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

import java.nio.file.Path;
import java.util.Map;
import java.util.Objects;
import net.openan.a2at.sdk.client.prompt.assembly.DefaultA2ATClientBuilder;
import net.openan.a2at.sdk.client.prompt.orchestration.ClientPromptGenerationOrchestrator;
import net.openan.a2at.sdk.core.model.A2ATConfig;
import net.openan.a2at.sdk.core.model.MetadataContent;
import net.openan.a2at.sdk.core.model.StandardTemplates;
import net.openan.a2at.sdk.core.model.TemplateUri;
import net.openan.a2at.sdk.negotiation.runtime.RoleBoundNegotiationOrchestrator;
import net.openan.a2at.sdk.negotiation.types.model.NegotiationType;
import net.openan.a2at.sdk.server.assembly.DefaultA2ATServerBuilder;
import net.openan.a2at.sdk.server.model.PromptComplianceResult;
import net.openan.a2at.sdk.server.compliance.DefaultServerPromptComplianceOrchestrator;

/** Uses the A2A-T Java client and server facades for every dispatched mock task. */
final class TaskTCodec {
    private final ClientPromptGenerationOrchestrator client;
    private final DefaultServerPromptComplianceOrchestrator server;
    private final TemplateUri template;
    private final RoleBoundNegotiationOrchestrator negotiation;

    TaskTCodec(Path envPath) {
        Path resolved = envPath.toAbsolutePath().normalize();
        A2ATConfig config = A2ATConfig.resolvePromptResourceLocalRootDir(A2ATConfig.load(resolved), resolved);
        StaticLlmClient llm = new StaticLlmClient();
        client = DefaultA2ATClientBuilder.builder()
                .envPath(resolved)
                .config(config)
                .llmClient(llm)
                .buildPromptGenerationOrchestrator();
        server = DefaultA2ATServerBuilder.builder()
                .envPath(resolved)
                .config(config)
                .llmClient(llm)
                .buildPromptComplianceOrchestrator();
        negotiation = DefaultA2ATClientBuilder.builder()
                .envPath(resolved)
                .config(config)
                .llmClient(llm)
                .buildNegotiationOrchestrator();
        template = TemplateUri.parse(StandardTemplates.PRIVATE_LINE_COMPLAINT_URI)
                .orElseThrow(() -> new IllegalStateException("Task-T complaint template is unavailable"));
    }

    MetadataContent encode(String instruction) {
        MetadataContent content = client.generateTaskPromptFromText(
                "请处理企业专线投诉。" + Objects.requireNonNullElse(instruction, ""), template);
        if (content.promptText() == null || content.promptText().isBlank()) {
            throw new IllegalStateException("Task-T client returned an empty prompt");
        }
        return content;
    }

    MetadataContent encodeForSkill(String skill, String instruction) {
        String text = "请处理企业专线投诉。" + Objects.requireNonNullElse(instruction, "");
        if (skill.contains("Authorization")) {
            return client.generateAuthPromptFromText(text, StandardTemplates.AUTHORIZATION_POLICY_MANAGEMENT);
        }
        if (skill.contains("Notification") || skill.equals("Restoration Result Reply")
                || skill.equals("Root Cause Summarization")) {
            return client.generateNotificationPromptFromText(text, StandardTemplates.SERVICE_RECOVERY);
        }
        return encode(instruction);
    }

    Map<String, Object> startInformationNegotiation(String request, Map<String, Object> facts) {
        return negotiation.startNegotiation(NegotiationType.INFORMATION, request, facts);
    }

    PromptComplianceResult validate(String prompt) {
        return server.checkTaskPrompt(Objects.requireNonNull(prompt, "prompt"));
    }
}
