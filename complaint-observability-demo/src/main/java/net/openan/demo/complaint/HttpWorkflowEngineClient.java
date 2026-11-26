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

import dev.openan.workflow.engine.client.DefaultWorkflowEngineClient;
import dev.openan.workflow.engine.control.ControlPoint;
import dev.openan.workflow.engine.control.EventCallback;
import dev.openan.workflow.engine.control.NegotiationStrategy;
import dev.openan.workflow.engine.model.MessageContent;
import dev.openan.workflow.engine.model.SendMessageResult;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import org.a2aproject.sdk.jsonrpc.common.wrappers.ListTasksResult;
import org.a2aproject.sdk.spec.ListTasksParams;

/** Workflow Engine client decorator used by HTTP mode to preserve demo error codes. */
final class HttpWorkflowEngineClient implements dev.openan.workflow.engine.client.WorkflowEngineClient {
    private final DefaultWorkflowEngineClient delegate;

    HttpWorkflowEngineClient(DefaultWorkflowEngineClient delegate) {
        this.delegate = delegate;
    }

    @Override
    public CompletableFuture<SendMessageResult> sendTask(String agentName, MessageContent content) {
        return normalize(delegate.sendTask(agentName, content));
    }

    @Override
    public CompletableFuture<SendMessageResult> sendTask(
            String agentName, MessageContent content, NegotiationStrategy negotiationStrategy) {
        return normalize(delegate.sendTask(agentName, content, negotiationStrategy));
    }

    @Override
    public CompletableFuture<SendMessageResult> sendTask(
            String agentName,
            MessageContent content,
            NegotiationStrategy negotiationStrategy,
            EventCallback eventCallback) {
        return normalize(delegate.sendTask(agentName, content, negotiationStrategy, eventCallback));
    }

    @Override
    public long callbackTimeoutSeconds() {
        return delegate.callbackTimeoutSeconds();
    }

    @Override
    public void setControlPoint(ControlPoint controlPoint) {
        delegate.setControlPoint(controlPoint);
    }

    @Override
    public void setEventCallback(EventCallback callback) {
        delegate.setEventCallback(callback);
    }

    @Override
    public CompletableFuture<SendMessageResult> getTask(String agentName, String taskId) {
        return normalize(delegate.getTask(agentName, taskId));
    }

    @Override
    public CompletableFuture<ListTasksResult> listTasks(String agentName, ListTasksParams params) {
        return delegate.listTasks(agentName, params);
    }

    @Override
    public CompletableFuture<SendMessageResult> cancelTask(String agentName, String taskId) {
        return normalize(delegate.cancelTask(agentName, taskId));
    }

    @Override
    public CompletableFuture<SendMessageResult> subscribeToTask(
            String agentName, String taskId, Consumer<Map<String, Object>> eventCallback) {
        return normalize(delegate.subscribeToTask(agentName, taskId, eventCallback));
    }

    @Override
    public void close() {
        delegate.close();
    }

    private static CompletableFuture<SendMessageResult> normalize(
            CompletableFuture<SendMessageResult> future) {
        return future.thenApply(HttpWorkflowEngineClient::normalize);
    }

    private static SendMessageResult normalize(SendMessageResult result) {
        if (result == null
                || result.getFailureCode() != null
                || !"TASK_STATE_FAILED".equals(result.getTaskState())) {
            return result;
        }
        Map<String, Object> metadata = result.getMetadata();
        Object code = metadata == null ? null : metadata.get("demo.error_code");
        Object message = metadata == null ? null : metadata.get("demo.error_message");
        if (code == null) {
            return result;
        }
        return SendMessageResult.builder()
                .text(result.getText())
                .task(result.getTask())
                .metadata(metadata)
                .taskState(result.getTaskState())
                .failureCode(String.valueOf(code))
                .failureMessage(message == null ? result.getText() : String.valueOf(message))
                .receivedMessages(result.getReceivedMessages())
                .build();
    }
}
