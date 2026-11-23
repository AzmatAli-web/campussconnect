<#
  Runs the same isolated checks used by CampusConnect CI on a Windows PC.
  No Firebase Admin credentials or live Atlas access are needed.
  Does NOT start the backend, update roles, or publish content.
#>
param(
  [switch]$SkipFlutter,
  [switch]$SkipIntegration
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Invoke-CampusCheck {
  param(
    [Parameter(Mandatory=$true)][string]$Title,
    [Parameter(Mandatory=$true)][string]$WorkingDirectory,
    [Parameter(Mandatory=$true)][string]$Executable,
    [Parameter(Mandatory=$true)][string[]]$Arguments
  )
  Write-Host ""
  Write-Host ">>> $Title" -ForegroundColor Cyan
  Push-Location (Join-Path $root $WorkingDirectory)
  try {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$Title FAILED (exit code $LASTEXITCODE)"
    }
    Write-Host "PASS: $Title" -ForegroundColor Green
  } finally {
    Pop-Location
  }
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw 'npm.cmd is required. Install Node.js 22+ and reopen PowerShell.'
}
Invoke-CampusCheck 'Backend dependencies' 'backend' 'npm.cmd' @('install','--no-audit','--no-fund')
Invoke-CampusCheck 'Backend unit tests' 'backend' 'npm.cmd' @('test')

if (-not $SkipIntegration) {
  $previousMongoVersion = $env:MONGOMS_VERSION
  $env:MONGOMS_VERSION = '7.0.24'
  try {
    Invoke-CampusCheck 'Isolated MongoDB + Firebase fixture integration' 'backend' 'npm.cmd' @('run','test:integration')
  } finally {
    $env:MONGOMS_VERSION = $previousMongoVersion
  }
}

Invoke-CampusCheck 'React dependencies' 'web' 'npm.cmd' @('install','--no-audit','--no-fund')
Invoke-CampusCheck 'React unit tests' 'web' 'npm.cmd' @('test')
Invoke-CampusCheck 'React production bundle and lazy chunk contract' 'web' 'npm.cmd' @('run','build')

if (-not $SkipFlutter) {
  if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
    throw 'Flutter is not on PATH. Install/configure Flutter or rerun with -SkipFlutter.'
  }
  Invoke-CampusCheck 'Flutter dependencies' 'mobile' 'flutter' @('pub','get')
  Invoke-CampusCheck 'Flutter static analysis' 'mobile' 'flutter' @('analyze')
  Invoke-CampusCheck 'Flutter unit tests' 'mobile' 'flutter' @('test')
}

Write-Host ""
Write-Host 'ALL REQUESTED CHECKS PASSED.' -ForegroundColor Green
Write-Host 'Physical-phone and privileged-role acceptance are separate manual steps.'
