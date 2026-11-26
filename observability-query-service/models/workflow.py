"""Workflow list and detail response models."""


class WorkflowModel:
    @staticmethod
    def source_status(statuses):
        return {source: {"status": status} for source, status in statuses.items()}

    def workflow_id(self, task):
        workflow = task.get("workflow") or {}
        return workflow.get("id", f"wf-{task['runId']}")

    def type(self, task):
        workflow = task.get("workflow") or {}
        return workflow.get("type", task.get("taskType", ""))

    def summary(self, task):
        return {
            "runId": task["runId"],
            "workflowId": self.workflow_id(task),
            "workflowType": self.type(task),
            "name": task.get("title", ""),
            "status": task.get("status", "success"),
            "startedAt": task["startedAt"],
            "durationMs": task["durationMs"],
            "spanCount": task.get("spanCount", 0),
            "traceId": (task.get("trace") or {}).get("traceID", ""),
        }

    def psop(self, task):
        steps = task.get("steps") or []
        workflow = task.get("workflow") or {}
        workflow_id = workflow.get("id", f"wf-{task['runId']}")
        return {
            "id": workflow_id,
            "name": workflow_id,
            "description": workflow.get("type", ""),
            "steps": [self.step(step, index, len(steps)) for index, step in enumerate(steps)],
        }

    def step(self, step, index, total):
        next_step = f"step{index + 2}" if index + 1 < total else "end"
        return {
            "name": f"step{index + 1}",
            "type": "SelfLoop",
            "subtasks": [
                {
                    "description": step["name"],
                    "agent": step.get("owner", ""),
                    "skill": step["name"],
                }
            ],
            "next": [{"step": next_step, "condition": ""}],
        }

    def detail(self, task):
        statuses = {"trace": "ready", "metric": "ready", "log": "ready"}
        return {
            **self.summary(task),
            "psop": self.psop(task),
            "partial": False,
            "sourceStatus": self.source_status(statuses),
        }

    def aggregates(self, tasks):
        total = len(tasks)
        success = sum(task.get("status") != "error" for task in tasks)
        return {
            "total": total,
            "success": success,
            "error": total - success,
            "successRate": success / total if total else 0,
            "avgDurationMs": round(sum(task["durationMs"] for task in tasks) / total) if total else 0,
        }

    def workflow_type_facets(self, tasks):
        facets = {}
        for task in tasks:
            workflow_type = self.type(task)
            facets[workflow_type] = facets.get(workflow_type, 0) + 1
        return [{"value": value, "count": count} for value, count in facets.items()]
