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
    [ValidateSet('success', 'authorization-denied')]
    [string]$Case = 'success',
    [string]$RunId = "four-jvm-$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())",
    [switch]$EnableTelemetry,
    [string]$OtelEndpoint = 'http://127.0.0.1:14317',
    [int]$TimeoutSeconds = 180,
    [int]$WestPort = 9101,
    [int]$EastPort = 9102,
    [int]$TransportPort = 9103,
    [int]$WaimoPort = 9104
)

$ErrorActionPreference = 'Stop'
$demoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$started = $false
$reportPath = Join-Path $demoRoot "artifacts\$RunId.json"

try {
    & (Join-Path $PSScriptRoot 'start-four-jvm.ps1') -Case $Case -RunId $RunId -EnableTelemetry:$EnableTelemetry -OtelEndpoint $OtelEndpoint -WestPort $WestPort -EastPort $EastPort -TransportPort $TransportPort -WaimoPort $WaimoPort | Out-Host
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $started = $true
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        if (Test-Path -LiteralPath $reportPath) { break }
        Start-Sleep -Milliseconds 500
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    if (-not (Test-Path -LiteralPath $reportPath)) {
        throw "Workflow report was not produced before timeout: $reportPath"
    }
}
finally {
    if ($started) {
        & (Join-Path $PSScriptRoot 'stop-four-jvm.ps1') -RunId $RunId | Out-Host
        if ($LASTEXITCODE -ne 0) { Write-Warning 'Four-JVM stop script returned a non-zero exit code' }
    }
}

& (Join-Path $PSScriptRoot 'verify-multiprocess.ps1') -Case $Case -RunId $RunId
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
