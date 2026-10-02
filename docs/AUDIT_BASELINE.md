# NetMonitor Enterprise - Baseline Architecture & Security Audit
**Document:** `docs/AUDIT_BASELINE.md`  
**Version:** V1.1.0-audit  
**Date:** 2026-10-02  
**Auditor:** Senior Full-Stack / DevOps / Security Engineering Team  

---

## 1. Executive Summary

This document establishes the official **Baseline Audit** of the NetMonitor Enterprise Network Monitoring Web Application prior to execution of hardening, security boundary implementation, configuration synchronization, and release-readiness tasks.

The system is currently functional in production and local development environments. This audit catalogues the current architecture, configuration hierarchy, security boundaries, telemetry pipelines, test models, and technical debt to ensure that subsequent hardening steps improve resilience and security without disrupting existing functional capabilities.

---

## 2. Current Architecture

### 2.1 Component Topology

```
[ Web Browser Client ]
       │
       ▼ (Port 80 / 443)
[ Nginx Reverse Proxy Gateway ]
       │
       ├───────────────────────────────┬───────────────────────────────┐
       ▼ (Port 5001)                   ▼ (Port 9090)                   ▼ (Port 3000)
[ NetMonitor Node.js App Core ]   [ Prometheus TSDB ]         [ Grafana OSS ]
  • REST API & SSE Engine           • Metrics Storage           • NOC Dashboards
  • Storage & Targets Generator     • PromQL Query Engine       • Embedding
  • Alert Rules & Notifications           │
  • In-Memory Cache                       ├────────────────────────────┐
  • SNMP Crawler / Scanner                ▼ (Port 9116)                ▼ (Port 9115)
       │                            [ SNMP Exporter ]          [ Blackbox Exporter ]
       ▼ (Direct SNMP UDP 161)        • Hardware MIBs            • ICMP Ping RTT
[ Network Switches & Routers ]        • Interface HC Counters    • Reachability
```

### 2.2 System Components

1. **Frontend Single Page Application (SPA):**
   * **Framework:** React 19 + Vite 8.
   * **Visuals & Charts:** Chart.js 4 + react-chartjs-2, Lucide icons.
   * **Communication:** Fetch API for REST requests; EventSource for Server-Sent Events (SSE).
   * **Bundle:** Compiled to static HTML/JS/CSS in `/app/dist`, served by Nginx.

2. **Backend Application Core (`server/server.js`):**
   * **Runtime:** Node.js 20 LTS (Alpine Linux).
   * **Framework:** Vanilla HTTP server (`http.createServer`) without Express or heavy dependencies.
   * **Size:** Single monolithic file, 3,320 lines of code (~126 KB).
   * **Responsibilities:** Session authentication, device CRUD, settings persistence, SNMP topology crawler, network scanner, Prometheus target generation, alert engine with LINE/webhook dispatch, traffic background poller, and SSE broadcast.

3. **Storage Engine (`data/db.json`):**
   * **Format:** Single atomic JSON document storage.
   * **Sub-collections:** `devices`, `settings`, `topology` (nodes, edges, positions, metadata), `topologyPositions`, `deletedIps`.
   * **Telemetry History:** `data/perf_history.json` for lightweight historical telemetry.

4. **Telemetry & Exporter Subsystems:**
   * **Prometheus TSDB (v2.45.3):** Time-series database storing 15s/30s resolution metrics with 30-day retention.
   * **SNMP Exporter (v0.24.1):** Go binary polling network devices via SNMPv2c/v1.
   * **Blackbox Exporter (v0.24.0):** ICMP prober for sub-second ping latency and reachability.
   * **Grafana (v10.2.3):** Optional embedded analytics.

---

## 3. Current Deployment Modes

| Attribute | Docker Orchestration (Primary) | Native Linux Systemd (Bare-Metal / VM) |
|---|---|---|
| **Entrypoint** | `docker-compose.yml` (6 services) | Systemd units managed by `deploy.sh` / `INFRA_INSTALLATION_GUIDE.md` |
| **Ingress** | Nginx container binding 80/443 | Host Nginx reverse proxy |
| **Backend Process** | Non-root `netmon` (UID 10001) in Alpine | Systemd service `netmonitor.service` |
| **Targets Path** | Docker volume `prometheus_targets` mounted at `/etc/prometheus/targets` | Host path `/etc/prometheus/targets/` |
| **Exporters** | Isolated on internal bridge network `netmonitor-net` | Host ports bound to `127.0.0.1` |
| **Config Location** | `./config/` mounted read-only into containers | `/etc/prometheus/`, `/etc/snmp_exporter/`, `/etc/nginx/` |

---

## 4. Current Configuration Sources & Port Catalog

### 4.1 Port Matrix

| Service | Container / Process Port | Host Binding | Purpose |
|---|---|---|---|
| **Nginx HTTP** | 80 | `0.0.0.0:80` (or `${HTTP_PORT}`) | Main web dashboard & API gateway |
| **Nginx HTTPS** | 443 | `0.0.0.0:443` (or `${HTTPS_PORT}`) | TLS/SSL secured access |
| **NetMonitor API** | 5001 | `127.0.0.1:5001` | Core REST API & SSE (Protected behind Nginx) |
| **Prometheus TSDB** | 9090 | `127.0.0.1:9090` | Metrics queries & alerting rules |
| **Blackbox Exporter** | 9115 | `127.0.0.1:9115` | ICMP probing daemon |
| **SNMP Exporter** | 9116 | `127.0.0.1:9116` | SNMP walk proxy daemon |
| **Grafana** | 3000 | `127.0.0.1:3000` | Analytics dashboards |

### 4.2 Configuration Files & Authoritative Status

| Configuration File | Current Location | Status / Authority | Observations |
|---|---|---|---|
| **Prometheus Config** | `config/prometheus/prometheus.yml` | **Authoritative** | Clean unified 3-job design (prometheus, blackbox-icmp, snmp). |
| **SNMP Exporter Config** | `config/snmp_exporter/snmp.yml` | **Authoritative** | Contains modules (`if_mib`, `cisco_switch`, `aruba_switch`, `cisco_sb`, `huawei_switch`, `mikrotik_router`) and auths (`public_v1`, `public_v2`). |
| **SNMP Exporter Duplicate**| `config/prometheus/snmp.yml` | **Redundant Duplicate** | 100% byte-for-byte identical to `config/snmp_exporter/snmp.yml`. Must be marked deprecated. |
| **SNMP Optimized Modules** | `config/snmp_exporter/snmp_optimized_modules.yml` | **Fragment** | Exporter module definitions without auth block; used by setup helper. |
| **Blackbox Config** | `config/prometheus/blackbox.yml` | **Authoritative** | ICMP module definitions. |
| **Nginx Proxy Config** | `config/nginx/netmonitor.conf` | **Authoritative** | Reverse proxy, SSE tuning, gzip, and OWASP security headers. |
| **Environment Template** | `.env.example` | **Authoritative Template** | Exhaustive configuration matrix for Docker and Native setup. |
| **Dynamic Targets** | `data/targets/blackbox/` & `data/targets/snmp/` | **Authoritative Output** | Generated by backend `syncPrometheusTargets()` engine. |

---

## 5. Current API Groups & Security Boundary Analysis

| Endpoint Group | Method | Path | Current Auth Check | Current Role Enforced | Security Finding |
|---|---|---|---|---|---|
| **Setup Status** | `GET` | `/api/setup/status` | None | None | ⚠️ Returns config state; masks passwords but exposes community strings if unmasked. |
| **Setup Complete** | `POST` | `/api/setup/complete` | Conditional | `Admin` (if configured) | Enforces Admin once `isConfigured` is true. |
| **Authentication** | `POST` | `/api/auth/login` | None (Public) | None | Handles emergency login and Grafana proxy auth. |
| **Current User** | `GET` | `/api/auth/me` | Validates Token | None | Returns current user session or 401. |
| **Logout** | `POST` | `/api/auth/logout` | None | None | Removes session token. |
| **Emergency Password** | `POST` | `/api/auth/emergency-password`| Token | `Admin` | Protected; requires Admin session. |
| **Health Check** | `GET` | `/api/health` | None (Public) | None | Essential for container probes; currently reports memory & uptime. |
| **Prometheus Proxy** | `ANY` | `/api/prometheus/*` | **NONE** | **NONE** | 🚨 **High Risk:** Unauthenticated proxy allowing arbitrary PromQL queries to Prometheus core. |
| **Topology Discovery** | `GET/POST`| `/api/topology/discover` | Partial | `Editor`/`Admin` | Validates session for crawler execution. |
| **Storage API** | `GET` | `/api/storage`, `/api/storage/all` | Token | None | Read allowed for all authenticated users. |
| **Storage Mutations** | `POST` | `/api/storage/devices`, `/settings` | Token | `Editor` (device), `Admin` (settings) | RBAC enforced in `server.js`. |
| **SSE Traffic Stream** | `GET` | `/api/storage/stream/traffic` | **NONE** | **NONE** | ⚠️ **Medium Risk:** Anyone can connect to SSE stream without session verification. |
| **SSE Alerts Stream** | `GET` | `/api/storage/stream/alerts` | **NONE** | **NONE** | ⚠️ **Medium Risk:** Unauthenticated event stream subscription. |
| **Active Alerts** | `GET` | `/api/alerts/active` | **NONE** | **NONE** | Unauthenticated read of active network alerts. |
| **Alert Mutations** | `POST` | `/api/alerts/acknowledge*` | **NONE** | **NONE** | 🚨 **High Risk:** Unauthenticated operators can acknowledge or clear alert history. |
| **Analytics Query** | `GET/POST`| `/api/analytics/query_range` | **NONE** | **NONE** | 🚨 **High Risk:** Unauthenticated PromQL execution gateway with 5m cache. |
| **Device Performance** | `GET` | `/api/devices/performance` | **NONE** | **NONE** | Unauthenticated read of switch telemetry. |

---

## 6. Current Authentication & RBAC Model

* **Session Storage:** In-memory `sessions` JavaScript `Map` inside the Node.js process.
* **Token Format:** Cryptographically generated hex token (`crypto.randomBytes(32).toString('hex')`).
* **Session Lifecycle:** 24-hour rolling expiry (`SESSION_EXPIRY = 86400000 ms`).
* **Supported Roles:**
  1. `Viewer`: Read-only access to dashboards, topology, and historical analytics.
  2. `Editor`: Operational permissions (device additions, edits, alert acknowledgments).
  3. `Admin`: Full governance (settings modification, SNMP credentials, emergency reset, user management).
* **Emergency Break-Glass Account:**
  * Supported via `verifyEmergencyCredentials()`.
  * Fallback credentials: `emergency` / `emergency@netmon` (Hardcoded default in `getDefaultData()`).
  * Compared using `crypto.timingSafeEqual()`.

---

## 7. Current Telemetry Sources & Semantics

1. **Ping Latency & Availability:**
   * Source: Prometheus Blackbox Exporter `probe_success` and `probe_duration_seconds`.
   * Semantic: `probe_success == 1` indicates Online; `0` indicates Offline.
2. **Bandwidth & Traffic Counters:**
   * Source: SNMP MIB-II 64-bit High-Capacity counters `ifHCInOctets` and `ifHCOutOctets`.
   * Fallback: 32-bit `ifInOctets` / `ifOutOctets`.
   * Calculation: PromQL `rate(ifHCInOctets[5m]) * 8 / 1000000` (Mbps).
   * Semantic Issue: Currently missing sample or disconnected target may be rendered as `0 Mbps` instead of explicit `No Data`.
3. **Hardware Utilization (CPU / Memory):**
   * Multi-vendor OIDs queried via SNMP Exporter (`hwEntityCpuUsage`, `cpmCPUTotal5minRev`, `rlCpuUtilDuringLast5Minutes`, `hpSwitchCpuStat`).
   * Fallback: Internal background crawler in `server.js` walks device directly if Prometheus has 0 series.

---

## 8. Current Testing Model

* Executed via `npm test` running 9 sequential CommonJS test suites:
  1. `tests/test_config_redesign.cjs` (Target directory structure and config validation)
  2. `tests/test_alert_lifecycle.cjs` (Firing, acknowledging, resolving alerts)
  3. `tests/test_target_generator.cjs` (YAML formatting for Blackbox and SNMP)
  4. `tests/test_wan_promql.cjs` (WAN PromQL syntax validation)
  5. `tests/test_settings_runtime.cjs` (Settings sanitization and credential masking)
  6. `tests/test_final_integration.cjs` (20-scenario master integration suite with simulated server)
  7. `tests/test_emergency_login.cjs` (Emergency break-glass authentication engine)
  8. `tests/test_analytics_platform.cjs` (7 analytics modules and dynamic step calculations)
  9. `tests/test_topology_discovery.cjs` (LLDP/CDP multi-vendor deduplication and layout algorithms)
* **Build Verification:** `npm run build` compiles Vite SPA cleanly in under 2 seconds.
* **Linter:** `npm run lint` running Oxlint with 0 errors across all 43 source files.

---

## 9. Identified Technical Debt & Vulnerabilities

| Classification | Issue Description | Location | Impact |
|---|---|---|---|
| **Security Weakness** | Unauthenticated `/api/prometheus/*` proxy route | `server/server.js` | Arbitrary PromQL and administrative probe access. |
| **Security Weakness** | Unauthenticated `/api/analytics/query_range` route | `server/server.js` | Direct query load on Prometheus without session check. |
| **Security Weakness** | Unauthenticated Alert mutations (`/api/alerts/acknowledge*`) | `server/server.js` | Unauthorized operators can acknowledge critical network alerts. |
| **Security Weakness** | Unauthenticated SSE event streams | `server/server.js` | Telemetry eavesdropping without login. |
| **Security Weakness** | Default `emergency@netmon` fallback password in code | `server/server.js` | Insecure default credential if environment variable is not supplied. |
| **Security Weakness** | Plaintext emergency password stored in `db.json` | `data/db.json` | Credential leakage on compromised host. |
| **Security Weakness** | Missing brute-force rate limiter on `/api/auth/login` | `server/server.js` | Susceptible to credential guessing attacks. |
| **Configuration Inconsistency** | Duplicate `config/prometheus/snmp.yml` | `config/prometheus/` | Config drift risk between Prometheus and SNMP Exporter directories. |
| **Configuration Inconsistency** | Phantom SNMP modules in `snmpMapper.js` | `server/snmpMapper.js` | `cisco_basic`, `cisco_wlc`, `synology`, etc., mapped in code but absent from `snmp.yml`. |
| **Configuration Inconsistency** | `setupPrometheusSnmp.js` refers to `prometheus_redesign.yml` | `server/setupPrometheusSnmp.js` | Path inconsistency during host migrations. |
| **Maintainability** | Monolithic `server.js` file (3,320 lines) | `server/server.js` | High cognitive load, tightly coupled subsystems. |
| **Release & Versioning** | Version mismatch across packages | `package.json`, `server/package.json` | `0.0.0` vs `1.0.0` vs `V1.1+`. |
| **Telemetry Semantics** | Missing differentiation between `0 Mbps` and `No Data` | `src/components/traffic/` | Ambiguous reporting during link failure or counter reset. |

---

## 10. Planned Remediation Roadmap

The 13 execution phases specified in the Master Development Prompt will resolve the identified technical debt in strict priority order:

1. **Phase 1 — Configuration Source of Truth:** Establish single authoritative files, eliminate duplication, and prevent configuration drift.
2. **Phase 2 — SNMP Module & Auth Consistency:** Reconcile `VALID_SNMP_MODULES` with `snmp.yml`; build `scripts/validate-snmp-config.js`.
3. **Phase 3 — Secure API Boundary:** Introduce unified auth middleware (`requireAuth`, `requireRole`, `requireAdmin`, `requireEditor`) covering all endpoints.
4. **Phase 4 — Emergency Credential Hardening:** Implement PBKDF2/scrypt password hashing with unique salt; eliminate hardcoded default passwords.
5. **Phase 5 — Prometheus & Analytics Security:** Constrain Prometheus proxy, sanitize queries, enforce rate limits, and restrict arbitrary PromQL.
6. **Phase 6 — Traffic Semantics & Optimization:** Distinguish `No Data` from `0 Mbps`, implement unified traffic formatters, and reduce duplicate poll queries.
7. **Phase 7 — Deployment Consistency:** Unify Docker Compose and Native Linux paths and volume permissions.
8. **Phase 8 — Device & SNMP Concurrency:** Enforce concurrency limit (max 5) on direct SNMP walks to prevent network socket starvation.
9. **Phase 9 — Build, Test & Clean Install:** Create automated clean-install verification and expand test matrix.
10. **Phase 10 — E2E Monitoring Test:** Environment-driven real hardware testing script (`tests/test_snmp_device.cjs`).
11. **Phase 11 — Incremental Backend Modularization:** Deconstruct `server.js` into clean `routes/`, `services/`, and `middleware/` modules without regression.
12. **Phase 12 — Documentation & Change Control:** Synchronize bilingual guides, create `CHANGELOG.md`, `SECURITY.md`, and `MIGRATION.md`.
13. **Phase 13 — Release Candidate:** Generate sanitized release bundle and final audit report (`docs/FINAL_AUDIT.md`).
