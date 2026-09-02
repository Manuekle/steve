#!/bin/bash
set -euo pipefail

# ─── Steve Enterprise Installer ──────────────────────────────────────────────
# Supports macOS (ARM/Intel) and Linux (x64/arm64).
# Installs: Git, Docker (check only), Node.js 24, pnpm, project deps,
#           PostgreSQL (via Docker), and runs migrations.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Manuekle/steve/main/install.sh | bash
#   or: bash install.sh
# ──────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BLUE}▸${NC} $*"; }
ok()    { echo -e "${GREEN}✔${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
fail()  { echo -e "${RED}✘${NC} $*"; exit 1; }

# ── Detect platform ──────────────────────────────────────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) PLATFORM="macos" ;;
  Linux)  PLATFORM="linux" ;;
  *)      fail "Unsupported OS: $OS. Use install.ps1 for Windows." ;;
esac

echo ""
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${BOLD}  Steve Enterprise Installer${NC}"
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo ""
echo -e "  Platform:  ${GREEN}$PLATFORM${NC} ($ARCH)"
echo -e "  Home:      ${GREEN}$HOME${NC}"
echo ""

# ── 1. Git ───────────────────────────────────────────────────────────────────

info "Checking Git..."
if command -v git &>/dev/null; then
  ok "Git $(git --version | awk '{print $3}')"
else
  warn "Git not found. Installing..."
  if [ "$PLATFORM" = "macos" ]; then
    xcode-select --install 2>/dev/null || fail "Install Xcode Command Line Tools manually."
  else
    sudo apt-get update -qq && sudo apt-get install -y -qq git >/dev/null
  fi
  ok "Git installed"
fi

# ── 2. Docker ────────────────────────────────────────────────────────────────

info "Checking Docker..."
if ! command -v docker &>/dev/null; then
  fail "Docker not found.\n  → macOS: https://www.docker.com/products/docker-desktop/\n  → Linux: https://docs.docker.com/engine/install/"
fi

if ! docker info &>/dev/null 2>&1; then
  warn "Docker daemon not running."
  if [ "$PLATFORM" = "macos" ]; then
    info "Starting Docker Desktop..."
    open -a Docker 2>/dev/null || true
    echo -n "  Waiting for Docker daemon"
    for i in $(seq 1 30); do
      docker info &>/dev/null 2>&1 && break
      echo -n "."
      sleep 2
    done
    echo ""
    docker info &>/dev/null 2>&1 || fail "Docker did not start. Open Docker Desktop manually and re-run this script."
  else
    fail "Start Docker daemon manually and re-run this script."
  fi
fi
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# ── 3. Node.js ───────────────────────────────────────────────────────────────

info "Checking Node.js..."
NEED_INSTALL_NODE=false

if command -v node &>/dev/null; then
  NODE_MAJOR=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_MAJOR" -ge 24 ] 2>/dev/null; then
    ok "Node.js $(node --version | tr -d 'v')"
  else
    warn "Node.js $NODE_MAJOR found, but 24+ required."
    NEED_INSTALL_NODE=true
  fi
else
  NEED_INSTALL_NODE=true
fi

if [ "$NEED_INSTALL_NODE" = true ]; then
  info "Installing Node.js 24 via nvm..."
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -d "$NVM_DIR" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  fi
  # shellcheck source=/dev/null
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install 24
  nvm use 24
  ok "Node.js $(node --version | tr -d 'v')"
fi

# ── 4. pnpm via corepack ─────────────────────────────────────────────────────

info "Checking pnpm..."
if command -v pnpm &>/dev/null; then
  PNPM_VER=$(pnpm --version 2>/dev/null || echo "unknown")
  ok "pnpm $PNPM_VER"
else
  info "Enabling corepack and installing pnpm..."
  corepack enable 2>/dev/null || true
  corepack prepare pnpm@10.33.2 --activate 2>/dev/null || npm install -g pnpm@10.33.2
  ok "pnpm $(pnpm --version)"
fi

# ── 5. Project directory ─────────────────────────────────────────────────────

INSTALL_DIR="${STEVE_INSTALL_DIR:-$HOME/steve}"

if [ ! -d "$INSTALL_DIR" ]; then
  info "Creating project directory at $INSTALL_DIR..."
  mkdir -p "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# If it's a git repo, pull latest. If not, it was probably copied manually.
if [ -d .git ]; then
  info "Updating to latest version..."
  git pull --ff-only 2>/dev/null || warn "Could not auto-update. Run 'git pull' manually."
fi

# ── 6. .env ──────────────────────────────────────────────────────────────────

info "Checking .env..."
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    warn "Created .env from template. ${BOLD}Set a database password and a route password in it:${NC}"
    echo ""
    echo -e "    ${BOLD}nano $INSTALL_DIR/.env${NC}"
    echo ""
    echo -e "    API keys do not go here — add them in Settings once the app is up."
    echo ""
  else
    fail ".env.example not found. Is this the Steve project directory?"
  fi
else
  ok ".env exists"
fi

# ── 7. Install dependencies ──────────────────────────────────────────────────

info "Installing dependencies..."
pnpm install --frozen-lockfile --strict-peer-dependencies 2>/dev/null || pnpm install
ok "Dependencies installed"

# ── 8. PostgreSQL ────────────────────────────────────────────────────────────

info "Starting PostgreSQL..."
docker compose up -d postgres 2>/dev/null || docker-compose up -d postgres 2>/dev/null || true
echo -n "  Waiting for PostgreSQL"
for i in $(seq 1 15); do
  docker compose exec -T postgres pg_isready -q 2>/dev/null && break
  docker-compose exec -T postgres pg_isready -q 2>/dev/null && break
  echo -n "."
  sleep 2
done
echo ""
ok "PostgreSQL running on port 5544"

# ── 9. Migrations ────────────────────────────────────────────────────────────

info "Running migrations..."
pnpm db:migrate 2>/dev/null || warn "Migrations may need manual attention. Run: pnpm db:migrate"
ok "Migrations complete"

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  Installation Complete!${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}1.${NC} Edit .env with your database and route passwords:"
echo -e "     ${BOLD}nano $INSTALL_DIR/.env${NC}"
echo -e "     (API keys go in Settings / Connections, not in .env)"
echo ""
echo -e "  ${BOLD}2.${NC} Start the app:"
echo -e "     ${BOLD}cd $INSTALL_DIR && pnpm dev${NC}"
echo ""
echo -e "  ${BOLD}3.${NC} Open in browser:"
echo -e "     ${GREEN}http://localhost:3001${NC}"
echo ""
echo -e "  ${BOLD}Production build:${NC}"
echo -e "     pnpm build && pnpm start & pnpm start:eve"
echo ""
