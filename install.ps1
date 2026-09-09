# ─── Senka Enterprise Installer (Windows) ───────────────────────────────────
# Requires: PowerShell 5.1+, Docker Desktop, WinGet or manual Node.js install.
#
# Usage:
#   irm https://raw.githubusercontent.com/Manuekle/senka/main/install.ps1 | iex
#   or: powershell -ExecutionPolicy Bypass -File install.ps1
# ──────────────────────────────────────────────────────────────────────────────

# NOT "Stop": with $ErrorActionPreference = "Stop", a native command's normal
# informational stderr output (docker-compose's status lines, for one) gets
# raised as a terminating NativeCommandError and kills the script, even
# through `2>$null`. Every step below checks $LASTEXITCODE for real failures
# instead of relying on that preference.
$ErrorActionPreference = "Continue"

function Write-Info  { param($Msg) Write-Host "▸ $Msg" -ForegroundColor Cyan }
function Write-Ok    { param($Msg) Write-Host "✔ $Msg" -ForegroundColor Green }
function Write-Warn  { param($Msg) Write-Host "⚠ $Msg" -ForegroundColor Yellow }
function Write-Fail  { param($Msg) Write-Host "✘ $Msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "═══════════════════════════════════════════" -ForegroundColor White
Write-Host "  Senka Enterprise Installer (Windows)" -ForegroundColor White
Write-Host "═══════════════════════════════════════════" -ForegroundColor White
Write-Host ""

# ── 1. Docker Desktop ────────────────────────────────────────────────────────
# `docker.exe` is a native process: a failing exit code does NOT throw a
# PowerShell exception, so try/catch around it never fires. Check
# $LASTEXITCODE explicitly instead, or a stopped daemon silently reads as
# "fine" and the script hangs later in migrations, waiting on a database that
# never came up.

Write-Info "Checking Docker..."
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Fail "Docker Desktop not found.`n  → https://www.docker.com/products/docker-desktop/"
}
$dockerVer = docker --version 2>$null
Write-Ok "Docker $dockerVer"

docker info 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Warn "Docker daemon not running. Starting Docker Desktop..."
    $dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) {
        Start-Process $dockerExe
    } else {
        Write-Fail "Docker Desktop.exe not found at the default path. Start Docker Desktop manually and re-run."
    }

    Write-Host -NoNewline "  Waiting for Docker daemon"
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        docker info 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Write-Host -NoNewline "."
    }
    Write-Host ""
    if (-not $ready) {
        Write-Fail "Docker did not start within 60s. Open Docker Desktop manually, wait until it says `"running`", then re-run."
    }
}
Write-Ok "Docker daemon running"

# ── 2. Node.js ───────────────────────────────────────────────────────────────

Write-Info "Checking Node.js..."
$needInstall = $false
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVer = node --version 2>$null
    $major = [int]($nodeVer -replace 'v','' -split '\.')[0]
    if ($major -ge 24) {
        Write-Ok "Node.js $nodeVer"
    } else {
        Write-Warn "Node.js $nodeVer found, but 24+ required."
        $needInstall = $true
    }
} else {
    $needInstall = $true
}

if ($needInstall) {
    Write-Info "Installing Node.js 24..."
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Install Node.js 24+ manually from https://nodejs.org/ and re-run."
    }
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    Write-Ok "Node.js installed"
}

# ── 3. pnpm ──────────────────────────────────────────────────────────────────

Write-Info "Checking pnpm..."
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    $pnpmVer = pnpm --version 2>$null
    Write-Ok "pnpm $pnpmVer"
} else {
    Write-Info "Installing pnpm via corepack..."
    corepack enable 2>$null
    corepack prepare pnpm@10.33.2 --activate 2>$null
    if ($LASTEXITCODE -ne 0) {
        npm install -g pnpm@10.33.2
    }
    Write-Ok "pnpm installed"
}

# ── 4. Project directory ─────────────────────────────────────────────────────

$installDir = if ($env:STEVE_INSTALL_DIR) { $env:STEVE_INSTALL_DIR } else { "$env:USERPROFILE\senka" }

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
        Write-Warn "Created .env from template. Set a database password and a route password in it (API keys go in Settings, not here):"
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
pnpm install --frozen-lockfile --strict-peer-dependencies 2>$null
if ($LASTEXITCODE -ne 0) {
    pnpm install
}
if ($LASTEXITCODE -ne 0) {
    Write-Fail "pnpm install failed. Run it yourself to see the error: pnpm install"
}
Write-Ok "Dependencies installed"

# ── 7. PostgreSQL ────────────────────────────────────────────────────────────

Write-Info "Starting PostgreSQL..."
docker compose up -d postgres 2>$null
if ($LASTEXITCODE -ne 0) {
    docker-compose up -d postgres 2>$null
}
if ($LASTEXITCODE -ne 0) {
    Write-Fail "docker compose up -d postgres failed. Run it yourself to see the error: docker compose up -d postgres"
}

Write-Host -NoNewline "  Waiting for PostgreSQL"
$pgReady = $false
for ($i = 0; $i -lt 15; $i++) {
    docker compose exec -T postgres pg_isready -q 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $pgReady = $true; break }
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 2
}
Write-Host ""
if (-not $pgReady) {
    Write-Fail "PostgreSQL did not become ready. Check: docker compose logs postgres"
}
Write-Ok "PostgreSQL running on port 5544"

# ── 8. Migrations ────────────────────────────────────────────────────────────

Write-Info "Running migrations..."
pnpm db:migrate
if ($LASTEXITCODE -ne 0) {
    Write-Warn "Migrations may need manual attention. Run: pnpm db:migrate"
} else {
    Write-Ok "Migrations complete"
}

# ── Done ─────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "═══════════════════════════════════════════" -ForegroundColor Green
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  1. Edit .env with your database and route passwords:" -ForegroundColor White
Write-Host "     (API keys go in Settings / Connections, not in .env)" -ForegroundColor White
Write-Host "     notepad $installDir\.env" -ForegroundColor White
Write-Host ""
Write-Host "  2. Start the app:" -ForegroundColor White
Write-Host "     cd $installDir && pnpm dev" -ForegroundColor White
Write-Host ""
Write-Host "  3. Open in browser:" -ForegroundColor White
Write-Host "     http://localhost:3001" -ForegroundColor Green
Write-Host ""
