# NetMonitor: Administrator, Operations & Troubleshooting Guide

This comprehensive manual covers day-to-day administration, RBAC security, configuration schemas, backup/restore procedures, upgrades, and incident response playbooks for **NetMonitor Enterprise**.

---

## Table of Contents
1. [Security & Access Control (RBAC)](#1-security--access-control-rbac)
2. [Emergency Break-Glass Access](#2-emergency-break-glass-access)
3. [Device Management & SNMP Configuration](#3-device-management--snmp-configuration)
4. [System Configuration Reference](#4-system-configuration-reference)
5. [Backup, Restore & Disaster Recovery](#5-backup-restore--disaster-recovery)
6. [Alerting & Notification Integrations](#6-alerting--notification-integrations)
7. [Upgrade & Rollback Procedures](#7-upgrade--rollback-procedures)
8. [Troubleshooting & Incident Playbook](#8-troubleshooting--incident-playbook)

---

## 1. Security & Access Control (RBAC)

NetMonitor enforces a strict 3-tier Role-Based Access Control model across all REST and SSE endpoints:

| Feature / Operation | Admin | Operator / Editor | Viewer |
|---|:---:|:---:|:---:|
| Real-Time Dashboard & Telemetry | ✅ | ✅ | ✅ |
| Topology Map & Device Inspection | ✅ | ✅ | ✅ |
| Historical Analytics & Reports | ✅ | ✅ | ✅ |
| Acknowledge Active Alerts | ✅ | ✅ | ❌ |
| Network Scan & Device Enrollment | ✅ | ✅ | ❌ |
| Edit Device Config / Credentials | ✅ | ❌ | ❌ |
| Clear Historical Alerts | ✅ | ❌ | ❌ |
| Direct PromQL Proxy Execution | ✅ | ❌ | ❌ |
| Full Database Backup & Restore | ✅ | ❌ | ❌ |
| System Settings & Secrets | ✅ | ❌ | ❌ |

---

## 2. Emergency Break-Glass Access

In the event of an authentication subsystem outage or database recovery scenario:
- Configured directly via `EMERGENCY_USERNAME` and `EMERGENCY_PASSWORD` in `.env`.
- Passwords are automatically hashed at startup using **PBKDF2 with 100,000 rounds of SHA-512** and individual salts.
- Protected by a dedicated rate-limiter: maximum 5 failed attempts per 15-minute window per IP to eliminate brute-force attack vectors.
- Credentials in responses from `GET /api/setup/status` are strictly masked or redacted.

---

## 3. Device Management & SNMP Configuration

### Supported Device Modules
NetMonitor maps devices to multi-vendor profiles defined in `config/snmp_exporter/snmp.yml`:
- `if_mib`: Standard RFC 1213 / MIB-II network switches, routers, and firewalls.
- `cisco`: Cisco Catalyst (2960, 3850, 9300), ISR routers, Nexus switches.
- `mikrotik`: MikroTik RouterOS devices (CCR, CRS, RB series).
- `synology`: Synology NAS storage appliances (DiskStation, RackStation).
- `server`: Linux and Windows SNMP-enabled servers.

### Prometheus Target Generation
Whenever devices are added, updated, or removed in NetMonitor:
1. The backend writes target entries to `/etc/prometheus/targets/snmp_targets.yml` and `/etc/prometheus/targets/blackbox_targets.yml`.
2. Prometheus automatically discovers updated targets via `file_sd_configs` within 15 seconds without process restarts.

---

## 4. System Configuration Reference

### Environment Variables (`.env`)

| Variable | Requirement | Default | Description |
|---|:---:|---|---|
| `NODE_ENV` | Optional | `production` | Runtime mode (`production` or `development`) |
| `PORT` | Optional | `5001` | Core backend HTTP listening port |
| `JWT_SECRET` | **Required** | *(None)* | Secret key for signing authentication tokens |
| `SESSION_SECRET` | **Required** | *(None)* | Secret key for session signing |
| `EMERGENCY_USERNAME` | Optional | `admin` | Break-glass administrative username |
| `EMERGENCY_PASSWORD` | **Required** | *(None)* | Break-glass administrative password |
| `PROMETHEUS_URL` | Optional | `http://localhost:9090` | Internal Prometheus TSDB query URL |
| `PROMETHEUS_TARGETS_DIR` | Optional | `/etc/prometheus/targets` | Target directory for `file_sd` YAML files |
| `SNMP_EXPORTER_URL` | Optional | `http://localhost:9116` | SNMP Exporter proxy URL |
| `BLACKBOX_EXPORTER_URL` | Optional | `http://localhost:9115` | Blackbox Exporter proxy URL |
| `SNMP_CONCURRENCY_LIMIT` | Optional | `5` | Maximum concurrent SNMP batch workers |
| `DEFAULT_DISCOVERY_CIDR` | Optional | `192.168.1.0/24` | Default subnet CIDR for network discovery |
| `DEFAULT_SNMP_COMMUNITY`| Optional | `public` | Default fallback SNMP community |
| `DEFAULT_SNMP_MODULE` | Optional | `if_mib` | Default fallback SNMP profile module |

### Database JSON Schema (`data/db.json`)
The application state is maintained in an atomic, file-backed JSON database:
```json
{
  "devices": [
    {
      "id": "dev-01",
      "name": "Core-Switch-01",
      "ip": "192.168.1.1",
      "type": "switch",
      "vendor": "Cisco",
      "community": "monitoring_community",
      "module": "cisco"
    }
  ],
  "settings": {
    "orgName": "Enterprise NOC",
    "refreshInterval": 10,
    "wanInterface": "auto",
    "emergencyUsername": "admin"
  },
  "topology": {
    "nodes": [],
    "edges": []
  },
  "alerts": []
}
```

---

## 5. Backup, Restore & Disaster Recovery

### Automated Pre-Write Snapshots
Before any disk mutation to `data/db.json`, NetMonitor creates a rolling backup file: `data/db.json.bak`.

### Exporting Full Database Backup (API)
```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
     http://localhost:5001/api/admin/backup \
     -o netmonitor_backup.json
```
The export payload contains:
- `schemaVersion`: Data format version (`1.1.0`)
- `exportTimestamp`: ISO timestamp
- `checksum`: SHA-256 cryptographic hash of database content
- `data`: Complete database snapshot

### Restoring from Backup (API)
```bash
curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" \
     -H "Content-Type: application/json" \
     -d @netmonitor_backup.json \
     http://localhost:5001/api/admin/restore
```
The server validates the payload structure and SHA-256 checksum, performs an atomic disk write, and reschedules all runtime pollers immediately.

---

## 6. Alerting & Notification Integrations

NetMonitor evaluates network telemetry every 10 seconds against configurable thresholds:
- **Ping Latency**: Warning (>100ms), Critical (>250ms)
- **Packet Loss**: Warning (>5%), Critical (>20%)
- **High Traffic Utilization**: Bandwidth utilization exceeding 85% of interface capacity
- **Device Down**: 3 consecutive failed ICMP ping probes

### Notification Channels
1. **LINE Messaging API / LINE Notify**: Enter Channel Access Token and Target User/Group ID in Settings.
2. **Generic Webhook**: Dispatches structured JSON payloads to Slack, Microsoft Teams, Discord, or automated incident management platforms.

---

## 7. Upgrade & Rollback Procedures

### Upgrading from V1.0 to V1.1
1. **Take Backup Snapshot**:
   ```bash
   cp data/db.json data/db.json.pre-upgrade.bak
   ```
2. **Pull Release & Rebuild**:
   ```bash
   # Docker:
   docker compose down
   docker compose build --no-cache netmonitor
   docker compose up -d

   # Native Linux:
   sudo systemctl stop netmonitor-backend
   git pull origin main
   npm ci --omit=dev
   npm run build
   sudo systemctl start netmonitor-backend
   ```
3. **Verify Health**:
   ```bash
   curl -f http://localhost:5001/api/health
   ```

### Emergency Rollback Procedure
If issues arise post-upgrade:
```bash
# 1. Stop current application
docker compose down  # or: sudo systemctl stop netmonitor-backend

# 2. Restore database snapshot
cp data/db.json.pre-upgrade.bak data/db.json

# 3. Revert code to previous release tag
git checkout v1.0.0
docker compose up -d # or: sudo systemctl start netmonitor-backend
```

---

## 8. Troubleshooting & Incident Playbook

### Incident 1: Target Returns `HTTP status 500 Internal Server Error`
- **Symptom**: In Prometheus Web UI (`:9090/targets`), a target in `job="snmp"` is marked DOWN with `server returned HTTP status 500`.
- **Root Cause**: `snmp_exporter` sent SNMP requests to the target and timed out (default 20s) or received an ICMP Port Unreachable.
- **Diagnostic Flow**:
  1. Test ICMP ping: `ping <DEVICE_IP>`
     - If ping fails: Physical device is offline, powered down, or cable is disconnected.
     - If ping succeeds: SNMP community mismatch or SNMP daemon not running.
  2. Test SNMP walk directly:
     ```bash
     curl -i "http://127.0.0.1:9116/snmp?target=<DEVICE_IP>&module=if_mib&auth=public_v2"
     ```
  3. Verify SNMP community string in NetMonitor device settings matches device configuration.

### Incident 2: Target Returns `HTTP status 400 Bad Request`
- **Symptom**: Prometheus target marked DOWN with HTTP 400.
- **Root Cause**: Specified SNMP module (e.g. `cisco`, `mikrotik`) is not defined in `config/snmp_exporter/snmp.yml`.
- **Remediation**: Run `node scripts/validate-snmp-config.js` to inspect valid module names, and update device module to a supported profile.

### Incident 3: Target Returns `HTTP status 429 Too Many Requests`
- **Symptom**: Analytics queries or PromQL API calls return `HTTP 429`.
- **Root Cause**: Client exceeded the deep analytics rate limit (60 queries/minute per IP/token).
- **Remediation**: Check `Retry-After` header in response. Ensure external dashboards or scripts do not query higher than once per second.

### Incident 4: Blackbox Exporter Returns `probe_success 0` for all targets
- **Symptom**: All ICMP ping probes show DOWN even though targets are reachable.
- **Root Cause**: Blackbox exporter process lacks raw socket privileges (`CAP_NET_RAW`).
- **Remediation**:
  - Docker: Ensure `cap_add: [NET_RAW]` is present in `docker-compose.yml`.
  - Native Linux: Run `sudo setcap cap_net_raw+ep /usr/local/bin/blackbox_exporter`.

### Incident 5: Permission Denied on Target Generation
- **Symptom**: Backend logs show `EACCES: permission denied, open '/etc/prometheus/targets/snmp_targets.yml'`.
- **Root Cause**: The user running `netmonitor` does not have write permissions to `/etc/prometheus/targets`.
- **Remediation**:
  ```bash
  sudo chown -R netmonitor:prometheus /etc/prometheus/targets
  sudo chmod 775 /etc/prometheus/targets
  ```
