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

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import net.openan.observability.ObservationSpan;

/** Keeps an explicit span parent for SDK-managed asynchronous task dispatch. */
final class TraceParentRegistry {
    private final ConcurrentMap<String, ObservationSpan> taskParents = new ConcurrentHashMap<>();
    private volatile ObservationSpan fallbackParent;

    TraceParentRegistry(ObservationSpan fallbackParent) {
        this.fallbackParent = fallbackParent;
    }

    void setFallbackParent(ObservationSpan parent) {
        fallbackParent = parent;
    }

    void register(String taskId, ObservationSpan parent) {
        if (taskId != null && !taskId.isBlank() && parent != null) {
            taskParents.put(taskId, parent);
        }
    }

    ObservationSpan find(String taskId) {
        if (taskId != null && !taskId.isBlank()) {
            ObservationSpan parent = taskParents.get(taskId);
            if (parent != null) {
                return parent;
            }
        }
        return fallbackParent;
    }
}
