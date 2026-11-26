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
    [string]$WslDistro = 'Ubuntu',
    [ValidateRange(60, 86400)]
    [int]$WslKeepAliveSeconds = 86400,
    [ValidateRange(30, 300)]
    [int]$StorageTimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'
$demoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$storageRoot = (Resolve-Path (Join-Path $demoRoot '..\observability-sdk-java\deploy\local-storage')).Path
$composePath = Join-Path $storageRoot 'compose.yaml'
$docker = Get-Command docker -ErrorAction SilentlyContinue
$wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
$keepAlivePath = Join-Path $demoRoot 'target\local-storage-wsl.pid'

function ConvertTo-WslPath([string]$WindowsPath) {
    if ($WindowsPath -notmatch '^(?<drive>[A-Za-z]):(?<rest>.*)$') {
        throw "Expected an absolute Windows path: $WindowsPath"
    }
    return "/mnt/$($Matches.drive.ToLower())$($Matches.rest.Replace('\', '/'))"
}

function Stop-PreviousWslKeepAlive {
    if (-not (Test-Path -LiteralPath $keepAlivePath)) {
        return
    }
    $previousPid = [int](Get-Content -LiteralPath $keepAlivePath -Raw).Trim()
    $previous = Get-Process -Id $previousPid -ErrorAction SilentlyContinue
    if ($null -ne $previous -and $previous.ProcessName -eq 'wsl') {
        Stop-Process -Id $previousPid -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $keepAlivePath -Force -ErrorAction SilentlyContinue
}

function Wait-HttpEndpoint([string]$Uri) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($StorageTimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -Uri $Uri -Method Get -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return
            }
        }
        catch { }
        Start-Sleep -Seconds 2
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw "Local storage endpoint did not become ready: $Uri"
}

function Start-StorageDependentsWithDocker {
    & docker compose --project-name openan-complaint-demo -f $composePath up -d data-prepper jaeger collector
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($null -ne $docker) {
    Stop-PreviousWslKeepAlive
    & docker compose --project-name openan-complaint-demo -f $composePath up -d
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Wait-HttpEndpoint 'http://127.0.0.1:19200/'
    Start-StorageDependentsWithDocker
    Wait-HttpEndpoint 'http://127.0.0.1:16686/'
    Write-Output 'LOCAL_STORAGE_RUNTIME=windows-docker'
    exit 0
}

if ($null -eq $wsl) {
    throw 'Neither Docker CLI nor wsl.exe is available.'
}
Stop-PreviousWslKeepAlive
& wsl.exe -d $WslDistro -u root -- docker info | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "WSL Docker daemon is unavailable in distro $WslDistro."
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $keepAlivePath) | Out-Null
$keepAlive = Start-Process -FilePath 'wsl.exe' -ArgumentList @(
        '-d', $WslDistro, '-u', 'root', '--', 'sleep', "$WslKeepAliveSeconds") -WindowStyle Hidden -PassThru
$keepAlive.Id | Set-Content -LiteralPath $keepAlivePath -Encoding ascii
$wslComposePath = ConvertTo-WslPath $composePath
$wslArgs = @(
    '-d', $WslDistro, '-u', 'root', '--', 'docker', 'compose',
    '--project-name', 'openan-complaint-demo', '-f', $wslComposePath, 'up', '-d')
try {
    & wsl.exe @wslArgs
    if ($LASTEXITCODE -ne 0) { throw "WSL Docker Compose failed with exit code $LASTEXITCODE." }
    Wait-HttpEndpoint 'http://127.0.0.1:19200/'
    $wslDependentArgs = @(
        '-d', $WslDistro, '-u', 'root', '--', 'docker', 'compose',
        '--project-name', 'openan-complaint-demo', '-f', $wslComposePath,
        'up', '-d', 'data-prepper', 'jaeger', 'collector')
    & wsl.exe @wslDependentArgs
    if ($LASTEXITCODE -ne 0) { throw "WSL Docker Compose dependency restart failed with exit code $LASTEXITCODE." }
    Wait-HttpEndpoint 'http://127.0.0.1:16686/'
    Write-Output "LOCAL_STORAGE_RUNTIME=wsl:$WslDistro"
}
catch {
    Stop-PreviousWslKeepAlive
    throw
}
