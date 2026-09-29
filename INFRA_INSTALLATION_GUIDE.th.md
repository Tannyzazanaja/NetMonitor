# คู่มือการติดตั้งและปรับแต่งโครงสร้างพื้นฐาน Telemetry (Infrastructure Installation Guide)
### Prometheus, SNMP Exporter, Blackbox Exporter และ Grafana

คู่มือฉบับนี้อธิบายขั้นตอนการติดตั้ง การกำหนดค่าความปลอดภัย และการทดสอบระบบ Infrastructure เบื้องหลังของ **NetMonitor** อย่างละเอียด ทั้งแบบคอนเทนเนอร์ (Docker Compose) และแบบติดตั้งตรงบนระบบปฏิบัติการลินุกซ์ (Linux Bare-Metal / Systemd):
* **Prometheus TSDB** (v2.45+): ฐานข้อมูล Time-Series ความเร็วสูง สำหรับจัดเก็บ Metrics และประมวลผลคำสั่ง PromQL
* **Blackbox Exporter** (v0.24+): เซอร์วิสตรวจวัดค่าความหน่วง (Ping Latency), ความพร้อมใช้งาน SLA และสถานะ Up/Down ผ่าน ICMP
* **SNMP Exporter** (v0.24+): พร็อกซีแปลงข้อมูล SNMP จากอุปกรณ์เครือข่ายหลากยี่ห้อมาเป็น Prometheus Metrics
* **Grafana OSS** (v10.2+): เอนจินแสดงผลแดชบอร์ด รองรับการฝังพาเนล (Embed) เข้าสู่ NetMonitor และจัดการสิทธิ์ผู้ใช้ RBAC

---

## สารบัญ (Table of Contents)

1. [สถาปัตยกรรมการไหลของข้อมูล (Telemetry Pipeline)](#1-สถาปัตยกรรมการไหลของข้อมูล-telemetry-pipeline)
2. [วิธีที่ 1: ติดตั้งอัตโนมัติผ่าน Docker Compose (แนะนำสำหรับ Production)](#2-วิธีที่-1-ติดตั้งอัตโนมัติผ่าน-docker-compose-แนะนำสำหรับ-production)
   - [ตารางโครงสร้างเซอร์วิสและ Volume Mappings](#ตารางโครงสร้างเซอร์วิสและ-volume-mappings)
   - [การตั้งค่าตัวแปรในไฟล์ .env](#การตั้งค่าตัวแปรในไฟล์-env)
   - [คำสั่งควบคุมและจัดการคอนเทนเนอร์](#คำสั่งควบคุมและจัดการคอนเทนเนอร์)
3. [วิธีที่ 2: ติดตั้งตรงบนลินุกซ์แบบ Native Systemd (Ubuntu / Debian / RHEL)](#3-วิธีที่-2-ติดตั้งตรงบนลินุกซ์แบบ-native-systemd-ubuntu--debian--rhel)
   - [การสร้าง System Users และโครงสร้างโฟลเดอร์](#31-การสร้าง-system-users-และโครงสร้างโฟลเดอร์)
   - [การติดตั้ง Blackbox Exporter และสิทธิ์ Raw Socket](#32-การติดตั้ง-blackbox-exporter-และสิทธิ์-raw-socket)
   - [การติดตั้ง SNMP Exporter และคอมไพล์โมดูล MIB](#33-การติดตั้ง-snmp-exporter-และคอมไพล์โมดูล-mib)
   - [การติดตั้ง Prometheus TSDB และระบบ Target Directory](#34-การติดตั้ง-prometheus-tsdb-และระบบ-target-directory)
   - [การติดตั้ง Grafana, เปิดสิทธิ์ Embed และต่อ Datasource](#35-การติดตั้ง-grafana-เปิดสิทธิ์-embed-และต่อ-datasource)
4. [การเชื่อมโยง Infrastructure เข้ากับ NetMonitor Core](#4-การเชื่อมโยง-infrastructure-เข้ากับ-netmonitor-core)
5. [ขั้นตอนการทดสอบและวินิจฉัยปัญหา (Verification Playbook)](#5-ขั้นตอนการทดสอบและวินิจฉัยปัญหา-verification-playbook)
   - [การตรวจเช็กสถานะการทำงาน (Health Checks)](#การตรวจเช็กสถานะการทำงาน-health-checks)
   - [ทดสอบยิงโพรบจริง (ICMP Ping และ SNMP Query)](#ทดสอบยิงโพรบจริง-icmp-ping-และ-snmp-query)
   - [ตารางแก้ไขปัญหาที่พบบ่อย](#ตารางแก้ไขปัญหาที่พบบ่อย)

---

## 1. สถาปัตยกรรมการไหลของข้อมูล (Telemetry Pipeline)

```
 [ หน้าเว็บ NetMonitor ] ────────────► [ NetMonitor Backend (Port 5001) ]
                                                    │
                             ┌──────────────────────┴──────────────────────┐
                             │ สร้างไฟล์ Target อัตโนมัติ (file_sd)        │
                             ▼                                             ▼
             /etc/prometheus/targets/blackbox/*.yml        /etc/prometheus/targets/snmp/*.yml
                             │                                             │
                             └──────────────────────┬──────────────────────┘
                                                    │ ดึงข้อมูลตามรอบเวลา (Scrape)
                                                    ▼
                                         [ Prometheus TSDB :9090 ]
                                          • ประมวลผลคำสั่ง PromQL
                                          • เก็บข้อมูล: 30 วัน / 50GB
                                                    │
                        ┌───────────────────────────┴───────────────────────────┐
                        │ ยิงคิวรี /probe?target=X                              │ ยิงคิวรี /snmp?target=X
                        ▼                                                       ▼
           [ Blackbox Exporter :9115 ]                             [ SNMP Exporter :9116 ]
            • ICMP Echo Request (Ping)                              • UDP Port 161 (GET/BULK)
            • วัดค่า Latency และ Up/Down                            • ดึง ifHCInOctets, CPU, Mem
            • ต้องมีสิทธิ์ NET_RAW                                  • ใช้ไฟล์คอนฟิก snmp.yml
                        │                                                       │
                        ▼                                                       ▼
          [ อุปกรณ์เครือข่ายที่ดูแลทั้งหมด ] ◄──────────────────────────────────┘
          Switches, Routers, Firewalls, Servers, Access Points
```

---

## 2. วิธีที่ 1: ติดตั้งอัตโนมัติผ่าน Docker Compose (แนะนำสำหรับ Production)

ชุดแพ็กเกจ Turn-key ของ NetMonitor มีการตั้งค่าคอนเทนเนอร์ทั้ง 4 ตัวไว้พร้อมใช้งานทันทีในไฟล์ `docker-compose.yml`

### ตารางโครงสร้างเซอร์วิสและ Volume Mappings

| เซอร์วิส | Docker Image | พอร์ตบนโฮสต์ (ผูกกับ 127.0.0.1) | โฟลเดอร์ที่ Mount เข้าคอนเทนเนอร์ | พารามิเตอร์สำคัญ |
|---|---|---|---|---|
| **prometheus** | `prom/prometheus:v2.45.3` | `127.0.0.1:9090:9090` | `config/prometheus/prometheus.yml` ➔ `/etc/prometheus/prometheus.yml`<br>`prometheus_targets` ➔ `/etc/prometheus/targets`<br>`prometheus_data` ➔ `/prometheus` | `--storage.tsdb.retention.time=30d`<br>`--storage.tsdb.retention.size=50GB`<br>`--web.enable-lifecycle` |
| **blackbox-exporter** | `prom/blackbox-exporter:v0.24.0` | `127.0.0.1:9115:9115` | `config/prometheus/blackbox.yml` ➔ `/config/blackbox.yml` | `cap_add: [NET_RAW]` (จำเป็นสำหรับการส่ง ICMP) |
| **snmp-exporter** | `prom/snmp-exporter:v0.24.1` | `127.0.0.1:9116:9116` | `config/snmp_exporter/snmp.yml` ➔ `/etc/snmp_exporter/snmp.yml` | โมดูลหลากยี่ห้อ (`cisco_switch`, `aruba_switch`, `if_mib`) |
| **grafana** | `grafana/grafana-oss:10.2.3` | `127.0.0.1:3000:3000` | `grafana_data` ➔ `/var/lib/grafana` | `GF_SECURITY_ALLOW_EMBEDDING=true`<br>`GF_AUTH_ANONYMOUS_ENABLED=true` |

### การตั้งค่าตัวแปรในไฟล์ .env

เซอร์วิส Infrastructure จะดึงค่าคอนฟิกจากไฟล์ `.env` บนเครื่องโฮสต์:

```bash
# กำหนดอายุและขนาดการจัดเก็บข้อมูลของ Prometheus
PROMETHEUS_RETENTION_TIME=30d
PROMETHEUS_RETENTION_SIZE=50GB
PROMETHEUS_SCRAPE_INTERVAL=15s

# พอร์ตภายในของแต่ละเซอร์วิส
PROMETHEUS_PORT=9090
BLACKBOX_EXPORTER_PORT=9115
SNMP_EXPORTER_PORT=9116
GRAFANA_PORT=3000

# ข้อมูลผู้ดูแลระบบและการฝังหน้าจอ Grafana
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=รหัสผ่านGrafanaที่มีความปลอดภัยสูง
GRAFANA_ANONYMOUS_ENABLED=true
```

### คำสั่งควบคุมและจัดการคอนเทนเนอร์

```bash
# 1. สั่งรันคอนเทนเนอร์ทั้งหมดในโหมด Background
docker compose up -d

# 2. ตรวจสอบสถานะการทำงาน
docker compose ps

# 3. ดู Log แบบ Real-Time แยกรายเซอร์วิส
docker compose logs -f prometheus
docker compose logs -f snmp-exporter
docker compose logs -f blackbox-exporter
docker compose logs -f grafana

# 4. สั่งให้ Prometheus โหลดคอนฟิกใหม่โดยไม่ต้องรีสตาร์ทคอนเทนเนอร์
curl -X POST http://127.0.0.1:9090/-/reload
```

---

## 3. วิธีที่ 2: ติดตั้งตรงบนลินุกซ์แบบ Native Systemd (Ubuntu / Debian / RHEL)

สำหรับองค์กรที่ต้องการติดตั้งลงบนเครื่อง Bare-Metal หรือ Virtual Machine โดยตรงโดยไม่ผ่าน Docker

### 3.1 การสร้าง System Users และโครงสร้างโฟลเดอร์

รันคำสั่งด้วยสิทธิ์ `root` หรือ `sudo`:

```bash
# สร้าง Service Accounts ที่ไม่มีสิทธิ์ Login เชลล์
sudo useradd --no-create-home --shell /bin/false prometheus
sudo useradd --no-create-home --shell /bin/false blackbox_exporter
sudo useradd --no-create-home --shell /bin/false snmp_exporter

# สร้างโฟลเดอร์สำหรับเก็บคอนฟิกและไฟล์เป้าหมาย (Targets)
sudo mkdir -p /etc/prometheus/targets/blackbox
sudo mkdir -p /etc/prometheus/targets/snmp
sudo mkdir -p /var/lib/prometheus
sudo mkdir -p /etc/blackbox_exporter
sudo mkdir -p /etc/snmp_exporter

# มอบหมายสิทธิ์ความเป็นเจ้าของให้แต่ละผู้ใช้
sudo chown -R prometheus:prometheus /etc/prometheus /var/lib/prometheus
sudo chown -R blackbox_exporter:blackbox_exporter /etc/blackbox_exporter
sudo chown -R snmp_exporter:snmp_exporter /etc/snmp_exporter
```

---

### 3.2 การติดตั้ง Blackbox Exporter และสิทธิ์ Raw Socket

Blackbox Exporter จำเป็นต้องเปิด Raw Socket เพื่อส่งแพ็กเก็ต ICMP Echo โดยไม่ต้องรันด้วย Root เราจะให้สิทธิ์ผ่านคำสั่ง `setcap cap_net_raw+ep`

1. **ดาวน์โหลดและติดตั้งไบนารี:**
   ```bash
   BB_VERSION="0.24.0"
   curl -LO "https://github.com/prometheus/blackbox_exporter/releases/download/v${BB_VERSION}/blackbox_exporter-${BB_VERSION}.linux-amd64.tar.gz"
   tar -xzf "blackbox_exporter-${BB_VERSION}.linux-amd64.tar.gz"
   sudo cp "blackbox_exporter-${BB_VERSION}.linux-amd64/blackbox_exporter" /usr/local/bin/
   sudo chown blackbox_exporter:blackbox_exporter /usr/local/bin/blackbox_exporter
   rm -rf blackbox_exporter*
   ```

2. **กำหนดสิทธิ์ Raw Socket (สำคัญที่สุด):**
   ```bash
   sudo setcap cap_net_raw+ep /usr/local/bin/blackbox_exporter
   ```
   > [!IMPORTANT]
   > หากไม่รันคำสั่ง `setcap` นี้ การ Ping ตรวจสอบอุปกรณ์จะล้มเหลวทันทีและขึ้นข้อผิดพลาด `socket: operation not permitted`

3. **วางไฟล์คอนฟิก (`/etc/blackbox_exporter/blackbox.yml`):**
   คัดลอกไฟล์ `config/prometheus/blackbox.yml` จาก NetMonitor:
   ```bash
   sudo cp config/prometheus/blackbox.yml /etc/blackbox_exporter/blackbox.yml
   sudo chown blackbox_exporter:blackbox_exporter /etc/blackbox_exporter/blackbox.yml
   sudo chmod 644 /etc/blackbox_exporter/blackbox.yml
   ```

4. **สร้าง Systemd Service (`/etc/systemd/system/blackbox_exporter.service`):**
   ```ini
   [Unit]
   Description=Prometheus Blackbox Exporter
   Wants=network-online.target
   After=network-online.target

   [Service]
   User=blackbox_exporter
   Group=blackbox_exporter
   Type=simple
   ExecStart=/usr/local/bin/blackbox_exporter \
     --config.file=/etc/blackbox_exporter/blackbox.yml \
     --web.listen-address=127.0.0.1:9115
   Restart=always
   RestartSec=5s
   LimitNOFILE=65536

   [Install]
   WantedBy=multi-user.target
   ```

5. **เริ่มการทำงานของ Service:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now blackbox_exporter
   sudo systemctl status blackbox_exporter
   ```

---

### 3.3 การติดตั้ง SNMP Exporter และคอมไพล์โมดูล MIB

1. **ดาวน์โหลดและติดตั้งไบนารี:**
   ```bash
   SNMP_VERSION="0.24.1"
   curl -LO "https://github.com/prometheus/snmp_exporter/releases/download/v${SNMP_VERSION}/snmp_exporter-${SNMP_VERSION}.linux-amd64.tar.gz"
   tar -xzf "snmp_exporter-${SNMP_VERSION}.linux-amd64.tar.gz"
   sudo cp "snmp_exporter-${SNMP_VERSION}.linux-amd64/snmp_exporter" /usr/local/bin/
   sudo chown snmp_exporter:snmp_exporter /usr/local/bin/snmp_exporter
   rm -rf snmp_exporter*
   ```

2. **วางไฟล์คอนฟิก SNMP MIB (`/etc/snmp_exporter/snmp.yml`):**
   คัดลอกไฟล์ `config/snmp_exporter/snmp.yml` จากโปรเจกต์:
   ```bash
   sudo cp config/snmp_exporter/snmp.yml /etc/snmp_exporter/snmp.yml
   sudo chown snmp_exporter:snmp_exporter /etc/snmp_exporter/snmp.yml
   sudo chmod 640 /etc/snmp_exporter/snmp.yml
   ```

3. **สร้าง Systemd Service (`/etc/systemd/system/snmp_exporter.service`):**
   ```ini
   [Unit]
   Description=Prometheus SNMP Exporter
   Wants=network-online.target
   After=network-online.target

   [Service]
   User=snmp_exporter
   Group=snmp_exporter
   Type=simple
   ExecStart=/usr/local/bin/snmp_exporter \
     --config.file=/etc/snmp_exporter/snmp.yml \
     --web.listen-address=127.0.0.1:9116
   Restart=always
   RestartSec=5s
   LimitNOFILE=65536

   [Install]
   WantedBy=multi-user.target
   ```

4. **เริ่มการทำงานของ Service:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now snmp_exporter
   sudo systemctl status snmp_exporter
   ```

---

### 3.4 การติดตั้ง Prometheus TSDB และระบบ Target Directory

1. **ดาวน์โหลดและติดตั้งไบนารี:**
   ```bash
   PROM_VERSION="2.45.3"
   curl -LO "https://github.com/prometheus/prometheus/releases/download/v${PROM_VERSION}/prometheus-${PROM_VERSION}.linux-amd64.tar.gz"
   tar -xzf "prometheus-${PROM_VERSION}.linux-amd64.tar.gz"
   sudo cp "prometheus-${PROM_VERSION}.linux-amd64/prometheus" /usr/local/bin/
   sudo cp "prometheus-${PROM_VERSION}.linux-amd64/promtool" /usr/local/bin/
   sudo chown prometheus:prometheus /usr/local/bin/prometheus /usr/local/bin/promtool
   rm -rf prometheus*
   ```

2. **วางไฟล์คอนฟิก Scrape Configuration (`/etc/prometheus/prometheus.yml`):**
   คัดลอกไฟล์ `config/prometheus/prometheus.yml` จาก NetMonitor และปรับ Hostname ให้ชี้ไปยัง `127.0.0.1`:
   ```bash
   sudo cp config/prometheus/prometheus.yml /etc/prometheus/prometheus.yml
   sudo sed -i 's/blackbox-exporter:9115/127.0.0.1:9115/g' /etc/prometheus/prometheus.yml
   sudo sed -i 's/snmp-exporter:9116/127.0.0.1:9116/g' /etc/prometheus/prometheus.yml
   sudo chown prometheus:prometheus /etc/prometheus/prometheus.yml
   sudo chmod 644 /etc/prometheus/prometheus.yml
   ```

3. **ตรวจสอบความถูกต้องของคอนฟิกด้วย `promtool`:**
   ```bash
   promtool check config /etc/prometheus/prometheus.yml
   # ผลลัพธ์ต้องแสดง: SUCCESS: /etc/prometheus/prometheus.yml is valid
   ```

4. **สร้าง Systemd Service (`/etc/systemd/system/prometheus.service`):**
   ```ini
   [Unit]
   Description=Prometheus Time Series Database
   Wants=network-online.target
   After=network-online.target

   [Service]
   User=prometheus
   Group=prometheus
   Type=simple
   ExecStart=/usr/local/bin/prometheus \
     --config.file=/etc/prometheus/prometheus.yml \
     --storage.tsdb.path=/var/lib/prometheus \
     --storage.tsdb.retention.time=30d \
     --storage.tsdb.retention.size=50GB \
     --web.enable-lifecycle \
     --web.listen-address=127.0.0.1:9090
   ExecReload=/bin/kill -HUP $MAINPID
   Restart=always
   RestartSec=5s
   LimitNOFILE=65536

   [Install]
   WantedBy=multi-user.target
   ```

5. **เริ่มการทำงานของ Service:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now prometheus
   sudo systemctl status prometheus
   ```

---

### 3.5 การติดตั้ง Grafana, เปิดสิทธิ์ Embed และต่อ Datasource

1. **ติดตั้ง Grafana OSS (Ubuntu / Debian):**
   ```bash
   sudo apt-get install -y apt-transport-https software-properties-common wget
   sudo mkdir -p /etc/apt/keyrings/
   wget -q -O - https://apt.grafana.com/gpg.key | gpg --dearmor | sudo tee /etc/apt/keyrings/grafana.gpg > /dev/null
   echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" | sudo tee /etc/apt/sources.list.d/grafana.list
   sudo apt-get update
   sudo apt-get install -y grafana
   ```

   *(สำหรับ RHEL / CentOS / Rocky Linux):*
   ```bash
   sudo tee /etc/yum.repos.d/grafana.repo <<EOF
   [grafana]
   name=grafana
   baseurl=https://rpm.grafana.com
   repo_gpgcheck=1
   enabled=1
   gpgcheck=1
   gpgkey=https://rpm.grafana.com/gpg.key
   sslverify=1
   sslcacert=/etc/pki/tls/certs/ca-bundle.crt
   EOF
   sudo dnf install -y grafana
   ```

2. **ปรับแต่งสิทธิ์การฝังหน้าจอ (`/etc/grafana/grafana.ini`):**
   เปิดไฟล์ `/etc/grafana/grafana.ini` แล้วปรับตั้งค่าดังนี้:
   ```ini
   [security]
   # อนุญาตให้ NetMonitor นำ Dashboard ไปฝังในหน้าเว็บผ่าน iframe ได้
   allow_embedding = true
   admin_user = admin
   admin_password = รหัสผ่านผู้ดูแลระบบGrafana

   [auth.anonymous]
   # อนุญาตให้ผู้ใช้ทั่วไปดูหน้าจอ Dashboard ได้โดยไม่ต้องล็อกอินซ้ำ
   enabled = true
   org_name = Main Org.
   org_role = Viewer

   [users]
   allow_sign_up = false
   auto_assign_org_role = Viewer
   ```

3. **ตั้งค่าให้ต่อ Prometheus Datasource อัตโนมัติ (`/etc/grafana/provisioning/datasources/prometheus.yaml`):**
   ```yaml
   apiVersion: 1
   datasources:
     - name: Prometheus
       type: prometheus
       access: proxy
       url: http://127.0.0.1:9090
       isDefault: true
       editable: false
       jsonData:
         timeInterval: 15s
         httpMethod: POST
   ```

4. **เริ่มการทำงานของ Service:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now grafana-server
   sudo systemctl status grafana-server
   ```

---

## 4. การเชื่อมโยง Infrastructure เข้ากับ NetMonitor Core

ไม่ว่าจะรันผ่าน Docker หรือติดตั้งผ่าน Linux Systemd ตัว NetMonitor Backend จะเชื่อมต่อเข้าหาเซอร์วิสเหล่านี้ผ่านตัวแปรในไฟล์ `.env`:

```bash
# กำหนด URL ไปยังเซอร์วิสต่างๆ
PROMETHEUS_URL=http://127.0.0.1:9090
PROMETHEUS_TARGETS_DIR=/etc/prometheus/targets
BLACKBOX_EXPORTER_URL=http://127.0.0.1:9115
SNMP_EXPORTER_URL=http://127.0.0.1:9116
GRAFANA_URL=http://127.0.0.1:3000

# ความถี่ในการตรวจสอบ
PROMETHEUS_SCRAPE_INTERVAL=15s
```

* **สิทธิ์การเขียนโฟลเดอร์ Targets:** ผู้ใช้ที่รัน Backend ของ NetMonitor ต้องมีสิทธิ์อ่านและเขียน (Write Permission) ในโฟลเดอร์ `PROMETHEUS_TARGETS_DIR/blackbox` และ `PROMETHEUS_TARGETS_DIR/snmp` เพื่อให้ระบบสามารถเพิ่มอุปกรณ์ลงในคิวของ Prometheus ได้ทันที

---

## 5. ขั้นตอนการทดสอบและวินิจฉัยปัญหา (Verification Playbook)

### การตรวจเช็กสถานะการทำงาน (Health Checks)

รันคำสั่งเหล่านี้บนเครื่องโฮสต์เพื่อยืนยันว่าแต่ละเซอร์วิสทำงานปกติ:

```bash
# 1. เช็กความพร้อมของ Prometheus
curl -s http://127.0.0.1:9090/-/healthy
# ผลลัพธ์ที่ถูกต้อง: Prometheus Server is Healthy.

# 2. เช็กความพร้อมของ Blackbox Exporter
curl -s http://127.0.0.1:9115/
# ผลลัพธ์ที่ถูกต้อง: หน้าเว็บ HTML "Blackbox Exporter"

# 3. เช็กความพร้อมของ SNMP Exporter
curl -s http://127.0.0.1:9116/
# ผลลัพธ์ที่ถูกต้อง: หน้าเว็บ HTML "SNMP Exporter"

# 4. เช็กความพร้อมของ Grafana
curl -s http://127.0.0.1:3000/api/health
# ผลลัพธ์ที่ถูกต้อง: {"commit":"...","database":"ok","version":"10.2.3"}
```

---

### ทดสอบยิงโพรบจริง (ICMP Ping และ SNMP Query)

#### ทดสอบยิง ICMP Ping ผ่าน Blackbox Exporter:
```bash
curl -s "http://127.0.0.1:9115/probe?target=8.8.8.8&module=icmp" | grep -E "probe_success|probe_duration_seconds"
```
*ผลลัพธ์ที่ถูกต้อง:*
```
probe_duration_seconds 0.014238
probe_success 1
```

#### ทดสอบสืบค้น SNMP ผ่าน SNMP Exporter:
```bash
# ทดสอบไปยังสวิตช์ IP 192.168.1.1 ด้วย Community 'public'
curl -s "http://127.0.0.1:9116/snmp?target=192.168.1.1&module=if_mib&auth=public_v2" | grep -E "ifHCInOctets|ifOperStatus" | head -n 10
```
*ผลลัพธ์ที่ถูกต้อง:*
```
ifHCInOctets{ifDescr="GigabitEthernet1/0/1",ifIndex="1"} 4928172948
ifOperStatus{ifDescr="GigabitEthernet1/0/1",ifIndex="1"} 1
```

#### ตรวจสอบสถานะ Target ทั้งหมดใน Prometheus:
```bash
curl -s 'http://127.0.0.1:9090/api/v1/targets' | jq '.data.activeTargets[] | {job: .labels.job, instance: .labels.instance, health: .health, lastError: .lastError}'
```

---

### ตารางแก้ไขปัญหาที่พบบ่อย

| ปัญหา / ข้อความแจ้งเตือน | สาเหตุที่แท้จริง (Root Cause) | แนวทางแก้ไข |
|---|---|---|
| `socket: operation not permitted` ตอนทดสอบ Blackbox | ตัวไบนารีบนลินุกซ์ยังไม่ได้รับสิทธิ์ Raw Socket | รันคำสั่ง `sudo setcap cap_net_raw+ep /usr/local/bin/blackbox_exporter`<br>หรือใน Docker ตรวจสอบว่ามี `cap_add: [NET_RAW]` |
| `Scrape failed: scrape timed out` (HTTP 500 บน SNMP) | สวิตช์ปลายทางดับ หรือ Community String ไม่ตรง | เช็กการเชื่อมต่อ Ping ไปยัง IP สวิตช์ และเทียบ Community ระหว่างสวิตช์กับ NetMonitor |
| `Unknown module 'cisco_switch'` (HTTP 400 บน SNMP) | ตัว SNMP Exporter โหลดคอนฟิกเปล่าที่ไม่มีโมดูลของสวิตช์ | คัดลอกไฟล์ `config/snmp_exporter/snmp.yml` จาก NetMonitor ไปทับ แล้วรีสตาร์ทเซอร์วิส |
| `Address already in use` ตอนเปิด Service | พอร์ต 9090, 9115, 9116 หรือ 3000 ชนกับโปรแกรมอื่น | ตรวจสอบโปรเซสด้วย `ss -tulpn \| grep :<PORT>` และเปลี่ยนพอร์ตใน `.env` |
| หน้าจอ Grafana แจ้ง "Refused to display in a frame" | ระบบความปลอดภัยไม่อนุญาตให้นำ Dashboard ไปฝังในหน้าเว็บ | ใส่ `allow_embedding = true` ใต้หมวด `[security]` ใน `/etc/grafana/grafana.ini` |
