<#
.SYNOPSIS
    Niyantran Employee Monitoring V2 - Windows Uninstaller Script
.DESCRIPTION
    Stops running V2 agent instances and cleanly removes installed files and shortcuts.
#>

param(
    [string]$TargetDir = "$env:LOCALAPPDATA\NiyantranMonitoringV2"
)

$ErrorActionPreference = "Continue"
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Niyantran Employee Monitoring V2 - Uninstaller" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Stop active processes
Write-Host "[1/3] Terminating active V2 Agent processes..." -ForegroundColor Yellow
$procs = Get-Process -Name "NiyantranWin32Helper" -ErrorAction SilentlyContinue
if ($procs) {
    $procs | Stop-Process -Force
    Write-Host "      Stopped $($procs.Count) process(es)." -ForegroundColor Green
} else {
    Write-Host "      No active V2 processes running." -ForegroundColor Green
}

# 2. Remove Start Menu Shortcut
Write-Host "[2/3] Removing Start Menu Shortcuts..." -ForegroundColor Yellow
$startMenuDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Niyantran"
if (Test-Path $startMenuDir) {
    Remove-Item $startMenuDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "      Removed Start Menu shortcuts." -ForegroundColor Green
} else {
    Write-Host "      No Start Menu shortcuts found." -ForegroundColor Green
}

# 3. Remove Application Files
Write-Host "[3/3] Removing Application Directory: $TargetDir" -ForegroundColor Yellow
if (Test-Path $TargetDir) {
    Remove-Item $TargetDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "      Removed application files cleanly." -ForegroundColor Green
} else {
    Write-Host "      Application directory already removed." -ForegroundColor Green
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  Niyantran Monitoring V2 Clean Uninstallation Complete!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
