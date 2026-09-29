#!/usr/bin/env bash
# =============================================================================
# NetMonitor Enterprise Turn-Key Deployment Script (Linux / macOS / On-Prem)
# Automated Pre-Flight Checks, Environment Provisioning, Hardening & Healthcheck
# =============================================================================

set -e

# ANSI Color Codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}${BOLD}"
echo "================================================================================"
echo "    NETMONITOR ENTERPRISE PLATFORM - TURN-KEY DEPLOYMENT & HEALTHCHECK"
echo "================================================================================"
echo -e "${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# -----------------------------------------------------------------------------
# 1. Pre-Flight System Requirements Checks
# -----------------------------------------------------------------------------
echo -e "${BLUE}${BOLD}[Step 1/5] Running Pre-Flight System Checks...${NC}"

# 1.1 Check Docker CLI
if ! command -v docker &> /dev/null; then
    echo -e "${RED}[ERROR] Docker is not installed on this system.${NC}"
    echo "Please install Docker Engine before continuing: https://docs.docker.com/engine/install/"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Docker CLI is installed."

# 1.2 Check Docker Daemon
if ! docker info &> /dev/null; then
    echo -e "${RED}[ERROR] Docker daemon is not running or current user lacks docker group permissions.${NC}"
    echo "Try: sudo systemctl start docker OR sudo usermod -aG docker \$USER"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Docker daemon is active and responsive."

# 1.3 Check Docker Compose Plugin (v2) or standalone
COMPOSE_CMD=""
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo -e "${RED}[ERROR] Docker Compose is not installed.${NC}"
    echo "Please install Docker Compose plugin: https://docs.docker.com/compose/install/"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Docker Compose is available (${COMPOSE_CMD})."

# 1.4 Check Available Memory (RAM >= 2048 MB)
if [ -f /proc/meminfo ]; then
    TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    TOTAL_RAM_MB=$((TOTAL_RAM_KB / 1024))
    if [ "$TOTAL_RAM_MB" -lt 1900 ]; then
        echo -e "  ${YELLOW}⚠ [WARNING] System has only ${TOTAL_RAM_MB}MB RAM. Minimum recommended is 2048MB (2GB).${NC}"
    else
        echo -e "  ${GREEN}✓${NC} System Memory: ${TOTAL_RAM_MB}MB RAM (Adequate)."
    fi
fi

# 1.5 Check Available Disk Space (Free >= 10GB recommended)
FREE_DISK_KB=$(df -P "$SCRIPT_DIR" | tail -1 | awk '{print $4}')
FREE_DISK_GB=$((FREE_DISK_KB / 1024 / 1024))
if [ "$FREE_DISK_GB" -lt 5 ]; then
    echo -e "  ${RED}[ERROR] Insufficient disk space: Only ${FREE_DISK_GB}GB free. NetMonitor requires at least 5GB free.${NC}"
    exit 1
elif [ "$FREE_DISK_GB" -lt 10 ]; then
    echo -e "  ${YELLOW}⚠ [WARNING] Free disk space is ${FREE_DISK_GB}GB. Recommended is >= 10GB for Prometheus TSDB retention.${NC}"
else
    echo -e "  ${GREEN}✓${NC} Available Disk Space: ${FREE_DISK_GB}GB (Adequate)."
fi

# -----------------------------------------------------------------------------
# 2. Environment Initialization & Secret Generation
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}${BOLD}[Step 2/5] Initializing Environment & Cryptographic Secrets...${NC}"

if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo -e "  ${YELLOW}→ .env file not found. Auto-generating from .env.example...${NC}"
        cp .env.example .env
    else
        echo -e "${RED}[ERROR] Neither .env nor .env.example found!${NC}"
        exit 1
    fi
else
    echo -e "  ${GREEN}✓${NC} Existing .env configuration file found."
fi

# Source .env safely
export $(grep -v '^#' .env | xargs -d '\n' 2>/dev/null || true)

# Auto-generate SESSION_SECRET if missing
if [ -z "$SESSION_SECRET" ] || [ "$SESSION_SECRET" = "" ]; then
    NEW_SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
    sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${NEW_SESSION_SECRET}|g" .env
    echo -e "  ${GREEN}✓${NC} Auto-generated cryptographic SESSION_SECRET."
fi

# Auto-generate JWT_SECRET if missing
if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "" ]; then
    NEW_JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${NEW_JWT_SECRET}|g" .env
    echo -e "  ${GREEN}✓${NC} Auto-generated cryptographic JWT_SECRET."
fi

# Auto-generate EMERGENCY_PASSWORD if missing
if [ -z "$EMERGENCY_PASSWORD" ] || [ "$EMERGENCY_PASSWORD" = "" ]; then
    GENERATED_PASS=$(openssl rand -base64 12 2>/dev/null || head -c 12 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 12)
    sed -i "s|^EMERGENCY_PASSWORD=.*|EMERGENCY_PASSWORD=${GENERATED_PASS}|g" .env
    export EMERGENCY_PASSWORD="$GENERATED_PASS"
    echo -e "  ${YELLOW}★ Auto-generated initial EMERGENCY_PASSWORD: ${BOLD}${GENERATED_PASS}${NC}"
fi

# Re-read HTTP port for checks
HTTP_PORT="${HTTP_PORT:-80}"
HTTPS_PORT="${HTTPS_PORT:-443}"

# 1.6 Check Port Collisions (HTTP and HTTPS)
for PORT_CHECK in "$HTTP_PORT" "$HTTPS_PORT"; do
    if command -v ss &> /dev/null; then
        if ss -tuln | grep -q ":${PORT_CHECK} "; then
            echo -e "  ${YELLOW}⚠ [WARNING] Port ${PORT_CHECK} is already in use by a local process.${NC}"
            echo -e "    Ensure existing web server is stopped, or customize HTTP_PORT in .env."
        fi
    elif command -v netstat &> /dev/null; then
        if netstat -tuln | grep -q ":${PORT_CHECK} "; then
            echo -e "  ${YELLOW}⚠ [WARNING] Port ${PORT_CHECK} is already in use by a local process.${NC}"
        fi
    fi
done

# -----------------------------------------------------------------------------
# 3. Directory Structure & Permission Hardening
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}${BOLD}[Step 3/5] Setting Up Directory Tree & Permissions...${NC}"

# Ensure runtime directories exist
mkdir -p data/targets/blackbox data/targets/snmp config/nginx/ssl

# Ensure pre-baked snmp.yml and blackbox.yml exist
if [ ! -f config/snmp_exporter/snmp.yml ] && [ -f config/snmp_exporter/snmp_optimized_modules.yml ]; then
    echo "auths:" > config/snmp_exporter/snmp.yml
    echo "  public_v1:" >> config/snmp_exporter/snmp.yml
    echo "    community: public" >> config/snmp_exporter/snmp.yml
    echo "    version: 1" >> config/snmp_exporter/snmp.yml
    echo "  public_v2:" >> config/snmp_exporter/snmp.yml
    echo "    community: public" >> config/snmp_exporter/snmp.yml
    echo "    version: 2" >> config/snmp_exporter/snmp.yml
    echo "" >> config/snmp_exporter/snmp.yml
    cat config/snmp_exporter/snmp_optimized_modules.yml >> config/snmp_exporter/snmp.yml
fi

# Set Linux file permissions so non-root container user (UID 10001) can read/write data
if [ "$(id -u)" -eq 0 ]; then
    chown -R 10001:10001 data/ 2>/dev/null || true
    chmod -R 775 data/ 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Data directory permissions configured (UID 10001:10001, mode 775)."
else
    chmod -R 777 data/ 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Data directory write permissions configured."
fi

# -----------------------------------------------------------------------------
# 4. Container Build & Orchestration Startup
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}${BOLD}[Step 4/5] Building & Launching Container Services...${NC}"

$COMPOSE_CMD build --pull
$COMPOSE_CMD up -d

echo -e "  ${GREEN}✓${NC} Docker Compose containers launched in background."

# -----------------------------------------------------------------------------
# 5. Health Check & Service Verification Loop
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}${BOLD}[Step 5/5] Performing Health Check & Service Verification...${NC}"

HEALTH_URL="http://127.0.0.1:${HTTP_PORT}/api/health"
MAX_WAIT_SECONDS=60
ELAPSED=0
IS_HEALTHY=false

echo -n "Waiting for NetMonitor Gateway to become healthy..."
while [ "$ELAPSED" -lt "$MAX_WAIT_SECONDS" ]; do
    if curl -s -f "$HEALTH_URL" &> /dev/null; then
        IS_HEALTHY=true
        break
    fi
    echo -n "."
    sleep 2
    ELAPSED=$((ELAPSED + 2))
done
echo ""

if [ "$IS_HEALTHY" = true ]; then
    echo -e "  ${GREEN}${BOLD}✓ System is HEALTHY (Response received from ${HEALTH_URL})${NC}"
else
    echo -e "  ${YELLOW}⚠ Warning: Health check did not return 200 within ${MAX_WAIT_SECONDS}s.${NC}"
    echo "  The service may still be warming up or initializing TSDB indices."
fi

# -----------------------------------------------------------------------------
# 6. Deployment Summary & Access Information
# -----------------------------------------------------------------------------
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo -e "\n${CYAN}${BOLD}"
echo "================================================================================"
echo "                   DEPLOYMENT COMPLETED SUCCESSFULLY 🎉"
echo "================================================================================"
echo -e "${NC}"

echo -e "${BOLD}Container Status:${NC}"
$COMPOSE_CMD ps

echo -e "\n${BOLD}Platform Access URLs:${NC}"
echo -e "  • Web Management Portal: ${CYAN}http://${HOST_IP}:${HTTP_PORT}${NC}"
echo -e "  • Health Check API:      ${CYAN}http://${HOST_IP}:${HTTP_PORT}/api/health${NC}"
if [ "$HTTPS_PORT" != "" ] && [ -f config/nginx/ssl/cert.pem ]; then
    echo -e "  • Secure HTTPS Portal:   ${CYAN}https://${HOST_IP}:${HTTPS_PORT}${NC}"
fi

echo -e "\n${BOLD}Initial Administrative Credentials:${NC}"
echo -e "  • Username: ${BOLD}${EMERGENCY_USERNAME:-admin}${NC}"
echo -e "  • Password: ${BOLD}${EMERGENCY_PASSWORD}${NC}"
echo -e "  ${YELLOW}(Please change your password immediately after initial login via Setup Wizard)${NC}"

echo -e "\n${BOLD}Quick Operations Commands:${NC}"
echo -e "  • View Live Logs:        ${GREEN}$COMPOSE_CMD logs -f netmonitor${NC}"
echo -e "  • Stop Services:         ${GREEN}$COMPOSE_CMD down${NC}"
echo -e "  • Restart Services:      ${GREEN}$COMPOSE_CMD restart${NC}"
echo ""
