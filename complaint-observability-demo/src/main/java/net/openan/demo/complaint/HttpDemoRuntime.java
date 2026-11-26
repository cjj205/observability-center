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

import dev.openan.workflow.engine.client.A2ATransport;
import dev.openan.workflow.engine.client.DefaultWorkflowEngineClient;
import dev.openan.workflow.engine.client.WorkflowEngineClient;
import dev.openan.workflow.engine.client.WorkflowEngineClientConfig;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import net.openan.observability.Observability;
import net.openan.observability.ObservationSpan;
import org.a2aproject.sdk.spec.AgentCard;

/** Four-role embedded runtime used to verify real HTTP A2A calls. */
final class HttpDemoRuntime implements AutoCloseable {
    private final HttpWorkflowEngineClient workflowClient;
    private final HttpWorkflowEngineClient regionalClient;
    private final List<HttpMockAgentServer> servers;

    private HttpDemoRuntime(
            HttpWorkflowEngineClient workflowClient,
            HttpWorkflowEngineClient regionalClient,
            List<HttpMockAgentServer> servers) {
        this.workflowClient = workflowClient;
        this.regionalClient = regionalClient;
        this.servers = servers;
    }

    static HttpDemoRuntime start(
            String caseName,
            Observability observe,
            TaskTCodec taskT,
            ObservationSpan traceParent,
            TraceParentRegistry traceParents) {
        List<HttpMockAgentServer> servers = new ArrayList<>();
        HttpWorkflowEngineClient regionalClient = null;
        HttpWorkflowEngineClient workflowClient = null;
        try {
            HttpMockAgentServer west = HttpMockAgentServer.start(
                    "West-GD NETSpirit", new MockAgentRouter(caseName, observe, taskT, null, traceParents));
            servers.add(west);
            HttpMockAgentServer east = HttpMockAgentServer.start(
                    "East-GD NETSpirit", new MockAgentRouter(caseName, observe, taskT, null, traceParents));
            servers.add(east);

            WorkflowEngineClientConfig config = clientConfig();
            DefaultWorkflowEngineClient regionalDelegate = DefaultWorkflowEngineClient.owning(
                    new A2ATransport(
                            List.of(west.agentCard(), east.agentCard()),
                            new SocketA2AJavaClientRuntime(
                                    config.getSendTimeoutSeconds(), observe, traceParent, traceParents),
                            config),
                    config);
            regionalClient = new HttpWorkflowEngineClient(regionalDelegate);

            HttpMockAgentServer transport = HttpMockAgentServer.start(
                    "Transport Complaint Agent",
                    new MockAgentRouter(caseName, observe, taskT, regionalClient, traceParents));
            servers.add(transport);
            HttpMockAgentServer waimo = HttpMockAgentServer.start(
                    "WAIMO Complaint Agent", new MockAgentRouter(caseName, observe, taskT, null, traceParents));
            servers.add(waimo);

            List<AgentCard> workflowCards = List.of(
                    waimo.agentCard(), transport.agentCard(), west.agentCard(), east.agentCard());
            DefaultWorkflowEngineClient workflowDelegate = DefaultWorkflowEngineClient.owning(
                    new A2ATransport(
                            workflowCards,
                            new SocketA2AJavaClientRuntime(
                                    config.getSendTimeoutSeconds(), observe, traceParent, traceParents),
                            config),
                    config);
            workflowClient = new HttpWorkflowEngineClient(workflowDelegate);
            return new HttpDemoRuntime(workflowClient, regionalClient, List.copyOf(servers));
        } catch (RuntimeException error) {
            if (workflowClient != null) {
                workflowClient.close();
            }
            if (regionalClient != null) {
                regionalClient.close();
            }
            for (int index = servers.size() - 1; index >= 0; index--) {
                servers.get(index).close();
            }
            throw error;
        }
    }

    WorkflowEngineClient workflowClient() {
        return workflowClient;
    }

    List<String> agentUrls() {
        return servers.stream().map(HttpMockAgentServer::url).toList();
    }

    List<Map<String, Object>> agentRecords() {
        return servers.stream()
                .flatMap(server -> server.records().stream())
                .toList();
    }

    @Override
    public void close() {
        workflowClient.close();
        regionalClient.close();
        for (int index = servers.size() - 1; index >= 0; index--) {
            servers.get(index).close();
        }
    }

    private static WorkflowEngineClientConfig clientConfig() {
        return WorkflowEngineClientConfig.builder()
                .sslVerify(false)
                .preferredProtocol("HTTP+JSON")
                .sendTimeoutSeconds(30)
                .taskPollIntervalMillis(200)
                .build();
    }
}
