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
