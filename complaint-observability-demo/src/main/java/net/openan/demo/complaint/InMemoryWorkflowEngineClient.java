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

import dev.openan.workflow.engine.client.WorkflowEngineClient;
import dev.openan.workflow.engine.control.EventCallback;
import dev.openan.workflow.engine.control.NegotiationStrategy;
import dev.openan.workflow.engine.model.MessageContent;
import dev.openan.workflow.engine.model.SendMessageResult;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.function.Consumer;
import net.openan.observability.ObservationSpan;
import org.a2aproject.sdk.spec.ListTasksParams;
import org.a2aproject.sdk.jsonrpc.common.wrappers.ListTasksResult;

/** Workflow Engine client seam backed by the deterministic MockAgent router. */
final class InMemoryWorkflowEngineClient implements WorkflowEngineClient {
    private final MockAgentRouter router;
    private final ObservationSpan traceParent;
    private final ExecutorService executor = Executors.newCachedThreadPool(r -> {
        Thread thread = new Thread(r, "complaint-demo-agent");
        thread.setDaemon(true);
        return thread;
    });
    private volatile EventCallback eventCallback;

    InMemoryWorkflowEngineClient(MockAgentRouter router) {
        this(router, null);
    }

    InMemoryWorkflowEngineClient(MockAgentRouter router, ObservationSpan traceParent) {
        this.router = router;
        this.traceParent = traceParent;
    }

    @Override
    public CompletableFuture<SendMessageResult> sendTask(String agentName, MessageContent content) {
        return sendTask(agentName, content, null, eventCallback);
    }

    @Override
    public CompletableFuture<SendMessageResult> sendTask(
            String agentName, MessageContent content, NegotiationStrategy negotiationStrategy) {
        return sendTask(agentName, content, negotiationStrategy, eventCallback);
    }

    @Override
    public CompletableFuture<SendMessageResult> sendTask(
            String agentName,
            MessageContent content,
            NegotiationStrategy negotiationStrategy,
            EventCallback callback) {
        emit(callback, "task.send", Map.of("agent", agentName));
        return CompletableFuture.supplyAsync(
                () -> router.dispatch(agentName, content, traceParent), executor)
                .whenComplete((result, error) -> {
                    if (error == null) {
                        emit(callback, "task.complete", Map.of("agent", agentName, "state", result.getTaskState()));
                    } else {
                        emit(callback, "task.error", Map.of("agent", agentName, "error", error.toString()));
                    }
                });
    }

    @Override
    public void setControlPoint(dev.openan.workflow.engine.control.ControlPoint controlPoint) {
        // Negotiation-T is not part of the first deterministic path.
    }

    @Override
    public void setEventCallback(EventCallback callback) {
        eventCallback = callback;
    }

    @Override
    public CompletableFuture<SendMessageResult> getTask(String agentName, String taskId) {
        return CompletableFuture.failedFuture(new UnsupportedOperationException("Demo task lookup is not implemented"));
    }

    @Override
    public CompletableFuture<ListTasksResult> listTasks(String agentName, ListTasksParams params) {
        return CompletableFuture.failedFuture(new UnsupportedOperationException("Demo task listing is not implemented"));
    }

    @Override
    public CompletableFuture<SendMessageResult> cancelTask(String agentName, String taskId) {
        return CompletableFuture.failedFuture(new UnsupportedOperationException("Demo task cancellation is not implemented"));
    }

    @Override
    public CompletableFuture<SendMessageResult> subscribeToTask(
            String agentName, String taskId, Consumer<Map<String, Object>> callback) {
        return CompletableFuture.failedFuture(new UnsupportedOperationException("Demo task subscription is not implemented"));
    }

    @Override
    public void close() {
        executor.shutdownNow();
    }

    private static void emit(EventCallback callback, String type, Map<String, Object> data) {
        if (callback != null) {
            callback.onEvent(type, data);
        }
    }
}
