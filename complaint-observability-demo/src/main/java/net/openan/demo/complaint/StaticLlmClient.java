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

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.openan.a2at.sdk.llm.LLMClient;
import net.openan.a2at.sdk.llm.LLMResponse;

/**
 * Deterministic LLM seam for the demo. It keeps Task-T prompt generation and validation inside the
 * SDK while making the demo independent of an external model endpoint.
 */
final class StaticLlmClient implements LLMClient {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Override
    public LLMResponse structured(
            List<Map<String, String>> messages,
            Map<String, Object> jsonSchema,
            Double temperature,
            Integer maxTokens) {
        return new LLMResponse(response(jsonSchema), "demo-static-model", Map.of(), Map.of());
    }

    private static String response(Map<String, Object> schema) {
        if (schema.containsKey("slotNames")) {
            return slots(schema);
        }
        if (hasProperty(schema, "passed") || hasProperty(schema, "errors")) {
            return "{\"passed\":true,\"errors\":[]}";
        }
        return "{\"matched\":true,\"scenario_code\":\"private-line-complaint\",\"error_message\":null}";
    }

    @SuppressWarnings("unchecked")
    private static boolean hasProperty(Map<String, Object> schema, String name) {
        Object properties = schema.get("properties");
        return properties instanceof Map<?, ?> propertyMap && propertyMap.containsKey(name);
    }

    private static String slots(Map<String, Object> schema) {
        Map<String, Object> values = new LinkedHashMap<>();
        Object rawNames = schema.get("slotNames");
        if (rawNames instanceof List<?> names) {
            for (Object rawName : names) {
                String name = String.valueOf(rawName);
                values.put(name, valueFor(name));
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("slots", values);
        result.put("slot_errors", List.of());
        try {
            return JSON.writeValueAsString(result);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Cannot serialize deterministic Task-T response", error);
        }
    }

    private static String valueFor(String name) {
        if (name.contains("任务对象")) {
            return "接入端口名称：P781-YSXR-PTN7900-2-TPA1EG24-03";
        }
        if (name.contains("任务上下文")) {
            return "投诉分类：专线质差；问题发生时间：2026-05-11T08:21:46Z；"
                    + "OSS侧事件流水号：event-id-20260511-09013；"
                    + "投诉详情：深圳访问广州的响应时延从12ms升至320ms，业务访问超时。";
        }
        return "demo-value";
    }
}
