# คู่มือการติดตั้งและตั้งค่า GitLab CI/CD แบบละเอียดทุกขั้นตอน (Step-by-Step Guide)

> **โครงสร้างระบบ (Universal Architecture):**
> - **เครื่องที่ 1 — GitLab Server (`<GITLAB_SERVER_IP>`):** รัน GitLab CE + GitLab Runner ด้วย Docker Compose
> - **เครื่องที่ 2 — Production Server (`<PROD_SERVER_IP>`):** รันระบบ NetMonitor Enterprise (รองรับทั้งโหมด Native PM2/Systemd และโหมด Docker Compose)

---

## สารบัญขั้นตอนทั้งหมด
1. **ขั้นตอนที่ 1:** ติดตั้ง GitLab CE + GitLab Runner ด้วย Docker Compose (บนเครื่อง GitLab Server)
2. **ขั้นตอนที่ 2:** เข้าสู่ระบบ GitLab ครั้งแรก และสร้างโปรเจกต์ (Repository)
3. **ขั้นตอนที่ 3:** สร้างและลงทะเบียน GitLab Runner (สำคัญมาก: ต้องเปิด **Run untagged jobs**)
4. **ขั้นตอนที่ 4:** ตั้งค่า `/srv/gitlab-runner/config/config.toml` ให้ดึงโค้ดและออกเน็ตได้ไม่ติดขัด
5. **ขั้นตอนที่ 5:** เตรียมสิทธิ์การเชื่อมต่อ SSH ไปยังเครื่อง Production Server (เลือกได้ทั้งแบบ SSH Key หรือ SSH Password)
6. **ขั้นตอนที่ 6:** ตั้งค่าตัวแปรในหน้าเว็บ GitLab (**Settings > CI/CD > Variables**)
7. **ขั้นตอนที่ 7:** Push โค้ดขึ้น GitLab และตรวจสอบการทำงานของ Pipeline
8. **การแก้ไขปัญหาที่พบบ่อย (Troubleshooting)**

---

## ขั้นตอนที่ 1: ติดตั้ง GitLab CE + GitLab Runner ด้วย Docker Compose

ทำที่เครื่อง **GitLab Server (`<GITLAB_SERVER_IP>`)**:

### 1.1 สร้างโฟลเดอร์เก็บข้อมูลถาวร
```bash
sudo mkdir -p /srv/gitlab/config /srv/gitlab/logs /srv/gitlab/data /srv/gitlab-runner/config
```

### 1.2 ตรวจสอบไฟล์ `deploy/docker-compose.gitlab-full.yml`
ก่อนรัน ให้เปิดไฟล์ `deploy/docker-compose.gitlab-full.yml` แล้วแทนที่ `<GITLAB_SERVER_IP>` ด้วย IP จริงของเครื่อง GitLab Server (เช่น `192.168.109.146`):
```bash
sed -i 's/<GITLAB_SERVER_IP>/192.168.109.146/g' deploy/docker-compose.gitlab-full.yml
```
*(หมายเหตุ: เปลี่ยน `192.168.109.146` เป็น IP เครื่อง GitLab ของคุณ)*

### 1.3 สั่งรัน Docker Compose
```bash
docker compose -f deploy/docker-compose.gitlab-full.yml up -d
```
> ⏳ **หมายเหตุ:** การเปิด GitLab CE ครั้งแรกจะใช้เวลาเตรียมระบบประมาณ **3–5 นาที** สามารถเช็คสถานะได้ด้วยคำสั่ง `docker ps` จนกว่าสถานะของ `gitlab-ce` จะขึ้นว่า `(healthy)`

---

## ขั้นตอนที่ 2: เข้าสู่ระบบ GitLab ครั้งแรก และสร้างโปรเจกต์

### 2.1 ดูรหัสผ่าน `root` เริ่มต้นของ GitLab
รันคำสั่งนี้บนเครื่อง GitLab Server เพื่อดูรหัสผ่านเริ่มต้น:
```bash
docker exec -it gitlab-ce grep 'Password:' /etc/gitlab/initial_root_password
```

### 2.2 ล็อกอินเข้าหน้าเว็บ GitLab และสร้างโปรเจกต์ใหม่
1. เปิดเบราว์เซอร์ไปที่ `http://<GITLAB_SERVER_IP>`
2. ล็อกอินด้วย:
   - **Username:** `root`
   - **Password:** *(รหัสผ่านที่ได้จากข้อ 2.1)*
3. กดปุ่ม **Create a project** ➔ เลือก **Create blank project**
4. กรอกข้อมูล:
   - **Project name:** `network-monitor-react`
   - **Visibility Level:** `Internal` หรือ `Private`
   - **เอาเครื่องหมายถูกออก** ที่ช่อง *"Initialize repository with a README"* (เพราะเรามีโค้ดอยู่แล้ว)
5. กด **Create project**

---

## ขั้นตอนที่ 3: สร้างและลงทะเบียน GitLab Runner (สำคัญมาก!)

เพื่อให้ GitLab ส่งงาน Build, Test และ Deploy ไปให้ `gitlab-runner` ทำงาน ต้องผูก Runner เข้ากับโปรเจกต์ตามขั้นตอนนี้:

### 3.1 สร้าง Runner บนหน้าเว็บ GitLab
1. เข้าไปที่หน้าโปรเจกต์ `network-monitor-react` บนเว็บ GitLab
2. เมนูซ้ายมือ เลือก **Settings** ➔ **CI/CD**
3. มองหาหัวข้อ **Runners** แล้วกดปุ่ม **Expand**
4. กดปุ่ม **New project runner** (หรือใน GitLab รุ่นเก่า ให้คัดลอก Registration Token):
   - **Operating systems:** เลือก `Linux`
   - **Tags:** กรอก `docker, production`
   - ⚠️ **จุดสำคัญที่สุด:** **ต้องติ๊กถูกที่ช่อง `[✓] Run untagged jobs`** (หากไม่ติ๊ก งานใน `.gitlab-ci.yml` จะค้างสถานะ *Pending* และไม่ยอมรัน!)
   - กดปุ่ม **Create runner**
5. หน้าเว็บจะแสดง **Runner authentication token** (ขึ้นต้นด้วย `glrt-...`) ให้คัดลอกเก็บไว้

### 3.2 รันคำสั่งลงทะเบียนใน Container `gitlab-runner`
กลับมาที่ Terminal ของเครื่อง **GitLab Server (`<GITLAB_SERVER_IP>`)** แล้วรันคำสั่ง:

```bash
docker exec -it gitlab-runner gitlab-runner register \
  --non-interactive \
  --url "http://<GITLAB_SERVER_IP>/" \
  --token "<วาง_TOKEN_ที่ได้จากหน้าเว็บ_glrt-...>" \
  --executor "docker" \
  --docker-image "node:22-bookworm-slim" \
  --description "netmonitor-docker-runner" \
  --clone-url "http://<GITLAB_SERVER_IP>/" \
  --docker-volumes "/var/run/docker.sock:/var/run/docker.sock" \
  --docker-volumes "/cache" \
  --docker-network-mode "host"
```
> 💡 **ทำไมต้องใส่ `--docker-network-mode "host"` และ `--clone-url`?**
> เพราะเมื่อ Runner สร้าง Container ย่อยขึ้นมาทำหน้าที่ Build และ SSH ไปหาเครื่อง Production การใช้ `network_mode = "host"` จะช่วยให้ Container ย่อยมองเห็นทั้ง IP ของเครื่อง GitLab (`<GITLAB_SERVER_IP>`) และ IP ของเครื่อง Production (`<PROD_SERVER_IP>`) ในวง LAN เดียวกันได้ทันทีโดยไม่ติดปัญหา Docker Bridge DNS!

---

## ขั้นตอนที่ 4: ตรวจสอบไฟล์ `/srv/gitlab-runner/config/config.toml`

เปิดไฟล์คอนฟิกของ Runner บนเครื่อง GitLab Server เพื่อตรวจสอบความเรียบร้อย:
```bash
sudo nano /srv/gitlab-runner/config/config.toml
```
ตรวจสอบให้แน่ใจว่าภายในบล็อก `[[runners]]` มีค่าดังนี้:
```toml
concurrent = 4
check_interval = 0

[[runners]]
  name = "netmonitor-docker-runner"
  url = "http://<GITLAB_SERVER_IP>/"
  token = "glrt-xxxxxxxxxxxxxxxxxxxx"
  executor = "docker"
  clone_url = "http://<GITLAB_SERVER_IP>/"
  [runners.docker]
    tls_verify = false
    image = "node:22-bookworm-slim"
    privileged = false
    disable_entrypoint_overwrite = false
    oom_kill_disable = false
    disable_cache = false
    volumes = ["/var/run/docker.sock:/var/run/docker.sock", "/cache"]
    network_mode = "host"
    shm_size = 0
```
จากนั้นสั่งรีสตาร์ท Runner 1 ครั้ง:
```bash
docker restart gitlab-runner
```

---

## ขั้นตอนที่ 5: เตรียมสิทธิ์การเชื่อมต่อ SSH ไปยังเครื่อง Production Server

ไฟล์ `.gitlab-ci.yml` ที่ปรับปรุงใหม่ รองรับการเชื่อมต่อ SSH ไปยังเครื่อง Production (`<PROD_SERVER_IP>`) ได้ **2 วิธี** (เลือกใช้วิธีใดวิธีหนึ่ง):

### วิธีที่ 1: ใช้ SSH Private Key (แนะนำ — ปลอดภัยสูงสุด)
รันคำสั่งนี้บนเครื่อง GitLab Server:
```bash
# 1. สร้างคู่กุญแจ SSH แบบไม่มีรหัสผ่าน (Passphrase ว่าง)
ssh-keygen -t ed25519 -C "gitlab-ci-deploy" -f ~/gitlab_deploy_key -N ""

# 2. คัดลอก Public Key ไปไว้ที่เครื่อง Production Server (ระบบจะถามรหัสผ่าน root ของเครื่อง Production ครั้งเดียว)
ssh-copy-id -i ~/gitlab_deploy_key.pub root@<PROD_SERVER_IP>

# 3. ทดสอบว่า SSH เข้าเครื่อง Production ได้โดยไม่ต้องกรอกรหัสผ่าน
ssh -i ~/gitlab_deploy_key root@<PROD_SERVER_IP> "hostname && uptime"

# 4. แสดงเนื้อหา Private Key เพื่อคัดลอกไปใส่ใน GitLab Variables ในขั้นตอนถัดไป
cat ~/gitlab_deploy_key
```
> 📌 คัดลอกข้อความทั้งหมดตั้งแต่บรรทัด `-----BEGIN OPENSSH PRIVATE KEY-----` จนถึง `-----END OPENSSH PRIVATE KEY-----`

### วิธีที่ 2: ใช้รหัสผ่าน SSH (`PROD_SSH_PASSWORD`) (ทางเลือกสำรองที่ตั้งค่าง่ายที่สุด)
หากไม่ต้องการสร้าง SSH Key คุณสามารถใช้รหัสผ่าน SSH ของเครื่อง Production ได้โดยตรง โดยข้ามไปใส่ตัวแปร `PROD_SSH_PASSWORD` ในขั้นตอนที่ 6 ได้เลย!

---

## ขั้นตอนที่ 6: ตั้งค่าตัวแปรในหน้าเว็บ GitLab (CI/CD Variables)

1. เข้าไปที่โปรเจกต์บนหน้าเว็บ GitLab
2. ไปที่เมนู **Settings** ➔ **CI/CD** ➔ กด **Expand** ที่หัวข้อ **Variables**
3. กดปุ่ม **Add variable** เพื่อเพิ่มตัวแปรตามตารางด้านล่าง:

| ชื่อตัวแปร (Key) | ค่าที่ต้องกรอก (Value) | Type | Protect variable? | Mask variable? |
| :--- | :--- | :---: | :---: | :---: |
| `PROD_SERVER_IP` | IP ของเครื่อง Production (เช่น `192.168.109.147`) | `Variable` | **เอาติ๊กถูกออก** ❌ | เอาติ๊กถูกออก ❌ |
| `PROD_SSH_USER` | ชื่อผู้ใช้ SSH บนเครื่อง Production (เช่น `root`) | `Variable` | **เอาติ๊กถูกออก** ❌ | เอาติ๊กถูกออก ❌ |
| `PROD_APP_DIR` | `/var/www/netmonitor-react` | `Variable` | **เอาติ๊กถูกออก** ❌ | เอาติ๊กถูกออก ❌ |
| `DEPLOY_MODE` | `auto` *(หรือใส่ `native` ถ้าใช้ PM2, `docker` ถ้าใช้ Docker)* | `Variable` | **เอาติ๊กถูกออก** ❌ | เอาติ๊กถูกออก ❌ |
| `SSH_PRIVATE_KEY` *(ถ้าใช้วิธีที่ 1)* | วางข้อความ Private Key ทั้งหมดจาก `cat ~/gitlab_deploy_key` | `Variable` หรือ `File` | **เอาติ๊กถูกออก** ❌ | เอาติ๊กถูกออก ❌ *(เพราะมีหลายบรรทัด)* |
| `PROD_SSH_PASSWORD` *(ถ้าใช้วิธีที่ 2)* | รหัสผ่าน SSH ของเครื่อง Production | `Variable` | **เอาติ๊กถูกออก** ❌ | ติ๊กถูกได้ ✅ (ถ้ายาวเกิน 8 ตัวอักษร) |

> ⚠️ **ข้อควรระวังสำคัญมากในการตั้งค่า Variables บน GitLab:**
> 1. **ช่อง `Protect variable` (Protected):** แนะนำให้ **เอาเครื่องหมายถูกออก (Uncheck)** ทุกตัวแปร! เพราะถ้าติ๊กไว้ แล้วคุณสั่งรัน Pipeline บน Branch ที่ไม่ได้ตั้งเป็น Protected ตัวแปรเหล่านี้จะไม่ถูกส่งเข้าไปใน Pipeline ทำให้ Deploy ล้มเหลว
> 2. **ช่อง `Mask variable` สำหรับ `SSH_PRIVATE_KEY`:** **ห้ามติ๊ก Mask** เพราะ GitLab ไม่รองรับการ Mask ข้อความที่มีหลายบรรทัด (Multi-line)

---

## ขั้นตอนที่ 7: Push โค้ดขึ้น GitLab และตรวจสอบการทำงานของ Pipeline

รันคำสั่งในโฟลเดอร์โปรเจกต์ `network-monitor-react` เพื่อส่งโค้ดขึ้น GitLab Server:

```bash
# 1. เพิ่ม Remote ชี้ไปยัง GitLab Server ของคุณ
git remote add gitlab http://<GITLAB_SERVER_IP>/root/network-monitor-react.git
# (หากมีชื่อ remote 'gitlab' อยู่แล้ว ใช้คำสั่ง: git remote set-url gitlab http://<GITLAB_SERVER_IP>/root/network-monitor-react.git)

# 2. บันทึกการเปลี่ยนแปลงทั้งหมด
git add .
git commit -m "ci: update GitLab CI/CD pipeline for automated production deployment"

# 3. Push โค้ดขึ้น GitLab
git push -u gitlab main
```

### การดูสถานะ Pipeline บนหน้าเว็บ GitLab
1. ไปที่เมนูซ้ายมือ **Build** ➔ **Pipelines**
2. คุณจะเห็น Pipeline กำลังรันเรียงตามลำดับ 4 ขั้นตอน (Stages):
   - 🟢 **`build:frontend`**: ติดตั้งแพ็กเกจและสั่ง `npm run build` สร้างโฟลเดอร์ `dist/`
   - 🟢 **`test:unit_and_security`**: รันชุดทดสอบความปลอดภัยและ Unit Test ทั้ง 18 ชุด
   - 🟢 **`deploy:production`**:
     - สำรองไฟล์ฐานข้อมูล `data/db.json` บนเครื่อง Production เก็บไว้ที่ `/var/backups/netmonitor/`
     - ส่งไฟล์ `dist/`, `server/`, `config/` ขึ้นเครื่อง Production ผ่าน `rsync`
     - สั่ง Reload บริการ (PM2 / Systemd / Nginx หรือ Docker Compose ตามที่ตรวจพบ)
   - 🟢 **`verify:health_check`**: ยิงตรวจสอบ `/api/health` จนได้รับ `HTTP 200 OK`

---

## 8. การแก้ไขปัญหาที่พบบ่อย (Troubleshooting)

| อาการที่พบ | สาเหตุ | วิธีแก้ไข |
| :--- | :--- | :--- |
| งานค้างสถานะ **Pending (สีส้ม)** ไม่ยอมเริ่มรัน | Runner ไม่ได้รับงานที่ไม่มี Tag | ไปที่ **Settings > CI/CD > Runners** กดรูปดินสอแก้ไข Runner แล้วติ๊กถูกที่ช่อง **`Run untagged jobs`** จากนั้นกด Save changes |
| Stage `build` แจ้งว่า `Could not resolve host` ตอน Clone โค้ด | Container ย่อยของ Runner หา IP GitLab ไม่เจอ | เปิด `/srv/gitlab-runner/config/config.toml` เพิ่ม `network_mode = "host"` และ `clone_url = "http://<GITLAB_SERVER_IP>/"` แล้วรัน `docker restart gitlab-runner` |
| Stage `deploy` แจ้งว่า `ไม่พบค่าตัวแปร SSH_PRIVATE_KEY หรือ PROD_SSH_PASSWORD` | ตัวแปรถูกติ๊ก `Protected` ไว้ หรือยังไม่ได้สร้าง | ไปที่ **Settings > CI/CD > Variables** กดแก้ไขตัวแปรแล้ว **เอาเครื่องหมายถูกออกจากช่อง `Protect variable`** |
| Stage `deploy` แจ้งว่า `Permission denied (publickey,password)` | ยังไม่ได้คัดลอก Public Key ไปยังเครื่อง Production หรือรหัสผ่านผิด | รัน `ssh-copy-id -i ~/gitlab_deploy_key.pub root@<PROD_SERVER_IP>` อีกครั้ง หรือตั้งค่าตัวแปร `PROD_SSH_PASSWORD` ใน GitLab Variables |
