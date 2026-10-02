# Changelog & Release Notes

All notable changes to **NetMonitor Enterprise** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-10-02 (Production Hardened Release)

### Executive Summary
Version 1.1.0 delivers an enterprise-grade security hardening, traffic semantics correction, concurrency optimization, deployment validation, and automated disaster recovery capabilities while preserving 100% of existing runtime monitoring features.

### Security Hardening
- **PBKDF2 Password Hashing**: Upgraded emergency credentials and administrative accounts to PBKDF2 with SHA-512 (100,000 iterations) and 32-byte cryptographic salts.
- **Timing-Safe Authentication**: Implemented `crypto.timingSafeEqual()` across all authentication routines to eliminate timing-attack vulnerabilities.
- **Role-Based Access Control (RBAC)**: Centralized 3-tier authorization (`Admin`, `Editor`, `Viewer`) enforced across all API endpoints (Alert mutations, Prometheus proxies, System setup, and Device CRUD).
- **Brute-Force & Rate Limiting**: Added strict IP-based rate limiting on login attempts (5 attempts/15 min) and deep analytics PromQL queries (60 queries/min with `Retry-After` header).
- **Credential Masking**: Sanitized `GET /api/setup/status` to mask SNMP communities and redact password hashes and salts.
- **Secret Scanning**: Added `scripts/security-scan.js` ensuring 0 hardcoded credentials across 119 files.

### Telemetry & Traffic Semantics
- **0 Mbps vs No Data Differentiation**: Distinguishes active interfaces with zero throughput (`status: 'ok'`, displaying `0.00 Mbps`) from interfaces experiencing telemetry dropouts or collector failures (`status: 'no_data'`).
- **UI Unit Standardization**: Corrected all misleading `MB/s` labels to `Mbps` in `DashboardView.jsx` and `TrafficView.jsx`.
- **Centralized Formatter**: Introduced `src/utils/trafficFormat.js` handling dynamic scaling across bps, Kbps, Mbps, and Gbps.
- **Initial REST Hydration**: Added `GET /api/traffic` and `GET /api/traffic/latest` for fast initial client hydration.

### Performance & Scalability
- **SNMP Concurrency Limiter**: Batched SNMP queries and network discovery sweeps through configurable concurrency workers (`SNMP_CONCURRENCY_LIMIT`, default: 5).
- **Partial Failure Isolation**: Unreachable or timing-out devices in batch sweeps no longer delay or fail remaining devices.
- **Target Directory Permissions**: Added `canWriteTargetDirectory()` startup probe ensuring non-root container user (`UID: 10001`) and native processes can write `file_sd` targets.
- **Target Validator**: Created `scripts/validate-prometheus-targets.js` verifying IP regex, module existence, and duplicate target detection.

### Backup & Disaster Recovery
- **Cryptographic Backup**: Added `/api/admin/backup` exporting full database with embedded SHA-256 integrity checksums.
- **Cryptographic Restore**: Added `/api/admin/restore` validating checksum integrity before atomic disk writes and poller rescheduling.
- **Graceful Shutdown**: Added `SIGTERM` and `SIGINT` handlers cleanly shutting down SSE streams, flushing cached state, and stopping active polling intervals.

---

## [1.0.0] - 2026-09-24 (Initial Release)

### Added
- Core web application with React 18, Vite, and Tailwind CSS.
- Node.js backend with Express and Server-Sent Events (SSE).
- Prometheus TSDB integration with Blackbox Exporter and SNMP Exporter.
- Subnet discovery crawler and semi-automatic network topology map.
- Real-time alerting engine with LINE Notify and generic webhooks.
- Multi-container Docker Compose orchestration stack.
