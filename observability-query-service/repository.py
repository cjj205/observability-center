"""Data repository for workflow records."""

import json
from pathlib import Path


class WorkflowRepository:
    def __init__(self, dataset):
        self.dataset = dataset
        self.tasks = dataset.get("tasks", [])

    @classmethod
    def from_workspace_file(cls, relative_path):
        root = Path(__file__).resolve().parent.parent
        with (root / relative_path).open(encoding="utf-8") as file:
            return cls(json.load(file))

    def generated_at(self):
        return self.dataset.get("generatedAt")

    def collection(self):
        return self.dataset.get("collection")

    def charts(self):
        return self.dataset.get("charts")

    def find(self, run_id):
        return next((task for task in self.tasks if task.get("runId") == run_id), None)
