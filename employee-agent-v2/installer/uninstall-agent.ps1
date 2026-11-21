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

# 2. Remove Start Menu and Desktop Shortcuts
Write-Host "[2/4] Removing Start Menu & Desktop Shortcuts..." -ForegroundColor Yellow
$startMenuDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Niyantran"
if (Test-Path $startMenuDir) {
    Remove-Item $startMenuDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "      Removed Start Menu shortcuts." -ForegroundColor Green
} else {
    Write-Host "      No Start Menu shortcuts found." -ForegroundColor Green
}

$desktopDir = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
$desktopLnk = "$desktopDir\Niyantran Employee Monitoring V2.lnk"
if (Test-Path $desktopLnk) {
    Remove-Item $desktopLnk -Force -ErrorAction SilentlyContinue
    Write-Host "      Removed Desktop shortcut." -ForegroundColor Green
}

# 3. Clean up Registry Protocol & Uninstall Entry
Write-Host "[3/4] Cleaning Registry entries..." -ForegroundColor Yellow
if (Test-Path "HKCU:\Software\Classes\niyantran") {
    Remove-Item "HKCU:\Software\Classes\niyantran" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "      Removed custom protocol registration (niyantran://)." -ForegroundColor Green
}
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\NiyantranMonitoringV2"
if (Test-Path $uninstallKey) {
    Remove-Item $uninstallKey -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "      Removed Add/Remove Programs registration." -ForegroundColor Green
}

# 4. Remove Application Files
Write-Host "[4/4] Removing Application Directory: $TargetDir" -ForegroundColor Yellow
if (Test-Path $TargetDir) {
    Remove-Item $TargetDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "      Removed application files cleanly." -ForegroundColor Green
} else {
    Write-Host "      Application directory already removed." -ForegroundColor Green
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  Niyantran Monitoring V2 Clean Uninstallation Complete!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
