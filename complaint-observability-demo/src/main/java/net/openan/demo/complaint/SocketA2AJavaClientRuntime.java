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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.openan.workflow.engine.client.A2AJavaClientRuntime;
import io.opentelemetry.api.trace.Span;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import net.openan.observability.Observability;
import net.openan.observability.ObservationSpan;
import net.openan.observability.SignalKind;
import net.openan.observability.TraceContextPropagation;
import org.a2aproject.sdk.client.ClientEvent;
import org.a2aproject.sdk.client.MessageEvent;
import org.a2aproject.sdk.client.TaskEvent;
import org.a2aproject.sdk.client.TaskUpdateEvent;
import org.a2aproject.sdk.client.http.A2AHttpClient;
import org.a2aproject.sdk.client.http.A2AHttpHeaders;
import org.a2aproject.sdk.client.http.A2AHttpResponse;
import org.a2aproject.sdk.client.http.ServerSentEvent;
import org.a2aproject.sdk.client.transport.rest.RestTransport;
import org.a2aproject.sdk.client.transport.spi.interceptors.ClientCallContext;
import org.a2aproject.sdk.spec.AgentCard;
import org.a2aproject.sdk.spec.EventKind;
import org.a2aproject.sdk.spec.MessageSendParams;
import org.a2aproject.sdk.spec.Task;
import org.a2aproject.sdk.spec.TaskArtifactUpdateEvent;
import org.a2aproject.sdk.spec.TaskState;
import org.a2aproject.sdk.spec.TaskStatusUpdateEvent;

/**
 * A2A Java client runtime backed by {@link HttpURLConnection}.
 *
 * <p>The workflow SDK's default runtime uses JDK {@code HttpClient}, whose selector manager also
 * needs a loopback pipe. This runtime keeps the official A2A Java REST transport and replaces only
 * the HTTP implementation so the demo can run on restricted Windows hosts.
 */
final class SocketA2AJavaClientRuntime implements A2AJavaClientRuntime {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final int timeoutMillis;
    private final Observability observe;
    private final ObservationSpan traceParent;
    private final TraceParentRegistry traceParents;

    SocketA2AJavaClientRuntime(long timeoutSeconds) {
        this(timeoutSeconds, null, null);
    }

    SocketA2AJavaClientRuntime(long timeoutSeconds, Observability observe) {
        this(timeoutSeconds, observe, null);
    }

    SocketA2AJavaClientRuntime(
            long timeoutSeconds, Observability observe, ObservationSpan traceParent) {
        this(timeoutSeconds, observe, traceParent, null);
    }

    SocketA2AJavaClientRuntime(
            long timeoutSeconds,
            Observability observe,
            ObservationSpan traceParent,
            TraceParentRegistry traceParents) {
        if (timeoutSeconds <= 0 || timeoutSeconds > Integer.MAX_VALUE / 1000L) {
            throw new IllegalArgumentException("timeoutSeconds must be positive and fit an int");
        }
        this.timeoutMillis = (int) (timeoutSeconds * 1000L);
        this.observe = observe;
        this.traceParent = traceParent;
        this.traceParents = traceParents;
    }

    @Override
    public Iterable<ClientEvent> sendMessage(
            AgentCard agentCard,
            MessageSendParams params,
            ClientCallContext callContext,
            Consumer<ClientEvent> eventSink,
            Consumer<String> logSink) {
        if (logSink != null) {
            logSink.accept("[SocketA2A] Sending message to " + agentCard.name());
        }
        List<ClientEvent> events = java.util.Collections.synchronizedList(new ArrayList<>());
        UrlConnectionA2AHttpClient httpClient = new UrlConnectionA2AHttpClient(timeoutMillis);
        RestTransport transport = null;
        ObservationSpan clientSpan = null;
        long started = System.nanoTime();
        try {
            if (agentCard.supportedInterfaces() == null || agentCard.supportedInterfaces().isEmpty()) {
                throw new IOException("Agent card has no supported interfaces: " + agentCard.name());
            }
            transport = new RestTransport(
                    httpClient,
                    agentCard,
                    agentCard.supportedInterfaces().get(0),
                    List.of());
            clientSpan = startClientSpan(agentCard, params);
            if (clientSpan == null) {
                addResponseEvent(events, eventSink, transport.sendMessage(params, callContext));
            } else {
                try (var scope = clientSpan.makeCurrent()) {
                    try {
                        addResponseEvent(events, eventSink, transport.sendMessage(params, callContext));
                        clientSpan.ok();
                    } catch (Exception failure) {
                        clientSpan.error(failure);
                        throw failure;
                    }
                }
            }
            return events;
        } catch (Exception failure) {
            throw new IllegalStateException("A2A HTTP request failed", failure);
        } finally {
            if (observe != null) {
                observe.metric(
                        "gen_ai.client.operation.duration",
                        (System.nanoTime() - started) / 1_000_000_000.0,
                        Map.of("operation.name", "SendMessage"));
            }
            if (clientSpan != null) {
                clientSpan.close();
            }
            if (transport != null) {
                transport.close();
            }
        }
    }

    @Override
    public void close() {
        // Each request owns and closes its A2A client; there is no shared selector thread.
    }

    private ObservationSpan startClientSpan(AgentCard agentCard, MessageSendParams params) {
        if (observe == null) {
            return null;
        }
        Map<String, Object> metadata = params.message() == null || params.message().metadata() == null
                ? Map.of()
                : params.message().metadata();
        Map<String, Object> attributes = new LinkedHashMap<>(A2AObservationAttributes.outbound(agentCard, params));
        addExtensionAttributes(attributes, metadata);
        String taskId = String.valueOf(metadata.getOrDefault("demo.task_id", "unknown"));
        if (!Span.current().getSpanContext().isValid()) {
            ObservationSpan parent = traceParents == null ? traceParent : traceParents.find(taskId);
            if (parent != null) {
                return observe.trace("SendMessage", SignalKind.CLIENT, attributes, parent);
            }
        }
        return observe.trace("SendMessage", SignalKind.CLIENT, attributes);
    }

    private static void addExtensionAttributes(Map<String, Object> attributes, Map<String, Object> metadata) {
        String extension = String.valueOf(metadata.getOrDefault("demo.extension.name", "task-t"));
        attributes.put("extension.name", extension);
        String skill = String.valueOf(metadata.getOrDefault("demo.skill", "unknown"));
        if ("authorization-t".equals(extension)) {
            attributes.put("authorization.stage", skill.endsWith("Request") ? "execute" : "preauthorize");
            attributes.put("authorization.policy.operation.type", "tunnel-optimization");
            return;
        }
        if ("notification-t".equals(extension)) {
            attributes.put("notification.topic", notificationTopic(skill));
            attributes.put("push.notification.url", "https://notification.demo.local/complaints/"
                    + metadata.getOrDefault("demo.run_id", "unknown"));
            return;
        }
        A2AObservationAttributes.addTaskT(attributes, metadata);
    }

    private static String notificationTopic(String skill) {
        return switch (skill) {
            case "Root Cause Summarization" -> "root-cause.reported";
            case "Restoration Plan Notification" -> "restoration-plan.reported";
            case "Restoration Notification" -> "restoration-result.reported";
            case "Restoration Result Reply" -> "sla-verification.reported";
            default -> "complaint.update";
        };
    }

    private static void addResponseEvent(
            List<ClientEvent> events, Consumer<ClientEvent> eventSink, EventKind response) throws IOException {
        ClientEvent event = toClientEvent(response);
        events.add(event);
        if (eventSink != null) {
            eventSink.accept(event);
        }
    }

    private static ClientEvent toClientEvent(EventKind event) throws IOException {
        if (event instanceof Task task) {
            return new TaskEvent(task);
        }
        if (event instanceof org.a2aproject.sdk.spec.Message message) {
            return new MessageEvent(message);
        }
        if (event instanceof TaskStatusUpdateEvent statusUpdate) {
            return new TaskUpdateEvent(null, statusUpdate);
        }
        if (event instanceof TaskArtifactUpdateEvent artifactUpdate) {
            return new TaskUpdateEvent(null, artifactUpdate);
        }
        throw new IOException("Unsupported A2A response event: " + event);
    }

    private static boolean isTerminal(ClientEvent event) {
        if (event instanceof TaskEvent taskEvent) {
            return isTerminal(taskEvent.getTask().status().state());
        }
        if (event instanceof TaskUpdateEvent taskUpdateEvent
                && taskUpdateEvent.getUpdateEvent() instanceof TaskStatusUpdateEvent statusUpdate) {
            return isTerminal(statusUpdate.status().state());
        }
        return event instanceof MessageEvent;
    }

    private static boolean isTerminal(TaskState state) {
        return state == TaskState.TASK_STATE_COMPLETED
                || state == TaskState.TASK_STATE_FAILED
                || state == TaskState.TASK_STATE_CANCELED
                || state == TaskState.TASK_STATE_REJECTED
                || state == TaskState.TASK_STATE_INPUT_REQUIRED
                || state == TaskState.TASK_STATE_AUTH_REQUIRED;
    }

    private static final class UrlConnectionA2AHttpClient implements A2AHttpClient {
        private final int timeoutMillis;

        private UrlConnectionA2AHttpClient(int timeoutMillis) {
            this.timeoutMillis = timeoutMillis;
        }

        @Override
        public GetBuilder createGet() {
            return new GetBuilderImpl();
        }

        @Override
        public PostBuilder createPost() {
            return new PostBuilderImpl();
        }

        @Override
        public DeleteBuilder createDelete() {
            return new DeleteBuilderImpl();
        }

        private abstract class BuilderBase<T> {
            protected String url;
            protected final Map<String, String> headers = new LinkedHashMap<>();

            protected abstract T self();

            protected T setUrl(String value) {
                this.url = value;
                return self();
            }

            protected T setHeaders(Map<String, String> values) {
                if (values != null) {
                    headers.putAll(values);
                }
                return self();
            }

            protected T setHeader(String name, String value) {
                headers.put(name, value);
                return self();
            }

            protected A2AHttpResponse execute(String method, String body) throws IOException {
                if (url == null || url.isBlank()) {
                    throw new IOException("A2A HTTP URL is missing");
                }
                HttpURLConnection connection =
                        (HttpURLConnection) new URL(url).openConnection(Proxy.NO_PROXY);
                connection.setRequestMethod(method);
                connection.setConnectTimeout(timeoutMillis);
                connection.setReadTimeout(timeoutMillis);
                connection.setInstanceFollowRedirects(false);
                connection.setDoInput(true);
                headers.forEach(connection::setRequestProperty);
                TraceContextPropagation.inject(connection, HttpURLConnection::setRequestProperty);
                if (body != null) {
                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                    connection.setDoOutput(true);
                    connection.setFixedLengthStreamingMode(bytes.length);
                    try (OutputStream output = connection.getOutputStream()) {
                        output.write(bytes);
                    }
                }
                int status = connection.getResponseCode();
                InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                String responseBody = input == null
                        ? ""
                        : new String(input.readAllBytes(), StandardCharsets.UTF_8);
                responseBody = normalizeResponse(responseBody);
                if (Boolean.getBoolean("demo.a2a.debug")) {
                    System.err.println("[SocketA2A] " + method + " " + url + " -> " + status
                            + " body=" + responseBody);
                }
                Map<String, List<String>> responseHeaders = new LinkedHashMap<>();
                connection.getHeaderFields().forEach((name, values) -> {
                    if (name != null && values != null) {
                        responseHeaders.put(name, List.copyOf(values));
                    }
                });
                connection.disconnect();
                return new Response(status, responseBody, A2AHttpHeaders.of(responseHeaders));
            }

            private String normalizeResponse(String body) {
                if (body == null || body.isBlank()) {
                    return body;
                }
                try {
                    JsonNode root = JSON.readTree(body);
                    addMissingMessageIds(root);
                    return JSON.writeValueAsString(root);
                } catch (Exception ignored) {
                    return body;
                }
            }

            private void addMissingMessageIds(JsonNode node) {
                if (node == null) {
                    return;
                }
                if (node.isObject()) {
                    ObjectNode object = (ObjectNode) node;
                    if (object.has("role") && object.has("parts") && !object.has("messageId")) {
                        object.put("messageId", UUID.randomUUID().toString());
                    }
                    object.properties().forEach(entry -> addMissingMessageIds(entry.getValue()));
                } else if (node.isArray()) {
                    ArrayNode array = (ArrayNode) node;
                    array.forEach(this::addMissingMessageIds);
                }
            }

            protected CompletableFuture<Void> executeSse(
                    String method,
                    String body,
                    Consumer<ServerSentEvent> eventConsumer,
                    Consumer<Throwable> errorConsumer,
                    Runnable completed) {
                return CompletableFuture.runAsync(() -> {
                    try {
                        if (url == null || url.isBlank()) {
                            throw new IOException("A2A HTTP URL is missing");
                        }
                        HttpURLConnection connection =
                                (HttpURLConnection) new URL(url).openConnection(Proxy.NO_PROXY);
                        connection.setRequestMethod(method);
                        connection.setConnectTimeout(timeoutMillis);
                        connection.setReadTimeout(timeoutMillis);
                        connection.setDoInput(true);
                        headers.forEach(connection::setRequestProperty);
                        TraceContextPropagation.inject(connection, HttpURLConnection::setRequestProperty);
                        if (body != null) {
                            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                            connection.setDoOutput(true);
                            connection.setFixedLengthStreamingMode(bytes.length);
                            try (OutputStream output = connection.getOutputStream()) {
                                output.write(bytes);
                            }
                        }
                        try (BufferedReader reader = new BufferedReader(
                                new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                            String eventType = null;
                            String eventId = null;
                            Long retry = null;
                            StringBuilder data = new StringBuilder();
                            String line;
                            while ((line = reader.readLine()) != null) {
                                if (line.isEmpty()) {
                                    if (data.length() > 0 && eventConsumer != null) {
                                        eventConsumer.accept(new ServerSentEvent(
                                                data.toString(), eventType, eventId, retry));
                                    }
                                    eventType = null;
                                    eventId = null;
                                    retry = null;
                                    data.setLength(0);
                                } else if (line.startsWith("data:")) {
                                    if (data.length() > 0) {
                                        data.append('\n');
                                    }
                                    data.append(line.substring(5).stripLeading());
                                } else if (line.startsWith("event:")) {
                                    eventType = line.substring(6).stripLeading();
                                } else if (line.startsWith("id:")) {
                                    eventId = line.substring(3).stripLeading();
                                } else if (line.startsWith("retry:")) {
                                    retry = Long.valueOf(line.substring(6).stripLeading());
                                }
                            }
                        } finally {
                            connection.disconnect();
                        }
                        if (completed != null) {
                            completed.run();
                        }
                    } catch (Throwable failure) {
                        if (errorConsumer != null) {
                            errorConsumer.accept(failure);
                        }
                    }
                });
            }
        }

        private final class GetBuilderImpl extends BuilderBase<GetBuilderImpl>
                implements A2AHttpClient.GetBuilder {
            @Override
            protected GetBuilderImpl self() {
                return this;
            }

            @Override
            public GetBuilderImpl url(String value) {
                return setUrl(value);
            }

            @Override
            public GetBuilderImpl addHeaders(Map<String, String> values) {
                return setHeaders(values);
            }

            @Override
            public GetBuilderImpl addHeader(String name, String value) {
                return setHeader(name, value);
            }

            @Override
            public A2AHttpResponse get() throws IOException {
                return execute("GET", null);
            }

            @Override
            public CompletableFuture<Void> getAsyncSSE(
                    Consumer<ServerSentEvent> eventConsumer,
                    Consumer<Throwable> errorConsumer,
                    Runnable completed)
                    throws IOException, InterruptedException {
                return executeSse("GET", null, eventConsumer, errorConsumer, completed);
            }
        }

        private final class PostBuilderImpl extends BuilderBase<PostBuilderImpl>
                implements A2AHttpClient.PostBuilder {
            private String body;

            @Override
            protected PostBuilderImpl self() {
                return this;
            }

            @Override
            public PostBuilderImpl url(String value) {
                return setUrl(value);
            }

            @Override
            public PostBuilderImpl addHeaders(Map<String, String> values) {
                return setHeaders(values);
            }

            @Override
            public PostBuilderImpl addHeader(String name, String value) {
                return setHeader(name, value);
            }

            @Override
            public PostBuilderImpl body(String value) {
                this.body = value;
                return this;
            }

            @Override
            public A2AHttpResponse post() throws IOException {
                return execute("POST", body);
            }

            @Override
            public CompletableFuture<Void> postAsyncSSE(
                    Consumer<ServerSentEvent> eventConsumer,
                    Consumer<Throwable> errorConsumer,
                    Runnable completed)
                    throws IOException, InterruptedException {
                return executeSse("POST", body, eventConsumer, errorConsumer, completed);
            }
        }

        private final class DeleteBuilderImpl extends BuilderBase<DeleteBuilderImpl>
                implements A2AHttpClient.DeleteBuilder {
            @Override
            protected DeleteBuilderImpl self() {
                return this;
            }

            @Override
            public DeleteBuilderImpl url(String value) {
                return setUrl(value);
            }

            @Override
            public DeleteBuilderImpl addHeaders(Map<String, String> values) {
                return setHeaders(values);
            }

            @Override
            public DeleteBuilderImpl addHeader(String name, String value) {
                return setHeader(name, value);
            }

            @Override
            public A2AHttpResponse delete() throws IOException {
                return execute("DELETE", null);
            }
        }

        private record Response(int status, String body, A2AHttpHeaders headers)
                implements A2AHttpResponse {
            @Override
            public boolean success() {
                return status >= 200 && status < 300;
            }
        }
    }
}
