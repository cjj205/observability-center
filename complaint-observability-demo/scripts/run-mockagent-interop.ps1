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
    [string]$RunId = "mockagent-interop-$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())",
    [string]$AgentId = 'an-l4-transport-network-fault-management-agent',
    [int]$Port = 19700,
    [switch]$InstallDependencies,
    [switch]$EnableTelemetry,
    [string]$OtelEndpoint = 'http://127.0.0.1:14317'
)

$ErrorActionPreference = 'Stop'
$demoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$mockRoot = (Resolve-Path (Join-Path $demoRoot '.vendor\openan-demo\mockagent')).Path
$venvRoot = Join-Path $demoRoot 'target\mockagent-venv'
$pythonPath = Join-Path $venvRoot 'Scripts\python.exe'
$logRoot = Join-Path $demoRoot 'target\mockagent-interop-logs'
$stdout = Join-Path $logRoot "$RunId.gateway.out.log"
$stderr = Join-Path $logRoot "$RunId.gateway.err.log"
$gateway = $null
$oldProtocol = $env:OTEL_EXPORTER_OTLP_PROTOCOL
$oldEndpoint = $env:OTEL_EXPORTER_OTLP_ENDPOINT

function Wait-Gateway([string]$Url, [int]$TimeoutSeconds = 45) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        try {
            $health = Invoke-RestMethod -Uri ($Url.TrimEnd('/') + '/health') -Method Get -TimeoutSec 3
            if ($health.status -eq 'ok') { return }
        } catch { }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw "MockAgent gateway did not become ready: $Url"
}

Set-Location $demoRoot
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
if (-not (Test-Path -LiteralPath $pythonPath)) {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($null -eq $python) { throw 'Python 3.12+ is required for the MockAgent interoperability probe.' }
    & $python.Source -m venv $venvRoot
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
if ($InstallDependencies) {
    & $pythonPath -m pip install -r (Join-Path $mockRoot 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw "MockAgent virtual environment is missing: $pythonPath. Re-run with -InstallDependencies."
}

$gatewayUrl = "http://127.0.0.1:$Port"
$oldPath = $env:PYTHONPATH
try {
    $env:PYTHONPATH = $mockRoot
    if ($EnableTelemetry) {
        $env:OTEL_EXPORTER_OTLP_PROTOCOL = 'grpc'
        $env:OTEL_EXPORTER_OTLP_ENDPOINT = $OtelEndpoint
    }
    $gatewayArgs = @(
        '-m', 'mockagent_engine.gateway',
        '--host', '127.0.0.1',
        '--port', "$Port",
        '--agents', $AgentId
    )
    $gateway = Start-Process -FilePath $pythonPath -ArgumentList $gatewayArgs -WorkingDirectory $mockRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
    Wait-Gateway $gatewayUrl
    $mavenArgs = @(
        '-B', '-ntp', 'compile', 'exec:java',
        '-Dexec.mainClass=net.openan.demo.complaint.MockAgentInteropMain',
        "-Ddemo.mockagent.base.url=$gatewayUrl",
        "-Ddemo.mockagent.agent.id=$AgentId",
        "-Ddemo.run.id=$RunId",
        "-Ddemo.otel.enabled=$(if ($EnableTelemetry) { 'true' } else { 'false' })",
        '-Dexec.cleanupDaemonThreads=false'
    )
    & mvn @mavenArgs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    if ($null -ne $gateway) {
        Stop-Process -Id $gateway.Id -Force -ErrorAction SilentlyContinue
    }
    if ($null -eq $oldPath) { Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue }
    else { $env:PYTHONPATH = $oldPath }
    if ($null -eq $oldProtocol) { Remove-Item Env:OTEL_EXPORTER_OTLP_PROTOCOL -ErrorAction SilentlyContinue }
    else { $env:OTEL_EXPORTER_OTLP_PROTOCOL = $oldProtocol }
    if ($null -eq $oldEndpoint) { Remove-Item Env:OTEL_EXPORTER_OTLP_ENDPOINT -ErrorAction SilentlyContinue }
    else { $env:OTEL_EXPORTER_OTLP_ENDPOINT = $oldEndpoint }
}
