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
    [int]$WestPort = 9101,
    [int]$EastPort = 9102,
    [int]$TransportPort = 9103,
    [int]$WaimoPort = 9104
)

$ErrorActionPreference = 'Stop'
$demoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$artifactRoot = Join-Path $demoRoot 'artifacts'
$logRoot = Join-Path $demoRoot 'target\four-jvm-logs'
$statePath = Join-Path $artifactRoot "$RunId.multiprocess.json"
$otelEnabled = if ($EnableTelemetry) { 'true' } else { 'false' }

function Wait-AgentCard([string]$Url, [int]$TimeoutSeconds = 45) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-RestMethod -Uri ($Url.TrimEnd('/') + '/.well-known/agent-card.json') -Method Get -TimeoutSec 3
            if ($null -ne $response.name) { return }
        } catch { }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw "AgentCard did not become ready: $Url"
}

Set-Location $demoRoot
New-Item -ItemType Directory -Force -Path $artifactRoot, $logRoot | Out-Null
& mvn -B -ntp package '-DskipTests'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& mvn -B -ntp dependency:build-classpath "-Dmdep.outputFile=$demoRoot\target\classpath.txt" '-Dmdep.includeScope=runtime'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$classPath = ((Join-Path $demoRoot 'target\classes') + ';' + (Get-Content (Join-Path $demoRoot 'target\classpath.txt') -Raw).Trim())

$roles = @(
    [ordered]@{ role = 'west'; port = $WestPort; url = "http://127.0.0.1:$WestPort"; service = 'complaint-west' },
    [ordered]@{ role = 'east'; port = $EastPort; url = "http://127.0.0.1:$EastPort"; service = 'complaint-east' },
    [ordered]@{ role = 'transport'; port = $TransportPort; url = "http://127.0.0.1:$TransportPort"; service = 'complaint-transport' },
    [ordered]@{ role = 'waimo'; port = $WaimoPort; url = "http://127.0.0.1:$WaimoPort"; service = 'complaint-waimo' }
)
$processes = [System.Collections.Generic.List[object]]::new()
$oldProtocol = $env:OTEL_EXPORTER_OTLP_PROTOCOL
$oldEndpoint = $env:OTEL_EXPORTER_OTLP_ENDPOINT

try {
    if ($EnableTelemetry) {
        $env:OTEL_EXPORTER_OTLP_PROTOCOL = 'grpc'
        $env:OTEL_EXPORTER_OTLP_ENDPOINT = $OtelEndpoint
    }
    foreach ($role in $roles) {
        $arguments = @(
            '-cp', $classPath,
            "-Ddemo.role=$($role.role)",
            "-Ddemo.case=$Case",
            "-Ddemo.run.id=$RunId",
            "-Ddemo.port=$($role.port)",
            "-Ddemo.public.url=$($role.url)",
            "-Ddemo.service.name=$($role.service)",
            "-Ddemo.otel.enabled=$otelEnabled",
            "-Ddemo.west.url=$($roles[0].url)",
            "-Ddemo.east.url=$($roles[1].url)",
            "-Ddemo.transport.url=$($roles[2].url)",
            'net.openan.demo.complaint.RoleMain'
        )
        $stdout = Join-Path $logRoot "$RunId.$($role.role).out.log"
        $stderr = Join-Path $logRoot "$RunId.$($role.role).err.log"
        $process = Start-Process -FilePath 'java' -ArgumentList $arguments -WorkingDirectory $demoRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
        $processes.Add([pscustomobject]@{
                role = $role.role
                pid = $process.Id
                url = $role.url
                serviceName = $role.service
                stdout = $stdout
                stderr = $stderr
            })
        Wait-AgentCard $role.url
    }
    $state = [ordered]@{
        runId = $RunId
        case = $Case
        transportMode = 'multi-http'
        otelEnabled = [bool]$EnableTelemetry
        otelEndpoint = $OtelEndpoint
        startedAtUtc = [DateTimeOffset]::UtcNow.ToString('O')
        roles = $processes
    }
    $state | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $statePath -Encoding utf8
    $state | ConvertTo-Json -Depth 10
}
catch {
    foreach ($item in $processes) {
        try { Invoke-WebRequest -Method Post -Uri ($item.url + '/admin/shutdown') -TimeoutSec 2 | Out-Null } catch { }
    }
    throw
}
finally {
    if ($null -eq $oldProtocol) { Remove-Item Env:OTEL_EXPORTER_OTLP_PROTOCOL -ErrorAction SilentlyContinue }
    else { $env:OTEL_EXPORTER_OTLP_PROTOCOL = $oldProtocol }
    if ($null -eq $oldEndpoint) { Remove-Item Env:OTEL_EXPORTER_OTLP_ENDPOINT -ErrorAction SilentlyContinue }
    else { $env:OTEL_EXPORTER_OTLP_ENDPOINT = $oldEndpoint }
}
