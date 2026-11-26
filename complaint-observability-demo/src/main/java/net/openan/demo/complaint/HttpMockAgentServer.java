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
 *    distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 *    WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 *    License for the specific language governing permissions and limitations
 *    under the License.
 */

package net.openan.demo.complaint;

import dev.openan.workflow.engine.model.MessageContent;
import dev.openan.workflow.engine.model.SendMessageResult;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import net.openan.observability.TraceContextPropagation;
import org.a2aproject.sdk.server.AgentCardCacheMetadata;
import org.a2aproject.sdk.server.ServerCallContext;
import org.a2aproject.sdk.server.agentexecution.AgentExecutor;
import org.a2aproject.sdk.server.agentexecution.RequestContext;
import org.a2aproject.sdk.server.events.InMemoryQueueManager;
import org.a2aproject.sdk.server.events.MainEventBus;
import org.a2aproject.sdk.server.events.MainEventBusProcessor;
import org.a2aproject.sdk.server.requesthandlers.DefaultRequestHandler;
import org.a2aproject.sdk.server.requesthandlers.RequestHandler;
import org.a2aproject.sdk.server.tasks.AgentEmitter;
import org.a2aproject.sdk.server.tasks.InMemoryPushNotificationConfigStore;
import org.a2aproject.sdk.server.tasks.InMemoryTaskStore;
import org.a2aproject.sdk.server.tasks.PushNotificationConfigStore;
import org.a2aproject.sdk.server.tasks.PushNotificationSender;
import org.a2aproject.sdk.spec.A2AError;
import org.a2aproject.sdk.spec.AgentCapabilities;
import org.a2aproject.sdk.spec.AgentCard;
import org.a2aproject.sdk.spec.AgentExtension;
import org.a2aproject.sdk.spec.AgentInterface;
import org.a2aproject.sdk.spec.AgentProvider;
import org.a2aproject.sdk.spec.AgentSkill;
import org.a2aproject.sdk.spec.Message;
import org.a2aproject.sdk.spec.Part;
import org.a2aproject.sdk.spec.TextPart;
import org.a2aproject.sdk.transport.rest.handler.RestHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Small TCP HTTP host around the official A2A Java REST handler.
 *
 * <p>A hand-written HTTP loop is used instead of JDK {@code HttpServer}: the latter relies on an
 * internal loopback pipe which is unavailable in some Windows/Java 21 environments. Requests are
 * still ordinary HTTP/1.1 messages, and A2A JSON parsing/response generation remains in the SDK's
 * {@link RestHandler}.
 */
final class HttpMockAgentServer implements AutoCloseable {
    private static final Logger LOGGER = LoggerFactory.getLogger(HttpMockAgentServer.class);
    private static final int THREAD_COUNT = 8;
    private static final int MAX_HEADER_BYTES = 64 * 1024;
    private static final int MAX_BODY_BYTES = 4 * 1024 * 1024;
    private static final String TASK_T_URI =
            "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1";
    private static final TraceContextPropagation.Getter<Map<String, String>> HEADER_GETTER =
            new TraceContextPropagation.Getter<>() {
                @Override
                public Iterable<String> keys(Map<String, String> headers) {
                    return headers.keySet();
                }

                @Override
                public String get(Map<String, String> headers, String name) {
                    return headers.get(name);
                }
            };

    private final String agentName;
    private final ServerSocket serverSocket;
    private final ExecutorService httpExecutor;
    private final ExecutorService agentExecutor;
    private final Thread acceptThread;
    private final Thread eventBusThread;
    private final AgentCard agentCard;
    private final RestHandler restHandler;
    private final MockAgentRouter router;
    private final Runnable shutdownHandler;

    private HttpMockAgentServer(
            String agentName,
            ServerSocket serverSocket,
            ExecutorService httpExecutor,
            ExecutorService agentExecutor,
            Thread acceptThread,
            Thread eventBusThread,
            AgentCard agentCard,
            RestHandler restHandler,
            MockAgentRouter router,
            Runnable shutdownHandler) {
        this.agentName = agentName;
        this.serverSocket = serverSocket;
        this.httpExecutor = httpExecutor;
        this.agentExecutor = agentExecutor;
        this.acceptThread = acceptThread;
        this.eventBusThread = eventBusThread;
        this.agentCard = agentCard;
        this.restHandler = restHandler;
        this.router = router;
        this.shutdownHandler = shutdownHandler;
    }

    static HttpMockAgentServer start(String agentName, MockAgentRouter router) {
        return start(agentName, router, 0, null, null);
    }

    static HttpMockAgentServer start(
            String agentName,
            MockAgentRouter router,
            int requestedPort,
            String advertisedUrl,
            Runnable shutdownHandler) {
        ServerSocket serverSocket = null;
        ExecutorService httpExecutor = null;
        ExecutorService agentExecutor = null;
        Thread eventBusThread = null;
        try {
            if (requestedPort < 0 || requestedPort > 65535) {
                throw new IllegalArgumentException("requestedPort must be between 0 and 65535");
            }
            serverSocket = new ServerSocket(requestedPort, 50, InetAddress.getByName("127.0.0.1"));
            int port = serverSocket.getLocalPort();
            String baseUrl = advertisedUrl == null || advertisedUrl.isBlank()
                    ? "http://127.0.0.1:" + port
                    : advertisedUrl.stripTrailing();
            AgentCard card = buildAgentCard(agentName, baseUrl);
            httpExecutor = executor("a2a-http-" + agentName);
            agentExecutor = executor("a2a-agent-" + agentName);
            InMemoryTaskStore taskStore = new InMemoryTaskStore();
            MainEventBus eventBus = new MainEventBus();
            InMemoryQueueManager queueManager = new InMemoryQueueManager(taskStore, eventBus);
            PushNotificationConfigStore pushStore = new InMemoryPushNotificationConfigStore();
            PushNotificationSender pushSender = (event, task) -> {
                // Push notifications are outside this deterministic request/response demo.
            };
            MainEventBusProcessor eventBusProcessor =
                    new MainEventBusProcessor(eventBus, taskStore, pushSender, queueManager);
            eventBusThread = new Thread(eventBusProcessor, "a2a-events-" + agentName);
            eventBusThread.setDaemon(true);

            AgentExecutor executor = new RouterAgentExecutor(agentName, router);
            RequestHandler requestHandler =
                    DefaultRequestHandler.builder()
                            .agentExecutor(executor)
                            .taskStore(taskStore)
                            .queueManager(queueManager)
                            .pushConfigStore(pushStore)
                            .mainEventBusProcessor(eventBusProcessor)
                            .executor(agentExecutor)
                            .eventConsumerExecutor(agentExecutor)
                            .build();
            RestHandler restHandler =
                    new RestHandler(card, new AgentCardCacheMetadata(card, null), requestHandler, Runnable::run);
            HttpMockAgentServer result = new HttpMockAgentServer(
                    agentName,
                    serverSocket,
                    httpExecutor,
                    agentExecutor,
                    newAcceptThread(
                            serverSocket, httpExecutor, restHandler, agentName, shutdownHandler),
                    eventBusThread,
                    card,
                    restHandler,
                    router,
                    shutdownHandler);
            eventBusThread.start();
            result.acceptThread.start();
            LOGGER.info("Started HTTP MockAgent {} at {}", agentName, result.url());
            return result;
        } catch (IOException | RuntimeException error) {
            closeQuietly(serverSocket, httpExecutor, agentExecutor, eventBusThread);
            throw new IllegalStateException("Failed to start HTTP MockAgent " + agentName, error);
        }
    }

    AgentCard agentCard() {
        return agentCard;
    }

    String url() {
        return agentCard.supportedInterfaces().get(0).url();
    }

    List<Map<String, Object>> records() {
        return new ArrayList<>(router.records());
    }

    @Override
    public void close() {
        try {
            serverSocket.close();
        } catch (IOException ignored) {
            // The socket is already closing.
        }
        acceptThread.interrupt();
        eventBusThread.interrupt();
        agentExecutor.shutdownNow();
        httpExecutor.shutdownNow();
        await(acceptThread);
        await(eventBusThread);
        await(agentExecutor);
        await(httpExecutor);
        LOGGER.info("Stopped HTTP MockAgent {}", agentName);
    }

    private static Thread newAcceptThread(
            ServerSocket socket,
            ExecutorService executor,
            RestHandler handler,
            String agentName,
            Runnable shutdownHandler) {
        Thread thread = new Thread(() -> {
            while (!socket.isClosed()) {
                try {
                    Socket connection = socket.accept();
                    executor.execute(() -> handleConnection(connection, handler, shutdownHandler));
                } catch (SocketException error) {
                    if (!socket.isClosed()) {
                        LOGGER.warn("A2A accept failed for {}", agentName, error);
                    }
                    break;
                } catch (IOException error) {
                    if (!socket.isClosed()) {
                        LOGGER.warn("A2A accept failed for {}", agentName, error);
                    }
                }
            }
        }, "a2a-accept-" + agentName);
        thread.setDaemon(true);
        return thread;
    }

    private static void handleConnection(
            Socket socket, RestHandler restHandler, Runnable shutdownHandler) {
        try (Socket connection = socket) {
            Request request = readRequest(connection.getInputStream());
            RestHandler.HTTPRestResponse response = dispatch(request, restHandler, shutdownHandler);
            writeResponse(connection.getOutputStream(), response);
        } catch (Exception error) {
            LOGGER.debug("A2A connection failed: {}", error.toString());
        }
    }

    private static RestHandler.HTTPRestResponse dispatch(
            Request request, RestHandler restHandler, Runnable shutdownHandler) {
        try {
            String path = URI.create(request.target()).getPath();
            if ("POST".equalsIgnoreCase(request.method())
                    && "/admin/shutdown".equals(path)
                    && shutdownHandler != null) {
                Thread shutdownThread = new Thread(shutdownHandler, "a2a-shutdown-request");
                shutdownThread.setDaemon(true);
                shutdownThread.start();
                return new RestHandler.HTTPRestResponse(
                        202, "application/json", "{\"status\":\"stopping\"}");
            }
            if ("GET".equalsIgnoreCase(request.method()) && "/".equals(path)) {
                return restHandler.getAgentCard();
            }
            if ("GET".equalsIgnoreCase(request.method()) && path.startsWith("/.well-known/")) {
                return restHandler.getAgentCard();
            }
            if ("POST".equalsIgnoreCase(request.method()) && "/message:send".equals(path)) {
                return restHandler.sendMessage(buildCallContext(request.headers()), "", request.body());
            }
            return new RestHandler.HTTPRestResponse(404, "application/json", "{\"error\":\"not found\"}");
        } catch (A2AError error) {
            return restHandler.createErrorResponse(error);
        } catch (IllegalArgumentException error) {
            return restHandler.createErrorResponse(new org.a2aproject.sdk.spec.InvalidRequestError(
                    "Invalid A2A request"));
        } catch (Exception error) {
            LOGGER.warn("A2A HTTP request failed", error);
            return restHandler.createErrorResponse(new org.a2aproject.sdk.spec.InternalError(
                    "A2A request handling failed"));
        }
    }

    private static Request readRequest(InputStream input) throws IOException {
        byte[] headerBytes = readHeader(input);
        String headerText = new String(headerBytes, StandardCharsets.ISO_8859_1);
        String[] lines = headerText.split("\\r\\n");
        if (lines.length == 0) {
            throw new IOException("Missing HTTP request line");
        }
        String[] requestLine = lines[0].split(" ", 3);
        if (requestLine.length != 3) {
            throw new IOException("Invalid HTTP request line");
        }
        Map<String, String> headers = new LinkedHashMap<>();
        for (int index = 1; index < lines.length; index++) {
            int separator = lines[index].indexOf(':');
            if (separator <= 0) {
                continue;
            }
            String name = lines[index].substring(0, separator).trim().toLowerCase(Locale.ROOT);
            String value = lines[index].substring(separator + 1).trim();
            headers.put(name, value);
        }
        int contentLength = 0;
        if (headers.containsKey("content-length")) {
            contentLength = Integer.parseInt(headers.get("content-length"));
        }
        if (contentLength < 0 || contentLength > MAX_BODY_BYTES) {
            throw new IOException("Invalid HTTP body length");
        }
        byte[] body = input.readNBytes(contentLength);
        if (body.length != contentLength) {
            throw new IOException("HTTP body ended before Content-Length");
        }
        return new Request(
                requestLine[0], requestLine[1], headers, new String(body, StandardCharsets.UTF_8));
    }

    private static byte[] readHeader(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        int matched = 0;
        while (output.size() <= MAX_HEADER_BYTES) {
            int value = input.read();
            if (value < 0) {
                throw new IOException("HTTP request ended before headers");
            }
            output.write(value);
            if ((matched == 0 && value == '\r')
                    || (matched == 2 && value == '\r')) {
                matched++;
            } else if ((matched == 1 && value == '\n')
                    || (matched == 3 && value == '\n')) {
                matched++;
                if (matched == 4) {
                    byte[] all = output.toByteArray();
                    return Arrays.copyOf(all, all.length - 4);
                }
            } else {
                matched = value == '\r' ? 1 : 0;
            }
        }
        throw new IOException("HTTP headers exceed limit");
    }

    private static void writeResponse(
            OutputStream output, RestHandler.HTTPRestResponse response) throws IOException {
        byte[] body = response.getBody() == null
                ? new byte[0]
                : response.getBody().getBytes(StandardCharsets.UTF_8);
        StringBuilder headers = new StringBuilder()
                .append("HTTP/1.1 ")
                .append(response.getStatusCode())
                .append(' ')
                .append(reason(response.getStatusCode()))
                .append("\r\n")
                .append("Content-Type: ")
                .append(response.getContentType() == null ? "application/json" : response.getContentType())
                .append("\r\n")
                .append("Content-Length: ")
                .append(body.length)
                .append("\r\n")
                .append("Connection: close\r\n");
        if (response.getHeaders() != null) {
            response.getHeaders().forEach((key, value) -> headers.append(key).append(": ").append(value).append("\r\n"));
        }
        headers.append("\r\n");
        output.write(headers.toString().getBytes(StandardCharsets.ISO_8859_1));
        output.write(body);
        output.flush();
    }

    private static String reason(int status) {
        return switch (status) {
            case 200 -> "OK";
            case 201 -> "Created";
            case 400 -> "Bad Request";
            case 401 -> "Unauthorized";
            case 404 -> "Not Found";
            case 405 -> "Method Not Allowed";
            default -> status >= 500 ? "Server Error" : "Response";
        };
    }

    private static ServerCallContext buildCallContext(Map<String, String> rawHeaders) {
        Map<String, String> headers = new LinkedHashMap<>(rawHeaders);
        aliasHeader(headers, "A2A-Extensions");
        aliasHeader(headers, "X-A2A-Extensions");
        aliasHeader(headers, "A2A-Protocol-Version");
        aliasHeader(headers, "A2A-Version");
        String extensionHeader = firstHeader(headers, "A2A-Extensions", "X-A2A-Extensions");
        Set<String> requestedExtensions = extensionHeader.isBlank()
                ? Set.of()
                : Arrays.stream(extensionHeader.split(","))
                        .map(String::trim)
                        .filter(value -> !value.isBlank())
                        .collect(java.util.stream.Collectors.toUnmodifiableSet());
        return new ServerCallContext(
                null,
                Map.of("headers", headers),
                requestedExtensions,
                firstNullableHeader(headers, "A2A-Protocol-Version", "A2A-Version"));
    }

    private static void aliasHeader(Map<String, String> headers, String expectedName) {
        String value = headers.get(expectedName.toLowerCase(Locale.ROOT));
        if (value != null) {
            headers.put(expectedName, value);
        }
    }

    private static String firstHeader(Map<String, String> headers, String first, String second) {
        String value = firstNullableHeader(headers, first, second);
        return value == null ? "" : value;
    }

    private static String firstNullableHeader(Map<String, String> headers, String first, String second) {
        String firstValue = headers.get(first);
        return firstValue != null ? firstValue : headers.get(second);
    }

    static AgentCard agentCard(String name, String baseUrl) {
        return buildAgentCard(name, baseUrl);
    }

    private static AgentCard buildAgentCard(String name, String baseUrl) {
        String url = baseUrl == null || baseUrl.isBlank()
                ? "http://127.0.0.1"
                : baseUrl.stripTrailing();
        AgentExtension taskT = AgentExtension.builder()
                .uri(TASK_T_URI)
                .description("Task-T messages used by the complaint demo")
                .required(false)
                .build();
        AgentCapabilities capabilities = AgentCapabilities.builder()
                .streaming(false)
                .pushNotifications(false)
                .extendedAgentCard(false)
                .extensions(List.of(taskT))
                .build();
        AgentSkill skill = AgentSkill.builder()
                .id("complaint-handling")
                .name(name + " complaint handling")
                .description("Deterministic complaint-handling fixture")
                .tags(List.of("complaint", "task-t"))
                .inputModes(List.of("text"))
                .outputModes(List.of("text"))
                .build();
        return AgentCard.builder()
                .name(name)
                .description("HTTP MockAgent for the complaint observability demo")
                .provider(new AgentProvider("OpenAN demo", "https://github.com/project-openan/openan-demo"))
                .version("0.1.0")
                .capabilities(capabilities)
                .defaultInputModes(List.of("text"))
                .defaultOutputModes(List.of("text"))
                .skills(List.of(skill))
                .supportedInterfaces(List.of(new AgentInterface("HTTP+JSON", url)))
                .preferredTransport("HTTP+JSON")
                .url(url)
                .build();
    }

    private static ExecutorService executor(String name) {
        return new ThreadPoolExecutor(
                THREAD_COUNT,
                THREAD_COUNT,
                0L,
                TimeUnit.MILLISECONDS,
                new LinkedBlockingQueue<>(),
                runnable -> {
                    Thread thread = new Thread(runnable, name);
                    thread.setDaemon(true);
                    return thread;
                });
    }

    private static void await(Thread thread) {
        try {
            thread.join(1_000);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
    }

    private static void await(ExecutorService executor) {
        try {
            executor.awaitTermination(1, TimeUnit.SECONDS);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
    }

    private static void closeQuietly(
            ServerSocket socket,
            ExecutorService httpExecutor,
            ExecutorService agentExecutor,
            Thread eventBusThread) {
        if (socket != null) {
            try {
                socket.close();
            } catch (IOException ignored) {
                // Best-effort startup cleanup.
            }
        }
        if (eventBusThread != null) {
            eventBusThread.interrupt();
        }
        if (httpExecutor != null) {
            httpExecutor.shutdownNow();
        }
        if (agentExecutor != null) {
            agentExecutor.shutdownNow();
        }
    }

    private record Request(String method, String target, Map<String, String> headers, String body) {
    }

    private static final class RouterAgentExecutor implements AgentExecutor {
        private final String agentName;
        private final MockAgentRouter router;

        private RouterAgentExecutor(String agentName, MockAgentRouter router) {
            this.agentName = agentName;
            this.router = router;
        }

        @Override
        public void execute(RequestContext context, AgentEmitter emitter) throws A2AError {
            Message message = context.getMessage();
            if (message == null) {
                emitter.fail(emitter.newAgentMessage(
                        List.of(new TextPart("A2A request did not contain a message")), Map.of()));
                return;
            }
            MessageContent content = new MessageContent(
                    message.parts(),
                    message.metadata(),
                    message.extensions() == null ? Set.of() : Set.copyOf(message.extensions()));
            Map<String, String> headers = requestHeaders(context);
            SendMessageResult result;
            try (var scope = TraceContextPropagation.extractToCurrent(headers, HEADER_GETTER)) {
                result = router.dispatch(agentName, content);
            }
            boolean success = result.getFailureCode() == null;
            String text = responseText(result);
            Map<String, Object> metadata = new LinkedHashMap<>();
            if (result.getMetadata() != null) {
                metadata.putAll(result.getMetadata());
            }
            if (!success) {
                metadata.put("demo.error_code", result.getFailureCode());
                metadata.put("demo.error_message", result.getFailureMessage());
            }
            emitter.addArtifact(
                    List.of(new TextPart(text)),
                    "complaint-result",
                    "Complaint result",
                    metadata);
            Message status = emitter.newAgentMessage(List.of(new TextPart(text)), metadata);
            if (success) {
                emitter.complete(status);
            } else {
                emitter.fail(status);
            }
        }

        private static Map<String, String> requestHeaders(RequestContext context) {
            if (context.getCallContext() == null || context.getCallContext().getState() == null) {
                return Map.of();
            }
            Object value = context.getCallContext().getState().get("headers");
            if (value instanceof Map<?, ?> values) {
                Map<String, String> headers = new LinkedHashMap<>();
                values.forEach((key, header) -> {
                    if (key != null && header != null) {
                        headers.put(String.valueOf(key), String.valueOf(header));
                    }
                });
                return headers;
            }
            return Map.of();
        }

        @Override
        public void cancel(RequestContext context, AgentEmitter emitter) throws A2AError {
            emitter.cancel();
        }

        private static String responseText(SendMessageResult result) {
            if (result.getReceivedMessages() != null) {
                for (var received : result.getReceivedMessages()) {
                    if (received.message() != null) {
                        String text = text(received.message().parts());
                        if (!text.isBlank()) {
                            return text;
                        }
                    }
                    for (var artifact : received.artifacts()) {
                        String text = text(artifact.parts());
                        if (!text.isBlank()) {
                            return text;
                        }
                    }
                }
            }
            return result.getFailureMessage() == null ? "" : result.getFailureMessage();
        }

        private static String text(List<Part<?>> parts) {
            StringBuilder result = new StringBuilder();
            for (Part<?> part : parts) {
                if (part instanceof TextPart text) {
                    result.append(text.text());
                }
            }
            return result.toString();
        }
    }
}
