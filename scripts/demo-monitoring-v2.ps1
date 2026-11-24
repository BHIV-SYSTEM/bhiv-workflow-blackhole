# <#
.SYNOPSIS
    One‑command demo launcher for Niyantran Employee Monitoring V2.
.DESCRIPTION
    Verifies required tools, starts backend, frontend, MongoDB, installs the Windows desktop agent, and opens the employee dashboard.
    All steps are logged to the console. No manual intervention required.
#>

# 1. Verify prerequisites
Write-Host "[1/5] Verifying prerequisites..." -ForegroundColor Cyan
$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm -ErrorAction SilentlyContinue
$mongo = Get-Service -Name MongoDB -ErrorAction SilentlyContinue
if (-not $node) { Write-Error "Node.js not found in PATH. Install from https://nodejs.org/"; exit 1 }
if (-not $npm) { Write-Error "npm not found in PATH. Install Node.js which includes npm."; exit 1 }
if ($mongo.Status -ne 'Running') {
    Write-Host "Starting MongoDB service..." -ForegroundColor Yellow
    Start-Service -Name MongoDB
    Start-Sleep -Seconds 3
}

# 2. Start backend server
Write-Host "[2/5] Starting backend (port 5000)..." -ForegroundColor Cyan
Push-Location "g:/Blackhole/Niyantran/server"
Start-Process -FilePath "npm" -ArgumentList "run","dev" -NoNewWindow -RedirectStandardOutput "backend.log"
Pop-Location
Start-Sleep -Seconds 5

# 3. Start frontend dev server
Write-Host "[3/5] Starting frontend (Vite on port 5173)..." -ForegroundColor Cyan
Push-Location "g:/Blackhole/Niyantran/client"
Start-Process -FilePath "npm" -ArgumentList "run","dev" -NoNewWindow -RedirectStandardOutput "frontend.log"
Pop-Location
Start-Sleep -Seconds 8

# 4. Install Windows Desktop Agent
Write-Host "[4/5] Installing Windows Desktop Agent..." -ForegroundColor Cyan
$installer = "g:/Blackhole/Niyantran/employee-agent-v2/installer/install-agent.ps1"
if (Test-Path $installer) {
    # Execute the installer script in a new PowerShell session
    powershell -ExecutionPolicy Bypass -File $installer -TargetDir "$env:LOCALAPPDATA\NiyantranMonitoringV2"
} else {
    Write-Error "Installer script not found at $installer"
    exit 1
}

# 5. Open employee dashboard in default browser
Write-Host "[5/5] Launching employee dashboard..." -ForegroundColor Cyan
Start-Process "http://localhost:5173"

Write-Host "Demo completed successfully. Press any key to exit..." -ForegroundColor Green
[void][System.Console]::ReadKey(true)
