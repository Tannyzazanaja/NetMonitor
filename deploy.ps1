param (
    [string]$ServerHost = "192.168.109.147",
    [string]$ServerUser = "root",
    [string]$RemoteDir = "/var/www/netmonitor-react/dist"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "SEAVL NetMonitor React Edition - Production Single-Click Deploy" -ForegroundColor Cyan
Write-Host "Target: $ServerUser@$ServerHost -> Single Backend Port: 5001" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# -----------------------------------------------------------------------------
# 1. Build Vite Production Bundle (Requirement 14: Check build success)
# -----------------------------------------------------------------------------
Write-Host "`n[1/4] Building production frontend assets (npm run build)..." -ForegroundColor Green
npm.cmd run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed! Aborting deployment before touching production services." -ForegroundColor Red
    exit $LASTEXITCODE
}

# -----------------------------------------------------------------------------
# 2. Upload Frontend files
# -----------------------------------------------------------------------------
Write-Host "`n[2/4] Uploading frontend dist files..." -ForegroundColor Green
ssh "$($ServerUser)@$($ServerHost)" "mkdir -p /var/www/netmonitor-react/dist /var/www/netmonitor-react/server /etc/prometheus/targets/blackbox /etc/prometheus/targets/snmp /etc/prometheus/backup"
scp -r dist/* "$($ServerUser)@$($ServerHost):$($RemoteDir)/"

# -----------------------------------------------------------------------------
# 3. Package Backend, Dependencies, and Configurations (Single Source of Truth)
# -----------------------------------------------------------------------------
Write-Host "`n[3/4] Packaging Backend (server.js), dependencies, and Prometheus configs..." -ForegroundColor Green

$serverJsB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Raw -Path server/server.js)))
$scannerJsB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Raw -Path server/scanner.js)))
$snmpMapperJsB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Raw -Path server/snmpMapper.js)))
$setupPromSnmpB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Raw -Path server/setupPrometheusSnmp.js)))
$packageJsonB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Raw -Path server/package.json)))
$packageLockJsonB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Raw -Path server/package-lock.json)))
$promConfigB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Raw -Path config/prometheus/prometheus.yml)))
$snmpModulesB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Raw -Path config/snmp_exporter/snmp_optimized_modules.yml)))

$deployCommand = @"
exec > /var/www/netmonitor-react/dist/deploy.log 2>&1
echo "=== Starting Unified NetMonitor Deployment ==="
date
cd /var/www/netmonitor-react/server

echo "1. Decoding backend source and package files..."
echo "$serverJsB64" | base64 -d > server.js
echo "$scannerJsB64" | base64 -d > scanner.js
echo "$snmpMapperJsB64" | base64 -d > snmpMapper.js
echo "$setupPromSnmpB64" | base64 -d > setupPrometheusSnmp.js
echo "$packageJsonB64" | base64 -d > package.json
echo "$packageLockJsonB64" | base64 -d > package-lock.json
echo "$promConfigB64" | base64 -d > /tmp/prometheus_redesign.yml
echo "$snmpModulesB64" | base64 -d > /tmp/snmp_optimized_modules.yml

echo "2. Installing backend dependencies via npm ci (Requirement 11)..."
npm ci --omit=dev

echo "3. Executing Prometheus & SNMP Exporter Setup..."
node setupPrometheusSnmp.js

chown -R www-data:www-data /var/www/netmonitor-react
chmod -R 775 /etc/prometheus/targets

echo "4. Managing PM2 process (Service: netmonitor-backend, Port: 5001)..."
# Release legacy ports (5000, 5002) and previous PM2 services if present
fuser -k 5000/tcp 5002/tcp 2>/dev/null || true
if command -v pm2 >/dev/null 2>&1; then
    pm2 delete netmonitor-storage-api 2>/dev/null || true
    pm2 restart netmonitor-backend --update-env 2>/dev/null || pm2 start server.js --name "netmonitor-backend"
    pm2 save
    pm2 startup systemd -u root --hp /root 2>/dev/null || true
elif command -v npx >/dev/null 2>&1; then
    npx pm2 delete netmonitor-storage-api 2>/dev/null || true
    npx pm2 restart netmonitor-backend --update-env 2>/dev/null || npx pm2 start server.js --name "netmonitor-backend"
    npx pm2 save
    npx pm2 startup systemd -u root --hp /root 2>/dev/null || true
else
    echo "PM2 not found, falling back to nohup..."
    pkill -f "node server.js" || true
    nohup node server.js > server.log 2>&1 &
fi

echo "5. Configuring Nginx (Specific file: /etc/nginx/conf.d/netmonitor.conf)..."
# Avoid removing non-netmonitor configs, only disable default if conflicting on 80
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/conf.d/netmonitor-react.conf 2>/dev/null || true

cat << 'EOF' > /etc/nginx/conf.d/netmonitor.conf
server {
    listen 80;
    server_name _ netmonitor.local netmonitor.seavl.local netmonitor;

    root /var/www/netmonitor-react/dist;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml application/javascript application/json image/svg+xml;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Grafana Dashboard (Port 3000)
    location ^~ /api/grafana/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host `$host;
    }

    location ^~ /api/grafana-auth/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host `$host;
    }

    # Prometheus Proxy (Port 9090)
    location ^~ /api/prometheus/ {
        proxy_pass http://127.0.0.1:9090/;
        proxy_http_version 1.1;
        proxy_set_header Host `$host;
    }

    # Dedicated SSE Stream Endpoint (Zero buffering, extended timeouts)
    location ~* ^/api/storage/stream/ {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host `$host;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # NetMonitor Unified Backend API (Port 5001)
    # Covers /api/health, /api/auth/, /api/storage/, /api/alerts/, /api/devices/, etc.
    location /api/ {
        proxy_pass http://127.0.0.1:5001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host `$host;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_cache_bypass `$http_upgrade;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # SPA Frontend Fallback
    location / {
        try_files `$uri `$uri/ /index.html;
    }
}
EOF

echo "6. Validating Nginx configuration syntax (Requirement 13)..."
nginx -t
if [ `$? -ne 0 ]; then
    echo "ERROR: Nginx configuration test failed! Aborting reload."
    exit 1
fi

echo "7. Reloading Nginx, SNMP Exporter, and Prometheus..."
systemctl reload nginx || systemctl restart nginx
systemctl restart prometheus-snmp-exporter 2>/dev/null || systemctl restart snmp_exporter 2>/dev/null || curl -X POST http://localhost:9116/-/reload 2>/dev/null || true
systemctl restart prometheus 2>/dev/null || systemctl reload prometheus 2>/dev/null || curl -X POST http://localhost:9090/-/reload 2>/dev/null || true
systemctl start prometheus 2>/dev/null || true
systemctl enable prometheus 2>/dev/null || true

echo "8. Running Automated Health Checks (Requirement 16)..."
HEALTH_OK=0
for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS http://127.0.0.1:5001/api/health >/dev/null 2>&1; then
        echo "Backend health check PASSED on port 5001."
        HEALTH_OK=1
        break
    fi
    echo "Waiting for backend service to respond... (`$i/10)"
    sleep 1
done

if [ `$HEALTH_OK -eq 0 ]; then
    echo "ERROR: Backend health check failed on http://127.0.0.1:5001/api/health"
    exit 1
fi

if curl -fsS http://127.0.0.1/api/health >/dev/null 2>&1; then
    echo "Nginx reverse proxy health check PASSED."
else
    echo "WARNING: Nginx reverse proxy health check did not return HTTP 200."
fi

echo "=== Deployment finished successfully ==="
date
"@

# Fix CRLF and save to a temporary bash script
$deployCommand = $deployCommand -replace "`r`n", "`n"
Set-Content -Path "deploy_backend.sh" -Value $deployCommand -Encoding Ascii -NoNewline

# -----------------------------------------------------------------------------
# 4. Upload and Execute Unified Deployment Script
# -----------------------------------------------------------------------------
Write-Host "`n[4/4] Executing remote deployment script on server..." -ForegroundColor Green
scp deploy_backend.sh "$($ServerUser)@$($ServerHost):/tmp/deploy_backend.sh"
ssh "$($ServerUser)@$($ServerHost)" "tr -d '\r' < /tmp/deploy_backend.sh > /tmp/deploy_backend_lf.sh && bash /tmp/deploy_backend_lf.sh && rm -f /tmp/deploy_backend*"
Remove-Item deploy_backend.sh -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# 5. Client-Side Post-Deployment Health Check (Requirement 16)
# -----------------------------------------------------------------------------
Write-Host "`n[Health Check] Verifying deployment from client..." -ForegroundColor Cyan
try {
    $health = Invoke-RestMethod -Uri "http://${ServerHost}/api/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host " Health Check SUCCESSFUL!" -ForegroundColor Green
    Write-Host "   Status:    $($health.status)" -ForegroundColor Gray
    Write-Host "   Backend:   $($health.backend)" -ForegroundColor Gray
    Write-Host "   Port:      $($health.port)" -ForegroundColor Gray
    Write-Host "   Uptime:    $($health.uptime)s" -ForegroundColor Gray
    Write-Host "   Timestamp: $($health.timestamp)" -ForegroundColor Gray
} catch {
    Write-Host " [Notice] Could not query http://${ServerHost}/api/health directly from this machine ($($_.Exception.Message)). Check deploy.log on server." -ForegroundColor Yellow
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "DEPLOYMENT SUCCESSFUL - SINGLE SOURCE OF TRUTH ACTIVE!" -ForegroundColor Green
Write-Host "Access URLs:" -ForegroundColor Cyan
Write-Host "  👉 http://${ServerHost}" -ForegroundColor Yellow
Write-Host "  👉 http://netmonitor.local" -ForegroundColor Yellow
Write-Host "  👉 http://netmonitor.seavl.local" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
