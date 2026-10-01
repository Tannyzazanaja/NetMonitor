# NetMonitor: Enterprise Network Observability & Management Platform

<p align="center">
  <a href="README.md"><b>English</b></a> | <a href="README.th.md"><b>ภาษาไทย</b></a>
</p>

<p align="center">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18.x%20%7C%2020.x-339933?logo=node.js&logoColor=white" alt="Node.js"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-18.2-61DAFB?logo=react&logoColor=black" alt="React"></a>
  <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite&logoColor=white" alt="Vite"></a>
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-Compose%20v2-2496ED?logo=docker&logoColor=white" alt="Docker"></a>
  <a href="https://prometheus.io/"><img src="https://img.shields.io/badge/Prometheus-2.45+-E6522C?logo=prometheus&logoColor=white" alt="Prometheus"></a>
  <a href="https://nginx.org/"><img src="https://img.shields.io/badge/Nginx-1.25%20Alpine-009639?logo=nginx&logoColor=white" alt="Nginx"></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/TailwindCSS-3.x-06B6D4?logo=tailwindcss&logoColor=white" alt="TailwindCSS"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

---

**NetMonitor** is an enterprise-grade, turn-key Network Observability and Management Platform engineered for modern campus, data center, and branch office networks. It unifies **real-time device health monitoring**, **historical time-series telemetry analytics**, and **semi-automatic L2/L3 topology discovery** into an intuitive, lightweight web dashboard.

Designed specifically to eliminate the overhead of complex, monolithic network management suites, NetMonitor leverages high-efficiency **Prometheus batch PromQL queries**, **Server-Sent Events (SSE)** for zero-polling real-time updates, and an **in-memory spatial topology engine** capable of rendering hundreds of nodes at 60 FPS.

---

## 📚 Technical Documentation Index

| Guide | Description | Target Audience |
|---|---|---|
| 🚀 [**Deployment Guide**](DEPLOYMENT_GUIDE.md) ([TH](DEPLOYMENT_GUIDE.th.md)) | Step-by-step turn-key installation, hardware sizing matrix, SSL/TLS, and disaster recovery. | System & Network Engineers |
| 🏗️ [**Infrastructure Guide**](INFRA_INSTALLATION_GUIDE.md) ([TH](INFRA_INSTALLATION_GUIDE.th.md)) | Detailed setup for Prometheus TSDB, SNMP Exporter, Blackbox Exporter, and Grafana (Docker & Systemd). | Infrastructure & DevOps Engineers |
| ⚙️ [**Configuration Reference**](CONFIG_REFERENCE.md) ([TH](CONFIG_REFERENCE.th.md)) | Comprehensive `.env` settings, JSON device schema, target YAML specifications, and PromQL catalog. | DevOps & Platform Architects |
| 🛠️ [**Troubleshooting Playbook**](TROUBLESHOOTING.md) ([TH](TROUBLESHOOTING.th.md)) | Diagnostic workflows for SNMP timeouts (HTTP 500), 400 Bad Request, port conflicts, and permissions. | Operations & NOC Teams |

---

## Table of Contents

1. [Key Features](#1-key-features)
2. [Architecture & Security](#2-architecture--security)
3. [Supported Hardware & Vendors](#3-supported-hardware--vendors)
4. [Quick Start (Turn-Key Deployment)](#4-quick-start-turn-key-deployment)
   - [Linux / macOS / Cloud VM](#linux--macos--cloud-vm)
   - [Windows / Windows Server](#windows--windows-server)
   - [Local Development Mode](#local-development-mode)
5. [Configuration & Environment Variables](#5-configuration--environment-variables)
6. [Topology Auto-Discovery Engine](#6-topology-auto-discovery-engine)
7. [Smart Alerting & Webhooks](#7-smart-alerting--webhooks)
8. [License & Contributing](#8-license--contributing)

---

## 1. Key Features

### 📡 Real-Time Observability
* **Sub-Second ICMP & SNMP Probing:** Powered by Prometheus Blackbox Exporter and SNMP Exporter.
* **Zero-Polling Web Dashboard:** Server-Sent Events (SSE) push live device status, telemetry updates, and alerts directly to connected browsers without refreshing.
* **Multi-Window Synchronization:** Multiple operators can view the dashboard simultaneously without multiplying load on the monitoring core.

### 📈 Historical Analytics Platform
* **7 Specialized Analytics Modules:**
  1. **CPU Usage Trend (`cpu`):** Multi-vendor CPU utilization percentage (`hwEntityCpuUsage`, `cpmCPUTotal5minRev`, `rlCpuUtilDuringLast5Minutes`, `hpSwitchCpuStat`, `hrProcessorLoad`).
  2. **Memory Usage Trend (`memory`):** Memory pool utilization percentage across Cisco, HP/Aruba, Huawei, and Host Resources storage.
  3. **Bandwidth Throughput (`bandwidth`):** Inbound, Outbound, and Combined traffic throughput (in Mbps) using 64-bit HC counters (`ifHCInOctets`/`ifHCOutOctets`) with automatic 32-bit fallback.
  4. **Interface Peak Utilization (`interface_util`):** Peak link capacity percentage calculated from port bandwidth divided by link speed (`ifHighSpeed`/`ifSpeed`).
  5. **Latency Trend RTT (`latency`):** Round-trip ping time in milliseconds via Prometheus Blackbox ICMP (`probe_duration_seconds * 1000`).
  6. **Packet Loss Trend (`packet_loss`):** ICMP packet drop percentage calculated via `(1 - probe_success) * 100`.
  7. **Device Availability SLA (`availability`):** Rolling availability percentage based on `avg_over_time(probe_success[5m]) * 100`.
* **In-Memory Cache:** 5-minute client-side query cache with dynamic optimal step calculation for sub-second chart rendering.

### 🗺️ Semi-Automatic Topology Discovery
* **Dual Discovery Protocols:** Concurrent LLDP and CDP neighbor discovery.
* **Multi-Vendor Link Deduplication:** Automatically reconciles reciprocal links between heterogeneous vendors (e.g., Cisco switch reporting Aruba neighbor via CDP, while Aruba reports Cisco via LLDP).
* **Dual Layout Modes:** Clean hierarchical tier layout (Core ➔ Distribution ➔ Access ➔ Edge) or dynamic force-directed physics layout.
* **O(1) Spatial Hash Grid Canvas:** Ultra-smooth HTML5 Canvas 2D rendering with pan, zoom, marquee selection, and spatial indexing for 300+ nodes.

---

## 2. Architecture & Security

```
                          [ Corporate LAN / WAN ]
                                    │
                                    ▼
                     ┌──────────────────────────────┐
                     │     Nginx Gateway (Reverse)  │  Port 80 (HTTP)
                     │     SSL/TLS Termination      │  Port 443 (HTTPS)
                     │  • OWASP Security Headers    │
                     │  • Content Security Policy   │
                     └──────────────┬───────────────┘
                                    │ Internal Network
           ┌────────────────────────┼────────────────────────┐
           ▼                        ▼                        ▼
  ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
  │ NetMonitor Core │      │ Prometheus TSDB │      │ Grafana Engine  │
  │ Node.js Backend │      │ Metrics Engine  │      │ Embedded Panels │
  │ Non-Root netmon │      │ Port 9090       │      │ Port 3000       │
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

### Enterprise Security Hardening
* **Container Isolation:** All telemetry microservices (Prometheus, SNMP Exporter, Blackbox Exporter, Grafana) are strictly bound to `127.0.0.1` or isolated within the internal Docker bridge network (`netmonitor-net`).
* **Non-Root Execution:** Node.js backend runs under an unprivileged system user (`netmon`, UID 10001).
* **OWASP Security Headers:** Enforces `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security` (HSTS), and Content Security Policy (CSP) via Nginx.
* **Role-Based Access Control (RBAC):** Distinct roles for `Viewer` (read-only), `Editor`, and `Admin`, authenticated via Grafana's user directory.
* **Emergency Break-Glass Account:** Standalone local administrator login (`EMERGENCY_USERNAME` / `EMERGENCY_PASSWORD`) for offline recovery and disaster management.
* **Zero-Touch Secret Masking:** Passwords, tokens, and SNMP community strings are masked with `***` across all public REST endpoints.

---

## 3. Supported Hardware & Vendors

NetMonitor includes pre-compiled, optimized SNMP modules in `config/snmp_exporter/snmp.yml`:

| Vendor / Platform | Recommended Module | Monitored Metrics |
|---|---|---|
| **Cisco Catalyst (IOS / IOS-XE)** | `cisco_switch` | 64-bit Port Traffic, CDP Neighbors, CPU (`cpmCPUTotal5minRev`), Memory Pool |
| **Cisco Small Business (C1200/C1300/CBS)** | `cisco_sb` | 64-bit Port Traffic, LLDP Neighbors, Radlan CPU (`rlCpuUtilDuringLast5Minutes`) |
| **HPE / Aruba (CX, ProCurve, AOS-S)** | `aruba_switch` | 64-bit Port Traffic, LLDP Neighbors, HP CPU (`hpSwitchCpuStat`), Memory |
| **Huawei (CloudEngine, S5700, VRP)** | `huawei_switch` | 64-bit Port Traffic, LLDP Neighbors, Huawei CPU (`hwEntityCpuUsage`), Memory |
| **MikroTik (RouterOS, CCR, CRS)** | `mikrotik_router` | 64-bit Port Traffic, LLDP Neighbors, CPU Load (`hrProcessorLoad`), Storage |
| **Linux / Windows / KVM Servers** | `host_resources` | RFC 2790 CPU (`hrProcessorLoad`), Memory Pool, Storage Volume Usage |
| **APC Smart-UPS / Symmetra** | `apcups` | Battery Charge %, Output Load, Internal Temperature, Battery Status |
| **Synology NAS (DiskStation / RackStation)** | `synology` | System Health, Disk Drive Status, Temperature, Volume Space |
| **Universal Fallback (Any Managed Device)** | `if_mib` | Universal RFC 2863 64-bit HC In/Out Counters, Admin/Oper Status, LLDP |

---

## 4. Quick Start (Turn-Key Deployment)

### Linux / macOS / Cloud VM
```bash
# 1. Clone repository
git clone https://github.com/Tannyzazanaja/NetMonitor.git
cd NetMonitor

# 2. Run the automated turn-key deployment script
chmod +x deploy.sh
./deploy.sh
```
*The script automatically checks Docker/Compose, verifies RAM/Disk, auto-generates `.env` and cryptographic secrets (`JWT_SECRET`, `SESSION_SECRET`, `EMERGENCY_PASSWORD`), provisions permissions, starts containers, and performs a wait-for-healthy verification.*

### Windows / Windows Server
```powershell
# Open PowerShell as Administrator
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\deploy.ps1
```

### Local Development Mode
```bash
# Install frontend & root dependencies
npm install

# Install backend dependencies
cd server && npm install && cd ..

# Copy configuration
cp .env.example .env

# Run Vite dev server + Backend in parallel
npm run dev
```

---

## 5. Configuration & Environment Variables

Copy `.env.example` to `.env` to customize settings:

```bash
# Gateway Ports
HTTP_PORT=80
HTTPS_PORT=443

# Organization Title
ORG_NAME="Acme Corp Network Operations Center"

# Default Network Discovery CIDR
DEFAULT_DISCOVERY_CIDR=192.168.1.0/24

# Default SNMP Read-Only Community
DEFAULT_SNMP_COMMUNITY=public

# Prometheus TSDB Retention
PROMETHEUS_RETENTION_TIME=30d
PROMETHEUS_RETENTION_SIZE=50GB
```

Refer to [**CONFIG_REFERENCE.md**](CONFIG_REFERENCE.md) for full parameter documentation.

---

## 6. Network Scanner & Topology Auto-Discovery

NetMonitor provides two distinct discovery mechanisms:

1. **Subnet IP & Device Scanner (`/api/scan`):**
   * Sweeps user-defined IP ranges or CIDR blocks (e.g., `192.168.1.0/24` or `192.168.1.1-254`).
   * Combines ICMP ping with SNMP queries (`sysDescr`, `sysName`) to automatically classify device roles (`switch`, `router`, `firewall`, `ap`, `server`) and vendors (`Cisco`, `Fortinet`, `Palo Alto`, `Aruba`, `MikroTik`, `Ubiquiti`, `Ruijie`).
   * Provides one-click onboarding of discovered devices into inventory.

2. **Topology Neighbor Crawler (`/api/topology/discover`):**
   * Concurrently queries managed switches in inventory via SNMP `LLDP-MIB` (`lldpRemSysName`, `lldpRemPortId`) and `CISCO-CDP-MIB` (`cdpCacheDeviceId`, `cdpCacheDevicePort`).
   * Resolves remote system names and port mappings (`ifName` / `ifDescr`).
   * **Multi-Vendor Link Deduplication:** Automatically reconciles reciprocal links between heterogeneous vendors into canonical links.
   * **Interactive Canvas:** Renders nodes on an HTML5 Canvas 2D engine with hierarchical and force-directed layouts.

---

## 7. Smart Alerting & LINE Notifications

* **Real-Time Health Evaluation:** Backend continuously monitors device reachability (`probe_success`) and evaluates latency thresholds.
* **Flapping Prevention:** Cooldown timers prevent notification storms during intermittent link flapping.
* **One-Click Acknowledgement:** Operators can acknowledge firing alerts directly from the Web UI to mute ongoing reminders.
* **LINE Messaging API Push Notifications:** Native integration with LINE Messaging API (`https://api.line.me/v2/bot/message/push`) using `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_USER_ID`, delivering instant incident and recovery ([RESOLVED]) messages.

---

## 8. License & Contributing

Distributed under the **MIT License**. See `LICENSE` for more information.

Contributions, issues, and feature requests are welcome!
Feel free to open a Pull Request or submit an Issue on the [GitHub Repository](https://github.com/Tannyzazanaja/NetMonitor).

---

<p align="center">
  <i>Engineered for resilient, observable, and high-performance enterprise networks.</i>
</p>
