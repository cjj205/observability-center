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
import dev.openan.workflow.engine.control.EventCallback;
import dev.openan.workflow.engine.client.WorkflowEngineClient;
import dev.openan.workflow.engine.model.ExecutionResult;
import dev.openan.workflow.engine.model.Workflow;
import dev.openan.workflow.engine.runner.ExecutePsop;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import net.openan.observability.ObservabilitySdk;
import net.openan.observability.ObservationSpan;
import net.openan.observability.SignalKind;
import net.openan.observability.SdkConfig;

/** Main entry point for the deterministic complaint-handling workflow demo. */
public final class DemoMain {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String PSOP_RESOURCE = "/scenario/psop_Complaint_Handling.json";

    private DemoMain() {
    }

    public static void main(String[] args) throws Exception {
        String caseName = args.length == 0 ? "success" : args[0];
        if (!caseName.equals("success") && !caseName.equals("authorization-denied")) {
            throw new IllegalArgumentException("case must be success or authorization-denied");
        }
        String runId = args.length > 1 ? args[1] : "complaint-" + System.currentTimeMillis();
        String transportMode = System.getProperty("demo.transport", "memory").trim().toLowerCase();
        if (!transportMode.equals("memory") && !transportMode.equals("http")) {
            throw new IllegalArgumentException("demo.transport must be memory or http");
        }
        boolean observabilityEnabled = Boolean.parseBoolean(System.getProperty("demo.otel.enabled", "true"));
        SdkConfig config = SdkConfig.builder()
                .serviceName("complaint-demo-" + caseName)
                .metricInterval(Duration.ofMillis(500))
                .enabled(observabilityEnabled)
                .build();
        try (ObservabilitySdk sdk = ObservabilitySdk.start(config)) {
            DemoRun run = execute(caseName, runId, transportMode, sdk);
            boolean exported = sdk.flush(10, TimeUnit.SECONDS);
            writeReport(run, exported, observabilityEnabled);
            System.out.println("RUN_ID=" + runId);
            System.out.println("STATUS=" + (run.result().isSuccess() ? "completed" : "failed"));
            System.out.println("EXPECTED_CASE=" + caseName);
            System.out.println("TRANSPORT_MODE=" + transportMode);
            System.out.println("OTEL_FLUSH=" + exported);
            System.out.println("REPORT=" + run.reportPath().toAbsolutePath());
            if (caseName.equals("success") && !run.result().isSuccess()) {
                throw new IllegalStateException("Success case did not complete: " + run.result().getError());
            }
            if (caseName.equals("authorization-denied") && run.result().isSuccess()) {
                throw new IllegalStateException("Authorization-denied case unexpectedly completed");
            }
        }
    }

    private static DemoRun execute(
            String caseName, String runId, String transportMode, ObservabilitySdk sdk) throws IOException {
        Workflow workflow = loadWorkflow();
        Path env = Path.of(System.getProperty("demo.a2at.env", "src/main/resources/a2at/demo.env"));
        TaskTCodec taskT = new TaskTCodec(env);
        MockAgentRouter router = null;
        InMemoryWorkflowEngineClient memoryClient = null;
        HttpDemoRuntime httpRuntime = null;
        WorkflowEngineClient client;
        List<String> agentUrls;
        ObservationSpan traceParent = sdk.observe().trace(
                "a2at.workflow",
                SignalKind.INTERNAL,
                Map.of(
                        "workflow.id", workflow.getId(),
                        "workflow.type", "complaint-demo",
                        "workflow.status", "running"));
        TraceParentRegistry traceParents = new TraceParentRegistry(traceParent);
        ExecutionResult result;
        List<Map<String, Object>> events = new ArrayList<>();
        try {
            if (transportMode.equals("http")) {
                httpRuntime = HttpDemoRuntime.start(
                        caseName, sdk.observe(), taskT, traceParent, traceParents);
                client = httpRuntime.workflowClient();
                agentUrls = httpRuntime.agentUrls();
            } else {
                router = new MockAgentRouter(caseName, sdk.observe(), taskT);
                memoryClient = new InMemoryWorkflowEngineClient(router, traceParent);
                client = memoryClient;
                agentUrls = List.of();
            }
            EventCallback callback = new EventCallback() {
                @Override
                public void onEvent(String type, Map<String, Object> data) {
                    synchronized (events) {
                        events.add(Map.of("type", type, "data", data));
                    }
                }
            };
            var controlPoint = new ComplaintControlPoint(taskT, runId);
            try (var scope = traceParent.makeCurrent()) {
                result = ExecutePsop.builder()
                        .psop(workflow)
                        .engineClient(client)
                        .controlPoint(controlPoint)
                        .runtimeIntent("跨地市企业专线SLA劣化投诉处理")
                        .lang("zh")
                        .eventCallback(callback)
                        .observability(sdk.observe())
                        .onFinish((finished, collected) -> {
                            synchronized (events) {
                                events.add(Map.of("type", "on_finish", "data", Map.of(
                                        "success", finished.isSuccess(),
                                        "eventCount", collected.size())));
                            }
                        })
                        .execute()
                        .join();
            }
            if (result.isSuccess()) {
                traceParent.ok();
            } else {
                traceParent.error();
            }
        } catch (RuntimeException | Error failure) {
            traceParent.error(failure);
            throw failure;
        } finally {
            if (httpRuntime != null) {
                httpRuntime.close();
            }
            if (memoryClient != null) {
                memoryClient.close();
            }
            traceParent.close();
        }
        Path reportPath = Path.of("artifacts").resolve(runId + ".json");
        List<Map<String, Object>> records = httpRuntime == null
                ? router.records()
                : httpRuntime.agentRecords();
        return new DemoRun(
                runId,
                caseName,
                transportMode,
                workflow.getId(),
                result,
                events,
                records,
                agentUrls,
                reportPath);
    }

    private static Workflow loadWorkflow() throws IOException {
        try (InputStream input = DemoMain.class.getResourceAsStream(PSOP_RESOURCE)) {
            if (input == null) {
                throw new IOException("Missing PSOP resource " + PSOP_RESOURCE);
            }
            Map<String, Object> data = JSON.readValue(input, new TypeReference<>() {
            });
            return Workflow.fromMap(data);
        }
    }

    private static void writeReport(DemoRun run, boolean exported, boolean observabilityEnabled) throws IOException {
        Files.createDirectories(run.reportPath().getParent());
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("runId", run.runId());
        report.put("case", run.caseName());
        report.put("transportMode", run.transportMode());
        report.put("workflowId", run.workflowId());
        report.put("success", run.result().isSuccess());
        report.put("error", run.result().getError());
        report.put("history", run.result().getHistory());
        report.put("stepOutputs", run.result().getStepOutputs());
        report.put("events", run.events());
        report.put("agentRecords", run.agentRecords());
        report.put("agentUrls", run.agentUrls());
        report.put("observabilityEnabled", observabilityEnabled);
        report.put("otelFlush", exported);
        JSON.writerWithDefaultPrettyPrinter().writeValue(run.reportPath().toFile(), report);
    }

    private record DemoRun(
            String runId,
            String caseName,
            String transportMode,
            String workflowId,
            ExecutionResult result,
            List<Map<String, Object>> events,
            List<Map<String, Object>> agentRecords,
            List<String> agentUrls,
            Path reportPath) {
    }
}
