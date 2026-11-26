<#
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
 #>

[CmdletBinding()]
param(
    [string]$WslDistro = 'Ubuntu'
)

$ErrorActionPreference = 'Stop'
$demoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$storageRoot = (Resolve-Path (Join-Path $demoRoot '..\observability-sdk-java\deploy\local-storage')).Path
$composePath = Join-Path $storageRoot 'compose.yaml'
$docker = Get-Command docker -ErrorAction SilentlyContinue
$keepAlivePath = Join-Path $demoRoot 'target\local-storage-wsl.pid'

if ($null -ne $docker) {
    & docker compose --project-name openan-complaint-demo -f $composePath down
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
else {
    $wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
    if ($null -eq $wsl) {
        throw 'Neither Docker CLI nor wsl.exe is available.'
    }
    if (Test-Path -LiteralPath $composePath) {
        $wslComposePath = "/mnt/$($composePath.Substring(0, 1).ToLower())$($composePath.Substring(2).Replace('\', '/'))"
        & wsl.exe -d $WslDistro -u root -- docker compose --project-name openan-complaint-demo -f $wslComposePath down
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
}

if (Test-Path -LiteralPath $keepAlivePath) {
    $keepAlivePid = [int](Get-Content -LiteralPath $keepAlivePath -Raw).Trim()
    $keepAlive = Get-Process -Id $keepAlivePid -ErrorAction SilentlyContinue
    if ($null -ne $keepAlive -and $keepAlive.ProcessName -eq 'wsl') {
        Stop-Process -Id $keepAlivePid -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $keepAlivePath -Force -ErrorAction SilentlyContinue
}
