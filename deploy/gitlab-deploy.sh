#!/usr/bin/env bash
# =============================================================================
# NetMonitor Enterprise - Remote Deployment Helper Script (GitLab Runner / Manual)
# Target Production Host: <PROD_SERVER_IP>
# =============================================================================

set -e

PROD_SERVER_IP="${PROD_SERVER_IP:-192.168.109.147}"
PROD_SSH_USER="${PROD_SSH_USER:-root}"
PROD_APP_DIR="${PROD_APP_DIR:-/var/www/netmonitor-react}"
PROD_BACKUP_DIR="${PROD_BACKUP_DIR:-/var/backups/netmonitor}"

echo "================================================================================"
echo "    NETMONITOR ENTERPRISE - PRODUCTION DEPLOYMENT AGENT"
echo "    Target Host: $PROD_SSH_USER@$PROD_SERVER_IP"
echo "    App Path:    $PROD_APP_DIR"
echo "================================================================================"

# 1. Check SSH Connectivity
echo -e "\n[1/5] Verifying SSH connectivity to production server..."
ssh -o StrictHostKeyChecking=no "$PROD_SSH_USER@$PROD_SERVER_IP" "echo 'SSH Connection OK: \$(hostname) (\$(date))'"

# 2. Database Pre-deployment Backup
echo -e "\n[2/5] Creating database snapshot before deployment..."
ssh -o StrictHostKeyChecking=no "$PROD_SSH_USER@$PROD_SERVER_IP" "
  mkdir -p $PROD_BACKUP_DIR
  if [ -f $PROD_APP_DIR/data/db.json ]; then
    SNAP=$PROD_BACKUP_DIR/db_\$(date +%Y%m%d_%H%M%S).json
    cp $PROD_APP_DIR/data/db.json \$SNAP
    echo 'Data snapshot preserved at: '\$SNAP
  else
    echo 'No existing database found; initial clean install mode.'
  fi
"

# 3. Directory Layout Preparation
echo -e "\n[3/5] Synchronizing application release payload..."
ssh -o StrictHostKeyChecking=no "$PROD_SSH_USER@$PROD_SERVER_IP" "
  mkdir -p $PROD_APP_DIR/dist \
           $PROD_APP_DIR/server \
           $PROD_APP_DIR/data/targets/blackbox \
           $PROD_APP_DIR/data/targets/snmp \
           /etc/prometheus/targets/blackbox \
           /etc/prometheus/targets/snmp \
           /etc/nginx/sites-available
"

# Rsync release components
rsync -avz --delete -e "ssh -o StrictHostKeyChecking=no" dist/ "$PROD_SSH_USER@$PROD_SERVER_IP:$PROD_APP_DIR/dist/"
rsync -avz --exclude="node_modules" -e "ssh -o StrictHostKeyChecking=no" server/ "$PROD_SSH_USER@$PROD_SERVER_IP:$PROD_APP_DIR/server/"
if [ -d config ]; then
  rsync -avz -e "ssh -o StrictHostKeyChecking=no" config/ "$PROD_SSH_USER@$PROD_SERVER_IP:$PROD_APP_DIR/config/"
fi
rsync -avz -e "ssh -o StrictHostKeyChecking=no" docker-compose.yml Dockerfile package.json "$PROD_SSH_USER@$PROD_SERVER_IP:$PROD_APP_DIR/"

# 4. Remote Process Reload (Docker Compose or PM2 Auto-Detect)
echo -e "\n[4/5] Updating production dependencies & reloading service..."
ssh -o StrictHostKeyChecking=no "$PROD_SSH_USER@$PROD_SERVER_IP" "
  set -e
  cd $PROD_APP_DIR

  if [ -f docker-compose.yml ] && (command -v docker-compose >/dev/null 2>&1 || docker compose version >/dev/null 2>&1); then
    echo 'Deploying via Docker Compose...'
    if docker compose version >/dev/null 2>&1; then
      docker compose up -d --build
    else
      docker-compose up -d --build
    fi
  else
    cd $PROD_APP_DIR/server
    npm ci --omit=dev --prefer-offline || npm install --omit=dev

    if command -v pm2 >/dev/null 2>&1; then
      pm2 reload netmonitor-backend || pm2 restart netmonitor-backend || pm2 start server.js --name netmonitor-backend
      pm2 save || true
    elif systemctl is-active --quiet netmonitor-backend; then
      systemctl restart netmonitor-backend
    else
      nohup node server.js > /var/log/netmonitor.log 2>&1 &
    fi

    if [ -f $PROD_APP_DIR/config/nginx/netmonitor.conf ]; then
      cp $PROD_APP_DIR/config/nginx/netmonitor.conf /etc/nginx/sites-available/netmonitor.conf
      ln -sf /etc/nginx/sites-available/netmonitor.conf /etc/nginx/sites-enabled/default 2>/dev/null || true
      nginx -t && systemctl reload nginx || true
    fi
  fi
"

# 5. Health Check Verification
echo -e "\n[5/5] Executing automated health verification..."
for i in {1..15}; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://$PROD_SERVER_IP/api/health" || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Healthcheck SUCCESS (HTTP 200). Service is healthy!"
    curl -s "http://$PROD_SERVER_IP/api/health"
    echo ""
    exit 0
  fi
  echo "Attempt $i/15: Received HTTP $HTTP_CODE, retrying in 3s..."
  sleep 3
done

echo "❌ [ERROR] Healthcheck failed after 15 attempts."
exit 1
