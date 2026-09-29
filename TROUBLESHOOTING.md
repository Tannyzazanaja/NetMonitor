# NetMonitor Troubleshooting & Incident Response Playbook

This troubleshooting guide provides concrete diagnostic workflows and immediate remediation procedures for production issues encountered when monitoring enterprise networks.

---

## Incident 1: Target Returns `HTTP status 500 Internal Server Error`

### Symptoms:
In Prometheus Target Web UI (`http://<SERVER>:9090/targets`), a target in `job="snmp"` is marked **DOWN** with:
```
Error scraping target: server returned HTTP status 500 Internal Server Error (Duration: 20.00x s)
```

### Technical Root Cause:
`snmp_exporter` acts as an HTTP proxy. When it sends SNMP UDP requests to a target and receives **no reply within the timeout (default 20s)**, or receives an **ICMP Port Unreachable**, it returns HTTP 500 (`Scrape failed: scrape timed out`) to Prometheus.

### Diagnostic Flowchart:
```
                    Target returns HTTP 500
                               │
               Check Scrape Duration in Prometheus
                               │
        ┌──────────────────────┴──────────────────────┐
        ▼                                             ▼
  Duration ≈ 20.00s                             Duration < 0.1s
(SNMP Request Timed Out)                    (Port Unreachable / Refused)
        │                                             │
   Test ICMP Ping                                     │
   ping <TARGET_IP>                                   │
        │                                             │
   ┌────┴─────────────────┐                           │
   ▼                      ▼                           ▼
Ping Fails             Ping OK                  Target OS has no
(Switch Offline /   (Community String         SNMP daemon listening
 Cable Unplugged)       Mismatch)              on UDP port 161
   │                      │                           │
   ▼                      ▼                           ▼
Power on device     Verify community in         Install/start snmpd
or restore link     switch config vs NetMonitor   or check ACLs
```

### Remediation Steps:
1. **If ICMP Ping Fails:** The physical switch or host is powered off, disconnected from LAN, or rebooting. Once power/cable is restored, the target automatically recovers to **UP**.
2. **If ICMP Ping Succeeds:** The SNMP Community string configured in NetMonitor does not match the switch.
   - Run a test probe directly from the NetMonitor host:
     ```bash
     curl -i "http://127.0.0.1:9116/snmp?target=<SWITCH_IP>&module=if_mib&auth=public_v2"
     ```
   - In the NetMonitor Web UI, navigate to **Device Settings** and update the device community to the matching string.

---

## Incident 2: Target Returns `HTTP status 400 Bad Request`

### Symptoms:
In Prometheus Target Web UI, a target is marked **DOWN** with:
```
server returned HTTP status 400 Bad Request
```

### Technical Root Cause:
The SNMP query specified a module name (e.g. `module=cisco_switch` or `module=aruba_switch`) that has not been compiled or loaded into the running `snmp_exporter` instance's `snmp.yml`.

### Remediation Steps:
1. **Immediate Fallback (Zero Downtime):**
   Change the device module in the NetMonitor Web UI to **`if_mib`**. `if_mib` is universal (RFC 2863) and supported by every managed switch in the world.
2. **Reload SNMP Exporter Configurations:**
   If you recently added custom modules to `config/snmp_exporter/snmp_optimized_modules.yml`:
   ```bash
   # Re-generate snmp.yml and reload container
   docker compose restart snmp-exporter
   ```

---

## Incident 3: Traffic Graphs Show `0.00 Mbps` or Empty Vectors

### Symptoms:
Prometheus query `ifHCInOctets` or `ifHCOutOctets` returns an empty vector (`[]`), or interface bandwidth shows no metrics in the Traffic Dashboard.

### Technical Root Cause:
1. `job="snmp"` targets are currently down or failing authentication.
2. The switch only supports legacy 32-bit SNMP counters (`ifInOctets`) rather than 64-bit High-Capacity counters (`ifHCInOctets`).

### Remediation Steps:
1. Check how many SNMP series are currently ingested:
   ```bash
   curl -s 'http://127.0.0.1:9090/api/v1/query?query=ifHCInOctets' | jq '.data.result | length'
   ```
2. NetMonitor's backend automatically includes 32-bit fallback PromQL:
   ```promql
   sum by (instance) (rate(ifHCInOctets[5m]) or rate(ifInOctets[5m])) * 8 / 1000000
   ```
3. Verify that the switch port is administratively and operationally UP (`ifOperStatus == 1`).

---

## Incident 4: Docker Permission Denied on `data/` Directory

### Symptoms:
Container `netmonitor-app` fails to start or crashes with:
```
EACCES: permission denied, open '/app/data/db.json'
```

### Technical Root Cause:
The NetMonitor container runs under a hardened, non-root system user (`netmon`, UID 10001). If the host directory `data/` is owned by `root:root` with strict permissions (e.g. `700`), the container process cannot read or write runtime settings.

### Remediation Steps (Linux / Host):
```bash
# Set ownership to container user (UID 10001)
sudo chown -R 10001:10001 data/
sudo chmod -R 775 data/
```
*Note: `deploy.sh` automatically performs this permission setup.*

---

## Incident 5: Port Collision on Port 80 or 443

### Symptoms:
`docker compose up -d` fails with:
```
Bind for 0.0.0.0:80 failed: port is already allocated
```

### Technical Root Cause:
An existing web server (Apache, Nginx, IIS, or Lighttpd) is already listening on port 80 or 443 on the host server.

### Remediation Steps:
1. Check what process is listening on port 80:
   - Linux: `sudo ss -tulpn | grep :80`
   - Windows: `Get-NetTCPConnection -LocalPort 80 -State Listen`
2. Change the public port in `.env`:
   ```bash
   HTTP_PORT=8080
   HTTPS_PORT=8443
   ```
3. Restart containers:
   ```bash
   docker compose up -d
   ```
   *The Web UI will now be available on `http://<SERVER_IP>:8080`.*

---

## Incident 6: Blackbox ICMP Probes Fail with `socket: operation not permitted`

### Symptoms:
All ICMP ping checks fail (`probe_success == 0`) for every IP on the network, even the default gateway.

### Technical Root Cause:
Docker containers do not have raw socket creation privileges by default unless explicitly granted.

### Remediation Steps:
Ensure `cap_add: [NET_RAW]` is present under `blackbox-exporter` in `docker-compose.yml`:
```yaml
blackbox-exporter:
  image: prom/blackbox-exporter:v0.24.0
  cap_add:
    - NET_RAW
```
On Linux hosts with strict sysctl settings, verify:
```bash
sudo sysctl -w net.ipv4.ping_group_range="0 2147483647"
```

---

## Incident 7: Prometheus TSDB High Disk Utilization

### Symptoms:
Host storage is filling up rapidly due to high-frequency metrics ingestion.

### Remediation Steps:
1. **Reduce Retention Period:** In `.env`, change `PROMETHEUS_RETENTION_TIME=15d` (or `30d`).
2. **Cap TSDB Maximum Size:** In `.env`, set `PROMETHEUS_RETENTION_SIZE=25GB`.
3. **Optimize Scrape Interval:** Increase `PROMETHEUS_SCRAPE_INTERVAL=30s` (or `60s`) in `.env`.
4. Restart Prometheus:
   ```bash
   docker compose restart prometheus
   ```
