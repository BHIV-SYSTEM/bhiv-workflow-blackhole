<#
.SYNOPSIS
    Niyantran Employee Monitoring V2 - Windows Installer Script
.DESCRIPTION
    Installs the Employee Monitoring V2 Desktop Agent into the current user's AppData.
    Verifies V1 non-interference, installs native Win32 helpers, creates Start Menu shortcuts,
    and sets up clean uninstallation.
#>

param(
    [string]$TargetDir = "$env:LOCALAPPDATA\NiyantranMonitoringV2",
    [switch]$SkipShortcut
)

$ErrorActionPreference = "Stop"
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Niyantran Employee Monitoring V2 - Windows Installer" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. OS & Architecture Verification
$is64Bit = [Environment]::Is64BitOperatingSystem
$osVersion = [Environment]::OSVersion.Version
Write-Host "[1/6] Verifying Windows Environment..." -ForegroundColor Yellow
if (-not $is64Bit) {
    Write-Error "CRITICAL: 64-bit Windows 10/11 is required."
}
Write-Host "      Detected: Windows $osVersion (64-bit) - OK" -ForegroundColor Green

# 2. V1 Non-Interference Check
Write-Host "[2/6] Checking for Legacy V1 Monitoring Agent..." -ForegroundColor Yellow
$v1Processes = Get-Process -ErrorAction SilentlyContinue | Where-Object { 
    $_.ProcessName -like "*employee-activity-agent*" -or $_.ProcessName -like "*niyantran-agent*" 
}
if ($v1Processes) {
    Write-Host "      NOTICE: Legacy V1 Agent detected running ($($v1Processes.Count) process(es))." -ForegroundColor Yellow
    Write-Host "      V2 will install safely without modifying or terminating V1." -ForegroundColor Green
} else {
    Write-Host "      No conflicting V1 agent active." -ForegroundColor Green
}

# 3. Create Installation Directory
Write-Host "[3/6] Creating Target Directory: $TargetDir" -ForegroundColor Yellow
if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}
New-Item -ItemType Directory -Path "$TargetDir\bin" -Force | Out-Null
New-Item -ItemType Directory -Path "$TargetDir\src" -Force | Out-Null

# 4. Copy Agent Files & Compiled Helper
Write-Host "[4/6] Deploying Agent Components & Native Win32 Helper..." -ForegroundColor Yellow
$sourceRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path "$sourceRoot\bin\NiyantranWin32Helper.exe")) {
    Write-Host "      Compiling NiyantranWin32Helper.exe..." -ForegroundColor Cyan
    $cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
    & $cscPath /nologo /r:System.Security.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /out:"$sourceRoot\bin\NiyantranWin32Helper.exe" "$sourceRoot\native-src\NiyantranWin32Helper.cs"
}

Copy-Item "$sourceRoot\bin\NiyantranWin32Helper.exe" "$TargetDir\bin\" -Force
Copy-Item "$sourceRoot\src\*" "$TargetDir\src\" -Recurse -Force
Copy-Item "$sourceRoot\package.json" "$TargetDir\" -Force

Write-Host "      Binaries and modules copied successfully." -ForegroundColor Green

# 5. Generate Start Menu Shortcut
if (-not $SkipShortcut) {
    Write-Host "[5/6] Creating Start Menu Shortcut..." -ForegroundColor Yellow
    $startMenuDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Niyantran"
    if (-not (Test-Path $startMenuDir)) {
        New-Item -ItemType Directory -Path $startMenuDir -Force | Out-Null
    }

    $wshell = New-Object -ComObject WScript.Shell
    $shortcutPath = "$startMenuDir\Niyantran Employee Monitoring V2.lnk"
    $shortcut = $wshell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "$TargetDir\bin\NiyantranWin32Helper.exe"
    $shortcut.Arguments = "tray DEV-INSTALLED"
    $shortcut.Description = "Niyantran Employee Monitoring V2 Desktop Agent"
    $shortcut.WorkingDirectory = $TargetDir
    $shortcut.Save()
    Write-Host "      Shortcut created at: $shortcutPath" -ForegroundColor Green
}

# 6. Generate Clean Uninstaller
Write-Host "[6/6] Generating Uninstaller Script..." -ForegroundColor Yellow
$uninstallScript = @"
Write-Host 'Uninstalling Niyantran Employee Monitoring V2...' -ForegroundColor Yellow
Get-Process -Name 'NiyantranWin32Helper' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
`$startMenuDir = "`$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Niyantran"
if (Test-Path "`$startMenuDir") {
    Remove-Item "`$startMenuDir" -Recurse -Force -ErrorAction SilentlyContinue
}
`$target = "$TargetDir"
if (Test-Path "`$target") {
    Remove-Item "`$target" -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host 'Niyantran V2 Agent uninstalled cleanly.' -ForegroundColor Green
"@

Set-Content -Path "$TargetDir\uninstall.ps1" -Value $uninstallScript -Force
Write-Host "      Uninstaller saved to: $TargetDir\uninstall.ps1" -ForegroundColor Green

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  Niyantran Monitoring V2 Installation Completed!" -ForegroundColor Green
Write-Host "  Target: $TargetDir" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
