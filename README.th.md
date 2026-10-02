# NetMonitor Enterprise: ระบบสังเกตการณ์และบริหารจัดการเครือข่ายองค์กร

<p align="center">
  <a href="README.md"><b>English</b></a> | <a href="README.th.md"><b>ภาษาไทย</b></a>
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

## 📖 สารบัญ (Table of Contents)
1. [ภาพรวมของระบบ (Overview)](#1-ภาพรวมของระบบ-overview)
2. [จุดเด่นและฟังก์ชันหลัก (Key Highlights)](#2-จุดเด่นและฟังก์ชันหลัก-key-highlights)
3. [ความต้องการของระบบและขนาดฮาร์ดแวร์ (Hardware Sizing)](#3-ความต้องการของระบบและขนาดฮาร์ดแวร์-hardware-sizing)
4. [วิธีการติดตั้งแบบ Docker Compose (แนะนำ)](#4-วิธีการติดตั้งแบบ-docker-compose-แนะนำ)
5. [วิธีการติดตั้งแบบ Native Linux Systemd](#5-วิธีการติดตั้งแบบ-native-linux-systemd)
6. [การตั้งค่า Nginx Reverse Proxy และ SSL/TLS](#6-การตั้งค่า-nginx-reverse-proxy-และ-ssltls)
7. [การเข้าสู่ระบบและระบบสิทธิ์ (RBAC & Emergency Access)](#7-การเข้าสู่ระบบและระบบสิทธิ์-rbac--emergency-access)
8. [การจัดการอุปกรณ์และโปรไฟล์ SNMP](#8-การจัดการอุปกรณ์และโปรไฟล์-snmp)
9. [การสำรองและกู้คืนข้อมูล (Backup & Restore)](#9-การสำรองและกู้คืนข้อมูล-backup--restore)
10. [คู่มือแก้ไขปัญหาเบื้องต้น (Troubleshooting)](#10-คู่มือแก้ไขปัญหาเบื้องต้น-troubleshooting)
11. [การทดสอบและตรวจสอบความปลอดภัย (Verification & Tests)](#11-การทดสอบและตรวจสอบความปลอดภัย-verification--tests)

---

## 1. ภาพรวมของระบบ (Overview)

**NetMonitor Enterprise** คือแพลตฟอร์มสังเกตการณ์และตรวจวัดประสิทธิภาพโครงข่ายระบบเครือข่าย (Network Observability & Management Platform) ระดับองค์กร ออกแบบมาเพื่อลดความซับซ้อนของโปรแกรมจัดการเครือข่ายแบบเดิม โดยรวมการมอนิเตอร์สถานะอุปกรณ์แบบ Real-Time, การวิเคราะห์ข้อมูลสถิติทราฟฟิกย้อนหลัง, แผนที่ Topology โครงข่ายแบบ Interactive, และการแจ้งเตือนอัจฉริยะ เข้าไว้ใน Web Dashboard เดียวที่รองรับทั้งหน้าจอ **Mobile, Tablet และ Desktop**

ระบบทำงานบนสถาปัตยกรรมแบบ **Single-Instance Enterprise Model** โดยใช้ฐานข้อมูล **Atomic JSON Database (`data/db.json`)** ที่เบา รวดเร็ว และมีระบบสำรองข้อมูลอัตโนมัติก่อนเขียนไฟล์ทุกครั้ง (`.bak`) ทำให้ไม่ต้องติดตั้งและดูแลฐานข้อมูลภายนอกขนาดใหญ่อย่าง PostgreSQL หรือ MySQL

---

## 2. จุดเด่นและฟังก์ชันหลัก (Key Highlights)

- **Zero-Polling Real-Time Push**: ใช้เทคโนโลยี **Server-Sent Events (SSE)** ส่งข้อมูลสถานะอุปกรณ์, ความเร็วทราฟฟิก และ Alert ขึ้นหน้าจอเว็บทันทีโดยที่เบราว์เซอร์ไม่ต้องกดรีเฟรช
- **ความปลอดภัยระดับสูง (Enterprise Security Boundary)**:
  - รหัสผ่านฉุกเฉินและบัญชีผู้ดูแลผ่านการเข้ารหัสด้วย **PBKDF2 (SHA-512, 100,000 รอบ) พร้อม Salt เฉพาะรายบัญชี**
  - การเปรียบเทียบรหัสผ่านแบบคงที่คงเวลา (`timingSafeEqual`) ป้องกันการโจมตีแบบ Timing Attack
  - ระบบสิทธิ์ **3-Tier RBAC**: `Admin` (จัดการทั้งหมด), `Editor` (รับทราบ Alert/สแกนเครือข่าย), `Viewer` (ดูข้อมูลอย่างเดียว)
  - ป้องกันการ Brute-force Login และจำกัดอัตราการดึงข้อมูลลึก PromQL (Query Rate Limiter สูงสุด 60 ครั้ง/นาที)
  - ไม่เปิดเผยรหัสผ่านและ Community String ใน API Response (Sanitized Payload)
- **ความแม่นยำของทราฟฟิก (Traffic Semantics)**:
  - แยกความแตกต่างอย่างชัดเจนระหว่าง **`0.00 Mbps`** (อุปกรณ์ออนไลน์ ลิงก์ทำงานปกติแต่ไม่มีแพ็กเก็ตวิ่ง) กับคำว่า **`No Data`** (อุปกรณ์ออฟไลน์ หรือดึงข้อมูลไม่ได้)
  - รองรับเคาน์เตอร์ 64-bit High Capacity (`ifHCInOctets`, `ifHCOutOctets`) สำหรับทราฟฟิกระดับ Gigabit+
- **รองรับอุปกรณ์หลากหลายยี่ห้อ (Multi-Vendor SNMP)**:
  - มีโปรไฟล์ MIB สำหรับ Cisco, MikroTik, Synology NAS, เซิร์ฟเวอร์ Linux/Windows และอุปกรณ์ Generic MIB-II (`if_mib`)
- **แผนที่โครงข่าย (Semi-Automatic Topology)**:
  - ลากย้ายตำแหน่งโหนดและจัดเก็บพิกัดอัตโนมัติ พร้อมเส้นเชื่อมโยงแสดงสถานะแบนด์วิดท์ของแต่ละลิงก์
- **ระบบกู้คืนข้อมูลมาตรฐานความปลอดภัย**:
  - ส่งออกและนำเข้าไฟล์ Backup ด้วยการตรวจสอบรหัส **SHA-256 Checksum** ป้องกันไฟล์เสียหายหรือถูกแก้ไข

---

## 3. ความต้องการของระบบและขนาดฮาร์ดแวร์ (Hardware Sizing)

| ขนาดระบบ | จำนวนอุปกรณ์ | CPU Cores | RAM | พื้นที่จัดเก็บ (SSD) | สภาพแวดล้อมที่เหมาะสม |
|---|---|---|---|---|---|
| **Small / สาขา** | 1 – 50 อุปกรณ์ | 2 Cores | 4 GB | 30 GB | สาขาย่อย, ห้องทดสอบ, ไซต์งาน |
| **Medium / แคมปัส** | 51 – 200 อุปกรณ์ | 4 Cores | 8 GB | 60 GB | สำนักงานใหญ่, โรงงาน, มหาวิทยาลัย |
| **Large / Data Center**| 201 – 500+ อุปกรณ์| 8 Cores | 16 GB | 120 GB | ดาต้าเซ็นเตอร์, ผู้ให้บริการเครือข่าย |

**พอร์ตเครือข่ายที่ต้องใช้งาน**:
- ขาเข้า (Inbound): `80/tcp` (HTTP) และ `443/tcp` (HTTPS)
- ขาออก (Outbound): `UDP 161` (SNMP Polling ไปยังอุปกรณ์) และ `ICMP Echo` (ยิง Ping ตรวจสอบความพร้อมใช้งาน)

---

## 4. วิธีการติดตั้งแบบ Docker Compose (แนะนำ)

Docker Compose เป็นวิธีติดตั้งที่สะดวก รวดเร็ว และผ่านการตั้งค่าด้านความปลอดภัย (Hardened) ไว้อย่างครบถ้วน:

### ขั้นตอนที่ 1: Clone Repository และเตรียมไฟล์คอนฟิก
```bash
git clone https://github.com/Tannyzazanaja/NetMonitor.git /opt/netmonitor
cd /opt/netmonitor

# คัดลอกไฟล์ Environment Template
cp .env.example .env
chmod 600 .env
```

### ขั้นตอนที่ 2: กำหนดค่าความปลอดภัยใน `.env`
เปิดไฟล์ `.env` และแก้ไขค่าที่สำคัญ:
```bash
# สร้าง Random Hex Key ด้วยคำสั่ง: openssl rand -hex 32
JWT_SECRET=ใส่_jwt_secret_แบบสุ่ม_32_bytes
SESSION_SECRET=ใส่_session_secret_แบบสุ่ม_32_bytes

# บัญชีฉุกเฉินสำหรับเข้าสู่ระบบครั้งแรก (Break-glass Admin)
EMERGENCY_USERNAME=admin
EMERGENCY_PASSWORD=ตั้งรหัสผ่านที่มีความปลอดภัยสูง

# ค่าเริ่มต้นในการสแกนเครือข่ายและ SNMP
DEFAULT_DISCOVERY_CIDR=192.168.1.0/24
DEFAULT_SNMP_COMMUNITY=your_monitoring_community
DEFAULT_SNMP_MODULE=if_mib
```

### ขั้นตอนที่ 3: สั่งรันระบบผ่าน Docker Compose
```bash
docker compose up -d --build
```

### ขั้นตอนที่ 4: ตรวจสอบสถานะการทำงาน
```bash
# ตรวจสอบว่า Container ทุกตัวทำงานและ Healthy
docker compose ps

# ดู Log ของระบบ NetMonitor
docker compose logs -f netmonitor

# ตรวจสอบ Health Endpoint
curl -f http://127.0.0.1:5001/api/health
```

เข้าใช้งานผ่านเว็บเบราว์เซอร์ที่: `http://<IP-ของเซิร์ฟเวอร์>`

---

## 5. วิธีการติดตั้งแบบ Native Linux Systemd

สำหรับองค์กรที่ต้องการติดตั้งบน Bare-metal หรือ Linux VM โดยตรง:

### ขั้นตอนที่ 1: สร้าง Service Account และติดตั้ง Node.js
```bash
# สร้าง User สำหรับรันเซอร์วิสเพื่อความปลอดภัย
sudo useradd -r -s /bin/false -d /var/lib/prometheus prometheus
sudo useradd -r -s /bin/false snmpexporter
sudo useradd -r -s /bin/false -d /opt/netmonitor netmonitor

# ติดตั้ง Node.js v20 LTS และ Nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx curl
```

### ขั้นตอนที่ 2: ติดตั้ง Prometheus, SNMP Exporter และ Blackbox Exporter
```bash
# 1. ติดตั้ง Prometheus TSDB (v2.45.3)
wget https://github.com/prometheus/prometheus/releases/download/v2.45.3/prometheus-2.45.3.linux-amd64.tar.gz
tar -xvf prometheus-2.45.3.linux-amd64.tar.gz
sudo mv prometheus-2.45.3.linux-amd64/prometheus /usr/local/bin/
sudo mkdir -p /etc/prometheus /var/lib/prometheus /etc/prometheus/targets
sudo chown -R prometheus:prometheus /var/lib/prometheus /etc/prometheus

# 2. ติดตั้ง SNMP Exporter (v0.24.1)
wget https://github.com/prometheus/snmp_exporter/releases/download/v0.24.1/snmp_exporter-0.24.1.linux-amd64.tar.gz
tar -xvf snmp_exporter-0.24.1.linux-amd64.tar.gz
sudo mv snmp_exporter-0.24.1.linux-amd64/snmp_exporter /usr/local/bin/
sudo mkdir -p /etc/snmp_exporter

# 3. ติดตั้ง Blackbox Exporter (v0.24.0)
wget https://github.com/prometheus/blackbox_exporter/releases/download/v0.24.0/blackbox_exporter-0.24.0.linux-amd64.tar.gz
tar -xvf blackbox_exporter-0.24.0.linux-amd64.tar.gz
sudo mv blackbox_exporter-0.24.0.linux-amd64/blackbox_exporter /usr/local/bin/
sudo mkdir -p /etc/blackbox_exporter
```

### ขั้นตอนที่ 3: ติดตั้งไฟล์คอนฟิกและ Systemd Unit
```bash
# คัดลอกคอนฟิก Prometheus และ SNMP
sudo cp config/prometheus/prometheus.yml /etc/prometheus/prometheus.yml
sudo cp config/snmp_exporter/snmp.yml /etc/snmp_exporter/snmp.yml

# คัดลอกไฟล์ Systemd Services
sudo cp deploy/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
```

### ขั้นตอนที่ 4: ตั้งค่าสิทธิ์โฟลเดอร์ Targets
เพื่อให้ Backend ของ NetMonitor สามารถเขียนไฟล์ Target ให้ Prometheus ได้:
```bash
sudo chown -R netmonitor:prometheus /etc/prometheus/targets
sudo chmod 775 /etc/prometheus/targets
```

### ขั้นตอนที่ 5: ติดตั้งแอปพลิเคชัน NetMonitor
```bash
sudo mkdir -p /opt/netmonitor /etc/netmonitor
sudo cp -r . /opt/netmonitor/
cd /opt/netmonitor

# ติดตั้ง Dependencies และคอมไพล์ Frontend
npm ci --omit=dev
npm run build

# กำหนดค่า Environment
sudo cp .env.example /etc/netmonitor/netmonitor.env
sudo chown -R netmonitor:netmonitor /opt/netmonitor /etc/netmonitor
sudo chmod 600 /etc/netmonitor/netmonitor.env
```

### ขั้นตอนที่ 6: เริ่มต้นการทำงานของเซอร์วิส
```bash
sudo systemctl enable --now prometheus snmp-exporter blackbox-exporter netmonitor-backend
sudo systemctl status netmonitor-backend
```

---

## 6. การตั้งค่า Nginx Reverse Proxy และ SSL/TLS

ระบบมีไฟล์คอนฟิกสำเร็จรูปอยู่ที่ `config/nginx/netmonitor.conf` ซึ่งรองรับ Server-Sent Events (SSE) และป้องกัน Connection หลุด:

```bash
sudo cp config/nginx/netmonitor.conf /etc/nginx/sites-available/netmonitor.conf
sudo ln -sf /etc/nginx/sites-available/netmonitor.conf /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

สำหรับการเปิดใช้งาน HTTPS ให้นำใบรับรอง SSL ไปวางที่:
- Certificate: `/etc/nginx/ssl/cert.pem`
- Private Key: `/etc/nginx/ssl/key.pem`

---

## 7. การเข้าสู่ระบบและระบบสิทธิ์ (RBAC & Emergency Access)

NetMonitor มีระบบแบ่งสิทธิ์ผู้ใช้แบบ 3 ระดับอย่างเข้มงวด:

| ความสามารถ / ฟังก์ชัน | Admin | Editor / Operator | Viewer |
|---|:---:|:---:|:---:|
| ดูแดชบอร์ด สถานะอุปกรณ์ และทราฟฟิกสด | ✅ | ✅ | ✅ |
| ดูแผนที่ Topology โครงข่าย | ✅ | ✅ | ✅ |
| ดูข้อมูลสถิติย้อนหลัง (Analytics) | ✅ | ✅ | ✅ |
| รับทราบการแจ้งเตือน (Acknowledge Alert) | ✅ | ✅ | ❌ |
| สแกนค้นหาอุปกรณ์ในวง Subnet | ✅ | ✅ | ❌ |
| เพิ่ม/แก้ไขข้อมูลอุปกรณ์ และรหัสผ่าน SNMP | ✅ | ❌ | ❌ |
| ล้างประวัติการแจ้งเตือน (Clear Alert History) | ✅ | ❌ | ❌ |
| รันคำสั่ง PromQL Direct Proxy | ✅ | ❌ | ❌ |
| สำรองและกู้คืนฐานข้อมูล (Backup & Restore) | ✅ | ❌ | ❌ |
| แก้ไขการตั้งค่าระบบ (Settings & Secret Keys) | ✅ | ❌ | ❌ |

**บัญชีผู้ดูแลฉุกเฉิน (Break-Glass Admin)**:
- กำหนดค่าผ่าน `EMERGENCY_USERNAME` และ `EMERGENCY_PASSWORD` ใน `.env`
- รหัสผ่านจะถูก Hash อัตโนมัติด้วย PBKDF2 (SHA-512, 100k รอบ) เมื่อระบบเริ่มต้น
- มี Rate Limiter จำกัดการล็อกอินผิดพลาดไม่เกิน 5 ครั้งต่อ 15 นาที เพื่อป้องกันการสุ่มรหัสผ่าน

---

## 8. การจัดการอุปกรณ์และโปรไฟล์ SNMP

### การเพิ่มอุปกรณ์เข้าระบบ
1. ไปที่เมนู **Devices** > คลิกปุ่ม **Add Device**
2. กรอกชื่ออุปกรณ์, IP Address, ชนิดอุปกรณ์ (Switch, Router, Firewall, Server, AP)
3. เลือก SNMP Module ให้ตรงกับรุ่นของอุปกรณ์:
   - `if_mib`: สวิตช์และเราเตอร์ทั่วไปตามมาตรฐาน MIB-II
   - `cisco`: สวิตช์และเราเตอร์ Cisco (Catalyst 2960, 3850, 9300, ISR, Nexus)
   - `mikrotik`: เราเตอร์และสวิตช์ MikroTik RouterOS
   - `synology`: อุปกรณ์จัดเก็บข้อมูล Synology NAS
   - `server`: เครื่องเซิร์ฟเวอร์ Linux และ Windows
4. ระบุ SNMP Community String (เช่น `public` หรือ Community ประจำองค์กร)

เมื่อเพิ่มอุปกรณ์สำเร็จ ระบบจะสร้างไฟล์ Target อัตโนมัติ:
- `/etc/prometheus/targets/snmp_targets.yml`
- `/etc/prometheus/targets/blackbox_targets.yml`
โดย Prometheus จะตรวจพบอุปกรณ์ใหม่ภายใน 15 วินาทีโดยไม่ต้องรีสตาร์ตระบบ

---

## 9. การสำรองและกู้คืนข้อมูล (Backup & Restore)

### การสำรองข้อมูลอัตโนมัติ (Pre-Write Snapshot)
ก่อนที่ระบบจะบันทึกการเปลี่ยนแปลงลงไฟล์ `data/db.json` ระบบจะสร้างไฟล์สำรอง `data/db.json.bak` ไว้เสมอ

### การดาวน์โหลดไฟล์สำรองข้อมูล (Export Backup)
ผู้ดูแลระบบสามารถดาวน์โหลดไฟล์สำรองข้อมูลแบบเต็มผ่าน Web UI หรือใช้คำสั่ง:
```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
     http://localhost:5001/api/admin/backup \
     -o netmonitor_backup.json
```
ไฟล์สำรองจะประกอบด้วย: ข้อมูลอุปกรณ์, ประวัติ Alert, พิกัด Topology, วันเวลาที่ส่งออก และ **SHA-256 Checksum**

### การกู้คืนข้อมูล (Restore Backup)
```bash
curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" \
     -H "Content-Type: application/json" \
     -d @netmonitor_backup.json \
     http://localhost:5001/api/admin/restore
```
ระบบจะตรวจสอบความถูกต้องของโครงสร้างไฟล์และ Checksum ก่อนทำการเขียนทับข้อมูลเดิม และจะเริ่มตั้งเวลาตัว Poller ใหม่ทันที

---

## 10. คู่มือแก้ไขปัญหาเบื้องต้น (Troubleshooting)

### ปัญหาที่ 1: สถานะ Target ขึ้น `HTTP status 500 Internal Server Error`
- **อาการ**: หน้าจอ Prometheus (:9090/targets) แสดงสถานะ DOWN พร้อมข้อความ HTTP 500
- **สาเหตุ**: `snmp_exporter` ส่งคำขอ SNMP UDP ไปยังอุปกรณ์แล้วไม่ได้รับการตอบกลับภายใน 20 วินาที หรือพอร์ต UDP 161 ถูกบล็อก
- **แนวทางแก้ไข**:
  1. ทดสอบ Ping ไปยัง IP อุปกรณ์: `ping <DEVICE_IP>` ถ้า Ping ไม่ติด แสดงว่าอุปกรณ์ดับหรือสายหลุด
  2. ถ้า Ping ติด ให้ทดสอบ SNMP Walk โดยตรง:
     ```bash
     curl -i "http://127.0.0.1:9116/snmp?target=<DEVICE_IP>&module=if_mib&auth=public_v2"
     ```
  3. ตรวจสอบว่า Community String ใน NetMonitor ตรงกับการตั้งค่าบนอุปกรณ์จริงหรือไม่

### ปัญหาที่ 2: สถานะ Target ขึ้น `HTTP status 400 Bad Request`
- **อาการ**: Prometheus Target ขึ้นสถานะ DOWN ด้วยข้อความ HTTP 400
- **สาเหตุ**: ระบุชื่อ SNMP Module ผิด หรือไม่มีโมดูลนั้นอยู่ใน `config/snmp_exporter/snmp.yml`
- **แนวทางแก้ไข**: ตรวจสอบโมดูลที่รองรับด้วยคำสั่ง `node scripts/validate-snmp-config.js` และแก้ไขโมดูลของอุปกรณ์ให้ถูกต้อง

### ปัญหาที่ 3: ได้รับข้อความ `HTTP 429 Too Many Requests`
- **อาการ**: หน้าจอ Analytics หรือ API ส่งกลับรหัส 429
- **สาเหตุ**: มีการยิงคำขอค้นหาข้อมูล PromQL เกิน 60 ครั้งต่อนาที
- **แนวทางแก้ไข**: รอประมาณ 1 นาทีตามค่า `Retry-After` ใน Header และตรวจสอบไม่ให้ Dashboard อื่นยิงคำขอถี่เกิน 1 ครั้งต่อวินาที

### ปัญหาที่ 4: Blackbox Exporter แสดง `probe_success 0` ตลอดเวลา
- **อาการ**: ทุกอุปกรณ์ขึ้นว่า Ping ไม่ติด ทั้งที่อุปกรณ์เปิดใช้งานอยู่
- **สาเหตุ**: ตัว Blackbox Exporter ไม่มีสิทธิ์ในการส่ง Raw Socket ICMP
- **แนวทางแก้ไข**:
  - บน Docker: ตรวจสอบว่าใน `docker-compose.yml` มีการตั้งค่า `cap_add: [NET_RAW]`
  - บน Native Linux: รันคำสั่ง `sudo setcap cap_net_raw+ep /usr/local/bin/blackbox_exporter`

### ปัญหาที่ 5: สิทธิ์บันทึกไฟล์ Target ล้มเหลว (Permission Denied)
- **อาการ**: ใน Log ของ Backend แจ้งเตือน `EACCES: permission denied, open '/etc/prometheus/targets/snmp_targets.yml'`
- **แนวทางแก้ไข**: ตั้งค่าสิทธิ์โฟลเดอร์ให้ถูกต้องด้วยคำสั่ง:
  ```bash
  sudo chown -R netmonitor:prometheus /etc/prometheus/targets
  sudo chmod 775 /etc/prometheus/targets
  ```

---

## 11. การทดสอบและตรวจสอบความปลอดภัย (Verification & Tests)

ระบบมาพร้อมกับชุดสคริปต์ตรวจสอบความถูกต้องและความปลอดภัยแบบอัตโนมัติ:

```bash
# 1. รันชุดทดสอบระบบอัตโนมัติทั้งหมด (13 Test Suites)
npm test

# 2. ตรวจสอบไวยากรณ์และความปลอดภัยของโค้ด (Linting)
npm run lint

# 3. ตรวจสอบว่าไม่มีรหัสผ่านหรือ Secret ใดๆ หลุดในซอร์สโค้ด
node scripts/security-scan.js

# 4. ตรวจสอบความถูกต้องของโปรไฟล์ SNMP Exporter
node scripts/validate-snmp-config.js

# 5. ตรวจสอบความถูกต้องของไฟล์ Target Prometheus
node scripts/validate-prometheus-targets.js

# 6. ทดสอบการจำลองติดตั้งระบบแบบ Clean Install จากศูนย์
node scripts/verify-clean-install.js
```

---

## 📄 เอกสารอ้างอิงเพิ่มเติม (Technical References)
- [**INSTALLATION.md**](INSTALLATION.md) — คู่มือการติดตั้งและคำแนะนำฮาร์ดแวร์เชิงลึก
- [**ADMIN_GUIDE.md**](ADMIN_GUIDE.md) — คู่มือการบริหารจัดการระบบและพารามิเตอร์แบบละเอียด
- [**DEVELOPER_GUIDE.md**](DEVELOPER_GUIDE.md) — สถาปัตยกรรมระบบ Data Pipeline และแนวทางสำหรับนักพัฒนา
- [**CHANGELOG.md**](CHANGELOG.md) — ประวัติการปรับปรุงระบบและบันทึกการปล่อยเวอร์ชัน
- [**SECURITY.md**](SECURITY.md) — นโยบายความปลอดภัยของระบบ
