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
    [ValidateSet('success', 'authorization-denied')]
    [string]$Case = 'success'
)

$ErrorActionPreference = 'Stop'
$demoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$reportPath = Join-Path $demoRoot "artifacts\$RunId.json"
$failures = [System.Collections.Generic.List[string]]::new()
if (-not (Test-Path -LiteralPath $reportPath)) {
    throw "Report not found: $reportPath"
}
$report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
$history = @($report.history)
$rootUrls = @($report.agentUrls)
$roleNames = @('west', 'east', 'transport', 'waimo')
$roleReports = @()
$allRecords = @()

if ([string]$report.transportMode -ne 'multi-http') { $failures.Add("expected multi-http, got $($report.transportMode)") }
if ([string]$report.workflowId -ne '1d4c367d-9f0c-4400-85d2-caaf21ee37af') { $failures.Add('workflowId does not match PR #29') }
if ($rootUrls.Count -ne 4) { $failures.Add("expected four root AgentCard URLs, got $($rootUrls.Count)") }

foreach ($role in $roleNames) {
    $path = Join-Path $demoRoot "artifacts\$RunId.$role.json"
    if (-not (Test-Path -LiteralPath $path)) {
        $failures.Add("missing role report: $path")
        continue
    }
    $roleReport = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    $roleReports += $roleReport
    if ([string]$roleReport.role -ne $role) { $failures.Add("role report mismatch: expected $role") }
    if ([string]::IsNullOrWhiteSpace([string]$roleReport.roleUrl)) { $failures.Add("$role did not record roleUrl") }
    $allRecords += @($roleReport.agentRecords)
}

$transportRecords = @($roleReports | Where-Object { $_.role -eq 'transport' } | ForEach-Object { $_.agentRecords })
$regionalRecords = @($roleReports | Where-Object { $_.role -in @('west', 'east') } | ForEach-Object { $_.agentRecords })

if ($Case -eq 'success') {
    if (-not $report.success) { $failures.Add('success case did not complete') }
    if ($history.Count -ne 7) { $failures.Add("expected 7 history entries, got $($history.Count)") }
    if (-not ($history.step -contains 'step7')) { $failures.Add('closure step is missing') }
    foreach ($operation in @('diagnosis-east', 'diagnosis-west', 'authorization', 'restoration')) {
        if (@($transportRecords | Where-Object { $_.kind -eq 'nested-task-http' -and $_.operation -eq $operation -and $_.status -eq 'completed' }).Count -ne 1) {
            $failures.Add("transport did not complete nested operation $operation")
        }
    }
    foreach ($step in @('step4', 'step5', 'step6')) {
        if (@($transportRecords | Where-Object { $_.kind -eq 'workflow-task' -and $_.step -eq $step -and $_.status -eq 'completed' }).Count -ne 1) {
            $failures.Add("transport workflow record missing for $step")
        }
    }
    $diagnosis = @($transportRecords | Where-Object { $_.operation -in @('diagnosis-east', 'diagnosis-west') -and $_.status -eq 'completed' })
    if ($diagnosis.Count -ne 2) {
        $failures.Add('two completed regional diagnosis records are required')
    } else {
        $latestStart = ($diagnosis | Measure-Object -Property startedNanos -Maximum).Maximum
        $earliestFinish = ($diagnosis | Measure-Object -Property finishedNanos -Minimum).Minimum
        if ([long]$latestStart -ge [long]$earliestFinish) { $failures.Add('regional diagnosis windows did not overlap') }
    }
    if (@($regionalRecords | Where-Object { $_.kind -eq 'workflow-task' -or $_.kind -eq 'nested-task-http' }).Count -eq 0) {
        $failures.Add('regional JVMs did not record any agent work')
    }
} else {
    if ($report.success) { $failures.Add('authorization-denied case unexpectedly succeeded') }
    if ($history.Count -ne 5) { $failures.Add("expected 5 history entries, got $($history.Count)") }
    if (-not ($history.step -contains 'step5')) { $failures.Add('failed dispatch step is missing') }
    if ($history.step -contains 'step6' -or $history.step -contains 'step7') { $failures.Add('downstream steps ran after authorization denial') }
    if (@($history | Where-Object { $_.errorCode -eq 'authorization.denied' }).Count -ne 1) { $failures.Add('authorization.denied was not recorded exactly once') }
    if (@($transportRecords | Where-Object { $_.operation -eq 'authorization' -and $_.status -eq 'failed' }).Count -ne 1) { $failures.Add('transport authorization failure record is missing') }
    if (@($transportRecords | Where-Object { $_.operation -eq 'restoration' }).Count -ne 0) { $failures.Add('restoration ran after authorization denial') }
}

$summary = [ordered]@{
    runId = $RunId
    case = $Case
    success = [bool]$report.success
    historyCount = $history.Count
    roleCount = $roleReports.Count
    recordCount = $allRecords.Count
    failureCount = $failures.Count
    report = $reportPath
}
$summary | ConvertTo-Json
if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    exit 1
}
