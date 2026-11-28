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

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.openan.workflow.engine.client.WorkflowEngineClient;
import dev.openan.workflow.engine.model.ExecutionResult;
import dev.openan.workflow.engine.model.MessageContent;
import dev.openan.workflow.engine.model.SendMessageResult;
import dev.openan.workflow.engine.model.Workflow;
import dev.openan.workflow.engine.runner.ExecutePsop;
import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;
import net.openan.a2at.sdk.negotiation.runtime.helper.NegotiationPayloadMapper;
import net.openan.observability.LogSeverity;
import net.openan.observability.ObservationSpan;
import net.openan.observability.SignalKind;
import net.openan.observability.Observability;

/** Executes the Transport-view PSOP after WAIMO dispatches a diagnosis task. */
final class LayeredTransportWorkflow {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String RESOURCE = "/scenario/psop_Complaint_Handling_Transport.json";

    private final String caseName;
    private final Observability observe;
    private final TaskTCodec taskT;
    private final WorkflowEngineClient client;

    LayeredTransportWorkflow(
            String caseName, Observability observe, TaskTCodec taskT, WorkflowEngineClient client) {
        this.caseName = caseName;
        this.observe = observe;
        this.taskT = taskT;
        this.client = client;
    }

    SendMessageResult execute(MessageContent request) {
        String runId = String.valueOf(request.metadata().getOrDefault("demo.run_id", "unknown"));
        try {
            Workflow workflow = load();
            emitInformationNegotiation(runId);
            ExecutionResult result = ExecutePsop.builder()
                    .psop(workflow)
                    .engineClient(client)
                    .controlPoint(new ComplaintControlPoint(taskT, runId, caseName))
                    .runtimeIntent("跨地市企业专线SLA劣化投诉处理")
                    .lang("zh")
                    .observability(observe)
                    .execute()
                    .join();
            if (result.isSuccess()) {
                return SendMessageResult.builder()
                        .taskState("TASK_STATE_COMPLETED")
                        .text("Transport PSOP completed")
                        .build();
            }
            return SendMessageResult.builder()
                    .taskState("TASK_STATE_FAILED")
                    .failureCode("transport.workflow_failed")
                    .failureMessage(String.valueOf(result.getError()))
                    .build();
        } catch (IOException | RuntimeException error) {
            return SendMessageResult.builder()
                    .taskState("TASK_STATE_FAILED")
                    .failureCode("transport.workflow_error")
                    .failureMessage(error.getMessage())
                    .build();
        }
    }

    private void emitInformationNegotiation(String runId) {
        Map<String, Object> payload = taskT.startInformationNegotiation(
                "A端诊断缺少cvlan和子接口信息，请补充。", Map.of("site", "A", "issue", "missing-cvlan"));
        Map<String, Object> context = NegotiationPayloadMapper.extractContextMap(payload);
        String negotiationId = String.valueOf(context.get("negotiationId"));
        Map<String, Object> propose = Map.of(
                "extension.name", "negotiation-t",
                "negotiation.id", negotiationId,
                "negotiation.round", context.get("round"),
                "negotiation.total_rounds", 2,
                "negotiation.max_rounds", 3,
                "negotiation.performative", "propose",
                "negotiation.result", "in-progress");
        try (ObservationSpan negotiation = observe.trace(
                "SendStreamingMessage-negotiation", SignalKind.SERVER, propose)) {
            observe.log("gen_ai.agent.a2at.message", LogSeverity.INFO,
                    "West-GD NETSpirit requested cvlan and subinterface details", propose, negotiation);
            Map<String, Object> accepted = new LinkedHashMap<>(propose);
            accepted.put("negotiation.round", 2);
            accepted.put("negotiation.performative", "accept");
            accepted.put("negotiation.result", "agreed");
            observe.log("gen_ai.agent.a2at.message", LogSeverity.INFO,
                    "Transport Complaint Agent supplied cvlan=409 and accepted the diagnosis continuation", accepted, negotiation);
            observe.metric("negotiation.rounds", 2,
                    Map.of("negotiation.id", negotiationId, "negotiation.result", "agreed"));
            observe.metric("negotiation.count", 1,
                    Map.of("negotiation.id", negotiationId, "negotiation.result", "agreed"));
            negotiation.ok();
        }
    }

    private static Workflow load() throws IOException {
        try (InputStream input = LayeredTransportWorkflow.class.getResourceAsStream(RESOURCE)) {
            if (input == null) {
                throw new IOException("Missing PSOP resource " + RESOURCE);
            }
            Map<String, Object> data = JSON.readValue(input, new TypeReference<>() {
            });
            return Workflow.fromMap(data);
        }
    }
}
