# NetMonitor: Enterprise Installation & Deployment Guide

This document provides complete, production-tested installation guides for deploying **NetMonitor** across bare-metal Linux servers, virtual machines, Docker containers, and Proxmox VE LXC environments.

---

## Table of Contents

1. [Hardware & Network Requirements](#1-hardware--network-requirements)
2. [Method 1: Bare-Metal / Linux VM (Ubuntu 22.04 / 24.04 LTS)](#2-method-1-bare-metal--linux-vm-ubuntu-2204--2404-lts)
   - [Step 1: System Packages & Node.js Setup](#step-1-system-packages--nodejs-setup)
   - [Step 2: Install Prometheus & Exporters](#step-2-install-prometheus--exporters)
   - [Step 3: Deploy NetMonitor Application](#step-3-deploy-netmonitor-application)
   - [Step 4: Configure Systemd Service](#step-4-configure-systemd-service)
   - [Step 5: Nginx Reverse Proxy with TLS/SSL](#step-5-nginx-reverse-proxy-with-tlsssl)
3. [Method 2: Docker & Docker Compose](#3-method-2-docker--docker-compose)
   - [Complete docker-compose.yml](#complete-docker-composeyml)
   - [Starting and Managing Services](#starting-and-managing-services)
4. [Method 3: Proxmox VE LXC Container Deployment](#4-method-3-proxmox-ve-lxc-container-deployment)
5. [Firewall & Security Hardening](#5-firewall--security-hardening)
6. [Post-Installation Verification](#6-post-installation-verification)

---

## 1. Hardware & Network Requirements

### Minimum Hardware Sizing
* **CPU:** 2 vCPU Cores (x86_64 or ARM64)
* **Memory:** 2 GB RAM (4 GB recommended for networks exceeding 100 switches)
* **Storage:** 20 GB SSD storage (adjust based on Prometheus TSDB retention)
* **Network Interface:** 1x Gigabit Ethernet with direct L2/L3 reachability to managed network switch subnets

### Network Ports & Protocols

| Port | Protocol | Direction | Source | Destination | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `80 / 443` | TCP | Inbound | Operator Browsers | NetMonitor Host | Nginx HTTPS Reverse Proxy |
| `5001` | TCP | Localhost | Nginx | NetMonitor Backend | NetMonitor Node.js Server |
| `9090` | TCP | Localhost | NetMonitor Backend | Prometheus | Time-Series Metric Query API |
| `9115` | TCP | Localhost | Prometheus | Blackbox Exporter | ICMP Ping Scraping |
| `9116` | TCP | Localhost | Prometheus | SNMP Exporter | SNMP Telemetry Scraping |
| `3000` | TCP | Localhost | Nginx / NetMonitor | Grafana | Embedded Dashboards (Optional) |
| `161` | UDP | Outbound | NetMonitor Host | Network Switches | SNMP v2c/v3 Telemetry Polling |
| `ICMP` | Protocol 1 | Outbound | NetMonitor Host | Network Switches | Reachability & Latency Monitoring |

---

## 2. Method 1: Bare-Metal / Linux VM (Ubuntu 22.04 / 24.04 LTS)

### Step 1: System Packages & Node.js Setup

Update the system and install essential build tools:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential libcap2-bin ufw nginx
```

Install **Node.js 20 LTS** via NodeSource:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify versions
node -v    # v20.x.x
npm -v     # 10.x.x
```

---

### Step 2: Install Prometheus & Exporters

Create system users and directory structures:
```bash
sudo useradd --no-create-home --shell /bin/false prometheus
sudo useradd --no-create-home --shell /bin/false blackbox_exporter
sudo useradd --no-create-home --shell /bin/false snmp_exporter

sudo mkdir -p /etc/prometheus/targets /var/lib/prometheus
sudo chown -R prometheus:prometheus /etc/prometheus /var/lib/prometheus
```

#### 2.1 Install Prometheus Server
```bash
PROM_VERSION="2.45.3"
wget https://github.com/prometheus/prometheus/releases/download/v${PROM_VERSION}/prometheus-${PROM_VERSION}.linux-amd64.tar.gz
tar xvf prometheus-${PROM_VERSION}.linux-amd64.tar.gz
cd prometheus-${PROM_VERSION}.linux-amd64
sudo cp prometheus promtool /usr/local/bin/
sudo cp -r consoles console_libraries /etc/prometheus/
sudo chown prometheus:prometheus /usr/local/bin/prometheus /usr/local/bin/promtool
cd .. && rm -rf prometheus-${PROM_VERSION}*
```

Create `/etc/prometheus/prometheus.yml`:
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  # NetMonitor Self Metrics
  - job_name: 'netmonitor'
    static_configs:
      - targets: ['127.0.0.1:5001']

  # ICMP Ping Probe via Blackbox Exporter
  - job_name: 'blackbox_icmp'
    metrics_path: /probe
    params:
      module: [icmp]
    file_sd_configs:
      - files:
          - '/etc/prometheus/targets/blackbox_targets.yml'
        refresh_interval: 15s
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: 127.0.0.1:9115

  # SNMP Hardware & Interface Telemetry
  - job_name: 'snmp_switch'
    metrics_path: /snmp
    scrape_interval: 30s
    scrape_timeout: 10s
    params:
      module: [if_mib]
      auth: [public_v2]
    file_sd_configs:
      - files:
          - '/etc/prometheus/targets/snmp_targets.yml'
        refresh_interval: 15s
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - source_labels: [module]
        target_label: __param_module
      - source_labels: [auth]
        target_label: __param_auth
      - target_label: __address__
        replacement: 127.0.0.1:9116
```

#### 2.2 Install Blackbox Exporter
```bash
BBOX_VERSION="0.24.0"
wget https://github.com/prometheus/blackbox_exporter/releases/download/v${BBOX_VERSION}/blackbox_exporter-${BBOX_VERSION}.linux-amd64.tar.gz
tar xvf blackbox_exporter-${BBOX_VERSION}.linux-amd64.tar.gz
cd blackbox_exporter-${BBOX_VERSION}.linux-amd64
sudo cp blackbox_exporter /usr/local/bin/
sudo chown blackbox_exporter:blackbox_exporter /usr/local/bin/blackbox_exporter
# Grant raw socket capability for ICMP ping execution without root:
sudo setcap cap_net_raw+ep /usr/local/bin/blackbox_exporter
cd .. && rm -rf blackbox_exporter-${BBOX_VERSION}*
```

Create `/etc/prometheus/blackbox.yml`:
```yaml
modules:
  icmp:
    prober: icmp
    timeout: 3s
    icmp:
      preferred_ip_protocol: ip4
```

#### 2.3 Install SNMP Exporter
```bash
SNMP_VERSION="0.24.1"
wget https://github.com/prometheus/snmp_exporter/releases/download/v${SNMP_VERSION}/snmp_exporter-${SNMP_VERSION}.linux-amd64.tar.gz
tar xvf snmp_exporter-${SNMP_VERSION}.linux-amd64.tar.gz
cd snmp_exporter-${SNMP_VERSION}.linux-amd64
sudo cp snmp_exporter /usr/local/bin/
sudo cp snmp.yml /etc/prometheus/snmp.yml
sudo chown -R snmp_exporter:snmp_exporter /usr/local/bin/snmp_exporter /etc/prometheus/snmp.yml
cd .. && rm -rf snmp_exporter-${SNMP_VERSION}*
```

Configure systemd units for all three daemons:

`/etc/systemd/system/prometheus.service`:
```ini
[Unit]
Description=Prometheus Time Series Database
After=network.target

[Service]
User=prometheus
Group=prometheus
Type=simple
ExecStart=/usr/local/bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/var/lib/prometheus/ \
  --storage.tsdb.retention.time=30d \
  --web.listen-address=127.0.0.1:9090
Restart=always

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/blackbox_exporter.service`:
```ini
[Unit]
Description=Prometheus Blackbox Exporter
After=network.target

[Service]
User=blackbox_exporter
Group=blackbox_exporter
Type=simple
ExecStart=/usr/local/bin/blackbox_exporter --config.file=/etc/prometheus/blackbox.yml --web.listen-address=127.0.0.1:9115
Restart=always

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/snmp_exporter.service`:
```ini
[Unit]
Description=Prometheus SNMP Exporter
After=network.target

[Service]
User=snmp_exporter
Group=snmp_exporter
Type=simple
ExecStart=/usr/local/bin/snmp_exporter --config.file=/etc/prometheus/snmp.yml --web.listen-address=127.0.0.1:9116
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start telemetry services:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now prometheus blackbox_exporter snmp_exporter
```

---

### Step 3: Deploy NetMonitor Application

Create application user and clone the repository:
```bash
sudo useradd -r -s /bin/false -d /opt/netmonitor netmonitor
sudo git clone https://github.com/Tannyzazanaja/NetMonitor.git /opt/netmonitor
cd /opt/netmonitor

# Install dependencies and build frontend
sudo npm install
cd server && sudo npm install && cd ..
sudo npm run build

# Setup permissions
sudo chown -R netmonitor:netmonitor /opt/netmonitor
sudo chmod -R 775 /opt/netmonitor/data
sudo chown -R netmonitor:prometheus /etc/prometheus/targets
sudo chmod -R 775 /etc/prometheus/targets

# Setup environment
sudo cp .env.example .env
sudo chown netmonitor:netmonitor .env
sudo chmod 600 .env
```

---

### Step 4: Configure Systemd Service

Create `/etc/systemd/system/netmonitor.service`:
```ini
[Unit]
Description=NetMonitor Enterprise Network Monitoring Platform
After=network.target prometheus.service

[Service]
Type=simple
User=netmonitor
Group=netmonitor
WorkingDirectory=/opt/netmonitor
ExecStart=/usr/bin/node server/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=5001
Environment=PROMETHEUS_URL=http://127.0.0.1:9090
Environment=PROMETHEUS_TARGETS_DIR=/etc/prometheus/targets
Environment=SNMP_EXPORTER_URL=http://127.0.0.1:9116
Environment=BLACKBOX_EXPORTER_URL=http://127.0.0.1:9115

# Security hardening
ProtectSystem=full
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Enable and start NetMonitor:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now netmonitor
sudo systemctl status netmonitor
```

---

### Step 5: Nginx Reverse Proxy with TLS/SSL

Create `/etc/nginx/sites-available/netmonitor`:
```nginx
server {
    listen 80;
    server_name netmonitor.local your-server-ip;

    # Maximum file upload size for config imports
    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for Server-Sent Events (SSE)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

Enable the site and reload Nginx:
```bash
sudo ln -sf /etc/nginx/sites-available/netmonitor /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## 3. Method 2: Docker & Docker Compose

For containerized environments, NetMonitor provides a four-tier compose bundle.

### Complete `docker-compose.yml`

Create a directory `netmonitor-docker` and place this file:

```yaml
version: '3.8'

services:
  netmonitor:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: netmonitor-app
    restart: unless-stopped
    ports:
      - "5001:5001"
    environment:
      - NODE_ENV=production
      - PORT=5001
      - PROMETHEUS_URL=http://prometheus:9090
      - PROMETHEUS_TARGETS_DIR=/etc/prometheus/targets
      - SNMP_EXPORTER_URL=http://snmp-exporter:9116
      - BLACKBOX_EXPORTER_URL=http://blackbox-exporter:9115
      - GRAFANA_URL=http://grafana:3000
    volumes:
      - ./data:/app/data
      - prometheus_targets:/etc/prometheus/targets
    networks:
      - netmonitor-net
    depends_on:
      - prometheus
      - blackbox-exporter
      - snmp-exporter

  prometheus:
    image: prom/prometheus:v2.45.3
    container_name: netmonitor-prometheus
    restart: unless-stopped
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
    volumes:
      - ./config/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_targets:/etc/prometheus/targets
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    networks:
      - netmonitor-net

  blackbox-exporter:
    image: prom/blackbox-exporter:v0.24.0
    container_name: netmonitor-blackbox
    restart: unless-stopped
    cap_add:
      - NET_RAW
    volumes:
      - ./config/prometheus/blackbox.yml:/config/blackbox.yml:ro
    ports:
      - "9115:9115"
    networks:
      - netmonitor-net

  snmp-exporter:
    image: prom/snmp-exporter:v0.24.1
    container_name: netmonitor-snmp
    restart: unless-stopped
    volumes:
      - ./config/prometheus/snmp.yml:/etc/snmp_exporter/snmp.yml:ro
    ports:
      - "9116:9116"
    networks:
      - netmonitor-net

  grafana:
    image: grafana/grafana-oss:10.2.3
    container_name: netmonitor-grafana
    restart: unless-stopped
    environment:
      - GF_SECURITY_ALLOW_EMBEDDING=true
      - GF_AUTH_ANONYMOUS_ENABLED=true
    volumes:
      - grafana_data:/var/lib/grafana
    ports:
      - "3000:3000"
    networks:
      - netmonitor-net

volumes:
  prometheus_targets:
  prometheus_data:
  grafana_data:

networks:
  netmonitor-net:
    driver: bridge
```

### Starting Services
```bash
docker compose up -d
docker compose logs -f netmonitor
```

---

## 4. Method 3: Proxmox VE LXC Container Deployment

Proxmox VE LXC provides minimal overhead and high I/O throughput.

### LXC Creation Settings
1. **Template:** `ubuntu-22.04-standard` or `ubuntu-24.04-standard`.
2. **Cores:** 2 Cores.
3. **Memory:** 2048 MB RAM, 512 MB Swap.
4. **Disk:** 20 GB Root Disk (on ZFS or Ceph pool).
5. **Network:** Assigned to your management VLAN bridge (e.g., `vmbr0`), static IP.

### Crucial: Enable Raw Socket for Ping in LXC
If using an **unprivileged container**, allow raw socket ICMP probing:
Edit `/etc/pve/lxc/<CTID>.conf` on the Proxmox host:
```ini
lxc.apparmor.profile: unconfined
lxc.cap.keep: net_raw
```
Restart the container:
```bash
pct reboot <CTID>
```
Inside the container, follow [Method 1: Bare-Metal Setup](#2-method-1-bare-metal--linux-vm-ubuntu-2204--2404-lts).

---

## 5. Firewall & Security Hardening

Configure `ufw` on the NetMonitor host:
```bash
# Allow SSH and Web
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Restrict Prometheus Exporter ports to localhost only
# (Internal daemons listen on 127.0.0.1 by default)

# Enable firewall
sudo ufw enable
```

---

## 6. Post-Installation Verification

1. **Verify Services Running:**
   ```bash
   sudo systemctl is-active netmonitor prometheus blackbox_exporter snmp_exporter nginx
   ```
   All five commands should output `active`.

2. **Verify Target Synchronization:**
   Check that `/etc/prometheus/targets/blackbox_targets.yml` and `snmp_targets.yml` are created and valid YAML.

3. **Access Web Console:**
   Open `http://your-server-ip/` in a browser. The First-Run Setup Wizard will welcome you.
