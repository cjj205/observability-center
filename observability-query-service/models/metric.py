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
