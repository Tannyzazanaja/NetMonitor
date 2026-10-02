# NetMonitor: Unified Installation & Deployment Guide

This guide provides instructions for deploying **NetMonitor Enterprise** across containerized (Docker Compose) and bare-metal (Linux systemd) environments.

---

## 1. Hardware Sizing & System Prerequisites

### Sizing Matrix

| Deployment Tier | Monitored Endpoints | CPU Cores | RAM | Storage (SSD) | Typical Environment |
|---|---|---|---|---|---|
| **Small / Edge** | 1 – 50 devices | 2 Cores | 4 GB | 30 GB | Branch office, Lab, Edge site |
| **Medium / Campus** | 51 – 200 devices | 4 Cores | 8 GB | 60 GB | Corporate headquarters, Campus |
| **Large / Data Center** | 201 – 500+ devices | 8 Cores | 16 GB | 120 GB | Multi-rack DC, ISP aggregation |

### Operating System & Network Requirements
- **OS**: Ubuntu 22.04+ LTS, Debian 12+, RHEL 9+, Rocky Linux 9+, or Alpine Linux 3.19+
- **Inbound Ports**:
  - `80/tcp` (HTTP Web Gateway)
  - `443/tcp` (HTTPS Web Gateway with SSL/TLS)
- **Outbound Network Access**:
  - `UDP 161` (SNMP polling to network devices)
  - `ICMP Echo Request` (Ping availability probing)

---

## 2. Option A: Docker Compose Deployment (Recommended)

Docker Compose provides a production-hardened, multi-container orchestration stack with predefined isolation, health checks, resource limits, and automated volume management.

### Architecture in Docker
- **`netmonitor-nginx`**: Reverse proxy gateway handling HTTP/HTTPS, compression, and SSE stream timeouts.
- **`netmonitor-app`**: Node.js backend engine & static React client (runs as non-root user).
- **`netmonitor-prometheus`**: TSDB instance with 30-day retention and dynamic `file_sd` targets.
- **`netmonitor-snmp-exporter`**: Multi-vendor SNMP-to-Prometheus metrics proxy.
- **`netmonitor-blackbox-exporter`**: Sub-second ICMP ping latency and loss prober (`CAP_NET_RAW` enabled).

### Step 1: Clone Repository & Configure Environment
```bash
git clone https://github.com/example/network-monitor-react.git /opt/netmonitor
cd /opt/netmonitor

# Copy environment template
cp .env.example .env
chmod 600 .env
```

### Step 2: Configure Production Secrets in `.env`
Edit `.env` and set cryptographically secure values:
```bash
# Generate secrets with: openssl rand -hex 32
JWT_SECRET=your_generated_random_hex_secret
SESSION_SECRET=your_generated_random_hex_secret

# Emergency Administrative Account
EMERGENCY_USERNAME=admin
EMERGENCY_PASSWORD=YourSecureProductionPassword!

# Network Discovery Defaults
DEFAULT_DISCOVERY_CIDR=192.168.1.0/24
DEFAULT_SNMP_COMMUNITY=your_snmp_community
DEFAULT_SNMP_MODULE=if_mib
```

### Step 3: Build & Launch Stack
```bash
docker compose up -d --build
```

### Step 4: Verify Deployment Status
```bash
# Check container health status
docker compose ps

# Check core application logs
docker compose logs -f netmonitor

# Probe health endpoint
curl -f http://127.0.0.1:5001/api/health
```

---

## 3. Option B: Native Bare-Metal / Linux Systemd Deployment

### Step 1: Create Dedicated Service Accounts
```bash
# Dedicated non-login service accounts
sudo useradd -r -s /bin/false -d /var/lib/prometheus prometheus
sudo useradd -r -s /bin/false snmpexporter
sudo useradd -r -s /bin/false -d /opt/netmonitor netmonitor

# Install Node.js LTS (v20.x) and Nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx curl
```

### Step 2: Install Prometheus & Exporters
```bash
# 1. Prometheus TSDB (v2.45.3)
wget https://github.com/prometheus/prometheus/releases/download/v2.45.3/prometheus-2.45.3.linux-amd64.tar.gz
tar -xvf prometheus-2.45.3.linux-amd64.tar.gz
sudo mv prometheus-2.45.3.linux-amd64/prometheus /usr/local/bin/
sudo mkdir -p /etc/prometheus /var/lib/prometheus /etc/prometheus/targets
sudo chown -R prometheus:prometheus /var/lib/prometheus /etc/prometheus

# 2. SNMP Exporter (v0.24.1)
wget https://github.com/prometheus/snmp_exporter/releases/download/v0.24.1/snmp_exporter-0.24.1.linux-amd64.tar.gz
tar -xvf snmp_exporter-0.24.1.linux-amd64.tar.gz
sudo mv snmp_exporter-0.24.1.linux-amd64/snmp_exporter /usr/local/bin/
sudo mkdir -p /etc/snmp_exporter

# 3. Blackbox Exporter (v0.24.0)
wget https://github.com/prometheus/blackbox_exporter/releases/download/v0.24.0/blackbox_exporter-0.24.0.linux-amd64.tar.gz
tar -xvf blackbox_exporter-0.24.0.linux-amd64.tar.gz
sudo mv blackbox_exporter-0.24.0.linux-amd64/blackbox_exporter /usr/local/bin/
sudo mkdir -p /etc/blackbox_exporter
```

### Step 3: Install Configuration Files & Systemd Units
```bash
# Copy configuration files from repository
sudo cp config/prometheus/prometheus.yml /etc/prometheus/prometheus.yml
sudo cp config/snmp_exporter/snmp.yml /etc/snmp_exporter/snmp.yml

# Copy systemd unit definitions
sudo cp deploy/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
```

### Step 4: Configure Target Directory Permissions
Ensure the `netmonitor` process can write `file_sd` YAML target files to `/etc/prometheus/targets`:
```bash
sudo chown -R netmonitor:prometheus /etc/prometheus/targets
sudo chmod 775 /etc/prometheus/targets
```

### Step 5: Install NetMonitor Application
```bash
sudo mkdir -p /opt/netmonitor /etc/netmonitor
sudo cp -r . /opt/netmonitor/
cd /opt/netmonitor

# Install dependencies and build production UI
npm ci --omit=dev
npm run build

# Configure environment
sudo cp .env.example /etc/netmonitor/netmonitor.env
sudo chown -R netmonitor:netmonitor /opt/netmonitor /etc/netmonitor
sudo chmod 600 /etc/netmonitor/netmonitor.env
```

### Step 6: Start All Services
```bash
sudo systemctl enable --now prometheus snmp-exporter blackbox-exporter netmonitor-backend
sudo systemctl status netmonitor-backend
```

---

## 4. Ingress Reverse Proxy & SSL/TLS Configuration (Nginx)

NetMonitor includes an Nginx reverse proxy configuration at `config/nginx/netmonitor.conf` supporting Server-Sent Events (SSE), WebSocket upgrades, security headers, and static file serving.

### Deploying Nginx Config
```bash
sudo cp config/nginx/netmonitor.conf /etc/nginx/sites-available/netmonitor.conf
sudo ln -sf /etc/nginx/sites-available/netmonitor.conf /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### Enabling SSL/TLS Certificates
For production deployments, place your certificate and private key in `/etc/nginx/ssl`:
- Certificate: `/etc/nginx/ssl/cert.pem`
- Private Key: `/etc/nginx/ssl/key.pem`

---

## 5. Post-Installation Verification & Health Checks

Run automated diagnostic scripts to verify full stack health:
```bash
# Verify Prometheus target syntax & directory permissions
node scripts/validate-prometheus-targets.js

# Verify SNMP exporter profiles & MIB OID trees
node scripts/validate-snmp-config.js

# Verify codebase has zero hardcoded credentials
node scripts/security-scan.js
```

### Accessing the Web Dashboard
Open your web browser and navigate to:
```
http://<SERVER-IP>
```
Log in using the emergency administrator credentials configured in `.env` (`EMERGENCY_USERNAME` and `EMERGENCY_PASSWORD`).
