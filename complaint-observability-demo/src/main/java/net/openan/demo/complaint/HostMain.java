/*
 * Copyright (c) 2026 Huawei Technologies Co., Ltd.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 *    Licensed under the Apache License, Version 2.0 (the "License"); you may
 *    not use this file except in compliance with the License. You may obtain
 *    a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an AS IS BASIS, WITHOUT
 *    WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 *    License for the specific language governing permissions and limitations
 *    under the License.
 */

package net.openan.demo.complaint;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Minimal host API for submitting one deterministic demo run and reading its report.
 *
 * <p>The host serializes runs because the legacy {@link DemoMain} entry point reads process
 * properties for transport and telemetry configuration. This keeps the demo deterministic while
 * exposing the same report to a UI or an automation job.
 */
public final class HostMain implements AutoCloseable {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_HEADER_BYTES = 64 * 1024;
    private static final int MAX_BODY_BYTES = 4 * 1024 * 1024;

    private final ServerSocket serverSocket;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final AtomicReference<RunStatus> activeRun = new AtomicReference<>();
    private volatile boolean stopping;

    private HostMain(String bindHost, int port) throws IOException {
        serverSocket = new ServerSocket(port, 50, InetAddress.getByName(bindHost));
    }

    public static void main(String[] args) throws Exception {
        String bindHost = property("demo.host.bind", "127.0.0.1");
        int port = integerProperty("demo.host.port", 9200);
        try (HostMain host = new HostMain(bindHost, port)) {
            System.out.println("HOST_URL=http://" + bindHost + ":" + host.serverSocket.getLocalPort());
            System.out.println("HOST_READY=true");
            System.out.flush();
            host.acceptLoop();
        }
    }

    private void acceptLoop() throws IOException {
        while (!stopping) {
            try {
                Socket socket = serverSocket.accept();
                executor.submit(() -> handle(socket));
            } catch (SocketException error) {
                if (!stopping) {
                    throw error;
                }
            }
        }
    }

    private void handle(Socket socket) {
        try (Socket owned = socket) {
            Request request = Request.read(owned.getInputStream());
            Response response = dispatch(request);
            response.write(owned.getOutputStream());
        } catch (Exception error) {
            try {
                new Response(500, Map.of("error", error.toString())).write(socket.getOutputStream());
            } catch (IOException ignored) {
                // The peer may have closed the connection.
            }
        }
    }

    private Response dispatch(Request request) throws IOException {
        if ("GET".equals(request.method()) && "/healthz".equals(request.path())) {
            return Response.json(200, Map.of("status", "ok"));
        }
        if ("POST".equals(request.method()) && "/admin/shutdown".equals(request.path())) {
            executor.submit(() -> {
                stopping = true;
                try {
                    serverSocket.close();
                } catch (IOException ignored) {
                    // Closing the accept socket is best effort.
                }
            });
            return Response.json(202, Map.of("status", "stopping"));
        }
        if ("POST".equals(request.method()) && "/runs".equals(request.path())) {
            return submit(request.body());
        }
        if ("GET".equals(request.method()) && request.path().startsWith("/runs/")) {
            return readRun(request.path().substring("/runs/".length()));
        }
        return Response.json(404, Map.of("error", "not_found"));
    }

    private Response submit(byte[] body) throws IOException {
        Map<String, Object> input;
        try {
            input = JSON.readValue(body, new TypeReference<>() {
            });
        } catch (IOException error) {
            return Response.json(400, Map.of("error", "request body must be JSON", "detail", error.getMessage()));
        }
        String caseName = text(input.get("case"), "success");
        String runId = text(input.get("runId"), "host-" + System.currentTimeMillis());
        String transport = text(input.get("transport"), property("demo.transport", "memory"));
        if (!caseName.equals("success") && !caseName.equals("authorization-denied")) {
            return Response.json(400, Map.of("error", "case must be success or authorization-denied"));
        }
        if (!transport.equals("memory") && !transport.equals("http")) {
            return Response.json(400, Map.of("error", "transport must be memory or http"));
        }
        if (!runId.matches("[A-Za-z0-9._-]{1,120}")) {
            return Response.json(400, Map.of("error", "runId contains unsupported characters"));
        }
        RunStatus status = new RunStatus(runId, caseName, transport);
        if (!activeRun.compareAndSet(null, status)) {
            RunStatus current = activeRun.get();
            return Response.json(409, Map.of(
                    "error", "a run is already active",
                    "runId", current == null ? "" : current.runId(),
                    "status", current == null ? "" : current.state()));
        }
        executor.submit(() -> execute(status));
        return Response.json(202, status.asMap());
    }

    private void execute(RunStatus status) {
        String oldTransport = System.getProperty("demo.transport");
        String oldOtel = System.getProperty("demo.otel.enabled");
        try {
            System.setProperty("demo.transport", status.transport());
            if (System.getProperty("demo.otel.enabled") == null) {
                System.setProperty("demo.otel.enabled", "false");
            }
            DemoMain.main(new String[] {status.caseName(), status.runId()});
            status.complete(null);
        } catch (Throwable error) {
            status.complete(error);
        } finally {
            restoreProperty("demo.transport", oldTransport);
            restoreProperty("demo.otel.enabled", oldOtel);
            activeRun.compareAndSet(status, null);
        }
    }

    private Response readRun(String runId) throws IOException {
        if (!runId.matches("[A-Za-z0-9._-]{1,120}")) {
            return Response.json(400, Map.of("error", "runId contains unsupported characters"));
        }
        Path report = Path.of("artifacts").resolve(runId + ".json");
        if (Files.exists(report)) {
            try (InputStream input = Files.newInputStream(report)) {
                return new Response(200, JSON.readValue(input, new TypeReference<>() {
                }));
            }
        }
        RunStatus current = activeRun.get();
        if (current != null && current.runId().equals(runId)) {
            return Response.json(202, current.asMap());
        }
        return Response.json(404, Map.of("error", "run_not_found", "runId", runId));
    }

    @Override
    public void close() {
        stopping = true;
        try {
            serverSocket.close();
        } catch (IOException ignored) {
            // Closing is idempotent.
        }
        executor.shutdownNow();
    }

    private static String text(Object value, String fallback) {
        if (value == null || String.valueOf(value).isBlank()) {
            return fallback;
        }
        return String.valueOf(value).trim();
    }

    private static void restoreProperty(String name, String value) {
        if (value == null) {
            System.clearProperty(name);
        } else {
            System.setProperty(name, value);
        }
    }

    private static String property(String name, String fallback) {
        String value = System.getProperty(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    private static int integerProperty(String name, int fallback) {
        String value = System.getProperty(name);
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return Integer.parseInt(value);
    }

    private static final class RunStatus {
        private final String runId;
        private final String caseName;
        private final String transport;
        private volatile String state = "running";
        private volatile String error;

        private RunStatus(String runId, String caseName, String transport) {
            this.runId = runId;
            this.caseName = caseName;
            this.transport = transport;
        }

        private String runId() {
            return runId;
        }

        private String caseName() {
            return caseName;
        }

        private String transport() {
            return transport;
        }

        private String state() {
            return state;
        }

        private void complete(Throwable failure) {
            error = failure == null ? null : failure.toString();
            state = failure == null ? "completed" : "failed";
        }

        private Map<String, Object> asMap() {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("runId", runId);
            result.put("case", caseName);
            result.put("transport", transport);
            result.put("status", state);
            if (error != null) {
                result.put("error", error);
            }
            return result;
        }
    }

    private record Request(String method, String path, Map<String, String> headers, byte[] body) {
        private static Request read(InputStream input) throws IOException {
            byte[] headerBytes = readHeaders(input);
            String headerText = new String(headerBytes, StandardCharsets.ISO_8859_1);
            String[] lines = headerText.split("\\r\\n");
            if (lines.length == 0) {
                throw new IOException("empty HTTP request");
            }
            String[] requestLine = lines[0].split(" ");
            if (requestLine.length < 2) {
                throw new IOException("invalid HTTP request line");
            }
            Map<String, String> headers = new LinkedHashMap<>();
            for (int index = 1; index < lines.length; index++) {
                int separator = lines[index].indexOf(':');
                if (separator > 0) {
                    headers.put(lines[index].substring(0, separator).trim().toLowerCase(Locale.ROOT),
                            lines[index].substring(separator + 1).trim());
                }
            }
            int length = Integer.parseInt(headers.getOrDefault("content-length", "0"));
            if (length < 0 || length > MAX_BODY_BYTES) {
                throw new IOException("request body is too large");
            }
            return new Request(requestLine[0], requestLine[1], headers, readBody(input, length));
        }

        private static byte[] readHeaders(InputStream input) throws IOException {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            int matched = 0;
            while (output.size() < MAX_HEADER_BYTES) {
                int value = input.read();
                if (value < 0) {
                    throw new IOException("connection closed before headers");
                }
                output.write(value);
                matched = value == (matched == 0 || matched == 2 ? '\r' : '\n') ? matched + 1 : 0;
                if (matched == 4) {
                    byte[] all = output.toByteArray();
                    return java.util.Arrays.copyOf(all, all.length - 4);
                }
            }
            throw new IOException("HTTP headers are too large");
        }

        private static byte[] readBody(InputStream input, int length) throws IOException {
            byte[] body = input.readNBytes(length);
            if (body.length != length) {
                throw new IOException("connection closed before request body");
            }
            return body;
        }
    }

    private record Response(int status, Map<String, Object> body) {
        private static Response json(int status, Map<String, Object> body) {
            return new Response(status, body);
        }

        private void write(OutputStream output) throws IOException {
            byte[] bytes = JSON.writeValueAsBytes(body);
            String reason = switch (status) {
                case 200 -> "OK";
                case 202 -> "Accepted";
                case 400 -> "Bad Request";
                case 404 -> "Not Found";
                case 409 -> "Conflict";
                default -> "Internal Server Error";
            };
            String headers = "HTTP/1.1 " + status + " " + reason + "\r\n"
                    + "Content-Type: application/json\r\n"
                    + "Content-Length: " + bytes.length + "\r\n"
                    + "Connection: close\r\n\r\n";
            output.write(headers.getBytes(StandardCharsets.ISO_8859_1));
            output.write(bytes);
            output.flush();
        }
    }
}
