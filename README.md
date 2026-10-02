# NetMonitor Enterprise Network Observability Platform

<p align="center">
  <a href="README.md"><b>English</b></a> | <a href="README.th.md"><b>ภาษาไทย (คู่มือภาษาไทย)</b></a>
</p>

<p align="center">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18.x%20%7C%2020.x-339933?logo=node.js&logoColor=white" alt="Node.js"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black" alt="React"></a>
  <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite&logoColor=white" alt="Vite"></a>
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-Compose%20v2-2496ED?logo=docker&logoColor=white" alt="Docker"></a>
  <a href="https://prometheus.io/"><img src="https://img.shields.io/badge/Prometheus-2.45+-E6522C?logo=prometheus&logoColor=white" alt="Prometheus"></a>
  <a href="https://nginx.org/"><img src="https://img.shields.io/badge/Nginx-1.25%20Alpine-009639?logo=nginx&logoColor=white" alt="Nginx"></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/TailwindCSS-3.x-06B6D4?logo=tailwindcss&logoColor=white" alt="TailwindCSS"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

---

**NetMonitor Enterprise** is a high-performance, turn-key Network Observability and Management Platform engineered for modern campus, data center, and enterprise networks. It unifies **sub-second real-time device health monitoring**, **Prometheus time-series telemetry**, **interactive network topology maps**, and **real-time push alerting** into an intuitive, lightweight web dashboard.

---

## 📚 Essential Documentation & Manuals

The platform documentation has been consolidated into the following authoritative manuals:

| Manual | Description | Target Audience |
|---|---|---|
| 🇹🇭 [**คู่มือภาษาไทยฉบับสมบูรณ์**](README.th.md) | คู่มือการติดตั้ง การตั้งค่า การใช้งาน และการแก้ไขปัญหาฉบับภาษาไทย | ผู้ดูแลระบบและวิศวกรเครือข่าย |
| 🚀 [**Installation & Deployment Guide**](INSTALLATION.md) | Step-by-step setup for Docker Compose, Native Linux (systemd), Nginx reverse proxy, and hardware sizing. | System & Network Engineers |
| 🛠️ [**Administrator & Troubleshooting Guide**](ADMIN_GUIDE.md) | Operations, RBAC security, configuration reference, backup & restore, upgrades, and incident response playbooks. | Operations, DevOps & NOC Teams |
| 💻 [**Developer & Architecture Guide**](DEVELOPER_GUIDE.md) | System architecture, telemetry data pipelines, codebase layout, development workflow, and testing suite. | Developers & Platform Architects |
| 📋 [**Changelog & Release Notes**](CHANGELOG.md) | Complete version history, feature highlights, and hardening improvements in V1.1.0. | All Stakeholders |
| 🛡️ [**Security Policy**](SECURITY.md) | Security model, PBKDF2 authentication, rate limiting, and vulnerability disclosure policies. | Security & Compliance Teams |

---

## ⚡ Quick Start (Docker Compose)

Deploy the entire monitoring stack in 3 simple commands:

```bash
# 1. Clone repository
git clone https://github.com/example/network-monitor-react.git /opt/netmonitor
cd /opt/netmonitor

# 2. Configure environment
cp .env.example .env
# (Edit .env to set your JWT_SECRET and EMERGENCY_PASSWORD)

# 3. Build & Launch
docker compose up -d --build
```

Access the web dashboard at `http://localhost` (or server IP) and log in with your emergency admin credentials.

---

## 🌟 Key Highlights & Capabilities

- **Zero-Polling Real-Time Push**: Server-Sent Events (SSE) stream latency, interface throughput, and device status to browsers instantly without page refreshes.
- **Enterprise Security Boundary**: PBKDF2 credential hashing (100k rounds SHA-512), timing-safe comparisons, 3-tier RBAC (`Admin`, `Editor`, `Viewer`), and PromQL query rate limiters.
- **Accurate Traffic Semantics**: Strict differentiation between active zero-traffic interfaces (`0.00 Mbps`) and telemetry outages (`No Data`), with 64-bit High Capacity counter support.
- **Multi-Vendor SNMP Support**: Pre-configured MIB profiles for Cisco, MikroTik, Synology, Linux/Windows servers, and RFC 1213 generic devices.
- **Disaster Recovery Ready**: Cryptographically verified database exports with SHA-256 integrity checksums and atomic pre-write snapshots (`.bak`).
- **Zero Heavy External DB**: Lightweight, single-instance atomic JSON database engine (`data/db.json`) eliminating PostgreSQL/MySQL operational complexity.

---

## 📄 License
This project is licensed under the MIT License.
