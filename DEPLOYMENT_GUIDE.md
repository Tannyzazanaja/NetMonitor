# NetMonitor Enterprise Deployment & Operations Guide

This guide provides step-by-step instructions for deploying, securing, and maintaining the **NetMonitor Enterprise Network Monitoring Platform** on on-premises bare-metal servers, private cloud hypervisors (VMware ESXi, Proxmox, Hyper-V, KVM), or cloud instances (AWS, Azure, GCP).

---

## 1. System Requirements & Hardware Sizing Matrix

NetMonitor is engineered with **vanilla, zero-bloat microservices** (Node.js backend, static React build on Alpine Nginx, and compiled Go exporter binaries). Total active RAM across all 6 running containers is typically only **~350 MB – 600 MB** under normal operational load.

### Recommended Hardware Sizing Matrix

| Metric / Deployment Scale | Lab / Branch (< 30 Devices) | Small Enterprise (< 50 Devices) | Medium Enterprise (50 - 200 Devices) | Large Enterprise (> 200 Devices) |
|---|---|---|---|---|
| **vCPU Cores** | 1 vCPU | 1 - 2 vCPU | 2 vCPU | 4 vCPU |
| **System Memory (RAM)** | 1 GB - 2 GB | 2 GB | 4 GB | 8 GB |
| **Storage (SSD / NVMe)** | 10 GB | 15 - 20 GB | 30 - 50 GB | 80 - 100 GB |
| **Operating System** | Ubuntu 22.04 LTS / Debian 12 / RHEL 9 / Proxmox CT / Windows Server | Same | Same | Same |
| **Container Engine** | Docker Engine 24.0+ & Compose v2 | Same | Same | Same |
| **Network Interface** | 1 Gbps NIC | 1 Gbps NIC | 1 Gbps / 10 Gbps | 10 Gbps Redundant NICs |

### Real-World Container Memory & Storage Footprint:

* **NetMonitor Core (Node.js API):** ~40 MB – 60 MB RAM (written in vanilla Node.js without heavy frameworks).
* **Nginx Gateway (Alpine):** ~10 MB – 15 MB RAM (serves pre-compiled Vite static frontend).
* **Blackbox Exporter (Go binary):** ~15 MB – 30 MB RAM (sub-second ICMP probes with negligible CPU).
* **SNMP Exporter (Go binary):** ~25 MB – 50 MB RAM (lean OID walks without bloated tables).
* **Prometheus TSDB (Go binary):** ~150 MB – 300 MB RAM (compresses time-series samples to ~1.5 bytes/sample; 50 devices with 30-day retention consumes only ~1 GB – 3 GB of disk space).
* **Grafana OSS:** ~80 MB – 150 MB RAM.

---

## 2. Architecture Overview

```
                          [ Corporate LAN / WAN ]
                                    │
                                    ▼
                     ┌──────────────────────────────┐
                     │     Nginx Gateway (Reverse)  │  Port 80 (HTTP)
                     │     SSL/TLS Termination      │  Port 443 (HTTPS)
                     └──────────────┬───────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           ▼                        ▼                        ▼
  ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
  │ NetMonitor Core │      │ Prometheus TSDB │      │ Grafana Engine  │
  │ Node.js Backend │      │ Metrics Engine  │      │ Embedded Panels │
  │ & Static Dist   │      │ Port 9090       │      │ Port 3000       │
  │ Port 5001       │      └────────┬────────┘      └─────────────────┘
  └────────┬────────┘               │
           │ Dynamic file_sd        ▼
           └──────────────► ┌────────────────────────────────┐
                            │      Telemetry Exporters       │
                            │  • Blackbox (ICMP Ping) :9115  │
                            │  • SNMP Exporter (UDP 161) :9116│
                            └───────────────┬────────────────┘
                                            │ UDP 161 & ICMP
                                            ▼
                           [ Managed Network Devices ]
                       Switches, Firewalls, Routers, APs
```

---

## 3. Quick Turn-Key Deployment (Docker Compose)

### 3.1 Linux / macOS Deployment
1. **Clone or copy the release package to the target server:**
   ```bash
   cd /opt/netmonitor
   ```
2. **Execute the automated deployment script:**
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```
   *The script automatically runs pre-flight checks (RAM, Disk, Docker), copies `.env.example` to `.env`, generates random cryptographic keys (`JWT_SECRET`, `SESSION_SECRET`, `EMERGENCY_PASSWORD`), provisions directory permissions, and launches the container stack.*

3. **Verify running containers:**
   ```bash
   docker compose ps
   ```

### 3.2 Windows / Windows Server Deployment
1. Open **PowerShell as Administrator** in the project folder:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\deploy.ps1
   ```
2. The script runs automated health checks and displays your live dashboard URL and credentials upon completion.

> [!NOTE]
> If your organization requires deploying Prometheus, SNMP Exporter, Blackbox Exporter, and Grafana natively as Linux systemd services (Bare-Metal / VM) instead of Docker Compose, refer to the [**Infrastructure Installation Guide**](INFRA_INSTALLATION_GUIDE.md) ([TH](INFRA_INSTALLATION_GUIDE.th.md)).

---

## 4. Configuration & Customization (`.env`)

Before exposing the platform to production, adjust values in `.env`:

```bash
# Public HTTP & HTTPS gateway ports
HTTP_PORT=80
HTTPS_PORT=443

# Organization branding displayed on dashboards & reports
ORG_NAME="Acme Corp Network Operations Center"

# Default subnet for automated discovery
DEFAULT_DISCOVERY_CIDR=192.168.1.0/24

# Default SNMP Read-Only community for switch onboarding
DEFAULT_SNMP_COMMUNITY=public

# Prometheus metric retention duration and size
PROMETHEUS_RETENTION_TIME=30d
PROMETHEUS_RETENTION_SIZE=50GB
```

---

## 5. SSL / TLS Certificate Setup (HTTPS on Port 443)

To secure the web interface with an SSL certificate:

1. **Place your certificate and private key in the SSL directory:**
   - Certificate Chain: `config/nginx/ssl/cert.pem`
   - Private Key: `config/nginx/ssl/key.pem`
2. **Enable HTTPS in Nginx:**
   Open `config/nginx/netmonitor.conf` and uncomment the `server { listen 443 ssl http2; ... }` block.
3. **Reload Nginx:**
   ```bash
   docker compose restart nginx
   ```

---

## 6. Network Firewall & Ingress / Egress Rules

Ensure the server hosting NetMonitor allows the following traffic:

### Inbound Traffic (To NetMonitor Server):
| Port | Protocol | Source | Purpose |
|---|---|---|---|
| `80` | TCP | Management Workstations / LAN | HTTP Web Dashboard |
| `443` | TCP | Management Workstations / LAN | HTTPS Secure Dashboard |
| `22` | TCP | Admin Bastion / Jump Host | SSH Management |

### Outbound Traffic (From NetMonitor to Network):
| Port | Protocol | Destination | Purpose |
|---|---|---|---|
| `161` | UDP | All Monitored Devices | SNMP v2c/v3 Telemetry Polling |
| Any | ICMP (Echo Request) | All Monitored Devices | Blackbox Ping Latency & Up/Down |
| `443` | TCP | Internet (api.line.me) | LINE Messaging API Push Notifications (Optional) |

---

## 7. Backup & Disaster Recovery

### Data to Backup:
- **Device & Topology Database:** `data/db.json`
- **Application Configuration:** `.env`
- **SSL Certificates:** `config/nginx/ssl/`
- **Prometheus Metric Volume (Optional):** Docker volume `netmonitor_prometheus_data`

### Quick Backup Script:
```bash
#!/usr/bin/env bash
BACKUP_DIR="/backup/netmonitor-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r data/ "$BACKUP_DIR/data/"
cp .env "$BACKUP_DIR/.env"
cp -r config/ "$BACKUP_DIR/config/"
tar -czf "${BACKUP_DIR}.tar.gz" -C "/backup" "$(basename "$BACKUP_DIR")"
rm -rf "$BACKUP_DIR"
echo "Backup saved to: ${BACKUP_DIR}.tar.gz"
```

---

## 8. Role-Based Access Control (RBAC) & User Management

NetMonitor enforces a strict three-tier privilege model integrated with Grafana's user directory (`http://<SERVER_IP>:3000/admin/users`):

| Operational Capability | Viewer | Editor | Admin |
|---|:---:|:---:|:---:|
| **View Real-Time Dashboard & Telemetry** | ✅ | ✅ | ✅ |
| **View Topology Map** | ✅ | ✅ | ✅ |
| **View Historical Analytics & Export CSV/PNG** | ✅ | ✅ | ✅ |
| **Acknowledge Active Alerts** | ❌ | ✅ | ✅ |
| **Add / Edit / Delete Network Devices** | ❌ | ✅ | ✅ |
| **Trigger Topology Discovery & Save Layout** | ❌ | ✅ | ✅ |
| **Modify Global Settings & Subnet CIDR** | ❌ | ❌ | ✅ |
| **Configure SNMP Communities & LINE Notifications** | ❌ | ❌ | ✅ |
| **Emergency Break-Glass Credential Access** | ❌ | ❌ | ✅ |

### Emergency Break-Glass Account
If Grafana is offline, unreachable, or in disaster recovery, operators can log in using the local break-glass credentials configured via `EMERGENCY_USERNAME` (default: `emergency`) and `EMERGENCY_PASSWORD` in `.env`. This immediately grants administrative privileges without external dependencies.

