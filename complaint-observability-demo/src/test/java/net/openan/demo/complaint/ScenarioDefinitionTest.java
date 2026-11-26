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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.openan.workflow.engine.model.Workflow;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ScenarioDefinitionTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void loadsThePr29ScenarioAsSevenExecutableSteps() throws Exception {
        try (InputStream input = getClass().getResourceAsStream(
                "/scenario/psop_Complaint_Handling.json")) {
            Map<String, Object> raw = JSON.readValue(input, new TypeReference<>() {
            });
            Workflow workflow = Workflow.fromMap(raw);

            assertEquals("1d4c367d-9f0c-4400-85d2-caaf21ee37af", workflow.getId());
            assertEquals(7, workflow.getSteps().size());
            assertEquals(
                    List.of("step1", "step2", "step3", "step4", "step5", "step6", "step7"),
                    workflow.getSteps().stream().map(step -> step.getName()).toList());
            assertTrue(workflow.getSteps().get(3).getSubtasks().get(0).getAgent()
                    .contains("Transport"));
            assertEquals("SelfLoop", workflow.getSteps().get(0).getStepType().getValue());
        }
    }
}
