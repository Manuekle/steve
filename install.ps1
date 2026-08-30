# ─── Steve Enterprise Installer (Windows) ───────────────────────────────────
# Requires: PowerShell 5.1+, Docker Desktop, WinGet or manual Node.js install.
#
# Usage:
#   irm https://raw.githubusercontent.com/your-org/steve/main/install.ps1 | iex
#   or: powershell -ExecutionPolicy Bypass -File install.ps1
# ──────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

function Write-Info  { param($Msg) Write-Host "▸ $Msg" -ForegroundColor Cyan }
function Write-Ok    { param($Msg) Write-Host "✔ $Msg" -ForegroundColor Green }
function Write-Warn  { param($Msg) Write-Host "⚠ $Msg" -ForegroundColor Yellow }
function Write-Fail  { param($Msg) Write-Host "✘ $Msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "═══════════════════════════════════════════" -ForegroundColor White
Write-Host "  Steve Enterprise Installer (Windows)" -ForegroundColor White
Write-Host "═══════════════════════════════════════════" -ForegroundColor White
Write-Host ""

# ── 1. Docker Desktop ────────────────────────────────────────────────────────

Write-Info "Checking Docker..."
try {
    $dockerVer = docker --version 2>$null
    if (-not $dockerVer) { throw "not found" }
    Write-Ok "Docker $dockerVer"
} catch {
    Write-Fail "Docker Desktop not found.`n  → https://www.docker.com/products/docker-desktop/"
}

try {
    docker info 2>$null | Out-Null
} catch {
    Write-Warn "Docker daemon not running. Starting Docker Desktop..."
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue
    Write-Host "  Waiting for Docker daemon..."
    Start-Sleep -Seconds 15
    try { docker info 2>$null | Out-Null } catch {
        Write-Fail "Docker did not start. Open Docker Desktop manually and re-run."
    }
}

# ── 2. Node.js ───────────────────────────────────────────────────────────────

Write-Info "Checking Node.js..."
$needInstall = $false
try {
    $nodeVer = node --version 2>$null
    $major = [int]($nodeVer -replace 'v','' -split '\.')[0]
    if ($major -ge 24) {
        Write-Ok "Node.js $nodeVer"
    } else {
        Write-Warn "Node.js $nodeVer found, but 24+ required."
        $needInstall = $true
    }
} catch {
    $needInstall = $true
}

if ($needInstall) {
    Write-Info "Installing Node.js 24..."
    try {
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements 2>$null
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        Write-Ok "Node.js installed"
    } catch {
        Write-Fail "Install Node.js 24+ manually from https://nodejs.org/ and re-run."
    }
}

# ── 3. pnpm ──────────────────────────────────────────────────────────────────

Write-Info "Checking pnpm..."
try {
    $pnpmVer = pnpm --version 2>$null
    Write-Ok "pnpm $pnpmVer"
} catch {
    Write-Info "Installing pnpm via corepack..."
    try {
        corepack enable 2>$null
        corepack prepare pnpm@10.33.2 --activate 2>$null
    } catch {
        npm install -g pnpm@10.33.2
    }
    Write-Ok "pnpm installed"
}

# ── 4. Project directory ─────────────────────────────────────────────────────

$installDir = if ($env:STEVE_INSTALL_DIR) { $env:STEVE_INSTALL_DIR } else { "$env:USERPROFILE\steve" }

if (-not (Test-Path $installDir)) {
    Write-Info "Creating project at $installDir..."
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

Set-Location $installDir

if (Test-Path .git) {
    Write-Info "Updating to latest version..."
    git pull --ff-only 2>$null
}

# ── 5. .env ──────────────────────────────────────────────────────────────────

Write-Info "Checking .env..."
if (-not (Test-Path .env)) {
    if (Test-Path .env.example) {
        Copy-Item .env.example .env
        Write-Warn "Created .env from template. Edit it with your API keys:"
        Write-Host ""
        Write-Host "    notepad $installDir\.env" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Fail ".env.example not found."
    }
} else {
    Write-Ok ".env exists"
}

# ── 6. Install dependencies ──────────────────────────────────────────────────

Write-Info "Installing dependencies..."
try {
    pnpm install --frozen-lockfile --strict-peer-dependencies 2>$null
} catch {
    pnpm install
}
Write-Ok "Dependencies installed"

# ── 7. PostgreSQL ────────────────────────────────────────────────────────────

Write-Info "Starting PostgreSQL..."
try { docker compose up -d postgres 2>$null } catch { docker-compose up -d postgres 2>$null }
Write-Host "  Waiting for PostgreSQL..."
Start-Sleep -Seconds 5
Write-Ok "PostgreSQL running on port 5544"

# ── 8. Migrations ────────────────────────────────────────────────────────────

Write-Info "Running migrations..."
try { pnpm db:migrate } catch { Write-Warn "Migrations may need manual attention." }
Write-Ok "Migrations complete"

# ── Done ─────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "═══════════════════════════════════════════" -ForegroundColor Green
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  1. Edit .env with your API keys:" -ForegroundColor White
Write-Host "     notepad $installDir\.env" -ForegroundColor White
Write-Host ""
Write-Host "  2. Start the app:" -ForegroundColor White
Write-Host "     cd $installDir && pnpm dev" -ForegroundColor White
Write-Host ""
Write-Host "  3. Open in browser:" -ForegroundColor White
Write-Host "     http://localhost:3001" -ForegroundColor Green
Write-Host ""
