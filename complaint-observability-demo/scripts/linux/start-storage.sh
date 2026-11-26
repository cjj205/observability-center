#!/usr/bin/env bash
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

set -euo pipefail
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); demo_root=$(cd "$script_dir/../.." && pwd)
for command in docker curl; do command -v "$command" >/dev/null || { echo "Required command not found: $command" >&2; exit 1; }; done
for candidate in "$demo_root/../observability-sdk-java/deploy/local-storage" "$demo_root/../../observability-sdk-java/deploy/local-storage"; do [[ -f "$candidate/compose.yaml" ]] && { storage_root=$candidate; break; }; done
[[ ${storage_root:-} ]] || { echo 'Cannot locate observability-sdk-java/deploy/local-storage' >&2; exit 1; }
docker compose --project-name openan-complaint-demo -f "$storage_root/compose.yaml" up -d
for endpoint in http://127.0.0.1:19200/ http://127.0.0.1:16686/; do
  for _ in {1..90}; do curl -fsS --max-time 3 "$endpoint" >/dev/null && break; sleep 2; done
  curl -fsS --max-time 3 "$endpoint" >/dev/null || { echo "Storage endpoint did not become ready: $endpoint" >&2; exit 1; }
done
echo 'LOCAL_STORAGE_RUNTIME=linux-docker'
