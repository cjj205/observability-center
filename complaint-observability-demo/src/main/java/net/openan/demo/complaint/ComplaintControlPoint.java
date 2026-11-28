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

import dev.openan.workflow.engine.control.ControlPoint;
import dev.openan.workflow.engine.model.MessageContent;
import dev.openan.workflow.engine.model.RouteDecision;
import dev.openan.workflow.engine.model.RouteRequest;
import dev.openan.workflow.engine.model.TaskRequest;
import dev.openan.workflow.engine.model.TaskResult;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import net.openan.a2at.sdk.core.model.MetadataContent;
import org.a2aproject.sdk.spec.TextPart;

/** Host business callbacks supplied to the Workflow Engine. */
final class ComplaintControlPoint implements ControlPoint {
    private final TaskTCodec taskT;
    private final String runId;
    private final String caseName;

    ComplaintControlPoint(TaskTCodec taskT, String runId) {
        this(taskT, runId, "success");
    }

    ComplaintControlPoint(TaskTCodec taskT, String runId, String caseName) {
        this.taskT = taskT;
        this.runId = runId;
        this.caseName = caseName;
    }

    @Override
    public CompletableFuture<MessageContent> onTask(TaskRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            MetadataContent encoded = taskT.encodeForSkill(request.getSkill(), request.getInstruction());
            Map<String, Object> metadata = new LinkedHashMap<>(encoded.buildMetadataContent());
            metadata.put("demo.run_id", runId);
            metadata.put("demo.task_id", request.getTaskId());
            metadata.put("demo.step", request.getStepName());
            metadata.put("demo.skill", request.getSkill());
            metadata.put("demo.agent", request.getAgentName());
            metadata.put("demo.extension.name", extensionName(request.getSkill()));
            return new MessageContent(
                    List.of(new TextPart(encoded.promptText())),
                    metadata,
                    Set.of(encoded.extensionUri()));
        });
    }

    private static String extensionName(String skill) {
        if (skill.contains("Authorization")) return "authorization-t";
        if (skill.contains("Notification") || skill.equals("Restoration Result Reply")
                || skill.equals("Root Cause Summarization")) return "notification-t";
        return "task-t";
    }

    @Override
    public CompletableFuture<TaskResult> onSelfTask(TaskRequest request) {
        return CompletableFuture.supplyAsync(() -> TaskResult.success(List.of(Map.of(
                "agent", request.getAgentName(),
                "step", request.getStepName(),
                "skill", request.getSkill(),
                "status", "completed"))));
    }

    @Override
    public CompletableFuture<RouteDecision> onRoute(RouteRequest request) {
        String condition = request.condition();
        if (condition == null || condition.isBlank()) {
            return CompletableFuture.completedFuture(RouteDecision.allow());
        }
        if (condition.contains("授权校验通过")) {
            return CompletableFuture.completedFuture(caseName.equals("success")
                    ? RouteDecision.allow(condition) : RouteDecision.deny(condition));
        }
        if (condition.contains("授权校验不通过") || condition.contains("授权失败")
                || condition.contains("授权被拒绝")) {
            return CompletableFuture.completedFuture(caseName.equals("authorization-denied")
                    ? RouteDecision.allow(condition) : RouteDecision.deny(condition));
        }
        if (condition.contains("修复动作执行失败") || condition.contains("SLA指标未恢复")) {
            return CompletableFuture.completedFuture(RouteDecision.deny(condition));
        }
        return CompletableFuture.completedFuture(RouteDecision.allow(request.condition()));
    }
}
