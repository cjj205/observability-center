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
    void loadsThePr39LayeredScenarioResources() throws Exception {
        Workflow full = load("/scenario/psop_Complaint_Handling.json");
        Workflow waimo = load("/scenario/psop_Complaint_Handling_WAIMO.json");
        Workflow transport = load("/scenario/psop_Complaint_Handling_Transport.json");

        assertEquals("1d4c367d-9f0c-4400-85d2-caaf21ee37af", full.getId());
        assertEquals(16, full.getSteps().size());
        assertEquals("1d4c367d-9f0c-4400-85d2-caaf21ee37af-waimo", waimo.getId());
        assertEquals(7, waimo.getSteps().size());
        assertEquals("Transport Complaint Agent", waimo.getSteps().get(4).getSubtasks().get(0).getAgent());
        assertEquals("1d4c367d-9f0c-4400-85d2-caaf21ee37af-transport", transport.getId());
        assertEquals(12, transport.getSteps().size());
        assertEquals(2, transport.getSteps().get(2).getSubtasks().size());
        assertTrue(transport.getSteps().get(2).getSubtasks().stream()
                .allMatch(task -> task.getAgent().contains("NETSpirit")));
    }

    private Workflow load(String resource) throws Exception {
        try (InputStream input = getClass().getResourceAsStream(resource)) {
            Map<String, Object> raw = JSON.readValue(input, new TypeReference<>() {
            });
            return Workflow.fromMap(raw);
        }
    }
}
