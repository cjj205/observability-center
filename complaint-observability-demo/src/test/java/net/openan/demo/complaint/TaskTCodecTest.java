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

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class TaskTCodecTest {
    @Test
    void deterministicLlmPassesClientGenerationAndServerValidation() {
        TaskTCodec codec = new TaskTCodec(Path.of("src/main/resources/a2at/demo.env"));
        String prompt = codec.encode("请诊断跨地市专线质差投诉").promptText();

        assertTrue(prompt.contains("接入端口名称"));
        assertTrue(codec.validate(prompt).success());
    }
}
