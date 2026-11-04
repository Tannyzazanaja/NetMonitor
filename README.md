<<<<<<< HEAD
# NetMonitor Enterprise Network Observability Platform

<p align="center">
  <a href="README.md"><b>English</b></a> | <a href="README.th.md"><b>ภาษาไทย (คู่มือภาษาไทย)</b></a>
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

**NetMonitor Enterprise** is a high-performance, turn-key Network Observability and Management Platform engineered for modern campus, data center, and enterprise networks. It unifies **sub-second real-time device health monitoring**, **Prometheus time-series telemetry**, **interactive network topology maps**, and **real-time push alerting** into an intuitive, lightweight web dashboard.

---

## 📚 Essential Documentation & Manuals

The platform documentation has been consolidated into the following authoritative manuals:

| Manual | Description | Target Audience |
|---|---|---|
| 🇹🇭 [**คู่มือภาษาไทยฉบับสมบูรณ์**](README.th.md) | คู่มือการติดตั้ง การตั้งค่า การใช้งาน และการแก้ไขปัญหาฉบับภาษาไทย | ผู้ดูแลระบบและวิศวกรเครือข่าย |
| 🚀 [**Installation & Deployment Guide**](INSTALLATION.md) | Step-by-step setup for Docker Compose, Native Linux (systemd), Nginx reverse proxy, and hardware sizing. | System & Network Engineers |
| 🛠️ [**Administrator & Troubleshooting Guide**](ADMIN_GUIDE.md) | Operations, RBAC security, configuration reference, backup & restore, upgrades, and incident response playbooks. | Operations, DevOps & NOC Teams |
| 💻 [**Developer & Architecture Guide**](DEVELOPER_GUIDE.md) | System architecture, telemetry data pipelines, codebase layout, development workflow, and testing suite. | Developers & Platform Architects |
| 📋 [**Changelog & Release Notes**](CHANGELOG.md) | Complete version history, feature highlights, and hardening improvements in V1.1.0. | All Stakeholders |
| 🛡️ [**Security Policy**](SECURITY.md) | Security model, PBKDF2 authentication, rate limiting, and vulnerability disclosure policies. | Security & Compliance Teams |

---

## ⚡ Quick Start (Docker Compose)

Deploy the entire monitoring stack in 3 simple commands:

```bash
# 1. Clone repository
git clone https://github.com/example/network-monitor-react.git /opt/netmonitor
cd /opt/netmonitor

# 2. Configure environment
cp .env.example .env
# (Edit .env to set your JWT_SECRET and EMERGENCY_PASSWORD)

# 3. Build & Launch
docker compose up -d --build
```

Access the web dashboard at `http://localhost` (or server IP) and log in with your emergency admin credentials.

---

## 🌟 Key Highlights & Capabilities

- **Zero-Polling Real-Time Push**: Server-Sent Events (SSE) stream latency, interface throughput, and device status to browsers instantly without page refreshes.
- **Enterprise Security Boundary**: PBKDF2 credential hashing (100k rounds SHA-512), timing-safe comparisons, 3-tier RBAC (`Admin`, `Editor`, `Viewer`), and PromQL query rate limiters.
- **Accurate Traffic Semantics**: Strict differentiation between active zero-traffic interfaces (`0.00 Mbps`) and telemetry outages (`No Data`), with 64-bit High Capacity counter support.
- **Multi-Vendor SNMP Support**: Pre-configured MIB profiles for Cisco, MikroTik, Synology, Linux/Windows servers, and RFC 1213 generic devices.
- **Disaster Recovery Ready**: Cryptographically verified database exports with SHA-256 integrity checksums and atomic pre-write snapshots (`.bak`).
- **Zero Heavy External DB**: Lightweight, single-instance atomic JSON database engine (`data/db.json`) eliminating PostgreSQL/MySQL operational complexity.

---

## 📄 License
This project is licensed under the MIT License.
=======
# NetMonitor



## Getting started

To make it easy for you to get started with GitLab, here's a list of recommended next steps.

Already a pro? Just edit this README.md and make it your own. Want to make it easy? [Use the template at the bottom](#editing-this-readme)!

## Add your files

* [Create](https://docs.gitlab.com/user/project/repository/web_editor/#create-a-file) or [upload](https://docs.gitlab.com/user/project/repository/web_editor/#upload-a-file) files
* [Add files using the command line](https://docs.gitlab.com/topics/git/add_files/#add-files-to-a-git-repository) or push an existing Git repository with the following command:

```
cd existing_repo
git remote add origin http://192.168.109.146:9000/group1/netmonitor.git
git branch -M main
git push -uf origin main
```

## Integrate with your tools

* [Set up project integrations](http://192.168.109.146:9000/group1/netmonitor/-/settings/integrations)

## Collaborate with your team

* [Invite team members and collaborators](https://docs.gitlab.com/user/project/members/)
* [Create a new merge request](https://docs.gitlab.com/user/project/merge_requests/creating_merge_requests/)
* [Automatically close issues from merge requests](https://docs.gitlab.com/user/project/issues/managing_issues/#closing-issues-automatically)
* [Enable merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
* [Set auto-merge](https://docs.gitlab.com/user/project/merge_requests/auto_merge/)

## Test and Deploy

Use the built-in continuous integration in GitLab.

* [Get started with GitLab CI/CD](https://docs.gitlab.com/ci/quick_start/)
* [Analyze your code for known vulnerabilities with Static Application Security Testing (SAST)](https://docs.gitlab.com/user/application_security/sast/)
* [Deploy to Kubernetes, Amazon EC2, or Amazon ECS using Auto Deploy](https://docs.gitlab.com/topics/autodevops/requirements/)
* [Use pull-based deployments for improved Kubernetes management](https://docs.gitlab.com/user/clusters/agent/)
* [Set up protected environments](https://docs.gitlab.com/ci/environments/protected_environments/)

***

# Editing this README

When you're ready to make this README your own, just edit this file and use the handy template below (or feel free to structure it however you want - this is just a starting point!). Thanks to [makeareadme.com](https://www.makeareadme.com/) for this template.

## Suggestions for a good README

Every project is different, so consider which of these sections apply to yours. The sections used in the template are suggestions for most open source projects. Also keep in mind that while a README can be too long and detailed, too long is better than too short. If you think your README is too long, consider utilizing another form of documentation rather than cutting out information.

## Name
Choose a self-explaining name for your project.

## Description
Let people know what your project can do specifically. Provide context and add a link to any reference visitors might be unfamiliar with. A list of Features or a Background subsection can also be added here. If there are alternatives to your project, this is a good place to list differentiating factors.

## Badges
On some READMEs, you may see small images that convey metadata, such as whether or not all the tests are passing for the project. You can use Shields to add some to your README. Many services also have instructions for adding a badge.

## Visuals
Depending on what you are making, it can be a good idea to include screenshots or even a video (you'll frequently see GIFs rather than actual videos). Tools like ttygif can help, but check out Asciinema for a more sophisticated method.

## Installation
Within a particular ecosystem, there may be a common way of installing things, such as using Yarn, NuGet, or Homebrew. However, consider the possibility that whoever is reading your README is a novice and would like more guidance. Listing specific steps helps remove ambiguity and gets people to using your project as quickly as possible. If it only runs in a specific context like a particular programming language version or operating system or has dependencies that have to be installed manually, also add a Requirements subsection.

## Usage
Use examples liberally, and show the expected output if you can. It's helpful to have inline the smallest example of usage that you can demonstrate, while providing links to more sophisticated examples if they are too long to reasonably include in the README.

## Support
Tell people where they can go to for help. It can be any combination of an issue tracker, a chat room, an email address, etc.

## Roadmap
If you have ideas for releases in the future, it is a good idea to list them in the README.

## Contributing
State if you are open to contributions and what your requirements are for accepting them.

For people who want to make changes to your project, it's helpful to have some documentation on how to get started. Perhaps there is a script that they should run or some environment variables that they need to set. Make these steps explicit. These instructions could also be useful to your future self.

You can also document commands to lint the code or run tests. These steps help to ensure high code quality and reduce the likelihood that the changes inadvertently break something. Having instructions for running tests is especially helpful if it requires external setup, such as starting a Selenium server for testing in a browser.

## Authors and acknowledgment
Show your appreciation to those who have contributed to the project.

## License
For open source projects, say how it is licensed.

## Project status
If you have run out of energy or time for your project, put a note at the top of the README saying that development has slowed down or stopped completely. Someone may choose to fork your project or volunteer to step in as a maintainer or owner, allowing your project to keep going. You can also make an explicit request for maintainers.
>>>>>>> origin/main
