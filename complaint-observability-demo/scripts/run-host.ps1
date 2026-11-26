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
    [string]$RunId = "host-$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())",
    [ValidateSet('memory', 'http')]
    [string]$Transport = 'memory',
    [switch]$EnableTelemetry,
    [string]$OtelEndpoint = 'http://127.0.0.1:14317',
    [int]$Port = 9200,
    [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'
$demoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$logRoot = Join-Path $demoRoot 'target\host-logs'
$stdout = Join-Path $logRoot "$RunId.out.log"
$stderr = Join-Path $logRoot "$RunId.err.log"
$otelEnabled = if ($EnableTelemetry) { 'true' } else { 'false' }
$oldProtocol = $env:OTEL_EXPORTER_OTLP_PROTOCOL
$oldEndpoint = $env:OTEL_EXPORTER_OTLP_ENDPOINT
$process = $null

function Wait-Health([string]$Url, [int]$Timeout) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($Timeout)
    do {
        try {
            $response = Invoke-RestMethod -Uri ($Url.TrimEnd('/') + '/healthz') -Method Get -TimeoutSec 3
            if ($response.status -eq 'ok') { return }
        } catch { }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw "Host did not become ready: $Url"
}

Set-Location $demoRoot
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
& mvn -B -ntp package '-DskipTests'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& mvn -B -ntp dependency:build-classpath "-Dmdep.outputFile=$demoRoot\target\classpath.txt" '-Dmdep.includeScope=runtime'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$classPath = ((Join-Path $demoRoot 'target\classes') + ';' + (Get-Content (Join-Path $demoRoot 'target\classpath.txt') -Raw).Trim())
$hostUrl = "http://127.0.0.1:$Port"

try {
    if ($EnableTelemetry) {
        $env:OTEL_EXPORTER_OTLP_PROTOCOL = 'grpc'
        $env:OTEL_EXPORTER_OTLP_ENDPOINT = $OtelEndpoint
    }
    $arguments = @('-cp', $classPath, "-Ddemo.host.port=$Port", "-Ddemo.otel.enabled=$otelEnabled", 'net.openan.demo.complaint.HostMain')
    $process = Start-Process -FilePath 'java' -ArgumentList $arguments -WorkingDirectory $demoRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
    Wait-Health $hostUrl 45
    $request = @{ case = $Case; runId = $RunId; transport = $Transport } | ConvertTo-Json
    $accepted = Invoke-RestMethod -Uri ($hostUrl + '/runs') -Method Post -ContentType 'application/json' -Body $request
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
    $report = $null
    do {
        try {
            $response = Invoke-WebRequest -Uri ($hostUrl + '/runs/' + $RunId) -Method Get -TimeoutSec 3
            if ($response.StatusCode -eq 200) {
                $report = $response.Content | ConvertFrom-Json
                break
            }
        } catch { }
        Start-Sleep -Milliseconds 500
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    if ($null -eq $report) { throw "Host did not return a report before timeout: $RunId" }
    $report | ConvertTo-Json -Depth 8
}
finally {
    if ($null -ne $process) {
        try { Invoke-WebRequest -Method Post -Uri ($hostUrl + '/admin/shutdown') -TimeoutSec 3 | Out-Null } catch { }
        $deadline = [DateTimeOffset]::UtcNow.AddSeconds(20)
        do {
            $running = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
            if ($null -eq $running) { break }
            Start-Sleep -Milliseconds 250
        } while ([DateTimeOffset]::UtcNow -lt $deadline)
        if ($null -ne (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
            Stop-Process -Id $process.Id -Force
        }
    }
    if ($null -eq $oldProtocol) { Remove-Item Env:OTEL_EXPORTER_OTLP_PROTOCOL -ErrorAction SilentlyContinue }
    else { $env:OTEL_EXPORTER_OTLP_PROTOCOL = $oldProtocol }
    if ($null -eq $oldEndpoint) { Remove-Item Env:OTEL_EXPORTER_OTLP_ENDPOINT -ErrorAction SilentlyContinue }
    else { $env:OTEL_EXPORTER_OTLP_ENDPOINT = $oldEndpoint }
}

& (Join-Path $PSScriptRoot 'verify.ps1') -Case $Case -RunId $RunId -Transport $Transport
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
