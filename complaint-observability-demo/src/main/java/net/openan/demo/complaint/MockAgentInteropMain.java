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
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.URI;
import java.net.URL;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import net.openan.a2at.sdk.core.model.MetadataContent;
import net.openan.observability.ObservabilitySdk;
import net.openan.observability.SdkConfig;
import org.a2aproject.sdk.client.ClientEvent;
import org.a2aproject.sdk.client.TaskEvent;
import org.a2aproject.sdk.spec.AgentCard;
import org.a2aproject.sdk.spec.Message;
import org.a2aproject.sdk.spec.MessageSendParams;
import org.a2aproject.sdk.spec.Part;
import org.a2aproject.sdk.spec.Task;
import org.a2aproject.sdk.spec.TaskState;
import org.a2aproject.sdk.spec.TextPart;

/**
 * Sends one Task-T request from the Java SDK to a real openan-demo MockAgent process.
 *
 * <p>This is an interoperability probe. The deterministic complaint workflow keeps its Java
 * fixture so both success and authorization-denied branches remain repeatable; this entry point
 * verifies the replacement boundary against the pinned Python MockAgent implementation.
 */
public final class MockAgentInteropMain {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String TASK_T_URI =
            "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1";

    private MockAgentInteropMain() {
    }

    public static void main(String[] args) throws Exception {
        String baseUrl = property("demo.mockagent.base.url", "http://127.0.0.1:19700");
        String agentId = property(
                "demo.mockagent.agent.id", "an-l4-transport-network-fault-management-agent");
        String runId = property("demo.run.id", "mockagent-interop-" + System.currentTimeMillis());
        String agentUrl = baseUrl.stripTrailing() + "/agents/" + agentId;
        Map<String, Object> cardPayload = fetchJson(agentUrl + "/.well-known/agent-card.json");
        String cardName = String.valueOf(cardPayload.getOrDefault("name", agentId));
        System.out.println("MOCKAGENT_CARD=" + cardName);
        System.out.println("MOCKAGENT_URL=" + agentUrl);

        Path env = Path.of(System.getProperty("demo.a2at.env", "src/main/resources/a2at/demo.env"));
        TaskTCodec taskT = new TaskTCodec(env);
        MetadataContent encoded = taskT.encode("Execute diagnosis for complaint " + runId);
        Map<String, Object> metadata = new LinkedHashMap<>(encoded.buildMetadataContent());
        metadata.put("demo.run_id", runId);
        metadata.put("demo.task_id", UUID.randomUUID().toString());
        metadata.put("demo.step", "interop");
        metadata.put("demo.skill", "Transport Network Fault Diagnosis");
        metadata.put("demo.operation", "diagnosis");
        metadata.put("demo.agent", cardName);
        Message message = Message.builder()
                .role(Message.Role.ROLE_USER)
                .parts(List.of(new TextPart(encoded.promptText())))
                .messageId(UUID.randomUUID().toString())
                .contextId(runId)
                .metadata(metadata)
                .extensions(List.of(encoded.extensionUri(), TASK_T_URI))
                .build();
        MessageSendParams params = MessageSendParams.builder().message(message).build();

        boolean enabled = Boolean.parseBoolean(System.getProperty("demo.otel.enabled", "false"));
        SdkConfig config = SdkConfig.builder()
                .serviceName("complaint-mockagent-interop")
                .metricInterval(Duration.ofMillis(500))
                .enabled(enabled)
                .build();
        try (ObservabilitySdk sdk = ObservabilitySdk.start(config)) {
            AgentCard card = HttpMockAgentServer.agentCard(cardName, agentUrl);
            Iterable<ClientEvent> events = new SocketA2AJavaClientRuntime(30, sdk.observe())
                    .sendMessage(card, params, null, null, null);
            Task task = lastTask(events);
            if (task == null || task.status() == null) {
                throw new IllegalStateException("MockAgent returned no task event");
            }
            TaskState state = task.status().state();
            System.out.println("MOCKAGENT_TASK_STATE=" + state);
            String text = taskText(task);
            System.out.println("MOCKAGENT_RESULT_TEXT=" + text);
            if (state != TaskState.TASK_STATE_COMPLETED) {
                throw new IllegalStateException("MockAgent task did not complete: " + state);
            }
            System.out.println("OTEL_FLUSH=" + sdk.flush(10, TimeUnit.SECONDS));
        }
    }

    private static Task lastTask(Iterable<ClientEvent> events) {
        Task result = null;
        for (ClientEvent event : events) {
            if (event instanceof TaskEvent taskEvent) {
                result = taskEvent.getTask();
            }
        }
        return result;
    }

    private static String taskText(Task task) {
        StringBuilder result = new StringBuilder();
        if (task.status().message() != null) {
            appendParts(result, task.status().message().parts());
        }
        for (var artifact : task.artifacts()) {
            appendParts(result, artifact.parts());
        }
        return result.toString();
    }

    private static void appendParts(StringBuilder target, List<Part<?>> parts) {
        for (Part<?> part : parts) {
            if (part instanceof TextPart textPart) {
                if (target.length() > 0) {
                    target.append(" | ");
                }
                target.append(textPart.text());
            }
        }
    }

    private static Map<String, Object> fetchJson(String endpoint) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) URI.create(endpoint)
                .toURL()
                .openConnection(Proxy.NO_PROXY);
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(5000);
        connection.setUseCaches(false);
        int status = connection.getResponseCode();
        try (InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream()) {
            if (input == null) {
                throw new IOException("MockAgent card returned HTTP " + status);
            }
            if (status >= 400) {
                throw new IOException("MockAgent card returned HTTP " + status + ": "
                        + new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
            }
            return JSON.readValue(input, new TypeReference<>() {
            });
        } finally {
            connection.disconnect();
        }
    }

    private static String property(String name, String fallback) {
        String value = System.getProperty(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}
