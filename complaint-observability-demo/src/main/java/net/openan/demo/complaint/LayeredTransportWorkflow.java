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
import java.util.Map;
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
