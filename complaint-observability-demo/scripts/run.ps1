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
    [ValidateSet('success', 'authorization-denied')]
    [string]$Case = 'success',
    [string]$RunId = "complaint-$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())",
    [ValidateSet('memory', 'http')]
    [string]$Transport = 'memory',
    [switch]$EnableTelemetry,
    [string]$OtelEndpoint = 'http://127.0.0.1:14317'
)

$ErrorActionPreference = 'Stop'
$demoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$otelEnabled = if ($EnableTelemetry) { 'true' } else { 'false' }
$oldProtocol = $env:OTEL_EXPORTER_OTLP_PROTOCOL
$oldEndpoint = $env:OTEL_EXPORTER_OTLP_ENDPOINT

try {
    if ($EnableTelemetry) {
        $env:OTEL_EXPORTER_OTLP_PROTOCOL = 'grpc'
        $env:OTEL_EXPORTER_OTLP_ENDPOINT = $OtelEndpoint
    }

    Set-Location $demoRoot
    & mvn -B -ntp package exec:java `
        '-Dexec.mainClass=net.openan.demo.complaint.DemoMain' `
        "-Dexec.args=$Case $RunId" `
        "-Ddemo.transport=$Transport" `
        "-Ddemo.otel.enabled=$otelEnabled" `
        '-Dexec.cleanupDaemonThreads=false'
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
finally {
    if ($null -eq $oldProtocol) { Remove-Item Env:OTEL_EXPORTER_OTLP_PROTOCOL -ErrorAction SilentlyContinue }
    else { $env:OTEL_EXPORTER_OTLP_PROTOCOL = $oldProtocol }
    if ($null -eq $oldEndpoint) { Remove-Item Env:OTEL_EXPORTER_OTLP_ENDPOINT -ErrorAction SilentlyContinue }
    else { $env:OTEL_EXPORTER_OTLP_ENDPOINT = $oldEndpoint }
}
