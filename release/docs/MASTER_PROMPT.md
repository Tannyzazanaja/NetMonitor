<USER_REQUEST>
# MASTER DEVELOPMENT PROMPT

# Enterprise Network Monitoring Web Application

# Version: V1.1+ Hardening / Refactoring / Release Readiness

คุณคือ Senior Full-Stack Engineer + Network Monitoring Engineer + DevOps Engineer + Security Engineer
หน้าที่ของคุณคือพัฒนา Source Code ของระบบ Enterprise Network Monitoring Web Application รุ่นปัจจุบันให้มีความพร้อมสำหรับ Production/Enterprise Deployment มากขึ้น โดยต้องรักษาความสามารถที่ใช้งานได้ในปัจจุบันทั้งหมด

============================================================

1. CURRENT SYSTEM STATUS
   ============================================================

IMPORTANT:

ระบบ Runtime ปัจจุบันถือว่าใช้งานได้ตามปกติ

ห้ามตั้งสมมติฐานว่า:

* SNMP กำลังเสีย
* Prometheus กำลังเสีย
* Traffic กำลังเสีย
* Topology กำลังเสีย
* Alert กำลังเสีย
* Backend กำลัง crash
* SSE กำลังเสีย

หากพบสิ่งใดใน Source Code ให้แยกให้ชัดเจนว่าเป็น:

A. Current functional bug
B. Technical debt
C. Security weakness
D. Deployment inconsistency
E. Maintainability issue
F. Scalability concern
G. Documentation/Release issue

ห้ามแก้สิ่งที่ไม่ได้เสียเพียงเพราะสามารถ refactor ได้

เป้าหมายหลักคือ:

CURRENT WORKING SYSTEM
↓
HARDEN
↓
STANDARDIZE
↓
TEST
↓
OPTIMIZE
↓
RELEASE-READY

ไม่ใช่:

CURRENT WORKING SYSTEM
↓
REWRITE EVERYTHING

============================================================
2. PROJECT GOALS
================

พัฒนาระบบให้มีคุณสมบัติดังนี้:

1. ทำงานได้เหมือนปัจจุบัน
2. ปลอดภัยขึ้น
3. Configuration สอดคล้องกัน
4. Docker และ Native deployment มี behavior ที่สอดคล้องกัน
5. SNMP configuration มี source of truth ที่ชัดเจน
6. Prometheus configuration มี source of truth ที่ชัดเจน
7. Authentication/RBAC ครอบคลุม API ที่เกี่ยวข้อง
8. Telemetry ไม่เปิดเผยแก่ unauthenticated client โดยไม่จำเป็น
9. Traffic semantics ถูกต้อง
10. No Data และ Zero Mbps แยกจากกัน
11. Traffic polling ไม่ทำงานซ้ำซ้อนเกินจำเป็น
12. Backend maintainability ดีขึ้น
13. Test suite มี real build verification
14. Clean installation สามารถทำได้จาก source repository
15. Generic deployment ไม่มี organization-specific secret/IP/community
16. Deployment สามารถ reproduce ได้
17. มี release/versioning ที่ชัดเจน
18. มี rollback procedure
19. มี health checks
20. มี documentation ที่ตรงกับ implementation จริง

============================================================
3. HARD CONSTRAINTS
===================

ห้าม:

* เปลี่ยนระบบเป็น SaaS
* เปลี่ยนเป็น Multi-Tenant
* เพิ่มองค์กรหลายชุดใน database
* เปลี่ยน database architecture โดยไม่จำเป็น
* เปลี่ยน JSON DB เป็น PostgreSQL เพียงเพื่อ refactor
* รื้อ RBAC ที่ใช้งานได้
* รื้อ Authentication ที่ใช้งานได้
* เปลี่ยน Prometheus เป็นระบบอื่น
* เปลี่ยน SNMP Exporter เป็นระบบอื่น
* ลบ Traffic
* ลบ Topology
* ลบ Analytics
* ลบ Alert
* ลบ SSE
* hardcode network data
* hardcode SNMP community/password
* hardcode organization secrets
* mock telemetry ใน production path
* ใช้ fake traffic data
* ซ่อน error เพื่อให้ UI ดูเหมือนทำงาน
* เพิ่ม retry แบบ unlimited
* เพิ่ม polling frequency โดยไม่มีเหตุผล
* เพิ่ม dependency ขนาดใหญ่โดยไม่มีเหตุผล
* rewrite server.js ทั้งไฟล์ในครั้งเดียว
* เปลี่ยน API contract โดยไม่ทำ compatibility plan
* ทำ breaking change โดยไม่ระบุผลกระทบ
* ลบ test เพราะ test fail
* ลด coverage เพื่อให้ test ผ่าน
* แก้ test ให้ผ่านโดยไม่แก้ implementation จริง

============================================================
4. PHASE 0 — BASELINE AUDIT
===========================

ก่อนแก้ Source Code ให้สร้าง baseline

ตรวจ:

* package.json
* server/package.json
* package-lock.json
* server/package-lock.json
* .env.example
* config/
* data/
* Dockerfile
* docker-compose.yml
* deploy.ps1
* deployment scripts
* nginx configuration
* Prometheus configuration
* SNMP exporter configuration
* frontend services
* backend routes
* backend services
* tests/

สร้างไฟล์:

docs/AUDIT_BASELINE.md

ประกอบด้วย:

* current architecture
* current deployment modes
* current config sources
* current ports
* current services
* current API groups
* current auth model
* current telemetry sources
* current testing model
* known technical debt
* planned changes

ห้ามแก้ implementation ใน Phase นี้

============================================================
5. PHASE 1 — SOURCE OF TRUTH CONFIGURATION
==========================================

เป้าหมาย:

ทำให้ configuration ไม่ซ้ำซ้อนและไม่เกิด drift

ตรวจสอบ:

config/prometheus/
config/snmp_exporter/
config/nginx/
.env
data/
deployment scripts

โดยเฉพาะ:

* Prometheus config
* SNMP exporter config
* target directory
* auth profiles
* SNMP modules

กำหนด source of truth ที่ชัดเจน

แนะนำโครงสร้าง:

config/
├── prometheus/
│   └── prometheus.yml
├── snmp_exporter/
│   └── snmp.yml
└── nginx/
└── netmonitor.conf

ห้ามมี configuration file duplicate ที่ทำให้ผู้ดูแลไม่รู้ว่า file ไหนเป็น authoritative

หากมี duplicate ที่ยังจำเป็นสำหรับ compatibility ให้:

* ระบุว่า deprecated
* ระบุ owner/source of truth
* เพิ่ม comment
* เพิ่ม validation
* ห้ามปล่อยให้สองไฟล์ diverge โดยไม่มี detection

============================================================
6. PHASE 2 — SNMP CONFIGURATION CONSISTENCY
===========================================

ตรวจทุกชื่อ module ที่ถูกอ้างถึงใน:

* snmpMapper.js
* setupPrometheusSnmp.js
* server.js
* .env.example
* docs
* target generator
* snmp config

เปรียบเทียบ:

CODE MODULES
vs
ACTUAL SNMP EXPORTER MODULES

สร้าง validation command/tool:

node scripts/validate-snmp-config.js

ต้องตรวจ:

1. Module exists
2. Auth profile exists
3. Target references valid module
4. Target references valid auth
5. No phantom module
6. No orphaned config
7. No duplicate auth
8. No duplicate target
9. Invalid target IP
10. Invalid YAML

ถ้า module ถูกอ้างจาก code แต่ไม่มีใน exporter config:

ให้ fail validation

============================================================
7. PHASE 3 — AUTH PROFILE CONSISTENCY
=====================================

ทำให้ flow นี้เป็น source of truth เดียว:

Device Configuration
↓
Auth Profile Resolver
↓
SNMP Exporter Auth
↓
Prometheus Target
↓
SNMP Scrape

รองรับ:

* public_v1
* public_v2
* custom SNMP v2c
* future SNMPv3 extension architecture

ต้องตรวจว่า:

resolveAuthProfile()
syncSnmpAuthProfiles()
target generator
snmp.yml

ใช้ naming convention เดียวกัน

ตัวอย่าง:

community:
mycompany

canonical profile:
mycompany_v2

ถ้าต้องรองรับ alias:

auth_mycompany_v2

ให้กำหนด alias mapping อย่างชัดเจน

ห้ามสร้างชื่อ profile หลายรูปแบบโดยไม่มีเหตุผล

============================================================
8. PHASE 4 — SNMP VERSION ABSTRACTION
=====================================

ปัจจุบันบาง path ยังมี behavior แบบ SNMPv2c hardcoded

ให้ตรวจ:

* scanner
* performance polling
* topology discovery
* device test
* setup
* SNMP exporter

ห้ามประกาศว่า:

DEFAULT_SNMP_VERSION=1/2c/3

หาก implementation จริงยังรองรับเฉพาะ 2c

เลือก:

A. implement abstraction ให้ครบ

หรือ

B. document clearly ว่า current release รองรับ 2c only

ไม่สร้าง fake compatibility

หากเพิ่ม abstraction:

create:

server/snmp/
├── client.js
├── versions.js
├── credentials.js
├── polling.js
└── errors.js

============================================================
9. PHASE 5 — SECURE API BOUNDARY
================================

นี่เป็น Priority สูง

Audit ทุก `/api/*`

แบ่ง endpoint เป็น:

PUBLIC
AUTHENTICATED
EDITOR
ADMIN
SYSTEM INTERNAL

สร้าง middleware:

requireAuth()
requireRole()
requireEditor()
requireAdmin()

ห้ามใช้:

frontend hiding
button hiding

เป็น security control

Security ต้องถูก enforce ที่ Backend

ตรวจ endpoints ที่เกี่ยวข้องกับ:

* Prometheus
* Analytics
* Alerts
* Traffic
* Device performance
* History
* SSE
* Settings
* Topology
* Device management

============================================================
10. PHASE 6 — PROMETHEUS PROXY SECURITY
=======================================

หากมี:

/api/prometheus

ห้ามเป็น unrestricted public proxy

ต้อง:

1. Require authentication
2. Validate request
3. Restrict allowed API paths
4. Limit query size
5. Limit time range
6. Limit step
7. Apply request timeout
8. Prevent arbitrary destructive endpoints
9. Add rate limit
10. Prevent query abuse

อย่าให้ browser ส่ง arbitrary PromQL เข้ามาได้อย่างไม่มีข้อจำกัด

หากระบบต้องรองรับ advanced admin PromQL:

ให้สร้าง:

/api/admin/prometheus/query

และ require Admin

ส่วน frontend operational queries ให้ใช้ controlled endpoints

============================================================
11. PHASE 7 — ANALYTICS SECURITY
================================

Audit:

/api/analytics/query_range

หากรับ raw PromQL:

ต้องเพิ่ม:

* authentication
* authorization
* query size limit
* time range limit
* max step constraint
* execution timeout
* rate limit
* error normalization
* audit log

ทางเลือกที่ดีกว่า:

frontend ส่ง:

{
device,
metric,
range,
resolution
}

backend สร้าง PromQL เอง

แทน:

{
query: "arbitrary PromQL"
}

ห้ามสร้าง unrestricted query gateway ให้ Viewer

============================================================
12. PHASE 8 — ALERT SECURITY
============================

ทุก mutation endpoint ต้อง require proper role

เช่น:

POST /api/alerts/acknowledge
POST /api/alerts/unacknowledge
POST /api/alerts/acknowledge-all
POST /api/alerts/clear-history

อย่างน้อย:

Viewer:
read only

Editor:
acknowledge / operational actions

Admin:
configuration/destructive actions

ต้องตรวจ ownership/permission ที่ Backend

ห้ามใช้ frontend condition เป็น security

============================================================
13. PHASE 9 — TELEMETRY + SSE SECURITY
======================================

ตรวจ:

/api/storage/stream/traffic
/api/storage/stream/alerts

และ telemetry endpoints

SSE ต้อง:

1. authenticate
2. authorize
3. send appropriate headers
4. disable buffering
5. send heartbeat
6. clean subscription on disconnect
7. avoid memory leak
8. limit duplicate subscriptions
9. prevent unauthorized stream access

ต้องมี connection lifecycle:

CONNECT
AUTHENTICATE
SUBSCRIBE
HEARTBEAT
DATA
DISCONNECT
CLEANUP

หาก user ไม่ authenticated:

return 401

============================================================
14. PHASE 10 — SETUP STATUS SECURITY
====================================

Audit:

/api/setup/status

ห้าม expose sensitive configuration

ไม่ควร return:

* SNMP community
* password
* token
* secret
* session secret
* internal credential

แทนด้วย:

{
configured: true,
snmpConfigured: true,
prometheusConfigured: true,
grafanaConfigured: true
}

หากต้องแสดง configuration ให้แสดง:

masked value

เช่น:

---

============================================================
15. PHASE 11 — LOGIN SECURITY
=============================

เพิ่ม login rate limiting

ตัวอย่าง policy:

per IP:
5 failed attempts
↓
progressive delay

และ/หรือ:

username + IP tracking

ต้องมี:

429 Too Many Requests

พร้อม Retry-After ตามความเหมาะสม

อย่าทำ lockout ถาวรที่เปิดโอกาส DoS

============================================================
16. PHASE 12 — EMERGENCY ADMIN SECURITY
=======================================

Emergency/Break-Glass account ต้องปลอดภัย

ห้ามใช้ default password เช่น:

emergency@netmon

ใน production runtime

First install ต้อง:

1. generate random secret
2. display only once
3. require password change
4. hash password
5. never store plaintext
6. never log plaintext

เปลี่ยนจาก:

emergencyPassword

เป็น:

passwordHash
passwordSalt

ใช้ password hashing ที่เหมาะสม เช่น:

scrypt / Argon2id / PBKDF2

โดยใช้ Node.js crypto ที่เหมาะสม

============================================================
17. PHASE 13 — SECRET INITIALIZATION
====================================

กำหนด precedence ให้ชัดเจน:

FIRST INSTALL
↓
Environment/bootstrap secret
↓
Database initialization
↓
remove default secret

ห้าม:

.env มี password A
แต่ db.json มี password B

สร้าง:

scripts/initialize-security.js

และให้ idempotent:

รันซ้ำแล้วไม่ reset credential โดยไม่ตั้งใจ

============================================================
18. PHASE 14 — SESSION SECURITY
===============================

ตรวจ session implementation

ปัจจุบัน session memory-based สามารถคงไว้ได้ เพราะระบบเป็น single-instance internal WebApp

แต่ต้อง:

* use cryptographically secure session ID
* HttpOnly cookie
* SameSite
* Secure when HTTPS
* expiration
* logout cleanup
* session regeneration after login
* invalidate old session after privilege change

หากใช้ in-memory session:

ระบุ limitation ใน documentation

ห้ามสร้าง JWT เพียงเพื่อให้ดูเป็น enterprise ถ้าไม่ได้จำเป็น

============================================================
19. PHASE 15 — ENVIRONMENT VARIABLES
====================================

Audit `.env.example`

ทุก variable ต้องจัดเป็น:

USED
DEPRECATED
OPTIONAL
REQUIRED

ห้ามประกาศ variable ที่ code ไม่ได้อ่านจริงโดยไม่มีคำอธิบาย

โดยเฉพาะ:

HOST_BIND
SESSION_SECRET
JWT_SECRET
SNMP_TIMEOUT
SNMP_RETRIES
DEFAULT_SNMP_VERSION
APP_BASE_URL
ALLOWED_ADMIN_CIDR

ถ้ามี:

HOST_BIND=127.0.0.1

แต่ implementation bind:

0.0.0.0

ให้แก้ implementation หรือเอา variable ออก

Preferred:

server.listen(
PORT,
process.env.HOST_BIND || '0.0.0.0'
)

============================================================
20. PHASE 16 — TRAFFIC DATA SEMANTICS
=====================================

Traffic calculation ต้องรักษา:

ifHCInOctets
ifHCOutOctets

เป็น cumulative counters

ใช้:

rate()
หรือ equivalent ที่ถูกต้อง

ตัวอย่าง:

rate(ifHCInOctets[5m]) * 8 / 1000000

ต้องรองรับ:

* counter reset
* reboot
* interface flap
* missing sample
* exporter failure

IMPORTANT:

ต้องแยก:

NO DATA

ออกจาก:

0 Mbps

ห้ามใช้:

vector(0)

เป็น universal fallback ที่ทำให้ missing telemetry กลายเป็น zero

Preferred backend response:

{
status: "no_data"
}

หรือ:

{
status: "ok",
rxMbps: 0,
txMbps: 0
}

ตัวอย่าง:

Metric exists and rate=0
→ 0 Mbps

Metric missing
→ No Data

============================================================
21. PHASE 17 — TRAFFIC ARCHITECTURE
===================================

ปัจจุบันมี:

Backend Polling
+
Frontend Polling
+
SSE

อย่าลบสิ่งใดทันที

ให้ทำ architecture review ก่อน

Preferred target architecture:

Prometheus
↓
Backend Traffic Service
↓
Cache / Shared State
↓
SSE
↓
TrafficView

REST:
สำหรับ initial load / historical queries

SSE:
สำหรับ live updates

Frontend ไม่ควร query Prometheus ซ้ำทุก 10–30 วินาที หาก backend มี live stream ข้อมูลเดียวกันอยู่แล้ว

ต้องลด duplicate Prometheus requests

============================================================
22. PHASE 18 — TRAFFIC UI UNIT CORRECTION
=========================================

ตรวจทุก Traffic component

ให้หน่วยตรงกัน:

bps
Kbps
Mbps
Gbps
B/s
KB/s
MB/s

ห้ามใช้:

value = Mbps

แต่ label = MB/s

สร้าง utility กลาง:

formatTrafficRate(valueBps)

หรือ:

formatTrafficMbps(value)

และใช้ทั่วทั้ง application

============================================================
23. PHASE 19 — TRAFFIC QUERY OPTIMIZATION
=========================================

ห้าม:

1 interface = 1 Prometheus HTTP request

ทำ batch queries เท่าที่เหมาะสม

ใช้:

group_left
sum
max
topk
label matching

เท่าที่จำเป็น

แต่ต้อง:

* รักษา semantic correctness
* ไม่ใช้ PromQL ซับซ้อนโดยไม่มีเหตุผล
* ไม่ query ทุก interface หาก UI ต้องการเฉพาะ top N

เพิ่ม configurable:

TRAFFIC_POLL_INTERVAL
TRAFFIC_CACHE_TTL
TRAFFIC_QUERY_TIMEOUT
TRAFFIC_TOP_N

ค่า default ต้องเหมาะสม

============================================================
24. PHASE 20 — DIRECT SNMP CONCURRENCY
======================================

ตรวจ:

Promise.all()
Promise.allSettled()

โดยเฉพาะ:

performance polling
topology discovery
scanner

ห้ามยิง SNMP พร้อมกันแบบ unlimited

สร้าง:

SNMP_CONCURRENCY_LIMIT

default:

5

หรือค่าที่เหมาะสมกับ current architecture

ต้องรองรับ:

queue
timeout
retry
partial failure

หาก device 1 ตัว timeout:

device อื่นต้องยังทำงานต่อ

============================================================
25. PHASE 21 — BACKEND MODULARIZATION
=====================================

ห้าม rewrite server.js ทั้งไฟล์

ให้ refactor incremental

ปัจจุบัน `server.js` มีหลาย subsystem มากเกินไป

เป้าหมาย:

server/
├── server.js
├── routes/
│   ├── auth.js
│   ├── devices.js
│   ├── traffic.js
│   ├── alerts.js
│   ├── analytics.js
│   ├── topology.js
│   └── settings.js
│
├── services/
│   ├── prometheus.js
│   ├── snmp.js
│   ├── traffic.js
│   ├── alert.js
│   ├── analytics.js
│   └── topology.js
│
├── middleware/
│   ├── auth.js
│   ├── rateLimit.js
│   └── validation.js
│
└── config/

เริ่มจาก:

traffic
prometheus
auth
alerts

ก่อน

ทุก step ต้องผ่าน test suite

============================================================
26. PHASE 22 — DEVICE SCHEMA VALIDATION
=======================================

สร้าง centralized validation:

validateDevice()
validateDeviceUpdate()
validateSettings()

ต้องตรวจ:

name
ip
vendor
type
location
module
auth
SNMP version

IP ต้องเป็น valid IPv4/IPv6 ตาม scope ที่รองรับ

ห้ามปล่อย malformed YAML/target

Sanitize:

* CR
* LF
* quote
* control chars

ก่อน generate YAML

============================================================
27. PHASE 23 — PROMETHEUS TARGET VALIDATION
===========================================

สร้าง:

scripts/validate-prometheus-targets.js

ตรวจ:

* target IP
* job
* module
* auth
* duplicate
* missing labels
* malformed target
* invalid exporter URL

Expected flow:

Device DB
↓
Generator
↓
Validator
↓
YAML
↓
Prometheus

หาก validation fail:

อย่า reload Prometheus

============================================================
28. PHASE 24 — SETUP SCRIPT CORRECTION
======================================

ตรวจ:

server/setupPrometheusSnmp.js

ห้ามอ้าง:

prometheus_redesign.yml

หาก repository current source of truth คือ:

config/prometheus/prometheus.yml

ทุก path ต้องมาจาก central configuration

Preferred:

PROMETHEUS_CONFIG_PATH

PROMETHEUS_TARGETS_DIR

SNMP_EXPORTER_CONFIG_PATH

BLACKBOX_TARGETS_DIR

ต้องรองรับ Docker และ Native

============================================================
29. PHASE 25 — DOCKER/NATIVE CONSISTENCY
========================================

ระบบต้องรองรับ:

A. Docker
B. Native Linux

Behavior ต้องเทียบเท่ากันสำหรับ:

* device management
* SNMP auth
* SNMP modules
* Prometheus targets
* traffic
* alerts
* topology
* settings

โดยเฉพาะ custom SNMP community

ต้องสามารถ:

Docker Backend
↓
configure SNMP auth
↓
SNMP Exporter container
↓
scrape device

ได้จริง

ห้ามให้:

public/default SNMP

ทำงาน แต่ custom SNMP

ทำงานไม่ได้

============================================================
30. PHASE 26 — DOCKER VOLUME PERMISSIONS
========================================

ตรวจทุก mounted volume

โดยเฉพาะ:

/etc/prometheus/targets

ตรวจ:

UID
GID
read
write
execute

ให้ NetMonitor process มีสิทธิ์ที่จำเป็นเท่านั้น

ไม่ใช้ chmod 777

สร้าง startup validation:

canWriteTargetDirectory()

หากเขียนไม่ได้:

startup error แบบเข้าใจได้

ไม่ fail เงียบ

============================================================
31. PHASE 27 — DEPLOYMENT SCRIPT
================================

ตรวจ:

deploy.ps1
deploy.sh
Dockerfile
docker-compose.yml

ให้ deployment package ประกอบด้วย:

application
config
migration
templates
docs

แต่ไม่รวม:

node_modules
.git
runtime secrets
local cache
organization-specific secrets

Native deployment ต้อง sync:

* application
* configuration
* package files
* required migration
* required exporter config
* required Prometheus targets structure

ห้าม deploy เฉพาะ `dist` แล้วคิดว่า production state สมบูรณ์

============================================================
32. PHASE 28 — RELEASE PACKAGE
==============================

สร้าง:

release/
├── app/
├── config/
├── deploy/
├── docs/
├── scripts/
├── .env.example
├── README.md
├── INSTALLATION.md
├── ADMIN_GUIDE.md
└── DEVELOPER_GUIDE.md

ห้าม bundle:

node_modules
.git
secrets
logs
runtime database
temporary caches

หากต้องการ `dist`:

ให้ build ตอน release

============================================================
33. PHASE 29 — VERSIONING
=========================

ทำ version ให้สอดคล้องกัน

Root package:
1.1.0

Backend:
1.1.0

Git tag:
v1.1.0

Release documentation:
V1.1.0

ห้ามมี:

root 0.0.0
backend 1.0.0
documentation V1.5

พร้อมกัน

สร้าง:

CHANGELOG.md

รูปแบบ:

Added
Changed
Fixed
Security
Deprecated
Removed

============================================================
34. PHASE 30 — BUILD VERIFICATION
=================================

แก้ test suite ที่ตรวจเพียงว่า dist มีอยู่

ต้องให้ CI/Release test รันจริง:

npm ci
npm run lint
npm run build
npm test

ถ้า root และ server แยก package:

cd server
npm ci
npm test

แล้ว:

cd ..
npm run build

ห้ามถือว่า:

dist/index.html exists

เท่ากับ build success

============================================================
35. PHASE 31 — CLEAN INSTALL TEST
=================================

สร้าง automated clean-install scenario:

1. fresh directory
2. clone source
3. npm ci
4. configuration bootstrap
5. generate config
6. start services
7. health check
8. login
9. add device
10. generate Prometheus targets
11. verify Prometheus
12. verify SNMP exporter
13. verify Traffic
14. verify Alerts
15. verify Topology
16. verify Analytics
17. verify SSE

ต้องสามารถทำซ้ำได้

============================================================
36. PHASE 32 — LIVE E2E MONITORING TEST
=======================================

Unit test ไม่เพียงพอ

สร้าง test mode สำหรับ:

REAL NETWORK DEVICE

flow:

Network Device
↓
UDP/161
↓
SNMP Exporter
↓
Prometheus
↓
ifHCInOctets
ifHCOutOctets
↓
rate()
↓
Backend
↓
Traffic API
↓
SSE/Frontend

Test ต้องตรวจ:

* SNMP target UP
* ifHCInOctets exists
* ifHCOutOctets exists
* interface labels
* traffic rate
* CPU
* memory
* uptime
* alert
* topology where supported

Credential ต้องมาจาก environment

ห้าม hardcode IP/community

============================================================
37. PHASE 33 — TEST DEVICE CONFIGURATION
========================================

ไฟล์:

tests/test_snmp_device.cjs

ห้าม hardcode:

IP
community
password

ให้ใช้ environment:

TEST_SNMP_TARGET
TEST_SNMP_COMMUNITY
TEST_SNMP_VERSION
TEST_SNMP_MODULE

หาก environment ไม่พร้อม:

SKIP WITH REASON

ไม่ใช่ FAIL แบบ misleading

============================================================
38. PHASE 34 — TEST COVERAGE
============================

เพิ่ม test สำหรับ:

Security
├── unauthenticated Prometheus
├── unauthenticated Analytics
├── unauthenticated Alerts
├── unauthenticated SSE
├── role boundaries
├── login rate limit
└── setup secret exposure

Configuration
├── invalid module
├── invalid auth
├── duplicate target
├── invalid YAML
└── config drift

Traffic
├── normal
├── zero traffic
├── no data
├── counter reset
├── missing sample
└── fallback metric

Deployment
├── Docker
├── Native
├── clean install
└── restart/recovery

============================================================
39. PHASE 35 — API CONTRACT
===========================

จัด API response ให้มี schema สม่ำเสมอ

Success:

{
"success": true,
"data": ...
}

Error:

{
"success": false,
"error": {
"code": "...",
"message": "...",
"details": ...
}
}

ห้ามเปลี่ยน frontend/backend contract โดยไม่มี migration

Error codes ควรมี:

AUTH_REQUIRED
FORBIDDEN
INVALID_REQUEST
NOT_FOUND
SNMP_ERROR
PROMETHEUS_ERROR
NO_DATA
CONFIG_ERROR
INTERNAL_ERROR

============================================================
40. PHASE 36 — HEALTH CHECKS
============================

เพิ่ม:

GET /api/health

และถ้าเหมาะสม:

GET /api/health/deep

Health:

* backend
* database
* Prometheus
* SNMP exporter
* Blackbox exporter

แยก:

Liveness
Readiness
Dependency health

อย่าให้ dependency ตัวเดียวทำให้ backend liveness เป็น DOWN หาก backend ยังทำงานได้

============================================================
41. PHASE 37 — OBSERVABILITY OF THE MONITORING SYSTEM
=====================================================

Backend ต้อง log:

request ID
route
duration
status
error code

Traffic:

device
metric
duration
result count

SNMP:

target
module
status
duration
error category

ห้าม log:

community
password
token
cookie
authorization
session secret

ใช้:

<REDACTED>

============================================================
42. PHASE 38 — ERROR CLASSIFICATION
===================================

สร้าง error classes:

SnmpTimeoutError
SnmpAuthError
SnmpUnavailableError
PrometheusTimeoutError
PrometheusQueryError
ConfigValidationError
AuthorizationError
ValidationError

แล้ว map HTTP status ให้เหมาะสม

เช่น:

401
403
400
404
408
409
422
429
500
502
503

อย่าส่งทุกอย่างเป็น 500

============================================================
43. PHASE 39 — PARTIAL FAILURE
==============================

Monitoring system ต้อง graceful degradation

ตัวอย่าง:

Device A = UP
Device B = SNMP timeout
Device C = UP

ผล:

A → data
B → no data
C → data

ห้าม:

A + B + C
↓
whole monitoring failure

Topology ก็ต้องใช้หลักการเดียวกัน

Analytics ก็ต้องรองรับ partial data

Traffic ก็ต้องรองรับ partial interface data

============================================================
44. PHASE 40 — CACHE POLICY
===========================

ตรวจ cache ทุก subsystem

ต้องกำหนด:

cache key
TTL
max size
invalidation
stale behavior

โดยเฉพาะ:

Analytics
Traffic
Device performance
Topology

ห้าม cache secret หรือ credential

============================================================
45. PHASE 41 — FRONTEND QUALITY
===============================

ตรวจ:

loading state
empty state
error state
stale state
no-data state

UI ต้องไม่แสดง:

0

หากจริง ๆ ไม่มีข้อมูล

ต้องแยก:

Loading
No Data
Error
Offline
Zero
Stale

Traffic UI ต้องใช้หน่วยที่ถูกต้อง

และ formatter กลาง

============================================================
46. PHASE 42 — REMOVE ORGANIZATION-SPECIFIC DATA
================================================

Source release ต้องไม่ hardcode:

organization name
company logo
company address
internal IP
SNMP community
real password
real Grafana URL
real Prometheus URL
real notification endpoint

ยกเว้น:

example/template

เช่น:

192.0.2.0/24
198.51.100.0/24
example.local

ใช้ documentation-safe placeholders ตามความเหมาะสม

============================================================
47. PHASE 43 — DOCUMENTATION AUDIT
==================================

ตรวจ:

README.md
README.th.md
INSTALLATION.md
ADMIN_GUIDE.md
DEVELOPER_GUIDE.md

ให้ทุกคำสั่งตรงกับ implementation จริง

เพิ่ม:

CHANGELOG.md
RELEASE_NOTES.md
MIGRATION.md
TROUBLESHOOTING.md
SECURITY.md
ARCHITECTURE.md

ต้องบอก:

Docker installation
Native installation
Configuration
SNMP setup
Prometheus setup
Grafana setup
Backup
Restore
Upgrade
Rollback
Emergency access
Security considerations

============================================================
48. PHASE 44 — CI/CD
====================

เพิ่ม CI pipeline ตามความเหมาะสม:

1. install
2. lint
3. build
4. unit test
5. integration test
6. security checks
7. artifact packaging

pipeline ต้อง fail หาก:

* build fail
* test fail
* lint critical fail
* config validation fail
* secret scanning fail

============================================================
49. PHASE 45 — SECRET SCANNING
==============================

ตรวจ repository ทั้งหมดหา:

* password
* community
* token
* API key
* private IP
* hardcoded credentials
* JWT secret
* session secret

สร้าง:

scripts/security-scan.js

หรือใช้ scanner ที่เหมาะสม

False positives ต้อง whitelist อย่างชัดเจน

ห้ามลบ secret เพียงจาก test แล้วทำให้ test ใช้งานจริงไม่ได้

ใช้ environment injection

============================================================
50. PHASE 46 — SERVER.JS REFACTOR STRATEGY
==========================================

ห้าม rewrite server.js ครั้งเดียว

แบ่งเป็น incremental PR/task:

Task A:
extract auth

Task B:
extract traffic

Task C:
extract prometheus

Task D:
extract alerts

Task E:
extract analytics

Task F:
extract topology

หลังแต่ละ task:

npm test

และ API regression test

server.js ควรกลายเป็น:

bootstrap
middleware
route registration
startup
shutdown

ไม่ควรเป็น business logic 3,000+ lines

============================================================
51. PHASE 47 — GRACEFUL SHUTDOWN
================================

เพิ่ม:

SIGTERM
SIGINT

shutdown sequence:

1. stop accepting requests
2. stop polling
3. close SSE
4. flush critical state
5. close file/database resources
6. exit

ต้องไม่:

* corrupt db.json
* leave stale locks
* leave orphan timers
* leave open sockets

============================================================
52. PHASE 48 — STARTUP VALIDATION
=================================

เมื่อ server start:

validate:

* environment
* config
* directories
* database
* Prometheus URL
* SNMP exporter URL
* target directories
* write permissions

ถ้า configuration ผิด:

ต้องแจ้ง error ชัดเจน

ไม่ควร:

start successfully
แต่ feature หลักใช้งานไม่ได้

============================================================
53. PHASE 49 — BACKUP / RESTORE
===============================

รักษา JSON database architecture ปัจจุบัน

เพิ่ม:

backup
restore
validation
atomic restore

Backup ต้องไม่รวม:

* passwords plaintext
* environment secrets
* transient cache
* session state

Restore ต้อง validate schema ก่อน replace database

============================================================
54. PHASE 50 — PERFORMANCE TEST
===============================

Benchmark:

50 devices
100 devices
300 devices

วัด:

* memory
* CPU
* API latency
* Prometheus query latency
* SNMP exporter load
* number of requests
* SSE connections
* topology render
* analytics response
* traffic response

อย่า optimize ด้วย intuition

ใช้ measurement

============================================================
55. PHASE 51 — SECURITY REGRESSION
==================================

ต้องทดสอบ:

Unauthenticated:
→ protected endpoint = 401

Viewer:
→ read = allowed
→ destructive write = 403

Editor:
→ operational action = allowed
→ admin action = 403

Admin:
→ administrative action = allowed

Prometheus query abuse:
→ rejected

Rate limit:
→ activated

Sensitive setup:
→ secret absent

Cookie:
→ HttpOnly
→ Secure when HTTPS

============================================================
56. PHASE 52 — DEPLOYMENT MATRIX
================================

สร้างตาราง:

| Feature            | Docker | Native |
| ------------------ | ------ | ------ |
| Login              | PASS   | PASS   |
| RBAC               | PASS   | PASS   |
| Device CRUD        | PASS   | PASS   |
| SNMP v2c           | PASS   | PASS   |
| Custom SNMP Auth   | PASS   | PASS   |
| Prometheus Targets | PASS   | PASS   |
| Traffic            | PASS   | PASS   |
| Alerts             | PASS   | PASS   |
| Topology           | PASS   | PASS   |
| Analytics          | PASS   | PASS   |
| SSE                | PASS   | PASS   |
| Backup             | PASS   | PASS   |
| Restore            | PASS   | PASS   |

ห้าม mark PASS โดยไม่มี test evidence

============================================================
57. PHASE 53 — RELEASE GATE
===========================

Release candidate ต้องผ่านทั้งหมด:

[ ] npm ci
[ ] npm run lint
[ ] npm run build
[ ] npm test
[ ] config validation
[ ] SNMP config validation
[ ] target validation
[ ] secret scan
[ ] security regression
[ ] clean install
[ ] Docker test
[ ] Native test
[ ] E2E telemetry test
[ ] Traffic test
[ ] Alert test
[ ] Topology test
[ ] Analytics test
[ ] SSE test
[ ] restart test
[ ] backup test
[ ] restore test

หากไม่ผ่านข้อใด:

ห้ามประกาศ Release Ready

============================================================
58. PHASE 54 — CHANGE CONTROL
=============================

ก่อนแก้แต่ละ subsystem ให้ระบุ:

CURRENT BEHAVIOR
EXPECTED BEHAVIOR
WHY CHANGE
RISK
FILES AFFECTED
TESTS AFFECTED
ROLLBACK PLAN

ห้ามทำ broad refactor โดยไม่จำเป็น

============================================================
59. REQUIRED OUTPUT FROM CODING AGENT
=====================================

เมื่อทำงานแต่ละ Phase เสร็จ ต้องรายงาน:

PHASE:
STATUS:

FILES CHANGED:

* ...

FILES ADDED:

* ...

FILES REMOVED:

* ...

ARCHITECTURE CHANGES:

* ...

SECURITY CHANGES:

* ...

CONFIG CHANGES:

* ...

TESTS:

* ...

COMMANDS RUN:

* ...

RESULT:
PASS / FAIL

REGRESSION:
NONE / FOUND

REMAINING RISKS:

* ...

============================================================
60. FINAL AUDIT REPORT
======================

หลังทำเสร็จ ให้สร้าง:

docs/FINAL_AUDIT.md

โดยมี:

1. Architecture
2. Security
3. Configuration
4. Deployment
5. Performance
6. Testing
7. Traffic
8. SNMP
9. Prometheus
10. SSE
11. Topology
12. Analytics
13. Alerts
14. Documentation
15. Backup/Restore
16. Release readiness
17. Remaining technical debt

============================================================
61. FINAL ACCEPTANCE CRITERIA
=============================

ถือว่างานเสร็จเมื่อ:

FUNCTIONAL

[ ] Current features still work
[ ] Traffic still works
[ ] SNMP still works
[ ] Prometheus still works
[ ] Topology still works
[ ] Analytics still works
[ ] Alerts still work
[ ] SSE still works
[ ] Authentication still works
[ ] RBAC still works

SECURITY

[ ] Protected API authenticated
[ ] Role boundaries enforced
[ ] Prometheus proxy protected
[ ] Analytics query protected
[ ] Alert mutations protected
[ ] SSE protected
[ ] Sensitive setup data hidden
[ ] Emergency password hashed
[ ] No default production password
[ ] Login rate limiting
[ ] Secret scan clean

CONFIGURATION

[ ] Source of truth defined
[ ] No phantom modules
[ ] No invalid auth profiles
[ ] Docker/native consistent
[ ] Target validation
[ ] YAML validation
[ ] Environment variables documented

TRAFFIC

[ ] HC counters supported
[ ] Rate calculation correct
[ ] No Data != 0 Mbps
[ ] Units correct
[ ] No query explosion
[ ] Backend/Frontend polling optimized

DEPLOYMENT

[ ] Clean install
[ ] Docker install
[ ] Native install
[ ] Upgrade
[ ] Rollback
[ ] Backup
[ ] Restore

QUALITY

[ ] npm run build PASS
[ ] npm test PASS
[ ] lint PASS
[ ] security scan PASS
[ ] E2E PASS
[ ] no critical regression

============================================================
62. MOST IMPORTANT DEVELOPMENT PRINCIPLE
========================================

Do NOT judge success by:

"the application starts"

Do NOT judge success by:

"npm test passed"

Do NOT judge success by:

"UI looks normal"

Success means:

SOURCE CODE
+
CONFIGURATION
+
SECURITY
+
DEPLOYMENT
+
LIVE TELEMETRY
+
TESTING

all behave consistently

The final system should be:

Stable
Secure
Maintainable
Observable
Deployable
Reproducible
Generic
Enterprise-ready

without changing the fundamental identity of the application.

============================================================
63. EXECUTION ORDER
===================

Execute in this order:

PHASE 0
Baseline Audit

PHASE 1
Configuration Source of Truth

PHASE 2
SNMP Module/Auth Consistency

PHASE 3
Security API Boundary

PHASE 4
Emergency Credential Hardening

PHASE 5
Prometheus/Analytics Security

PHASE 6
Traffic Semantics and Optimization

PHASE 7
Deployment Consistency

PHASE 8
Device/SNMP Concurrency

PHASE 9
Build/Test/Clean Install

PHASE 10
E2E Monitoring Test

PHASE 11
Incremental Backend Refactoring

PHASE 12
Documentation

PHASE 13
Release Candidate

Do NOT start with large-scale refactoring.

Security and configuration consistency come first.

============================================================
64. FINAL RULE
==============

The existing application is already functional.

Treat the current codebase as a working production baseline.

Every change must satisfy:

"Improve the system without breaking what already works."

When uncertain:

1. inspect
2. measure
3. test
4. change minimally
5. verify
6. document

Never:

assume → rewrite → hope

Always:

inspect → identify → patch → test → verify

</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-10-02T09:27:15+07:00.
</ADDITIONAL_METADATA>