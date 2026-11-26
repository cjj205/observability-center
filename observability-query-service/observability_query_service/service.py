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

"""Application service for workflow observability queries."""

from .models.log import LogModel
from .models.metric import MetricModel
from .models.trace import TraceModel
from .models.workflow import WorkflowModel


class WorkflowQueryService:
    def __init__(self, repository):
        self.repository = repository
        self.workflow_model = WorkflowModel()
        self.trace_model = TraceModel()
        self.log_model = LogModel()
        self.metric_model = MetricModel()

    def health(self):
        statuses = {"trace": "ready", "metric": "ready", "log": "ready"}
        return {"status": "ready", "sources": WorkflowModel.source_status(statuses)}

    def list_workflows(self, query):
        tasks = self.repository.tasks
        if query.get("from"):
            tasks = [task for task in tasks if task["startedAt"] >= query["from"]]
        if query.get("to"):
            tasks = [task for task in tasks if task["startedAt"] <= query["to"]]
        if query.get("status") and query["status"] != "all":
            tasks = [task for task in tasks if task["status"] == query["status"]]
        if query.get("workflowType"):
            tasks = [task for task in tasks if self.workflow_model.type(task) == query["workflowType"]]
        if query.get("keyword"):
            keyword = query["keyword"].lower()
            tasks = [
                task
                for task in tasks
                if any(keyword in str(value).lower() for value in self.workflow_model.summary(task).values())
            ]

        tasks = self.sort_workflows(tasks, query)
        limit = min(max(int(query.get("limit", 20)), 1), 100)
        page = tasks[:limit]
        statuses = {"trace": "ready", "metric": "ready", "log": "ready"}
        return {
            "items": [self.workflow_model.summary(task) for task in page],
            "nextCursor": None if len(tasks) <= limit else page[-1]["runId"],
            "aggregates": self.workflow_model.aggregates(tasks),
            "facets": {"workflowTypes": self.workflow_model.workflow_type_facets(tasks)},
            "meta": {
                "dataset": "observability-workflows",
                "source": "mock-adapter",
                "generatedAt": self.repository.generated_at(),
            },
            "partial": False,
            "sourceStatus": WorkflowModel.source_status(statuses),
        }

    def sort_workflows(self, tasks, query):
        sort = query.get("sort", "startedAt")
        reverse = query.get("order", "desc") == "desc"
        if sort == "durationMs":
            return sorted(tasks, key=lambda task: task["durationMs"], reverse=reverse)
        return sorted(tasks, key=lambda task: task["startedAt"], reverse=reverse)

    def get_workflow(self, run_id):
        task = self.repository.find(run_id)
        return None if task is None else self.workflow_model.detail(task)

    def get_trace(self, run_id, query):
        task = self.repository.find(run_id)
        return None if task is None else self.trace_model.from_task(task, query)

    def get_logs(self, run_id, query):
        task = self.repository.find(run_id)
        return None if task is None else self.log_model.from_task(task, query)

    def get_metrics(self, run_id, query):
        task = self.repository.find(run_id)
        if task is None:
            return None
        return self.metric_model.from_task(
            task,
            query,
            self.repository.collection(),
            self.repository.charts(),
        )
