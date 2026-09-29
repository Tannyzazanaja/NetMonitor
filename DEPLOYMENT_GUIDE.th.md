# คู่มือการติดตั้งและบริหารจัดการระบบ NetMonitor ระดับองค์กร (Enterprise Deployment & Operations Guide)

คู่มือฉบับนี้อธิบายขั้นตอนการติดตั้ง การรักษาความปลอดภัย และการบำรุงรักษาระบบ **NetMonitor Enterprise Network Monitoring Platform** อย่างละเอียด สำหรับการติดตั้งบนเซิร์ฟเวอร์แบบ Bare-Metal, ไฮเปอร์ไวเซอร์คลาวด์ส่วนตัว (VMware ESXi, Proxmox, Hyper-V, KVM) หรืออินสแตนซ์บนคลาวด์สาธารณะ (AWS, Azure, GCP)

---

## 1. ข้อกำหนดของระบบและตารางคำนวณสเปกฮาร์ดแวร์ (System Requirements & Sizing Matrix)

ระบบ **NetMonitor** ได้รับการออกแบบให้ทำงานแบบ **Lightweight (กินทรัพยากรต่ำมาก)** โดยเขียน Backend ด้วย Vanilla Node.js, Frontend คอมไพล์เป็น Static Files เสิร์ฟผ่าน Nginx Alpine และใช้ Exporter ที่เขียนด้วยภาษา Go ไบนารีขนาดเล็ก **หน่วยความจำ RAM รวมของทั้ง 6 คอนเทนเนอร์ขณะทำงานจริงใช้เพียงประมาณ 350 MB – 600 MB เท่านั้น**

### ตารางสเปกฮาร์ดแวร์ที่แนะนำสำหรับการใช้งานจริง (Realistic Sizing Matrix)

| ตัวชี้วัด / ขนาดระบบ | Lab / สาขาย่อย (< 30 อุปกรณ์) | องค์กรขนาดเล็ก (< 50 อุปกรณ์) | องค์กรขนาดกลาง (50 - 200 อุปกรณ์) | องค์กรขนาดใหญ่ (> 200 อุปกรณ์) |
|---|---|---|---|---|
| **vCPU Cores** | 1 vCPU | 1 - 2 vCPU | 2 vCPU | 4 vCPU |
| **หน่วยความจำ (RAM)** | 1 GB - 2 GB | 2 GB | 4 GB | 8 GB |
| **พื้นที่จัดเก็บข้อมูล (SSD/NVMe)** | 10 GB | 15 - 20 GB | 30 - 50 GB | 80 - 100 GB |
| **ระบบปฏิบัติการ (OS)** | Ubuntu 22.04 LTS / Debian 12 / RHEL 9 / Proxmox CT / Windows Server | เหมือนกัน | เหมือนกัน | เหมือนกัน |
| **Container Engine** | Docker Engine 24.0+ & Compose v2 | เหมือนกัน | เหมือนกัน | เหมือนกัน |
| **อินเทอร์เฟซเครือข่าย (NIC)** | 1 Gbps NIC | 1 Gbps NIC | 1 Gbps / 10 Gbps | 10 Gbps Redundant NICs |

### ปริมาณการใช้ทรัพยากรจริงของแต่ละ Service (Real-World Footprint):

* **NetMonitor Core (Node.js API):** ใช้ RAM เพียง **~40 MB – 60 MB** (ไม่ใช้ Framework เทอะทะ ทำงานรวดเร็ว)
* **Nginx Gateway (Alpine):** ใช้ RAM เพียง **~10 MB – 15 MB** (เสิร์ฟไฟล์ Static ของ React และทำ Reverse Proxy)
* **Blackbox Exporter (Go binary):** ใช้ RAM เพียง **~15 MB – 30 MB** (ยิง ICMP Ping ระดับวินาที กิน CPU แทบจะเป็น 0%)
* **SNMP Exporter (Go binary):** ใช้ RAM เพียง **~25 MB – 50 MB** (ดึงเฉพาะ OID ที่จำเป็น ไม่ดึงตารางซ้ำซ้อน)
* **Prometheus TSDB (Go binary):** ใช้ RAM เพียง **~150 MB – 300 MB** (ระบบบีบอัด Time-Series เฉลี่ย 1 ตัวเลขใช้เนื้อที่เพียง 1.5 Bytes ทำให้อุปกรณ์ 50 ตัว เก็บประวัติ 30 วัน ใช้พื้นที่ดิสก์เพียง **~1 GB – 3 GB** เท่านั้น)
* **Grafana OSS:** ใช้ RAM เพียง **~80 MB – 150 MB**

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

> [!NOTE]
> หากองค์กรของท่านมีข้อกำหนดให้ติดตั้ง Prometheus, SNMP Exporter, Blackbox Exporter และ Grafana บนระบบปฏิบัติการลินุกซ์โดยตรง (Bare-Metal / VM แบบ Linux Systemd) แทนการใช้ Docker Compose สามารถศึกษาขั้นตอนอย่างละเอียดได้ที่ [**คู่มือการติดตั้ง Infrastructure**](INFRA_INSTALLATION_GUIDE.th.md) ([EN](INFRA_INSTALLATION_GUIDE.md))

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
| `443` | TCP | อินเทอร์เน็ต (api.line.me) | ส่งข้อความแจ้งเตือนผ่าน LINE Messaging API (ไม่บังคับ) |

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

---

## 8. การควบคุมสิทธิ์การเข้าถึง (RBAC) และการจัดการผู้ใช้ (User Management)

NetMonitor รองรับการกำหนดสิทธิ์การใช้งาน 3 ระดับ (Three-Tier Privilege Model) โดยทำงานเชื่อมโยงกับระบบจัดการผู้ใช้ของ Grafana (`http://<SERVER_IP>:3000/admin/users`):

| หน้าที่การทำงาน / ความสามารถในระบบ | Viewer (ผู้ดู) | Editor (ผู้ดูแลทั่วไป) | Admin (ผู้ดูแลระบบสูงสุด) |
|---|:---:|:---:|:---:|
| **ดูแดชบอร์ด Real-Time & ข้อมูล Telemetry** | ✅ | ✅ | ✅ |
| **ดูแผนผังโครงสร้าง Topology เครือข่าย** | ✅ | ✅ | ✅ |
| **ดูและส่งออกรายงานประวัติสถิติ (CSV/PNG)** | ✅ | ✅ | ✅ |
| **รับทราบการแจ้งเตือน (Acknowledge Active Alerts)** | ❌ | ✅ | ✅ |
| **เพิ่ม / แก้ไข / ลบ ข้อมูลอุปกรณ์เครือข่าย** | ❌ | ✅ | ✅ |
| **สั่งค้นหาอุปกรณ์ Topology อัตโนมัติ & จัดบันทึกตำแหน่ง** | ❌ | ✅ | ✅ |
| **แก้ไขการตั้งค่าหลักของระบบ & ซับเน็ต CIDR** | ❌ | ❌ | ✅ |
| **กำหนดค่า SNMP Communities & LINE Notifications** | ❌ | ❌ | ✅ |
| **เข้าใช้งานระบบด้วยบัญชีฉุกเฉิน Break-Glass** | ❌ | ❌ | ✅ |

### บัญชีฉุกเฉินกรณีเกิดเหตุขัดข้อง (Emergency Break-Glass Account)
ในกรณีที่ Grafana เกิดข้อผิดพลาด ไม่สามารถเชื่อมต่อได้ หรืออยู่ในขั้นตอนการกู้คืนระบบ (Disaster Recovery) ผู้ดูแลระบบสามารถล็อกอินเข้าสู่ระบบได้โดยตรงผ่านบัญชีฉุกเฉิน ซึ่งถูกกำหนดค่าไว้ในตัวแปร `EMERGENCY_USERNAME` (ค่าเริ่มต้น: `emergency`) และ `EMERGENCY_PASSWORD` ในไฟล์ `.env` โดยระบบจะมอบสิทธิ์ Admin สูงสุดทันทีโดยไม่พึ่งพาบริการภายนอกใดๆ

