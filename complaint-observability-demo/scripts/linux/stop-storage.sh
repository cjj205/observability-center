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
command -v docker >/dev/null || { echo 'Required command not found: docker' >&2; exit 1; }
for candidate in "$demo_root/../observability-sdk-java/deploy/local-storage" "$demo_root/../../observability-sdk-java/deploy/local-storage"; do [[ -f "$candidate/compose.yaml" ]] && { storage_root=$candidate; break; }; done
[[ ${storage_root:-} ]] || { echo 'Cannot locate observability-sdk-java/deploy/local-storage' >&2; exit 1; }
docker compose --project-name openan-complaint-demo -f "$storage_root/compose.yaml" down
