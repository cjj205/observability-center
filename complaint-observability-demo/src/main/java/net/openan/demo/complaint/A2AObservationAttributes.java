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

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.a2aproject.sdk.spec.AgentCard;
import org.a2aproject.sdk.spec.AgentInterface;
import org.a2aproject.sdk.spec.Message;
import org.a2aproject.sdk.spec.MessageSendParams;

/** Builds configured A2A and A2A-T span attributes from protocol objects. */
final class A2AObservationAttributes {
    private A2AObservationAttributes() {
    }

    static Map<String, Object> outbound(AgentCard agentCard, MessageSendParams params) {
        Map<String, Object> attributes = fromMessage(agentCard.name(), params.message());
        addText(attributes, "gen_ai.agent.version", agentCard.version());
        if (agentCard.supportedInterfaces() != null && !agentCard.supportedInterfaces().isEmpty()) {
            AgentInterface endpoint = agentCard.supportedInterfaces().get(0);
            addText(attributes, "transport", endpoint.protocolBinding());
            addText(attributes, "protocol.version", endpoint.protocolVersion());
        }
        return attributes;
    }

    static Map<String, Object> inbound(String agentName, Message message) {
        Map<String, Object> attributes = fromMessage(agentName, message);
        addText(attributes, "transport", "HTTP+JSON");
        addText(attributes, "protocol.version", AgentInterface.CURRENT_PROTOCOL_VERSION);
        addText(attributes, "gen_ai.agent.version", "0.1.0");
        return attributes;
    }

    private static Map<String, Object> fromMessage(String agentName, Message message) {
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("operation.name", "SendMessage");
        addText(attributes, "gen_ai.agent.name", agentName);
        if (message == null) return attributes;
        addText(attributes, "task_id", message.taskId());
        addText(attributes, "context_id", message.contextId());
        addText(attributes, "message_id", message.messageId());
        if (message.role() != null) addText(attributes, "role", message.role().toString());
        List<String> extensions = message.extensions();
        if (extensions != null && !extensions.isEmpty()) addText(attributes, "extensions", String.join(",", extensions));
        if (message.parts() != null) attributes.put("parts.number", (long) message.parts().size());
        return attributes;
    }

    static void addTaskT(Map<String, Object> attributes, Map<String, Object> metadata) {
        attributes.put("extension.name", "task-t");
        addText(attributes, "task.type", string(metadata, "demo.skill"));
        addText(attributes, "task.object", string(metadata, "demo.step"));
        addText(attributes, "task_id", string(metadata, "demo.task_id"));
        addText(attributes, "context_id", string(metadata, "demo.run_id"));
    }

    private static String string(Map<String, Object> metadata, String key) {
        return metadata == null || metadata.get(key) == null ? null : String.valueOf(metadata.get(key));
    }

    private static void addText(Map<String, Object> attributes, String key, String value) {
        if (value != null && !value.isBlank()) attributes.put(key, value);
    }
}
