# NetMonitor: System Administrator & Operations Guide

This guide is designed for Network Engineers, Systems Administrators, and Site Reliability Engineers (SREs) operating and maintaining **NetMonitor** in enterprise production environments.

---

## Table of Contents

1. [Role-Based Access Control (RBAC) & User Management](#1-role-based-access-control-rbac--user-management)
2. [Emergency Break-Glass Authentication](#2-emergency-break-glass-authentication)
3. [Device Inventory Management](#3-device-inventory-management)
   - [Adding Devices Manually](#adding-devices-manually)
   - [Bulk Device Import (JSON / Template)](#bulk-device-import-json--template)
   - [Editing & Deleting Devices](#editing--deleting-devices)
4. [SNMP Configuration & Auth Profiles](#4-snmp-configuration--auth-profiles)
   - [SNMP v2c Configuration](#snmp-v2c-configuration)
   - [SNMP v3 User-Based Security (authPriv)](#snmp-v3-user-based-security-authpriv)
   - [Custom MIB Modules & OID Mapping](#custom-mib-modules--oid-mapping)
5. [Network Auto-Discovery Operations](#5-network-auto-discovery-operations)
   - [Subnet IP & Device Scanner (`/api/scan`)](#51-subnet-ip--device-scanner-apiscan)
   - [Topology Neighbor Crawling (`/api/topology/discover`)](#52-topology-neighbor-crawling-apitopologydiscover)
6. [Alerting & LINE Messaging API Integration](#6-alerting--line-messaging-api-integration)
   - [LINE Messaging API Configuration](#line-messaging-api-configuration)
   - [Alert Lifecycle: Cooldown, Flapping & Acknowledgement](#alert-lifecycle-cooldown-flapping--acknowledgement)
7. [Backup, Restore & Disaster Recovery](#7-backup-restore--disaster-recovery)
8. [Maintenance, Logs & Diagnostics](#8-maintenance-logs--diagnostics)

---

## 1. Role-Based Access Control (RBAC) & User Management

NetMonitor enforces a strict three-tier privilege model to prevent accidental configuration drift or unauthorized changes:

| Privilege Level | Viewer | Editor | Admin |
| :--- | :---: | :---: | :---: |
| **View Real-Time Dashboard** | ✅ | ✅ | ✅ |
| **View Topology Map** | ✅ | ✅ | ✅ |
| **View Historical Analytics & Export CSV** | ✅ | ✅ | ✅ |
| **Acknowledge Active Alerts** | ❌ | ✅ | ✅ |
| **Add / Edit / Delete Devices** | ❌ | ✅ | ✅ |
| **Trigger Topology Discovery & Save Layout** | ❌ | ✅ | ✅ |
| **Modify Global Settings & Discovery CIDR** | ❌ | ❌ | ✅ |
| **Configure SNMP Communities & Webhooks** | ❌ | ❌ | ✅ |
| **Manage Users & Emergency Passwords** | ❌ | ❌ | ✅ |

### Managing Users via Grafana
NetMonitor integrates directly with Grafana's user authentication system. To manage operator accounts:
1. Open Grafana Administration (`http://<SERVER_IP>:3000/admin/users`).
2. Create or invite users, and assign them an organization role:
   * **Viewer:** Read-only access to dashboards, analytics, and topology.
   * **Editor:** Operational access to acknowledge alerts, edit devices, and trigger discovery.
   * **Admin:** Full administrative control over global settings, communities, and emergency credentials.
3. Users log into NetMonitor using their Grafana username and password. NetMonitor queries Grafana's `/api/user` endpoint and dynamically applies the corresponding RBAC permissions.

---

## 2. Emergency Break-Glass Authentication

NetMonitor includes a built-in **Break-Glass Engine** designed for disaster scenarios—such as network isolation, database authentication corruption, or forgotten administrative passwords.

### How Break-Glass Works
1. **Fallback Credential Verification:** The server maintains an isolated emergency credential check in `server/server.js`.
2. **Break-Glass Usernames:** Logging in with `admin`, `emergency`, or `localadmin` paired with the emergency password triggers the emergency break-glass pipeline.
3. **Session Escalation:** Break-glass logins automatically issue a cryptographically signed JWT with `role: "admin"` and `isEmergency: true`.
4. **Emergency Password Rotation via API:**
   Admins can rotate the emergency password at runtime:
   ```bash
   curl -X POST http://localhost:5001/api/auth/emergency-password \
     -H "Content-Type: application/json" \
     -H "Cookie: token=YOUR_ADMIN_JWT" \
     -d '{"newPassword": "YourNewSecureEmergencyPassword123!"}'
   ```

---

## 3. Device Inventory Management

### Adding Devices Manually
1. Open the NetMonitor web interface and navigate to **Device Manager**.
2. Click **+ Add Device**.
3. Fill in the device parameters:
   * **Hostname / Name:** e.g., `SW-CORE-01`
   * **Management IP:** e.g., `10.0.0.1` (Must be an IPv4 reachable by ICMP and SNMP)
   * **Role / Layer:** `L3 Switch`, `L2 Switch`, `Router`, `Firewall`, `Server`, or `Access Point`
   * **Vendor / Model:** `Cisco Catalyst 3850`, `Aruba 2930F`, etc.
   * **SNMP Community:** Community string (e.g., `public` or your encrypted community)
   * **SNMP Auth Profile:** Profile defined in `snmp.yml` (e.g., `public_v2` or `enterprise_v3`)
   * **Scrape Module:** `if_mib`, `cisco`, or `aruba`
   * **Rack / Location:** e.g., `DC-Rack-A01`
4. Click **Save Device**.
   * *Target Synchronization:* Within 500ms, NetMonitor automatically updates `/etc/prometheus/targets/blackbox_targets.yml` and `/etc/prometheus/targets/snmp_targets.yml`. Prometheus will begin scraping the new device on its next cycle.

### Bulk Device Import (JSON / Template)
For large environments, initialize or replace inventory using `config/examples/devices.template.json`:
```json
[
  {
    "id": "dev-001",
    "name": "SW-CORE-01",
    "ip": "10.0.0.1",
    "role": "L3 Switch",
    "type": "L3 Switch",
    "model": "Cisco Catalyst 9500",
    "location": "Main Data Center",
    "community": "your_snmp_community",
    "auth": "public_v2",
    "module": "cisco"
  },
  {
    "id": "dev-002",
    "name": "SW-DIST-01",
    "ip": "10.0.0.10",
    "role": "L2 Switch",
    "type": "L2 Switch",
    "model": "Aruba CX 6300",
    "location": "Floor 1 IDF",
    "community": "your_snmp_community",
    "auth": "public_v2",
    "module": "aruba"
  }
]
```
Upload this via **Device Manager** ➔ **Import Devices** or copy directly to `data/db.json` while the server is stopped.

### Editing & Deleting Devices
* **Editing:** Modifying an existing device dynamically relabels Prometheus targets without interrupting ongoing scrapes for other switches.
* **Deleting:** Removing a device cleans it from `db.json`, purges its targets from Prometheus scrape files, and removes its nodes from the Topology Canvas.

---

## 4. SNMP Configuration & Auth Profiles

NetMonitor interacts with switches via the Prometheus SNMP Exporter.

### SNMP v2c Configuration
In `/etc/prometheus/snmp.yml`, declare your community strings:
```yaml
auths:
  public_v2:
    version: 2
    community: your_snmp_community_here
```

### SNMP v3 User-Based Security (authPriv)
For hardened environments requiring cryptographic integrity and encryption:
```yaml
auths:
  secure_v3:
    version: 3
    username: netmon_agent
    security_level: authPriv
    auth_protocol: SHA256
    auth_password: YourAuthSecretPassword
    priv_protocol: AES128
    priv_password: YourPrivSecretPassword
```

### Switch Configuration Examples

#### Cisco IOS-XE:
```cisco
! SNMP v2c (Read-Only restricted to NetMonitor host)
access-list 50 permit 10.0.0.50
snmp-server community YourCommunity RO 50
snmp-server enable traps
```

#### Aruba / HPE AOS-S / AOS-CX:
```aruba
! ArubaOS-S
snmp-server community "YourCommunity" operator
snmp-server host 10.0.0.50 "YourCommunity"

! ArubaOS-CX
snmp-server community YourCommunity
snmp-server host 10.0.0.50 v2c community YourCommunity
```

---

## 5. Network Discovery & Topology Operations

NetMonitor separates network discovery into two complementary workflows:

### 5.1 Subnet IP & Device Scanner (`/api/scan`)
In **Device Manager** ➔ **Scan Subnet**:
1. Enter an IP Range or CIDR subnet (e.g. `192.168.1.0/24` or `192.168.1.1-254`).
2. Specify the SNMP Community String to test against discovered endpoints.
3. Click **Start Scan**.
4. The scanner executes:
   * **Ping Sweep:** Identifies active IP addresses on the wire.
   * **SNMP System Fingerprinting:** Queries `sysDescr` (1.3.6.1.2.1.1.1.0) and `sysName` (1.3.6.1.2.1.1.5.0) to automatically identify vendor (`Cisco`, `Aruba`, `Huawei`, `MikroTik`, `Fortinet`, `Palo Alto`, `Ubiquiti`, `Ruijie`, `Linux`, `Windows`) and hardware role (`switch`, `router`, `firewall`, `ap`, `server`).
5. Operators review discovered devices in the modal and click **Add Device** to import them directly into the persistent inventory.

### 5.2 Topology Neighbor Crawling (`/api/topology/discover`)
In **Topology View** ➔ **Discover Topology**:
1. NetMonitor queries all active managed switches already registered in inventory.
2. The crawler executes:
   * **Interface Mapping:** Subtree walks `ifName` (1.3.6.1.2.1.31.1.1.1.1) and `ifDescr` (1.3.6.1.2.1.2.2.1.2).
   * **LLDP Table Sweep:** Subtree walks standard IEEE `LLDP-MIB` (`lldpRemSysName`, `lldpRemPortId`, `lldpRemPortDesc`).
   * **CDP Table Sweep:** Subtree walks Cisco `CISCO-CDP-MIB` (`cdpCacheDeviceId`, `cdpCacheDevicePort`, `cdpCacheAddress`).
   * **Multi-Vendor Link Deduplication:** Automatically merges reciprocal links between vendors into canonical topology connections.
3. Discovered links and neighbor relationships are automatically visualized on the 60 FPS interactive HTML5 canvas.

---

## 6. Alerting & LINE Messaging API Integration

NetMonitor delivers real-time notifications for device failures and high-latency incidents.

### LINE Messaging API Configuration
NetMonitor pushes rich notification messages using the official LINE Messaging API push endpoint (`https://api.line.me/v2/bot/message/push`):
1. In the [LINE Developers Console](https://developers.line.biz/), create a Messaging API channel and issue a **Channel Access Token (long-lived)**.
2. Add your LINE Bot to your target LINE Group or obtain your personal User ID (`U...`).
3. In NetMonitor **Settings** ➔ **Alerts & Notifications**:
   * **LINE Channel Token:** Paste the Bearer token (stored masked with `***` in API responses).
   * **LINE Target ID:** Paste the target Group ID (`c...`) or User ID (`U...`).
4. Click **Save Settings**. When configured, the backend dispatches notifications immediately on state transitions.

### Alert Lifecycle: Cooldown, Flapping & Acknowledgement
1. **Trigger:** The backend continuously monitors target availability (`probe_success == 0`).
2. **Notification & Cooldown:** When an outage is detected, an alert card is dispatched to LINE. A flapping cooldown timer suppresses duplicate notifications during intermittent link state bounces.
3. **Operator Acknowledgment:** Operators can click **Acknowledge** in the Alerts UI. This marks the alert as acknowledged, records the operator's name, and prevents further reminders.
4. **Automatic Recovery Resolution:** When the device responds to ICMP probes again, an automatic **[RESOLVED]** message is dispatched to LINE, and the incident is archived to history.

---

## 7. Backup, Restore & Disaster Recovery

NetMonitor stores state in a flat, atomic document format, making backups straightforward.

### Daily Backup Script
Create `/usr/local/bin/netmonitor-backup.sh`:
```bash
#!/usr/bin/env bash
set -e

BACKUP_DIR="/var/backups/netmonitor"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "${BACKUP_DIR}"

echo "[*] Creating NetMonitor Backup: ${DATE}"
tar -czf "${BACKUP_DIR}/netmonitor_backup_${DATE}.tar.gz" \
  /opt/netmonitor/data/db.json \
  /opt/netmonitor/.env \
  /etc/prometheus/prometheus.yml \
  /etc/prometheus/snmp.yml \
  /etc/prometheus/targets/

# Keep last 14 days of backups
find "${BACKUP_DIR}" -type f -name "netmonitor_backup_*.tar.gz" -mtime +14 -delete
echo "[✓] Backup completed successfully."
```

### Full Disaster Recovery
To restore NetMonitor on a new server:
1. Complete [INSTALLATION.md](INSTALLATION.md) through Step 3.
2. Extract the backup archive:
   ```bash
   sudo tar -xzf netmonitor_backup_20260928_120000.tar.gz -C /
   ```
3. Restart NetMonitor and Prometheus:
   ```bash
   sudo systemctl restart prometheus netmonitor
   ```
4. Verify your inventory and dashboard state are instantly restored.

---

## 8. Maintenance, Logs & Diagnostics

### Viewing Real-Time Application Logs
```bash
# View NetMonitor server logs
sudo journalctl -u netmonitor -f -n 100

# View Prometheus scraping logs
sudo journalctl -u prometheus -f -n 100

# View SNMP Exporter error logs
sudo journalctl -u snmp_exporter -f -n 100
```

### Verifying Prometheus Target Scrape Health
Open `http://localhost:9090/targets` in a browser or query via CLI:
```bash
curl -s http://localhost:9090/api/v1/targets | grep -o '"health":"[^"]*"' | sort | uniq -c
```

### Manual SNMP Walk Diagnostic
If a device fails to report metrics, test directly from the command line:
```bash
# Check basic connectivity and sysDescr
snmpwalk -v2c -c public 10.0.0.1 1.3.6.1.2.1.1.1.0

# Check 64-bit interface traffic counters
snmpwalk -v2c -c public 10.0.0.1 1.3.6.1.2.1.31.1.1.1.6
```

---

*For developer documentation, API schemas, and architecture internals, please consult [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md).*
