# Security Policy & Architecture

## Security Architecture Overview

NetMonitor Enterprise employs defense-in-depth security principles across the presentation layer, application server, and telemetry ingest engines.

### 1. Authentication & Session Management
- **Session Mechanism**: Cryptographically generated 256-bit random session identifiers (`crypto.randomBytes(32)`).
- **Cookie Security**:
  - `HttpOnly`: Prevents client-side JavaScript access and mitigates XSS token extraction.
  - `SameSite=Lax`: Mitigates Cross-Site Request Forgery (CSRF).
  - `Secure`: Dynamically appended when served over HTTPS / TLS reverse proxy.
- **Session Expiry**: 24-hour rolling TTL; invalidated upon explicit logout or authentication failure.
- **Native EventSource SSE Support**: For browsers connecting to Server-Sent Events, authentication is verified via `Cookie: nm_session`, `Authorization: Bearer <token>`, or temporary signed query token (`?token=<token>`).

### 2. Role-Based Access Control (RBAC)
All server API routes strictly enforce backend authorization checks:
- **Viewer**: Read-only access to dashboards, device inventory, topology graphs, and historical telemetry.
- **Editor**: Operational actions including acknowledging active alarms and triggering manual SNMP discovery scans.
- **Admin**: Full administrative permissions including system configuration mutation, database backup/restore, break-glass credential management, and raw PromQL execution.

### 3. Password Storage & Cryptography
- **PBKDF2 Hashing**: Passwords stored using PBKDF2 (SHA-512 digest, 100,000 iterations, 16-byte cryptographically random salt).
- **Timing-Safe Comparison**: Verification utilizes `crypto.timingSafeEqual()` to eliminate side-channel timing attack vectors.
- **Secret Sanitization**: Database JSON storage sanitizes and strips all plaintext credentials; API responses mask secrets (`***`).

### 4. Rate Limiting & Denial-of-Service (DoS) Mitigation
- **Login Brute-Force Rate Limiting**: Maximum 5 consecutive failed login attempts per IP within a 5-minute sliding window. Exceeding attempts triggers HTTP 429 (Too Many Requests) with a `Retry-After` header.
- **Telemetry Query Throttling**: Maximum 60 queries per minute per IP for Prometheus proxy and analytics range queries to prevent TSDB denial-of-service.

### 5. Prometheus Proxy & Telemetry Boundary
- **Endpoint Whitelist**: Restricts proxy access strictly to operational read endpoints (`/api/v1/query`, `/api/v1/query_range`, `/api/v1/series`, `/api/v1/labels`).
- **Destructive Endpoint Lockdown**: Requests to administrative endpoints (`/-/quit`, `/-/reload`, `/api/v1/admin/tsdb/delete_series`) return HTTP 403 Forbidden.
- **Query Length Limits**: URI query payloads capped at 4096 bytes; analytics PromQL queries capped at 2048 bytes.

### 6. Vulnerability Reporting
To report security vulnerabilities or configuration exposures, please open a private security advisory on the source repository.
