# SEAVL NetMonitor: Enterprise Network Observability & Management System

> ระบบเฝ้าระวังและวิเคราะห์ประสิทธิภาพเครือข่ายระดับองค์กรแบบเรียลไทม์ (Enterprise Real-Time Network Observability & Telemetry System)

---

## 1. Project Overview (ภาพรวมโครงการ)

**SEAVL NetMonitor** เป็นระบบ Network Observability & Management Platform สมัยใหม่ พัฒนาขึ้นด้วยสถาปัตยกรรม High-Performance React + Vanilla Node.js เพื่อแก้ปัญหาความซ้ำซ้อนของการเก็บข้อมูล (Telemetry), การแจ้งเตือนซ้ำซ้อน (Duplicate Alerts), และ Scrape Timeout ของระบบเฝ้าระวังเครือข่ายเดิม

### จุดเด่นสำคัญ (Key Capabilities)
* **Real-time Topology & Neighbor Discovery**: ตรวจจับความเชื่อมโยงของอุปกรณ์สวิตช์ในระบบผ่าน LLDP (`lldpRem*`) และ CDP (`cdpCache*`) พร้อมคำนวณและวาด Topology อัตโนมัติ
* **Hardware Health & Telemetry**: ดึงค่า CPU Utilization, Memory Allocation, Uptime, และสถานะพอร์ตความเร็วสูง (64-bit HC In/Out Octets) จาก Cisco Catalyst (9200/9300/IOS-XE) และ HP/Aruba ProCurve (2530/2920) แบบ All-in-One ไม่เกิด Timeout
* **Single Source of Truth Alert Engine**: Backend รวมการแจ้งเตือนจาก Prometheus Native ALERTS, ICMP Reachability, และ Hardware Telemetry Thresholds เข้าเป็นสถานะเดียว ป้องกัน Alert ผี พร้อมระบบ Acknowledge, History Archiving, LINE Messaging API, และ SSE Streaming
* **Unified Prometheus Architecture**: แยก Scrape Target ออกจากกันเด็ดขาดระหว่าง Blackbox (ICMP) และ SNMP โดยใช้ Generic SNMP Job พร้อม Dynamic Relabeling ตาม Vendor และ Auth Profile
* **Production-Ready & High Performance**: ทำงานผ่าน Nginx Reverse Proxy ร่วมกับ PM2 Process Manager, Zero-Buffering SSE, และระบบ Health Check อัตโนมัติ

---

## 2. Architecture (สถาปัตยกรรมระบบ)

ระบบทำงานภายใต้สถาปัตยกรรม Decoupled Full-Stack Architecture โดยมี Backend เป็น Single Source of Truth สำหรับ State ทั้งหมด:

```
[ Physical Network Devices ]
  ├── Cisco Catalyst 9200/9300 (IOS-XE)
  ├── HP / Aruba 2530 PoE+ (ArubaOS-S)
  └── Servers / Routers / UPS
         │
         ├── ICMP Ping Probe ───────────► [ Blackbox Exporter :9115 ] ◄┐
         └── SNMPv2c / Auth Profiles ───► [ SNMP Exporter :9116 ]     │
                                                   │                   │
                                            Scrape Pull (1m)     Scrape (30s)
                                                   ▼                   │
                                        [ Prometheus Server :9090 ] ───┘
                                                   │
                                            PromQL Query Engine
                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Linux Server (192.168.109.147)                                              │
│                                                                             │
│  [ Nginx Reverse Proxy :80 ]                                                │
│    ├── /                     ──► /var/www/netmonitor-react/dist (React SPA) │
│    ├── /api/storage/stream/* ──► :5001 (SSE Zero-Buffering Stream)          │
│    ├── /api/*                ──► :5001 (Node.js Unified Backend API)        │
│    ├── /api/grafana/*        ──► :3000 (Grafana Dashboard)                  │
│    └── /api/prometheus/*     ──► :9090 (Prometheus Proxy)                   │
│                                                                             │
│  [ PM2 Daemon: netmonitor-backend (:5001) ]                                 │
│    ├── SNMP Mapper Engine (Single Source of Truth for Vendors/Auth)         │
│    ├── Target Sync Engine (Writes to /etc/prometheus/targets/{blackbox,snmp})│
│    ├── Unified Alert Lifecycle Engine & History Persistence                 │
│    ├── Live SNMP Telemetry Poller (30s caching & history baseline)          │
│    └── Public Health Endpoint (/api/health)                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. System Requirements (ความต้องการของระบบ)

### Server Environment (Ubuntu / Debian Linux)
* **Node.js**: v18.0.0 ขึ้นไป (แนะนำ v20+ LTS)
* **npm**: v9.0.0 ขึ้นไป
* **Prometheus**: v2.45+
* **SNMP Exporter**: v0.26+
* **Blackbox Exporter**: v0.24+
* **Grafana**: v10.0+ (ตัวเลือกเสริมสำหรับ Dashboard ฝังในระบบ)
* **Nginx**: v1.18+
* **PM2**: `npm install -g pm2`

### Network Requirements
* พอร์ต UDP 161 (SNMP) เปิดจากเซิร์ฟเวอร์ไปยัง Switch ทุกตัว
* พอร์ต ICMP Echo Request/Reply อนุญาตในเครือข่าย

---

## 4. Directory Structure (โครงสร้างไฟล์ระบบ)

```
network-monitor-react/
├── config/                         # Production Configurations (Single Source of Truth)
│   ├── nginx/
│   │   └── netmonitor.conf         # Production Nginx Reverse Proxy configuration
│   ├── prometheus/
│   │   └── prometheus.yml          # Production isolated Prometheus job configuration
│   ├── snmp_exporter/
│   │   └── snmp_optimized_modules.yml # Optimized Cisco & Aruba SNMP MIB modules
│   └── examples/
│       ├── blackbox_targets_example.yml # Target file format for ICMP
│       └── snmp_targets_example.yml     # Target file format for SNMP
├── data/                           # Local persistence (excluded from Git secrets)
│   ├── db.json                     # Active inventory & settings database
│   └── defaultDevices.json         # Factory default seed devices
├── public/                         # Web static assets (favicons, icons)
├── server/                         # Backend Application (Port 5001)
│   ├── defaultDevices.json         # Backup seed database
│   ├── package.json                # Backend dependency declarations
│   ├── package-lock.json           # Reproducible backend lockfile
│   ├── scanner.js                  # Subnet discovery & auto-detection engine
│   ├── server.js                   # Unified Backend REST API & Alert Engine
│   ├── setupPrometheusSnmp.js      # Automated deployment & migration script
│   └── snmpMapper.js               # Central SNMP Vendor & Auth Profile Mapper
├── src/                            # Frontend Application (React 19 + Vite)
│   ├── assets/                     # UI graphics & icons
│   ├── components/                 # React UI views & modal panels
│   │   ├── alerts/                 # Unified Alert Center & historical log
│   │   ├── auth/                   # Authentication & role-based access
│   │   ├── dashboard/              # Real-time traffic, health & donut charts
│   │   ├── devices/                # Switch inventory management & YAML export
│   │   ├── discovery/              # IP Range scanner modal
│   │   ├── grafana/                # Embedded Grafana kiosk panels
│   │   ├── services/               # Hardware telemetry & historical performance
│   │   ├── settings/               # System & notification configuration
│   │   └── topology/               # Interactive Canvas & Grid network map
│   ├── context/                    # React Context State Providers
│   ├── services/                   # Frontend API & Topology calculating services
│   └── utils/                      # Helper functions
├── tests/                          # Automated Verification Test Suites
│   ├── test_alert_lifecycle.cjs    # 7-step Alert state machine tests
│   ├── test_config_redesign.cjs    # Prometheus & SNMP mapper tests
│   └── test_target_generator.cjs   # File_sd mutex target generation tests
├── .env.example                    # Environment variable template
├── .gitignore                      # Git exclusion rules
├── deploy.ps1                      # Production 1-Click Deployment Script
├── package.json                    # Frontend dependencies & npm test/lint scripts
└── vite.config.js                  # Vite configuration & dev proxy (Port 5001)
```

---

## 5. Configuration & Environment Variables

คัดลอกไฟล์ `.env.example` ไปเป็น `.env` บนเซิร์ฟเวอร์หรือเครื่องพัฒนา:

```bash
cp .env.example .env
```

| Variable | Default Value | Description |
|:---|:---|:---|
| `PORT` | `5001` | พอร์ตหลักของ Node.js Backend API |
| `NODE_ENV` | `production` | สภาพแวดล้อมการทำงาน |
| `PROMETHEUS_URL` | `http://127.0.0.1:9090` | URL สำหรับเชื่อมต่อ Prometheus API |
| `PROMETHEUS_TARGETS_DIR`| `/etc/prometheus/targets` | ไดเรกทอรีสำหรับบันทึก target files |
| `DEFAULT_SNMP_COMMUNITY`| `seavl77` | SNMP Community เริ่มต้น |
| `DEFAULT_SNMP_AUTH_PROFILE`| `seavl77_v2` | ชื่อ Auth Profile เริ่มต้นใน SNMP Exporter |
| `LINE_NOTIFY_TOKEN` | - | Access Token สำหรับส่งแจ้งเตือนผ่าน LINE |

---

## 6. Development Setup (การติดตั้งสำหรับนักพัฒนา)

### 1. ติดตั้ง Dependencies
```bash
# ติดตั้ง Frontend dependencies
npm ci

# ติดตั้ง Backend dependencies
cd server
npm ci --omit=dev
cd ..
```

### 2. รัน Automated Test Suites
```bash
npm test
```
*รันชุดการทดสอบทั้ง 3 ชุด: Prometheus Config Validation, Alert Lifecycle, และ Mutex Target Generator*

### 3. รัน Linter Check
```bash
npm run lint
```

### 4. รันระบบในโหมด Development
เปิด 2 Terminal:

**Terminal 1 (Backend Server):**
```bash
cd server
node server.js
# Backend เริ่มทำงานที่ http://localhost:5001
```

**Terminal 2 (Frontend Dev Server):**
```bash
npm run dev
# Frontend เริ่มทำงานที่ http://localhost:5173 (มี Vite Proxy ส่งคำขอ /api/* ไปที่ Port 5001)
```

---

## 7. Production Deployment (การ Deploy สู่โปรดักชัน)

ระบบรองรับ **Single-Click Automated Deployment** ผ่านสคริปต์ [`deploy.ps1`](deploy.ps1) จาก Windows:

```powershell
.\deploy.ps1
```

### สิ่งที่สคริปต์จัดการให้อัตโนมัติ (10-Step Pipeline):
1. **Pre-build Validation**: รัน `npm run build` ตรวจสอบความถูกต้อง หากมี error จะยกเลิกทันที ไม่กระทบเซิร์ฟเวอร์
2. **Bundle & Source Upload**: ส่ง `dist/*`, โค้ด `server/`, และคอนฟิกโปรดักชันขึ้นเซิร์ฟเวอร์
3. **Reproducible Dependency Install**: รัน `npm ci --omit=dev` บนเซิร์ฟเวอร์
4. **Prometheus & SNMP Automated Migration**:
   - สำรองคอนฟิกเดิมลง `/etc/prometheus/backup/`
   - ตรวจสอบไวยากรณ์ด้วย `promtool check config`
   - ปรับใช้ `/etc/prometheus/prometheus.yml` ชุดใหม่
   - ผสานโมดูล `cisco_switch` และ `aruba_switch` เข้า `/etc/prometheus/snmp.yml`
5. **Port & PM2 Service Control**: ปิดพอร์ตเก่า และรีสตาร์ท service `netmonitor-backend` บนพอร์ต `5001`
6. **Nginx Reverse Proxy Configuration**: วางไฟล์ `/etc/nginx/conf.d/netmonitor.conf` สำหรับ NetMonitor โดยเฉพาะ
7. **Nginx Syntax Test**: ตรวจสอบไวยากรณ์ด้วย `nginx -t` ก่อน Reload
8. **Service Reload**: สั่ง reload Nginx, restart SNMP Exporter, และ Prometheus
9. **Server-Side Health Check**: วนลูป curl ตรวจสอบ `http://127.0.0.1:5001/api/health` จนตอบกลับ 200 OK
10. **Client-Side Verification**: ยิงทดสอบจากภายนอกเพื่อยืนยันความพร้อมใช้งาน

---

## 8. Prometheus & SNMP Exporter Architecture

### Dynamic Single-Job Architecture
ลดภาระ Scrape ของ Switch ด้วยการยุบ Job ให้เหลือ Job เดียว:
* **`blackbox-icmp`**: อ่านเฉพาะ `/etc/prometheus/targets/blackbox/*.yml` ด้วย `module: [icmp]`
* **`snmp`**: อ่านเฉพาะ `/etc/prometheus/targets/snmp/*.yml` โดยใช้ Relabeling ดังนี้:
  * `__address__` ➔ `__param_target` (IP อุปกรณ์)
  * `module` ➔ `__param_module` (เลือกโมดูลตาม Label ของเครื่อง เช่น `cisco_switch`, `aruba_switch`, `if_mib`)
  * `auth` ➔ `__param_auth` (เลือก Auth Profile เช่น `seavl77_v2`)
  * `__param_target` ➔ `instance`
  * `__address__` ➔ `localhost:9116`

### Optimized SNMP Modules (`config/snmp_exporter/snmp_optimized_modules.yml`)
* **`cisco_switch`**:
  * 64-bit HC Interface Traffic (`ifHCInOctets`, `ifHCOutOctets`)
  * Interface Status & Aliases (`ifOperStatus`, `ifAlias`, `ifDescr`)
  * LLDP Neighbors (`lldpRemSysName`, `lldpRemPortDesc`)
  * CDP Neighbors (`cdpCacheDevicePort`, `cdpCachePlatform`)
  * Cisco CPU 5-min (`cpmCPUTotal5minRev` OID: `1.3.6.1.4.1.9.9.109.1.1.1.1.5`)
  * Cisco Memory Pool (`ciscoMemoryPoolUsed`, `ciscoMemoryPoolFree`)
* **`aruba_switch` (HP 2530 / ArubaOS-S)**:
  * Interface Traffic + LLDP
  * HP Switch CPU (`hpSwitchCpuStat` OID: `1.3.6.1.4.1.11.2.14.11.5.1.9.6.1.0`)
  * HP Switch Memory (`hpSwitchMemoryTotal`, `hpSwitchMemoryFree`, `hpSwitchMemoryAllocated`)

---

## 9. Troubleshooting & FAQ (การแก้ไขปัญหาเบื้องต้น)

### 1. หน้าเว็บขึ้นว่า "ไม่มีข้อมูลในช่วงเวลานี้" ในประวัติประสิทธิภาพ (Performance History)
* **สาเหตุ**: Service Backend เพิ่งเริ่มทำงาน หรือยังไม่มีประวัติในแคช
* **วิธีแก้**: Backend มีระบบ Auto-Seed Baseline สดผ่าน SNMP เมื่อเปิด Modal ครั้งแรก หากต้องการตรวจสอบสถานะให้เรียก:
  ```bash
  curl http://localhost:5001/api/devices/<IP>/history?range=1h
  ```

### 2. ตรวจสอบสถานะการทำงานของ Backend
```bash
# ตรวจสอบ Health Endpoint
curl http://localhost:5001/api/health
# ผลลัพธ์: {"status":"ok","backend":"running","port":5001,"timestamp":"...","uptime":...}

# ตรวจสอบสถานะผ่าน PM2
pm2 status netmonitor-backend
pm2 logs netmonitor-backend --lines 50
```

### 3. ตรวจสอบ Nginx และการ Proxy
```bash
# ตรวจสอบความถูกต้องของ Nginx config
sudo nginx -t

# ดู Log เมื่อเกิดปัญหาการเชื่อมต่อ
sudo tail -f /var/log/nginx/error.log
```

### 4. ตรวจสอบ Target Files ที่ถูกสร้างขึ้น
```bash
# ตรวจสอบ Targets สำหรับ ICMP Ping
cat /etc/prometheus/targets/blackbox/netmonitor.yml

# ตรวจสอบ Targets สำหรับ SNMP
cat /etc/prometheus/targets/snmp/netmonitor.yml
```

### 5. คำสั่งสั่ง Reload Services
```bash
# Reload Prometheus
curl -X POST http://localhost:9090/-/reload

# Reload SNMP Exporter
curl -X POST http://localhost:9116/-/reload

# Reload Nginx
sudo systemctl reload nginx
```

---

## 10. Authors & License

* **Project**: SEAVL NetMonitor Enterprise Network Observability
* **License**: MIT License
