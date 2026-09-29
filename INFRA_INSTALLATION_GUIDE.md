# NetMonitor: Telemetry Infrastructure Installation & Operations Guide
### Prometheus, SNMP Exporter, Blackbox Exporter & Grafana

This technical guide provides step-by-step instructions for installing, configuring, hardening, and verifying the core telemetry infrastructure components that power **NetMonitor**:
* **Prometheus TSDB** (v2.45+): High-performance time-series database for metrics storage and PromQL queries.
* **Blackbox Exporter** (v0.24+): Network prober for ICMP ping latency, availability SLA, and packet reachability.
* **SNMP Exporter** (v0.24+): Multi-vendor SNMP-to-Prometheus metrics proxy with optimized MIB modules.
* **Grafana OSS** (v10.2+): Analytics dashboard engine with embedded panel support and RBAC user management.

---

## Table of Contents

1. [Architecture & Telemetry Pipeline](#1-architecture--telemetry-pipeline)
2. [Method A: Automated Docker Compose Deployment (Recommended)](#2-method-a-automated-docker-compose-deployment-recommended)
   - [Service Definitions & Volume Mappings](#service-definitions--volume-mappings)
   - [Environment Configuration](#environment-configuration)
   - [Starting & Managing Containers](#starting--managing-containers)
3. [Method B: Native Bare-Metal / Linux Systemd Deployment (Ubuntu / Debian / RHEL)](#3-method-b-native-bare-metal--linux-systemd-deployment)
   - [System Users & Directory Layout](#31-system-users--directory-layout)
   - [Blackbox Exporter Installation & Raw Socket Capabilities](#32-blackbox-exporter-installation)
   - [SNMP Exporter Installation & Module Configuration](#33-snmp-exporter-installation)
   - [Prometheus TSDB Installation & Target Directory Setup](#34-prometheus-tsdb-installation)
   - [Grafana Installation, Embedding & Datasource Provisioning](#35-grafana-installation)
4. [Connecting Infrastructure to NetMonitor Core](#4-connecting-infrastructure-to-netmonitor-core)
5. [Verification & Diagnostic Playbook](#5-verification--diagnostic-playbook)
   - [Component Health Checks](#component-health-checks)
   - [Live Probe Testing (ICMP & SNMP)](#live-probe-testing-icmp--snmp)
   - [Common Infrastructure Issues & Remediation](#common-infrastructure-issues--remediation)

---

## 1. Architecture & Telemetry Pipeline

```
 [ NetMonitor Web UI ] ────────────► [ NetMonitor Backend (Port 5001) ]
                                                    │
                             ┌──────────────────────┴──────────────────────┐
                             │ Generates Dynamic Target YAML (file_sd)     │
                             ▼                                             ▼
             /etc/prometheus/targets/blackbox/*.yml        /etc/prometheus/targets/snmp/*.yml
                             │                                             │
                             └──────────────────────┬──────────────────────┘
                                                    │ Scrapes on schedule
                                                    ▼
                                         [ Prometheus TSDB :9090 ]
                                          • PromQL Engine
                                          • Retention: 30d / 50GB
                                                    │
                        ┌───────────────────────────┴───────────────────────────┐
                        │ Scrapes /probe?target=X                               │ Scrapes /snmp?target=X
                        ▼                                                       ▼
           [ Blackbox Exporter :9115 ]                             [ SNMP Exporter :9116 ]
            • ICMP Echo Request (Ping)                              • UDP Port 161 (GET/BULK)
            • probe_success & duration                              • ifHCInOctets, CPU, Memory
            • Requires NET_RAW / cap_net_raw                        • Loads optimized snmp.yml
                        │                                                       │
                        ▼                                                       ▼
          [ Managed Network Devices ] ◄─────────────────────────────────────────┘
          Switches, Routers, Firewalls, Servers, Access Points
```

---

## 2. Method A: Automated Docker Compose Deployment (Recommended)

When using NetMonitor's turn-key deployment package, all four infrastructure services are pre-configured in `docker-compose.yml`.

### Service Definitions & Volume Mappings

| Service | Docker Image | Host Port (Localhost-Bound) | Container Volume Mounts | Key Parameters |
|---|---|---|---|---|
| **prometheus** | `prom/prometheus:v2.45.3` | `127.0.0.1:9090:9090` | `config/prometheus/prometheus.yml` ➔ `/etc/prometheus/prometheus.yml`<br>`prometheus_targets` ➔ `/etc/prometheus/targets`<br>`prometheus_data` ➔ `/prometheus` | `--storage.tsdb.retention.time=30d`<br>`--storage.tsdb.retention.size=50GB`<br>`--web.enable-lifecycle` |
| **blackbox-exporter** | `prom/blackbox-exporter:v0.24.0` | `127.0.0.1:9115:9115` | `config/prometheus/blackbox.yml` ➔ `/config/blackbox.yml` | `cap_add: [NET_RAW]` (Mandatory for ICMP sockets) |
| **snmp-exporter** | `prom/snmp-exporter:v0.24.1` | `127.0.0.1:9116:9116` | `config/snmp_exporter/snmp.yml` ➔ `/etc/snmp_exporter/snmp.yml` | Multi-vendor compiled modules (`cisco_switch`, `aruba_switch`, `if_mib`) |
| **grafana** | `grafana/grafana-oss:10.2.3` | `127.0.0.1:3000:3000` | `grafana_data` ➔ `/var/lib/grafana` | `GF_SECURITY_ALLOW_EMBEDDING=true`<br>`GF_AUTH_ANONYMOUS_ENABLED=true` |

### Environment Configuration

The infrastructure services pull parameter values from `.env`:

```bash
# Prometheus TSDB Retention
PROMETHEUS_RETENTION_TIME=30d
PROMETHEUS_RETENTION_SIZE=50GB
PROMETHEUS_SCRAPE_INTERVAL=15s

# Exporter & Internal Ports
PROMETHEUS_PORT=9090
BLACKBOX_EXPORTER_PORT=9115
SNMP_EXPORTER_PORT=9116
GRAFANA_PORT=3000

# Grafana Embedded Integration
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=YourStrongGrafanaPasswordHere
GRAFANA_ANONYMOUS_ENABLED=true
```

### Starting & Managing Containers

```bash
# 1. Start all infrastructure services along with NetMonitor
docker compose up -d

# 2. Check container status
docker compose ps

# 3. View logs for a specific service
docker compose logs -f prometheus
docker compose logs -f snmp-exporter
docker compose logs -f blackbox-exporter
docker compose logs -f grafana

# 4. Reload Prometheus configuration without restarting container
curl -X POST http://127.0.0.1:9090/-/reload
```

---

## 3. Method B: Native Bare-Metal / Linux Systemd Deployment

For production environments that do not use Docker, install each component as a native Linux service managed by `systemd`.

### 3.1 System Users & Directory Layout

Run the following commands as `root` (or with `sudo`) to create isolated service users and standard directories:

```bash
# Create unprivileged system accounts
sudo useradd --no-create-home --shell /bin/false prometheus
sudo useradd --no-create-home --shell /bin/false blackbox_exporter
sudo useradd --no-create-home --shell /bin/false snmp_exporter

# Create configuration and target directories
sudo mkdir -p /etc/prometheus/targets/blackbox
sudo mkdir -p /etc/prometheus/targets/snmp
sudo mkdir -p /var/lib/prometheus
sudo mkdir -p /etc/blackbox_exporter
sudo mkdir -p /etc/snmp_exporter

# Set appropriate ownerships
sudo chown -R prometheus:prometheus /etc/prometheus /var/lib/prometheus
sudo chown -R blackbox_exporter:blackbox_exporter /etc/blackbox_exporter
sudo chown -R snmp_exporter:snmp_exporter /etc/snmp_exporter
```

---

### 3.2 Blackbox Exporter Installation

Blackbox Exporter must be able to open raw ICMP sockets without running as `root`. We grant this capability using `setcap cap_net_raw+ep`.

1. **Download and install binary:**
   ```bash
   BB_VERSION="0.24.0"
   curl -LO "https://github.com/prometheus/blackbox_exporter/releases/download/v${BB_VERSION}/blackbox_exporter-${BB_VERSION}.linux-amd64.tar.gz"
   tar -xzf "blackbox_exporter-${BB_VERSION}.linux-amd64.tar.gz"
   sudo cp "blackbox_exporter-${BB_VERSION}.linux-amd64/blackbox_exporter" /usr/local/bin/
   sudo chown blackbox_exporter:blackbox_exporter /usr/local/bin/blackbox_exporter
   rm -rf blackbox_exporter*
   ```

2. **Grant Raw Socket Capability (CRITICAL):**
   ```bash
   sudo setcap cap_net_raw+ep /usr/local/bin/blackbox_exporter
   ```
   > [!IMPORTANT]
   > Without `cap_net_raw+ep`, ICMP ping checks will fail with `socket: operation not permitted` when executed under the unprivileged `blackbox_exporter` user.

3. **Deploy Configuration (`/etc/blackbox_exporter/blackbox.yml`):**
   Copy `config/prometheus/blackbox.yml` from the NetMonitor repository:
   ```bash
   sudo cp config/prometheus/blackbox.yml /etc/blackbox_exporter/blackbox.yml
   sudo chown blackbox_exporter:blackbox_exporter /etc/blackbox_exporter/blackbox.yml
   sudo chmod 644 /etc/blackbox_exporter/blackbox.yml
   ```

4. **Create Systemd Service (`/etc/systemd/system/blackbox_exporter.service`):**
   ```ini
   [Unit]
   Description=Prometheus Blackbox Exporter
   Wants=network-online.target
   After=network-online.target

   [Service]
   User=blackbox_exporter
   Group=blackbox_exporter
   Type=simple
   ExecStart=/usr/local/bin/blackbox_exporter \
     --config.file=/etc/blackbox_exporter/blackbox.yml \
     --web.listen-address=127.0.0.1:9115
   Restart=always
   RestartSec=5s
   LimitNOFILE=65536

   [Install]
   WantedBy=multi-user.target
   ```

5. **Start and enable service:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now blackbox_exporter
   sudo systemctl status blackbox_exporter
   ```

---

### 3.3 SNMP Exporter Installation

1. **Download and install binary:**
   ```bash
   SNMP_VERSION="0.24.1"
   curl -LO "https://github.com/prometheus/snmp_exporter/releases/download/v${SNMP_VERSION}/snmp_exporter-${SNMP_VERSION}.linux-amd64.tar.gz"
   tar -xzf "snmp_exporter-${SNMP_VERSION}.linux-amd64.tar.gz"
   sudo cp "snmp_exporter-${SNMP_VERSION}.linux-amd64/snmp_exporter" /usr/local/bin/
   sudo chown snmp_exporter:snmp_exporter /usr/local/bin/snmp_exporter
   rm -rf snmp_exporter*
   ```

2. **Deploy Multi-Vendor MIB Configuration (`/etc/snmp_exporter/snmp.yml`):**
   Copy the pre-compiled, optimized `snmp.yml` from the NetMonitor repository:
   ```bash
   sudo cp config/snmp_exporter/snmp.yml /etc/snmp_exporter/snmp.yml
   sudo chown snmp_exporter:snmp_exporter /etc/snmp_exporter/snmp.yml
   sudo chmod 640 /etc/snmp_exporter/snmp.yml
   ```

3. **Create Systemd Service (`/etc/systemd/system/snmp_exporter.service`):**
   ```ini
   [Unit]
   Description=Prometheus SNMP Exporter
   Wants=network-online.target
   After=network-online.target

   [Service]
   User=snmp_exporter
   Group=snmp_exporter
   Type=simple
   ExecStart=/usr/local/bin/snmp_exporter \
     --config.file=/etc/snmp_exporter/snmp.yml \
     --web.listen-address=127.0.0.1:9116
   Restart=always
   RestartSec=5s
   LimitNOFILE=65536

   [Install]
   WantedBy=multi-user.target
   ```

4. **Start and enable service:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now snmp_exporter
   sudo systemctl status snmp_exporter
   ```

---

### 3.4 Prometheus TSDB Installation

1. **Download and install binary:**
   ```bash
   PROM_VERSION="2.45.3"
   curl -LO "https://github.com/prometheus/prometheus/releases/download/v${PROM_VERSION}/prometheus-${PROM_VERSION}.linux-amd64.tar.gz"
   tar -xzf "prometheus-${PROM_VERSION}.linux-amd64.tar.gz"
   sudo cp "prometheus-${PROM_VERSION}.linux-amd64/prometheus" /usr/local/bin/
   sudo cp "prometheus-${PROM_VERSION}.linux-amd64/promtool" /usr/local/bin/
   sudo chown prometheus:prometheus /usr/local/bin/prometheus /usr/local/bin/promtool
   rm -rf prometheus*
   ```

2. **Deploy Prometheus Scrape Configuration (`/etc/prometheus/prometheus.yml`):**
   Copy `config/prometheus/prometheus.yml` from NetMonitor, adjusting exporter hostnames to `127.0.0.1:9115` and `127.0.0.1:9116` if running on the same host:
   ```bash
   sudo cp config/prometheus/prometheus.yml /etc/prometheus/prometheus.yml
   # In bare-metal mode, point exporter targets to 127.0.0.1
   sudo sed -i 's/blackbox-exporter:9115/127.0.0.1:9115/g' /etc/prometheus/prometheus.yml
   sudo sed -i 's/snmp-exporter:9116/127.0.0.1:9116/g' /etc/prometheus/prometheus.yml
   sudo chown prometheus:prometheus /etc/prometheus/prometheus.yml
   sudo chmod 644 /etc/prometheus/prometheus.yml
   ```

3. **Verify Configuration with `promtool`:**
   ```bash
   promtool check config /etc/prometheus/prometheus.yml
   # Output must indicate: SUCCESS: /etc/prometheus/prometheus.yml is valid
   ```

4. **Create Systemd Service (`/etc/systemd/system/prometheus.service`):**
   ```ini
   [Unit]
   Description=Prometheus Time Series Database
   Wants=network-online.target
   After=network-online.target

   [Service]
   User=prometheus
   Group=prometheus
   Type=simple
   ExecStart=/usr/local/bin/prometheus \
     --config.file=/etc/prometheus/prometheus.yml \
     --storage.tsdb.path=/var/lib/prometheus \
     --storage.tsdb.retention.time=30d \
     --storage.tsdb.retention.size=50GB \
     --web.enable-lifecycle \
     --web.listen-address=127.0.0.1:9090
   ExecReload=/bin/kill -HUP $MAINPID
   Restart=always
   RestartSec=5s
   LimitNOFILE=65536

   [Install]
   WantedBy=multi-user.target
   ```

5. **Start and enable service:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now prometheus
   sudo systemctl status prometheus
   ```

---

### 3.5 Grafana Installation

1. **Install Grafana OSS (Ubuntu / Debian):**
   ```bash
   sudo apt-get install -y apt-transport-https software-properties-common wget
   sudo mkdir -p /etc/apt/keyrings/
   wget -q -O - https://apt.grafana.com/gpg.key | gpg --dearmor | sudo tee /etc/apt/keyrings/grafana.gpg > /dev/null
   echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" | sudo tee /etc/apt/sources.list.d/grafana.list
   sudo apt-get update
   sudo apt-get install -y grafana
   ```

   *(For RHEL / CentOS / AlmaLinux / Rocky Linux):*
   ```bash
   sudo tee /etc/yum.repos.d/grafana.repo <<EOF
   [grafana]
   name=grafana
   baseurl=https://rpm.grafana.com
   repo_gpgcheck=1
   enabled=1
   gpgcheck=1
   gpgkey=https://rpm.grafana.com/gpg.key
   sslverify=1
   sslcacert=/etc/pki/tls/certs/ca-bundle.crt
   EOF
   sudo dnf install -y grafana
   ```

2. **Configure Embedding & Permissions (`/etc/grafana/grafana.ini`):**
   Open `/etc/grafana/grafana.ini` and apply the following settings:
   ```ini
   [security]
   # Allow NetMonitor frontend iframe to embed Grafana panels
   allow_embedding = true
   admin_user = admin
   admin_password = YourStrongGrafanaPassword

   [auth.anonymous]
   # Allow NetMonitor to display embedded panels without prompting credentials
   enabled = true
   org_name = Main Org.
   org_role = Viewer

   [users]
   allow_sign_up = false
   auto_assign_org_role = Viewer
   ```

3. **Auto-Provision Prometheus Datasource (`/etc/grafana/provisioning/datasources/prometheus.yaml`):**
   ```yaml
   apiVersion: 1
   datasources:
     - name: Prometheus
       type: prometheus
       access: proxy
       url: http://127.0.0.1:9090
       isDefault: true
       editable: false
       jsonData:
         timeInterval: 15s
         httpMethod: POST
   ```

4. **Start and enable service:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now grafana-server
   sudo systemctl status grafana-server
   ```

---

## 4. Connecting Infrastructure to NetMonitor Core

Whether running via Docker or native systemd, NetMonitor connects to the telemetry services via parameters in `.env`:

```bash
# Set endpoints to localhost for native bare-metal, or service names for Docker Compose
PROMETHEUS_URL=http://127.0.0.1:9090
PROMETHEUS_TARGETS_DIR=/etc/prometheus/targets
BLACKBOX_EXPORTER_URL=http://127.0.0.1:9115
SNMP_EXPORTER_URL=http://127.0.0.1:9116
GRAFANA_URL=http://127.0.0.1:3000

# Synchronization intervals
PROMETHEUS_SCRAPE_INTERVAL=15s
```

* **Target Directory Access:** Ensure the user running the NetMonitor backend process has write permissions to `PROMETHEUS_TARGETS_DIR/blackbox` and `PROMETHEUS_TARGETS_DIR/snmp` so it can dynamically register newly added network switches.

---

## 5. Verification & Diagnostic Playbook

### Component Health Checks

Run these diagnostic commands from the server hosting the infrastructure:

```bash
# 1. Prometheus Health Check
curl -s http://127.0.0.1:9090/-/healthy
# Expected: Prometheus Server is Healthy.

# 2. Blackbox Exporter Health Check
curl -s http://127.0.0.1:9115/
# Expected: HTML page: "Blackbox Exporter"

# 3. SNMP Exporter Health Check
curl -s http://127.0.0.1:9116/
# Expected: HTML page: "SNMP Exporter"

# 4. Grafana Health Check
curl -s http://127.0.0.1:3000/api/health
# Expected: {"commit":"...","database":"ok","version":"10.2.3"}
```

---

### Live Probe Testing (ICMP & SNMP)

#### Testing ICMP Ping via Blackbox Exporter:
```bash
curl -s "http://127.0.0.1:9115/probe?target=8.8.8.8&module=icmp" | grep -E "probe_success|probe_duration_seconds"
```
*Expected Output:*
```
# HELP probe_duration_seconds Returns how long the probe took to complete in seconds
probe_duration_seconds 0.014238
# HELP probe_success Displays whether a probe was successful (1) or not (0)
probe_success 1
```

#### Testing SNMP Query via SNMP Exporter:
```bash
# Test a managed switch on IP 192.168.1.1 with community 'public'
curl -s "http://127.0.0.1:9116/snmp?target=192.168.1.1&module=if_mib&auth=public_v2" | grep -E "ifHCInOctets|ifOperStatus" | head -n 10
```
*Expected Output:*
```
ifHCInOctets{ifDescr="GigabitEthernet1/0/1",ifIndex="1"} 4928172948
ifOperStatus{ifDescr="GigabitEthernet1/0/1",ifIndex="1"} 1
```

#### Checking Prometheus Target Scrape State:
```bash
curl -s 'http://127.0.0.1:9090/api/v1/targets' | jq '.data.activeTargets[] | {job: .labels.job, instance: .labels.instance, health: .health, lastError: .lastError}'
```

---

### Common Infrastructure Issues & Remediation

| Issue / Error | Root Cause | Immediate Remediation |
|---|---|---|
| `socket: operation not permitted` on Blackbox probe | Binary lacks Linux raw socket privileges | Run `sudo setcap cap_net_raw+ep /usr/local/bin/blackbox_exporter`<br>Or in Docker verify `cap_add: [NET_RAW]` |
| `Scrape failed: scrape timed out` (HTTP 500 on SNMP) | Target switch unreachable or community mismatch | Verify ping to target IP; verify community string in switch config vs NetMonitor settings |
| `Unknown module 'cisco_switch'` (HTTP 400 on SNMP) | SNMP Exporter loaded default minimal config without custom modules | Copy `config/snmp_exporter/snmp.yml` into exporter config path and restart service |
| `Address already in use` on startup | Port 9090, 9115, 9116, or 3000 is occupied by another process | Check listener via `ss -tulpn \| grep :<PORT>` and update port in `.env` / service config |
| Grafana panel displays "Refused to display in a frame" | Iframe embedding blocked by default security policy | Ensure `allow_embedding = true` is set in `/etc/grafana/grafana.ini` under `[security]` |
