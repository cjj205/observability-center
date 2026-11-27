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

"""OTLP trace response model."""

from datetime import datetime


class TraceModel:
    def from_task(self, task, options):
        spans_by_service = {}
        for span in (task.get("trace") or {}).get("spans") or []:
            spans_by_service.setdefault(span["service"], []).append(span)
        return {
            "resourceSpans": [
                self.resource_span(task, service, spans, options)
                for service, spans in spans_by_service.items()
            ],
            "partial": False,
            "sourceStatus": {"trace": {"status": "ready"}},
        }

    def resource_span(self, task, service, spans, options):
        workflow = task.get("workflow") or {}
        return {
            "resource": {
                "attributes": self.attributes(
                    {
                        "service.name": service,
                        "gen_ai.agent.a2at.workflow.id": workflow.get("id", f"wf-{task['runId']}"),
                        "gen_ai.agent.a2at.workflow.type": workflow.get("type", task.get("taskType")),
                        "gen_ai.agent.a2at.run.id": task["runId"],
                    }
                )
            },
            "scopeSpans": [
                {
                    "scope": {"name": "openan-observability-sdk", "version": "0.1.0"},
                    "spans": [self.span(task, span, options) for span in spans],
                }
            ],
        }

    def span(self, task, span, options):
        failed = span.get("status") == "error"
        return {
            "traceId": (task.get("trace") or {}).get("traceID", ""),
            "spanId": span["spanID"],
            "parentSpanId": span.get("parentSpanID", ""),
            "name": span["operationName"],
            "kind": f"SPAN_KIND_{(span.get('kind') or 'INTERNAL').upper()}",
            "startTimeUnixNano": self.unix_nano(task["startedAt"], span.get("startOffsetMs", 0)),
            "endTimeUnixNano": self.unix_nano(
                task["startedAt"],
                span.get("startOffsetMs", 0) + span.get("durationMs", 0),
            ),
            "attributes": [] if options.get("includeAttributes") is False else self.attributes(span.get("tags")),
            "status": {
                "code": "STATUS_CODE_ERROR" if failed else "STATUS_CODE_OK",
                "message": "span failed" if failed else "",
            },
            "events": [] if options.get("includeEvents") is False else [],
            "links": [] if options.get("includeLinks") is False else [],
        }

    @staticmethod
    def unix_nano(started_at, offset_ms):
        timestamp = datetime.fromisoformat(started_at.replace("Z", "+00:00")).timestamp()
        return str(int(timestamp * 1_000_000_000 + offset_ms * 1_000_000))

    @staticmethod
    def any_value(value):
        if value is None:
            return {"stringValue": str(value)}
        if isinstance(value, bool):
            return {"boolValue": value}
        if isinstance(value, int):
            return {"intValue": value}
        if isinstance(value, float):
            return {"doubleValue": value}
        return {"stringValue": str(value)}

    @classmethod
    def attributes(cls, attributes):
        return [
            {"key": key, "value": cls.any_value(value)}
            for key, value in (attributes or {}).items()
        ]
