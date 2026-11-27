# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
#
#    Licensed under the Apache License, Version 2.0 (the "License"); you may
#    not use this file except in compliance with the License. You may obtain
#    a copy of the License at
#
#         http://www.apache.org/licenses/LICENSE-2.0
#
#    Unless required by applicable law or agreed to in writing, software
#    distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
#    WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
#    License for the specific language governing permissions and limitations
#    under the License.

"""Metric response model."""


class MetricModel:
    def from_task(self, task, query, collection, charts):
        metrics = task.get("metrics") or {}
        duration = metrics.get("taskDuration") or {}
        return {
            "runId": task["runId"],
            "workflowId": (task.get("workflow") or {}).get("id", f"wf-{task['runId']}"),
            "collection": collection,
            "summary": {
                "workflowCount": metrics.get("taskCount", 1),
                "workflowDuration": {
                    "avg": duration.get("avg", task["durationMs"]),
                    "p95": duration.get("p95", task["durationMs"]),
                    "unit": "ms",
                },
                "spanCount": task.get("spanCount", 0),
            },
            "signals": self.signals(task, query.get("dim")),
            "charts": None if query.get("includeCharts") is False else charts,
            "partial": False,
            "sourceStatus": {"metric": {"status": "ready"}},
        }

    def signals(self, task, dim):
        signals = task.get("signals") or []
        if not dim:
            return signals
        return [signal for signal in signals if signal.get("dim", dim) == dim]
