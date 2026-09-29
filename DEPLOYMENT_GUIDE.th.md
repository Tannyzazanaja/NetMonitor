# คู่มือการติดตั้งและบริหารจัดการระบบ NetMonitor ระดับองค์กร (Enterprise Deployment & Operations Guide)

คู่มือฉบับนี้อธิบายขั้นตอนการติดตั้ง การรักษาความปลอดภัย และการบำรุงรักษาระบบ **NetMonitor Enterprise Network Monitoring Platform** อย่างละเอียด สำหรับการติดตั้งบนเซิร์ฟเวอร์แบบ Bare-Metal, ไฮเปอร์ไวเซอร์คลาวด์ส่วนตัว (VMware ESXi, Proxmox, Hyper-V, KVM) หรืออินสแตนซ์บนคลาวด์สาธารณะ (AWS, Azure, GCP)

---

## 1. ข้อกำหนดของระบบและตารางคำนวณสเปกฮาร์ดแวร์ (System Requirements & Sizing Matrix)

| ตัวชี้วัด / ขนาดองค์กร | องค์กรขนาดเล็ก (< 50 อุปกรณ์) | องค์กรขนาดกลาง (50 - 250 อุปกรณ์) | องค์กรขนาดใหญ่ (> 250 อุปกรณ์) |
|---|---|---|---|
| **vCPU Cores** | 2 vCPU | 4 vCPU | 8 vCPU |
| **หน่วยความจำ (RAM)** | 4 GB | 8 GB | 16 GB |
| **พื้นที่จัดเก็บข้อมูลความเร็วสูง (SSD/NVMe)** | 50 GB | 150 GB | 500 GB+ |
| **ระบบปฏิบัติการ (OS)** | Ubuntu 22.04 LTS / Debian 12 / RHEL 9 / Windows Server 2022 | เหมือนกัน | เหมือนกัน |
| **Container Engine** | Docker Engine 24.0+ & Compose v2 | เหมือนกัน | เหมือนกัน |
| **อินเทอร์เฟซเครือข่าย (NIC)** | 1 Gbps NIC | 1 Gbps / 10 Gbps | 10 Gbps Redundant NICs (Bonding) |

---

## 2. ภาพรวมสถาปัตยกรรมระบบ (Architecture Overview)

```
                          [ เครือข่ายองค์กร Corporate LAN / WAN ]
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
                                   [ อุปกรณ์เครือข่ายที่ดูแลทั้งหมด ]
                               Switches, Firewalls, Routers, APs, Servers
```

---

## 3. ขั้นตอนการติดตั้งอย่างรวดเร็ว (Quick Turn-Key Deployment)

### 3.1 การติดตั้งบน Linux / macOS
1. **คัดลอกไฟล์โปรเจกต์ไปยังเซิร์ฟเวอร์เป้าหมาย:**
   ```bash
   cd /opt/netmonitor
   ```
2. **รันสคริปต์ติดตั้งอัตโนมัติ:**
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```
   *สคริปต์จะตรวจสอบความพร้อมของระบบ (RAM, Disk, Docker) อัตโนมัติ, สร้างไฟล์ `.env` พร้อมสุ่มคีย์วิทยาการรหัสลับที่มีความปลอดภัยสูง (`JWT_SECRET`, `SESSION_SECRET`, `EMERGENCY_PASSWORD`), กำหนดสิทธิ์โฟลเดอร์สำหรับ Non-root user (UID 10001) และเริ่มการทำงานของคอนเทนเนอร์ทั้งหมด*

3. **ตรวจสอบสถานะคอนเทนเนอร์:**
   ```bash
   docker compose ps
   ```

### 3.2 การติดตั้งบน Windows / Windows Server
1. เปิด **PowerShell ในสิทธิ์ Administrator** แล้วเข้าไปที่โฟลเดอร์ของโปรเจกต์:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\deploy.ps1
   ```
2. สคริปต์จะตรวจสอบระบบ ติดตั้ง และแสดง URL สำหรับเข้าใช้งานแดชบอร์ดพร้อมรหัสผ่านฉุกเฉินเมื่อเสร็จสิ้น

---

## 4. การตั้งค่าระบบและการปรับแต่ง (`.env`)

ก่อนนำระบบไปใช้งานจริงในระดับ Production ให้ตรวจสอบและปรับแต่งค่าในไฟล์ `.env`:

```bash
# พอร์ตสาธารณะสำหรับเข้าใช้งานผ่าน Nginx Gateway
HTTP_PORT=80
HTTPS_PORT=443

# ชื่อองค์กรหรือแผนกที่แสดงบนแถบหัวข้อและรายงาน
ORG_NAME="ศูนย์ปฏิบัติการเครือข่าย บริษัท เอซีเอ็มอี คอร์ปอเรชั่น"

# Subnet เริ่มต้นสำหรับการค้นหาอุปกรณ์เครือข่ายอัตโนมัติ
DEFAULT_DISCOVERY_CIDR=192.168.1.0/24

# SNMP Read-Only Community เริ่มต้นสำหรับเชื่อมต่อสวิตช์
DEFAULT_SNMP_COMMUNITY=public

# ระยะเวลาและขนาดพื้นที่ในการจัดเก็บ Time-Series Data บน Prometheus
PROMETHEUS_RETENTION_TIME=30d
PROMETHEUS_RETENTION_SIZE=50GB
```

---

## 5. การตั้งค่าใบรับรองความปลอดภัย SSL / TLS (HTTPS บนพอร์ต 443)

เพื่อความปลอดภัยสูงสุดในการใช้งานผ่านเว็บเบราว์เซอร์:

1. **นำไฟล์ใบรับรอง (Certificate) และ Private Key มาวางไว้ในโฟลเดอร์ SSL:**
   - Certificate Chain: `config/nginx/ssl/cert.pem`
   - Private Key: `config/nginx/ssl/key.pem`
2. **เปิดใช้งาน HTTPS ใน Nginx:**
   เปิดไฟล์ `config/nginx/netmonitor.conf` แล้วลบเครื่องหมาย `#` ออกจากบล็อก `server { listen 443 ssl http2; ... }`
3. **รีโหลด Nginx:**
   ```bash
   docker compose restart nginx
   ```

---

## 6. การกำหนดกฎไฟร์วอลล์ของเครือข่าย (Firewall Rules)

ตรวจสอบให้แน่ใจว่าไฟร์วอลล์ของเซิร์ฟเวอร์และเครือข่ายอนุญาตการจราจรข้อมูลดังนี้:

### ขาเข้า (Inbound เข้าสู่เซิร์ฟเวอร์ NetMonitor):
| Port | Protocol | แหล่งที่มา (Source) | วัตถุประสงค์การใช้งาน |
|---|---|---|---|
| `80` | TCP | เครื่องผู้ดูแลระบบ / เครือข่าย LAN | หน้าเว็บ Web Dashboard (HTTP) |
| `443` | TCP | เครื่องผู้ดูแลระบบ / เครือข่าย LAN | หน้าเว็บ Web Dashboard ปลอดภัย (HTTPS) |
| `22` | TCP | Bastion / เครื่อง Admin | SSH สำหรับจัดการเซิร์ฟเวอร์ |

### ขาออก (Outbound จาก NetMonitor สู่เครือข่าย):
| Port | Protocol | ปลายทาง (Destination) | วัตถุประสงค์การใช้งาน |
|---|---|---|---|
| `161` | UDP | อุปกรณ์เครือข่ายทั้งหมดที่ถูกตรวจสอบ | ดึงข้อมูลสถิติ SNMP v2c/v3 Telemetry |
| Any | ICMP (Echo Request) | อุปกรณ์เครือข่ายทั้งหมดที่ถูกตรวจสอบ | ตรวจสอบสถานะ Online/Offline และค่า Latency |
| `443` | TCP | อินเทอร์เน็ต (api.line.me, Webhook) | ส่งข้อความแจ้งเตือนเหตุการณ์ (ไม่บังคับ) |

---

## 7. การสำรองข้อมูลและการกู้คืนระบบ (Backup & Disaster Recovery)

### ข้อมูลสำคัญที่ต้องสำรอง:
- **ฐานข้อมูลอุปกรณ์และแผนผังเครือข่าย:** `data/db.json`
- **ไฟล์คอนฟิกระบบ:** `.env`
- **ใบรับรองความปลอดภัย SSL:** `config/nginx/ssl/`
- **ข้อมูลประวัติสถิติ Prometheus (ทางเลือก):** Docker volume `netmonitor_prometheus_data`

### สคริปต์สำรองข้อมูลอัตโนมัติ:
```bash
#!/usr/bin/env bash
BACKUP_DIR="/backup/netmonitor-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r data/ "$BACKUP_DIR/data/"
cp .env "$BACKUP_DIR/.env"
cp -r config/ "$BACKUP_DIR/config/"
tar -czf "${BACKUP_DIR}.tar.gz" -C "/backup" "$(basename "$BACKUP_DIR")"
rm -rf "$BACKUP_DIR"
echo "บันทึกไฟล์สำรองข้อมูลเรียบร้อยแล้วที่: ${BACKUP_DIR}.tar.gz"
```
