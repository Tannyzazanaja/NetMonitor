# คู่มือการแก้ไขปัญหาและการรับมือเหตุฉุกเฉิน (Troubleshooting & Incident Response Playbook)

คู่มือฉบับนี้รวบรวมขั้นตอนการวินิจฉัย Root Cause และวิธีแก้ไขปัญหาที่พบบ่อยในการใช้งานระบบ NetMonitor บนสภาพแวดล้อม Production ไว้อย่างเป็นขั้นตอน เพื่อให้ทีม NOC และผู้ดูแลระบบสามารถกู้คืนระบบได้อย่างรวดเร็ว

---

## ปัญหาที่ 1: Prometheus แจ้ง Target ขัดข้องด้วย `HTTP status 500 Internal Server Error`

### อาการที่พบ (Symptoms):
ในหน้า Target ของ Prometheus (`http://<SERVER>:9090/targets`) อุปกรณ์ในกลุ่ม `job="snmp"` มีสถานะเป็น **DOWN** พร้อมข้อความ:
```
Error scraping target: server returned HTTP status 500 Internal Server Error (Duration: 20.00x s)
```

### สาเหตุเชิงลึก (Technical Root Cause):
`snmp_exporter` ทำงานเป็นตัวกลาง (HTTP Proxy) ในการส่งคำขอ SNMP ผ่าน UDP ไปยังอุปกรณ์ปลายทาง หากไม่ได้รับสัญญาณตอบกลับภายในเวลาที่กำหนด (Timeout ปกติคือ 20 วินาที) หรือได้รับสัญญาณ **ICMP Port Unreachable** จากสวิตช์ `snmp_exporter` จะส่งรหัส HTTP 500 (`Scrape failed: scrape timed out`) กลับมายัง Prometheus

### แผนผังการวินิจฉัย (Diagnostic Flowchart):
```
                    Target ส่งสถานะ HTTP 500
                               │
               ตรวจสอบค่า Scrape Duration ใน Prometheus
                               │
        ┌──────────────────────┴──────────────────────┐
        ▼                                             ▼
  Duration ≈ 20.00 วินาที                       Duration < 0.1 วินาที
(SNMP Request เกิด Timeout)                 (Port Unreachable / ปฏิเสธการเชื่อมต่อ)
        │                                             │
    ทดสอบ ICMP Ping                                   │
    ping <IP_อุปกรณ์>                                  │
        │                                             │
   ┌────┴─────────────────┐                           │
   ▼                      ▼                           ▼
Ping ไม่ผ่าน            Ping ผ่าน               อุปกรณ์ปลายทางไม่ได้เปิด
(สวิตช์ดับ / สายหลุด)    (Community String        Service SNMP บนพอร์ต 161 UDP
   │                    ไม่ตรงกัน)                     │
   ▼                      ▼                           ▼
เปิดเครื่องสวิตช์        ตรวจสอบ Community ใน        เปิดการทำงาน snmpd หรือ
หรือเสียบสายสัญญาณ      สวิตช์เทียบกับ NetMonitor    ตรวจ Access-List (ACL)
```

### ขั้นตอนการแก้ไข:
1. **หาก Ping ไม่ผ่าน:** สวิตช์ปิดอยู่ สายแลน/ไฟเบอร์หลุด หรืออุปกรณ์กำลังรีบูต เมื่อระบบกายภาพฟื้นตัว Target จะกลับมาเป็น **UP** อัตโนมัติ
2. **หาก Ping ผ่านแต่ SNMP Timeout:** ค่า SNMP Community String ใน NetMonitor ไม่ตรงกับที่ตั้งไว้ในสวิตช์
   - ทดสอบส่งคำสั่งสืบค้นตรงจากโฮสต์:
     ```bash
     curl -i "http://127.0.0.1:9116/snmp?target=<SWITCH_IP>&module=if_mib&auth=public_v2"
     ```
   - เข้าหน้าเว็บ NetMonitor ไปที่เมนู **Device Settings** แล้วแก้ไข Community ให้ตรงกับสวิตช์

---

## ปัญหาที่ 2: Target ส่งข้อผิดพลาด `HTTP status 400 Bad Request`

### อาการที่พบ:
ใน Prometheus Target Web UI อุปกรณ์แสดงสถานะ **DOWN** พร้อมข้อความ:
```
server returned HTTP status 400 Bad Request
```

### สาเหตุเชิงลึก:
การเรียกใช้งานระบุชื่อโมดูล (เช่น `module=cisco_switch` หรือ `module=aruba_switch`) ที่ไม่มีการคอมไพล์หรือไม่มีอยู่ในไฟล์ `snmp.yml` ของคอนเทนเนอร์ `snmp_exporter`

### ขั้นตอนการแก้ไข:
1. **สลับไปใช้โมดูลสากลทันที (Zero Downtime):**
   ในหน้า Web UI ของ NetMonitor ให้เปลี่ยนโมดูลของอุปกรณ์ตัวนั้นเป็น **`if_mib`** ซึ่งเป็นโมดูลสากลตามมาตรฐาน RFC 2863 ที่สวิตช์ Managed ทุกรุ่นในโลกต้องรองรับ
2. **รีโหลดคอนฟิกของ SNMP Exporter:**
   หากเพิ่งเพิ่มโมดูลใหม่ลงใน `config/snmp_exporter/snmp_optimized_modules.yml`:
   ```bash
   docker compose restart snmp-exporter
   ```

---

## ปัญหาที่ 3: กราฟ Traffic แสดง `0.00 Mbps` หรือข้อมูลว่างเปล่า (Empty Vectors)

### อาการที่พบ:
คิวรี Prometheus `ifHCInOctets` หรือ `ifHCOutOctets` ส่งค่ากลับมาเป็นอาเรย์ว่างเปล่า (`[]`) หรือหน้า Traffic Dashboard ไม่มีเส้นกราฟแสดงผล

### สาเหตุเชิงลึก:
1. Target ในกลุ่ม `job="snmp"` มีสถานะ Down หรือการยืนยันตัวตนล้มเหลว
2. สวิตช์รุ่นเก่ารองรับเฉพาะ 32-bit SNMP Counter (`ifInOctets`) ไม่รองรับ 64-bit High-Capacity Counter (`ifHCInOctets`)

### ขั้นตอนการแก้ไข:
1. ตรวจสอบจำนวน Metrics ที่ถูกบันทึกเข้ามาในระบบ:
   ```bash
   curl -s 'http://127.0.0.1:9090/api/v1/query?query=ifHCInOctets' | jq '.data.result | length'
   ```
2. ฝั่ง Backend ของ NetMonitor มีระบบ Fallback ไปหา 32-bit อัตโนมัติ:
   ```promql
   sum by (instance) (rate(ifHCInOctets[5m]) or rate(ifInOctets[5m])) * 8 / 1000000
   ```
3. ตรวจสอบว่าพอร์ตของสวิตช์เปิดใช้งานอยู่จริงหรือไม่ (`ifOperStatus == 1`)

---

## ปัญหาที่ 4: Docker แจ้งเตือน Permission Denied ในโฟลเดอร์ `data/`

### อาการที่พบ:
คอนเทนเนอร์ `netmonitor-app` ไม่สามารถเริ่มทำงานได้ หรือแครชพร้อมข้อความ:
```
EACCES: permission denied, open '/app/data/db.json'
```

### สาเหตุเชิงลึก:
คอนเทนเนอร์ NetMonitor รันภายใต้บัญชีความปลอดภัย Non-Root (`netmon`, UID 10001) หากโฟลเดอร์ `data/` บนเครื่องโฮสต์ถูกถือสิทธิ์โดย `root:root` พร้อมสิทธิ์ที่เข้มงวด โปรเซสในคอนเทนเนอร์จะไม่สามารถอ่านหรือเขียนไฟล์ได้

### ขั้นตอนการแก้ไข (บน Linux Host):
```bash
# กำหนดสิทธิ์ให้ตรงกับ UID 10001 ของคอนเทนเนอร์
sudo chown -R 10001:10001 data/
sudo chmod -R 775 data/
```
*(หมายเหตุ: สคริปต์ `deploy.sh` ได้ทำการตั้งค่าสิทธิ์นี้ให้อัตโนมัติแล้วในการติดตั้งครั้งแรก)*

---

## ปัญหาที่ 5: พอร์ต 80 หรือ 443 ชนกับโปรเซสอื่น (Port Collision)

### อาการที่พบ:
คำสั่ง `docker compose up -d` ล้มเหลวพร้อมข้อความ:
```
Bind for 0.0.0.0:80 failed: port is already allocated
```

### สาเหตุเชิงลึก:
มีโปรแกรม Web Server เดิม (เช่น Apache, Nginx ของโฮสต์, IIS หรือ Lighttpd) รันจองพอร์ต 80 หรือ 443 อยู่ก่อนแล้ว

### ขั้นตอนการแก้ไข:
1. ตรวจสอบว่าโปรเซสใดใช้งานพอร์ตอยู่:
   - บน Linux: `sudo ss -tulpn | grep :80`
   - บน Windows: `Get-NetTCPConnection -LocalPort 80 -State Listen`
2. เปลี่ยนพอร์ตสาธารณะในไฟล์ `.env`:
   ```bash
   HTTP_PORT=8080
   HTTPS_PORT=8443
   ```
3. สั่งรันคอนเทนเนอร์ใหม่อีกครั้ง:
   ```bash
   docker compose up -d
   ```
   *ระบบจะเปิดให้เข้าใช้งานผ่าน `http://<SERVER_IP>:8080` ทันที*

---

## ปัญหาที่ 6: Blackbox ICMP Ping ล้มเหลวด้วย `socket: operation not permitted`

### อาการที่พบ:
การ Ping ล้มเหลวทั้งหมด (`probe_success == 0`) สำหรับทุก IP แม้กระทั่ง Gateway

### สาเหตุเชิงลึก:
คอนเทนเนอร์ Docker ไม่มีสิทธิ์เปิด Raw Socket ในการส่งแพ็กเก็ต ICMP

### ขั้นตอนการแก้ไข:
ตรวจสอบว่าในไฟล์ `docker-compose.yml` มีการใส่ `cap_add: [NET_RAW]` ไว้ใต้เซอร์วิส `blackbox-exporter`:
```yaml
blackbox-exporter:
  image: prom/blackbox-exporter:v0.24.0
  cap_add:
    - NET_RAW
```
หากยังพบปัญหาบน Linux โฮสต์ที่มีความเข้มงวดสูง ให้รันคำสั่ง:
```bash
sudo sysctl -w net.ipv4.ping_group_range="0 2147483647"
```

---

## ปัญหาที่ 7: ข้อมูล Prometheus TSDB ใช้พื้นที่ดิสก์สูงเกินไป

### อาการที่พบ:
พื้นที่จัดเก็บข้อมูลบนเครื่องเซิร์ฟเวอร์เต็มอย่างรวดเร็วจากการเก็บ Metrics ถี่เกินไป

### ขั้นตอนการแก้ไข:
1. **ลดระยะเวลาเก็บข้อมูล:** ใน `.env` ปรับ `PROMETHEUS_RETENTION_TIME=15d` (หรือ `30d`)
2. **จำกัดขนาดความจุสูงสุด:** ใน `.env` ตั้ง `PROMETHEUS_RETENTION_SIZE=25GB`
3. **ปรับรอบเวลาดึงข้อมูล:** เพิ่มค่า `PROMETHEUS_SCRAPE_INTERVAL=30s` (หรือ `60s`)
4. รีสตาร์ท Prometheus:
   ```bash
   docker compose restart prometheus
   ```
