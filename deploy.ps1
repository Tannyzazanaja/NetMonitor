<#
.SYNOPSIS
    NetMonitor Enterprise Turn-Key Deployment Script (Windows / Windows Server)
.DESCRIPTION
    Automated pre-flight checks, environment initialization, cryptographic secret generation,
    hardened Docker Compose orchestration startup, and service health verification.
.PARAMETER RemoteServer
    Optional remote Linux/Ubuntu host to deploy to over SSH instead of local Docker.
.PARAMETER ServerUser
    Remote SSH username (defaults to 'root').
#>

param (
    [string]$RemoteServer = "192.168.109.147",
    [string]$ServerUser = "root",
    [switch]$SkipBuild = $false
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "    NETMONITOR ENTERPRISE PLATFORM - TURN-KEY DEPLOYMENT & HEALTHCHECK" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# =============================================================================
# MODE A: Local Docker Turn-Key Deployment (Default)
# =============================================================================
if ([string]::IsNullOrWhiteSpace($RemoteServer)) {
    Write-Host "`n[Step 1/5] Running Pre-Flight System Checks..." -ForegroundColor Blue

    # 1.1 Check Docker CLI
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerCmd) {
        Write-Host "[ERROR] Docker is not installed or not in PATH." -ForegroundColor Red
        Write-Host "Please install Docker Desktop or Docker Engine: https://docs.docker.com/desktop/install/windows-install/"
        exit 1
    }
    Write-Host "  [OK] Docker CLI is available." -ForegroundColor Green

    # 1.2 Check Docker Daemon
    try {
        $dockerInfo = docker info 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Docker daemon not running"
        }
        Write-Host "  [OK] Docker engine is active and responsive." -ForegroundColor Green
    }
    catch {
        Write-Host "[ERROR] Docker daemon is not running. Please start Docker Desktop/Engine." -ForegroundColor Red
        exit 1
    }

    # 1.3 Check Docker Compose
    $composeCmd = "docker compose"
    $composeCheck = docker compose version 2>&1
    if ($LASTEXITCODE -ne 0) {
        $composeCheckLegacy = docker-compose version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $composeCmd = "docker-compose"
        } else {
            Write-Host "[ERROR] Docker Compose is not installed." -ForegroundColor Red
            exit 1
        }
    }
    Write-Host "  [OK] Docker Compose is available ($composeCmd)." -ForegroundColor Green

    # 1.4 Check RAM and Disk
    try {
        $osInfo = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
        if ($osInfo) {
            $totalRamGb = [math]::Round($osInfo.TotalVisibleMemorySize / 1MB, 1)
            $freeRamGb = [math]::Round($osInfo.FreePhysicalMemory / 1MB, 1)
            Write-Host "  [OK] System Memory: $totalRamGb GB Total ($freeRamGb GB Free)." -ForegroundColor Green
        }
    } catch {}

    try {
        $driveLetter = (Get-Location).Drive.Name
        $diskInfo = Get-PSDrive -Name $driveLetter -ErrorAction SilentlyContinue
        if ($diskInfo) {
            $freeDiskGb = [math]::Round($diskInfo.Free / 1GB, 1)
            if ($freeDiskGb -lt 5) {
                Write-Host "  [ERROR] Insufficient disk space: Only $freeDiskGb GB free on drive $driveLetter." -ForegroundColor Red
                exit 1
            }
            Write-Host "  [OK] Available Disk Space: $freeDiskGb GB on drive $driveLetter." -ForegroundColor Green
        }
    } catch {}

    # -------------------------------------------------------------------------
    # 2. Environment Initialization & Secret Generation
    # -------------------------------------------------------------------------
    Write-Host "`n[Step 2/5] Initializing Environment & Cryptographic Secrets..." -ForegroundColor Blue

    $envPath = Join-Path $ScriptDir ".env"
    $envExamplePath = Join-Path $ScriptDir ".env.example"

    if (-not (Test-Path $envPath)) {
        if (Test-Path $envExamplePath) {
            Write-Host "  -> .env file not found. Auto-generating from .env.example..." -ForegroundColor Yellow
            Copy-Item $envExamplePath $envPath
        } else {
            Write-Host "[ERROR] Neither .env nor .env.example found!" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "  [OK] Existing .env configuration file found." -ForegroundColor Green
    }

    # Load and update secrets if missing
    $envContent = Get-Content $envPath -Raw

    # Generate SESSION_SECRET if blank
    if ($envContent -match 'SESSION_SECRET=\s*(\r?\n)') {
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $bytes = New-Object byte[] 32
        $rng.GetBytes($bytes)
        $newSessionSecret = -join ($bytes | ForEach-Object { "{0:x2}" -f $_ })
        $envContent = $envContent -replace 'SESSION_SECRET=\s*(\r?\n)', "SESSION_SECRET=$newSessionSecret`$1"
        Write-Host "  [OK] Auto-generated cryptographic SESSION_SECRET." -ForegroundColor Green
    }

    # Generate JWT_SECRET if blank
    if ($envContent -match 'JWT_SECRET=\s*(\r?\n)') {
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $bytes = New-Object byte[] 32
        $rng.GetBytes($bytes)
        $newJwtSecret = -join ($bytes | ForEach-Object { "{0:x2}" -f $_ })
        $envContent = $envContent -replace 'JWT_SECRET=\s*(\r?\n)', "JWT_SECRET=$newJwtSecret`$1"
        Write-Host "  [OK] Auto-generated cryptographic JWT_SECRET." -ForegroundColor Green
    }

    # Generate EMERGENCY_PASSWORD if blank
    $emergencyPass = ""
    if ($envContent -match 'EMERGENCY_PASSWORD=\s*(\r?\n)') {
        $chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!#$"
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $bytes = New-Object byte[] 12
        $rng.GetBytes($bytes)
        $emergencyPass = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
        $envContent = $envContent -replace 'EMERGENCY_PASSWORD=\s*(\r?\n)', "EMERGENCY_PASSWORD=$emergencyPass`$1"
        Write-Host "  [★] Auto-generated initial EMERGENCY_PASSWORD: $emergencyPass" -ForegroundColor Yellow
    }

    Set-Content -Path $envPath -Value $envContent -Encoding UTF8

    # Extract HTTP_PORT from .env
    $httpPort = 80
    if ($envContent -match 'HTTP_PORT=(\d+)') {
        $httpPort = [int]$matches[1]
    }

    # 1.5 Port Collision Check
    try {
        $activeConns = Get-NetTCPConnection -LocalPort $httpPort -State Listen -ErrorAction SilentlyContinue
        if ($activeConns) {
            Write-Host "  [WARNING] Port $httpPort is already occupied on this host. Consider changing HTTP_PORT in .env." -ForegroundColor Yellow
        }
    } catch {}

    # -------------------------------------------------------------------------
    # 3. Directory Structure Setup
    # -------------------------------------------------------------------------
    Write-Host "`n[Step 3/5] Setting Up Directory Tree..." -ForegroundColor Blue

    $directories = @(
        "data/targets/blackbox",
        "data/targets/snmp",
        "config/nginx/ssl"
    )
    foreach ($dir in $directories) {
        $targetDir = Join-Path $ScriptDir $dir
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
    }
    Write-Host "  [OK] Verified runtime directory tree." -ForegroundColor Green

    # -------------------------------------------------------------------------
    # 4. Container Build & Orchestration Startup
    # -------------------------------------------------------------------------
    Write-Host "`n[Step 4/5] Building & Launching Container Services..." -ForegroundColor Blue

    if (-not $SkipBuild) {
        Invoke-Expression "$composeCmd build"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Docker build failed." -ForegroundColor Red
            exit $LASTEXITCODE
        }
    }

    Invoke-Expression "$composeCmd up -d"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Docker compose up failed." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "  [OK] Containers started in background." -ForegroundColor Green

    # -------------------------------------------------------------------------
    # 5. Health Check & Service Verification Loop
    # -------------------------------------------------------------------------
    Write-Host "`n[Step 5/5] Performing Health Check & Service Verification..." -ForegroundColor Blue

    $healthUrl = "http://localhost:$httpPort/api/health"
    $maxWaitSec = 60
    $elapsed = 0
    $isHealthy = $false

    Write-Host -NoNewline "Waiting for NetMonitor Gateway to become healthy"
    while ($elapsed -lt $maxWaitSec) {
        try {
            $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
            if ($resp.StatusCode -eq 200) {
                $isHealthy = $true
                break
            }
        } catch {}
        Write-Host -NoNewline "."
        Start-Sleep -Seconds 2
        $elapsed += 2
    }
    Write-Host ""

    if ($isHealthy) {
        Write-Host "  [OK] System is HEALTHY (Response received from $healthUrl)." -ForegroundColor Green
    } else {
        Write-Host "  [WARNING] Health check timeout ($maxWaitSec s). Services may still be initializing indices." -ForegroundColor Yellow
    }

    # -------------------------------------------------------------------------
    # 6. Deployment Summary
    # -------------------------------------------------------------------------
    Write-Host "`n================================================================================" -ForegroundColor Cyan
    Write-Host "                   DEPLOYMENT COMPLETED SUCCESSFULLY" -ForegroundColor Cyan
    Write-Host "================================================================================" -ForegroundColor Cyan

    Write-Host "`nContainer Status:" -ForegroundColor White
    Invoke-Expression "$composeCmd ps"

    Write-Host "`nPlatform Access URLs:" -ForegroundColor White
    Write-Host "  • Web Management Portal: http://localhost:$httpPort" -ForegroundColor Cyan
    Write-Host "  • Health Check API:      http://localhost:$httpPort/api/health" -ForegroundColor Cyan

    if ($emergencyPass) {
        Write-Host "`nInitial Administrative Credentials:" -ForegroundColor White
        Write-Host "  • Username: admin" -ForegroundColor White
        Write-Host "  • Password: $emergencyPass" -ForegroundColor Yellow
        Write-Host "  (Please change your password immediately after initial login via Setup Wizard)" -ForegroundColor DarkYellow
    }

    Write-Host "`nQuick Operations Commands:" -ForegroundColor White
    Write-Host "  • View Live Logs: $composeCmd logs -f netmonitor" -ForegroundColor Green
    Write-Host "  • Stop Services:  $composeCmd down" -ForegroundColor Green
    Write-Host "  • Restart:        $composeCmd restart" -ForegroundColor Green
    Write-Host ""
}
# =============================================================================
# MODE B: Remote Deployment via SSH
# =============================================================================
else {
    Write-Host "`n[Remote Deploy Mode] Target Host: $ServerUser@$RemoteServer" -ForegroundColor Yellow

    Write-Host "[1/3] Building production frontend bundle..." -ForegroundColor Green
    $npmCmd = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }
    & $npmCmd run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Frontend build failed!" -ForegroundColor Red
        exit $LASTEXITCODE
    }

    Write-Host "[2/3] Uploading release package to $RemoteServer..." -ForegroundColor Green
    $remoteHost = "$ServerUser@$RemoteServer"
    ssh $remoteHost "mkdir -p /var/www/netmonitor-react/dist /var/www/netmonitor-react/server /etc/prometheus/targets/blackbox /etc/prometheus/targets/snmp"
    $remoteDistPath = $remoteHost + ":/var/www/netmonitor-react/dist/"
    $remoteServerPath = $remoteHost + ":/var/www/netmonitor-react/server/"
    scp -r dist/* $remoteDistPath
    scp -r server/* $remoteServerPath

    Write-Host "[3/3] Restarting services on remote host..." -ForegroundColor Green
    ssh $remoteHost "cd /var/www/netmonitor-react/server && npm ci --omit=dev && pm2 restart netmonitor-backend || pm2 start server.js --name netmonitor-backend"

    Write-Host "`n[OK] Remote deployment completed to http://$RemoteServer" -ForegroundColor Green
}
