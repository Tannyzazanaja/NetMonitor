# คู่มือการติดตั้งและใช้งาน GitLab CI/CD ด้วย Docker Compose (NetMonitor Enterprise)

> **สถาปัตยกรรมโครงสร้างระบบ (แบบ Universal):**
> - **GitLab Server:** `<GITLAB_SERVER_IP>` *(ติดตั้ง GitLab และ GitLab Runner ด้วย Docker Compose)*
> - **Production Server:** `<PROD_SERVER_IP>` *(ติดตั้ง NetMonitor Stack ด้วย Docker Compose)*

---

## 1. แผนผังการทำงาน (Architecture & Flow)

```
[ Developer / Admin ]
        │  (git push origin main)
        ▼
┌────────────────────────────────────────────────────────┐
│  GitLab Server: <GITLAB_SERVER_IP>                     │
│  ├─ docker-compose.gitlab-full.yml                     │
│  │   ├─ Service 1: gitlab-ce (GitLab Web & Repo)       │
│  │   └─ Service 2: gitlab-runner (CI/CD Engine)        │
│  │       │                                             │
│  │       ├─ [Stage 1: Test]   Node.js Container        │
│  │       ├─ [Stage 2: Build]  Vite Build -> dist/      │
│  │       └─ [Stage 3: Deploy] Alpine SSH & Rsync       │
└───────────────────────┬────────────────────────────────┘
                        │  SSH & Rsync (Private Key)
                        ▼
┌────────────────────────────────────────────────────────┐
│  Production Server: <PROD_SERVER_IP>                   │
│  ├─ docker-compose.yml (NetMonitor Enterprise Stack)   │
│  │   ├─ netmonitor-nginx (Port 80 / 443 Ingress)       │
│  │   ├─ netmonitor-app (Node.js REST API & SSE)        │
│  │   ├─ netmonitor-prometheus (TSDB Metrics)           │
│  │   ├─ netmonitor-snmp-exporter (SNMP Collector)      │
│  │   └─ netmonitor-blackbox-exporter (ICMP Ping)       │
│  └─ [Stage 4: Verify]: curl /api/health ตอบกลับ 200 OK │
└────────────────────────────────────────────────────────┘
```

---

## 2. ขั้นตอนที่ 1: การติดตั้งบนเครื่อง GitLab Server ด้วย Docker Compose

ในโฟลเดอร์ `deploy/` ได้จัดเตรียมไฟล์ Docker Compose ไว้ให้ 2 รูปแบบ เลือกใช้ตามความเหมาะสม:

### รูปแบบ A: ติดตั้งทั้ง GitLab CE + GitLab Runner ครบชุด (แนะนำ)
ใช้ไฟล์ `deploy/docker-compose.gitlab-full.yml`:

```bash
# 1. สร้างไดเรกทอรีสำหรับเก็บข้อมูลถาวรบนโฮสต์
sudo mkdir -p /srv/gitlab/config /srv/gitlab/logs /srv/gitlab/data /srv/gitlab-runner/config

# 2. สั่งรันทั้ง GitLab CE และ Runner ขึ้นมาพร้อมกัน
docker compose -f deploy/docker-compose.gitlab-full.yml up -d
```

### รูปแบบ B: มี GitLab รันอยู่แล้ว ต้องการเพิ่มเฉพาะ GitLab Runner
ใช้ไฟล์ `deploy/docker-compose.gitlab-runner.yml`:

```bash
sudo mkdir -p /srv/gitlab-runner/config
docker compose -f deploy/docker-compose.gitlab-runner.yml up -d
```

---

## 3. ขั้นตอนที่ 2: ลงทะเบียน Runner (Registration)

เมื่อ Container รันเรียบร้อยแล้ว ให้สั่ง Register ภายใน Container:

```bash
docker exec -it gitlab-runner gitlab-runner register
```

ระบบจะถามคำถาม ให้กรอกตามนี้:
1. **GitLab instance URL:** `http://<GITLAB_SERVER_IP>/` *(ระบุ URL หรือ IP ของเครื่องโฮสต์ GitLab)*
2. **Registration token:** คัดลอกจากหน้าเว็บ GitLab (**Settings ➔ CI/CD ➔ Runners**)
3. **Description:** `netmonitor-docker-runner`
4. **Tags:** `docker, production`
5. **Executor:** พิมพ์ **`docker`**
6. **Default Docker image:** พิมพ์ **`node:20-bookworm-slim`**

### ⚠️ การตั้งค่า Network ป้องกัน Runner หา GitLab ไม่เจอ
เปิดไฟล์ `/srv/gitlab-runner/config/config.toml` บนโฮสต์:
```bash
sudo nano /srv/gitlab-runner/config/config.toml
```
ตรวจสอบให้มีบรรทัด `clone_url` และ `volumes`:
```toml
[[runners]]
  name = "netmonitor-docker-runner"
  url = "http://<GITLAB_SERVER_IP>/"
  token = "glrt-xxxxxxxxxxxxxxxxxxxx"
  executor = "docker"
  clone_url = "http://<GITLAB_SERVER_IP>/"   # <--- จุดสำคัญ: เพื่อให้ Runner clone โค้ดผ่าน IP โฮสต์ได้
  [runners.docker]
    tls_verify = false
    image = "node:20-bookworm-slim"
    volumes = ["/var/run/docker.sock:/var/run/docker.sock", "/cache"]
```
บันทึกแล้วสั่ง: `docker restart gitlab-runner`

---

## 4. ขั้นตอนที่ 3: การสร้างและติดตั้ง SSH Key

รันคำสั่งบนเครื่องคอมพิวเตอร์ของคุณ หรือเครื่อง GitLab Server (`<GITLAB_SERVER_IP>`):

```bash
# สร้าง SSH Key แบบ Ed25519
ssh-keygen -t ed25519 -C "gitlab-ci@<GITLAB_SERVER_IP>" -f ./gitlab_deploy_key -N ""

# ส่ง Public Key ไปติดตั้งบน Production Server (<PROD_SERVER_IP>)
ssh-copy-id -i ./gitlab_deploy_key.pub <PROD_SSH_USER>@<PROD_SERVER_IP>
```

---

## 5. ขั้นตอนที่ 4: ตั้งค่าตัวแปรใน GitLab CI/CD Variables

เปิดหน้าเว็บ GitLab `http://<GITLAB_SERVER_IP>/` ➔ **Settings** ➔ **CI/CD** ➔ **Variables** ➔ **Add variable**:

| Key | Type | Value แนะนำ | คำอธิบาย |
| :--- | :---: | :--- | :--- |
| `SSH_PRIVATE_KEY` | Variable หรือ File | เนื้อหาทั้งหมดในไฟล์ `gitlab_deploy_key` | กุญแจลับสำหรับเชื่อมต่อ SSH เข้า Production Server |
| `PROD_SERVER_IP` | Variable | ระบุ IP ของเครื่อง Production ของคุณ เช่น `192.168.x.x` | IP เซิร์ฟเวอร์ปลายทาง |
| `PROD_SSH_USER` | Variable | `root` หรือ User ที่มีสิทธิ์ | บัญชีผู้ใช้ SSH บน Production Server |
| `PROD_APP_DIR` | Variable | `/var/www/netmonitor-react` | พาธไดเรกทอรีที่ติดตั้งระบบบน Production |

---

## 6. ขั้นตอนที่ 5: การติดตั้ง NetMonitor บน Production Server ด้วย Docker Compose

บนเครื่อง **Production Server (`<PROD_SERVER_IP>`)**:

```bash
# 1. สร้างโฟลเดอร์สำหรับโปรเจกต์
mkdir -p /var/www/netmonitor-react/data
cd /var/www/netmonitor-react

# 2. คัดลอก .env.example มาเป็น .env และกำหนดค่าพื้นฐาน
# (เมื่อ CI/CD ทำงาน ระบบจะ sync docker-compose.yml และไฟล์ทั้งหมดมาให้อัตโนมัติ)
```

เมื่อ GitLab CI/CD รันถึง Stage `deploy:production`:
1. Pipeline จะส่งไฟล์ Release Bundle (`dist/`), Backend Source (`server/`), และ `docker-compose.yml` ไปยัง `$PROD_APP_DIR`
2. Pipeline จะตรวจสอบอัตโนมัติว่ามีไฟล์ `docker-compose.yml` อยู่ แล้วสั่งรัน:
   ```bash
   docker compose up -d --build
   ```
3. คอนเทนเนอร์ทั้งหมด (Nginx, Node.js App, Prometheus, Exporters) จะถูก Build และ Reload ใหม่ทันทีแบบ Zero-Downtime!
4. Pipeline จะยิงทดสอบ `/api/health` จนได้ HTTP 200 OK เพื่อยืนยันความสมบูรณ์

---

## 7. วิธีทดสอบการ Deploy (Triggering Deployment)

สั่ง Commit และ Push ขึ้น GitLab Branch `main`:

```bash
git add .
git commit -m "feat(ci): configure docker-compose for gitlab and production deployment"
git push gitlab main
```

ดูขั้นตอนการทำงานได้ที่หน้าเว็บ GitLab เมนู **Build ➔ Pipelines** ครับ
