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
   - [Configuring Discovery CIDRs](#configuring-discovery-cidrs)
   - [Discovery Workflow: LLDP & CDP Crawling](#discovery-workflow-lldp--cdp-crawling)
   - [Promoting Discovered Devices to Production](#promoting-discovered-devices-to-production)
6. [Alerting & Webhook Integrations](#6-alerting--webhook-integrations)
   - [LINE Notify & LINE Messaging API](#line-notify--line-messaging-api)
   - [Telegram Bot Integration](#telegram-bot-integration)
   - [Generic Webhooks (Slack, Discord, Microsoft Teams)](#generic-webhooks-slack-discord-microsoft-teams)
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

### Managing Users
Admins can navigate to **Settings** ➔ **User Accounts** to:
* Create operator accounts with explicit roles (`viewer`, `editor`, `admin`).
* Revoke active sessions or update passwords.
* Reset failed login counters.

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

## 5. Network Auto-Discovery Operations

NetMonitor features active subnet discovery and recursive neighbor table walking.

### Configuring Discovery CIDRs
1. In **Settings** ➔ **Network Auto-Discovery**, set:
   * **Default Discovery CIDR:** e.g., `10.0.0.0/24` or `172.16.10.0/24`
   * **Default SNMP Community:** The community string used for fingerprinting
   * **Probing Timeout:** 1500ms

### Discovery Workflow: LLDP & CDP Crawling
1. Click **Topology** ➔ **Auto-Discovery**.
2. NetMonitor executes:
   * **Phase 1: Ping Sweep:** Discovers active IP addresses in the subnet.
   * **Phase 2: SNMP System Check:** Queries `sysDescr` (1.3.6.1.2.1.1.1) and `sysObjectID` (1.3.6.1.2.1.1.2) to classify device vendor and OS.
   * **Phase 3: Neighbor Crawl:** Queries LLDP (`lldpRemSysName`, `lldpRemPortId`) and Cisco CDP (`cdpCacheDeviceId`, `cdpCacheDevicePort`).
   * **Phase 4: Deduplication:** Eliminates reciprocal duplicate links and merges dual-protocol links into a single canonical link with 100% confidence score.

### Promoting Discovered Devices to Production
* Discovered devices appear in the **Staging Discovery Drawer**.
* Operators review hostnames, assign permanent rack locations, and click **Approve & Add to Inventory**.

---

## 6. Alerting & Webhook Integrations

NetMonitor delivers real-time notifications for link failures, device offline events, and threshold breaches.

### LINE Notify & LINE Messaging API
1. Obtain your **Channel Access Token** from the [LINE Developers Console](https://developers.line.biz/).
2. In NetMonitor **Settings** ➔ **Alerts & Notifications**:
   * **LINE Channel Token:** Paste the long-lived Bearer token.
   * **LINE Target ID:** Paste the target Group ID (`c...`) or User ID (`U...`).
3. Click **Test Notification** to verify delivery.

### Telegram Bot Integration
1. Open Telegram and talk to `@BotFather` to create a new bot and obtain your Bot Token (`123456:ABC-DEF...`).
2. Add the bot to your network operations group.
3. Obtain your Chat ID using `https://api.telegram.org/bot<TOKEN>/getUpdates`.
4. Configure in NetMonitor settings:
   * **Webhook URL:** `https://api.telegram.org/bot<TOKEN>/sendMessage`
   * **Payload Template:**
     ```json
     {
       "chat_id": "-1001234567890",
       "text": "🚨 *NETMONITOR ALERT*\nDevice: {device_name}\nIP: {device_ip}\nStatus: {status}\nSeverity: {severity}",
       "parse_mode": "Markdown"
     }
     ```

### Generic Webhooks (Slack, Discord, Microsoft Teams)
NetMonitor supports sending standard JSON HTTP POST requests to any incoming webhook URL:
```bash
POST https://hooks.slack.com/services/T00/B00/XXXX
Content-Type: application/json

{
  "text": "🚨 Device Alert: SW-CORE-01 (10.0.0.1) is DOWN!"
}
```

### Alert Lifecycle: Cooldown, Flapping & Acknowledgement
1. **Trigger:** A device fails 3 consecutive ICMP probes (`probe_success == 0`).
2. **Notification & Cooldown:** The alert is dispatched to configured channels. A 5-minute cooldown timer is initiated. If the device flaps up and down within this window, redundant notifications are suppressed.
3. **Operator Acknowledgment:** Operators can click **Acknowledge** in the UI. This changes the badge to orange (`ACKNOWLEDGED`), records the acknowledging operator's username, and mutes further reminders.
4. **Resolution:** When the device responds to ICMP probes again, an automatic **[RESOLVED]** message is dispatched, and the incident is archived to history.

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
