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
 *    distributed under the License is distributed on an AS IS BASIS, WITHOUT
 *    WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 *    License for the specific language governing permissions and limitations
 *    under the License.
 #>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RunId,
    [int]$TimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'
$demoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$statePath = Join-Path $demoRoot "artifacts\$RunId.multiprocess.json"
if (-not (Test-Path -LiteralPath $statePath)) {
    throw "Multi-process state not found: $statePath"
}
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$items = @($state.roles)

foreach ($item in ($items | Sort-Object role -Descending)) {
    try {
        Invoke-WebRequest -Method Post -Uri ($item.url.TrimEnd('/') + '/admin/shutdown') -TimeoutSec 3 | Out-Null
    } catch {
        Write-Verbose "Shutdown request failed for $($item.role): $($_.Exception.Message)"
    }
}

$deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
foreach ($item in $items) {
    do {
        $running = Get-Process -Id ([int]$item.pid) -ErrorAction SilentlyContinue
        if ($null -eq $running) { break }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    $running = Get-Process -Id ([int]$item.pid) -ErrorAction SilentlyContinue
    if ($null -ne $running) {
        Stop-Process -Id ([int]$item.pid) -Force
        Write-Warning "Force-stopped $($item.role) process $($item.pid) after shutdown timeout"
    }
}

[ordered]@{
    runId = $RunId
    stoppedAtUtc = [DateTimeOffset]::UtcNow.ToString('O')
    roles = $items | ForEach-Object { $_.role }
} | ConvertTo-Json -Depth 5
