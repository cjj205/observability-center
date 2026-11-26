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
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class MockAgentMappingTest {
    @Test
    void keepsThePr29NamesMappedToMockagentCards() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        try (InputStream input = getClass().getResourceAsStream("/mockagent/agent-mapping.json")) {
            Map<String, Object> document = mapper.readValue(input, new TypeReference<>() {
            });
            List<Map<String, Object>> mappings = (List<Map<String, Object>>) document.get("mapping");

            assertEquals(4, mappings.size());
            assertTrue(mappings.stream().anyMatch(mapping ->
                    "WAIMO Complaint Agent".equals(mapping.get("workflowAgent"))
                            && "mockagent_an-l4-complaint-handling-agent".equals(mapping.get("mockagentCard"))));
            assertTrue(mappings.stream().anyMatch(mapping ->
                    "Transport Complaint Agent".equals(mapping.get("workflowAgent"))
                            && "mockagent_an-l4-transport-network-fault-management-agent"
                            .equals(mapping.get("mockagentCard"))));
        }
    }
}
