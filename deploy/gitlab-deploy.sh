#!/usr/bin/env bash
# =============================================================================
# NetMonitor Enterprise - Remote Deployment Helper Script (GitLab Runner / Manual)
# Target Production Host: <PROD_SERVER_IP>
# =============================================================================

set -e

PROD_SERVER_IP="${PROD_SERVER_IP:-192.168.109.147}"
PROD_SSH_USER="${PROD_SSH_USER:-root}"
PROD_SSH_PORT="${PROD_SSH_PORT:-22}"
PROD_APP_DIR="${PROD_APP_DIR:-/var/www/netmonitor-react}"
PROD_BACKUP_DIR="${PROD_BACKUP_DIR:-/var/backups/netmonitor}"
DEPLOY_MODE="${DEPLOY_MODE:-auto}"

SSH_OPTS="-p ${PROD_SSH_PORT} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=15"

echo "================================================================================"
echo "    NETMONITOR ENTERPRISE - PRODUCTION DEPLOYMENT AGENT"
echo "    Target Host: $PROD_SSH_USER@$PROD_SERVER_IP:$PROD_SSH_PORT"
echo "    App Path:    $PROD_APP_DIR"
echo "    Deploy Mode: $DEPLOY_MODE"
echo "================================================================================"

# 1. Check SSH Connectivity
echo -e "\n[1/5] Verifying SSH connectivity to production server..."
ssh $SSH_OPTS "$PROD_SSH_USER@$PROD_SERVER_IP" "echo 'SSH Connection OK: \$(hostname) (\$(date))'"

# 2. Database Pre-deployment Backup
echo -e "\n[2/5] Creating database snapshot before deployment..."
ssh $SSH_OPTS "$PROD_SSH_USER@$PROD_SERVER_IP" "
  mkdir -p $PROD_BACKUP_DIR
  if [ -f $PROD_APP_DIR/data/db.json ]; then
    SNAP=$PROD_BACKUP_DIR/db_\$(date +%Y%m%d_%H%M%S).json
    cp $PROD_APP_DIR/data/db.json \$SNAP
    echo 'Data snapshot preserved at: '\$SNAP
    ls -1t $PROD_BACKUP_DIR/db_*.json 2>/dev/null | tail -n +11 | xargs -r rm -f || true
  else
    echo 'No existing database found; initial clean install mode.'
  fi
"

# 3. Directory Layout Preparation
echo -e "\n[3/5] Synchronizing application release payload..."
ssh $SSH_OPTS "$PROD_SSH_USER@$PROD_SERVER_IP" "
  mkdir -p $PROD_APP_DIR/dist \
           $PROD_APP_DIR/server \
           $PROD_APP_DIR/config \
           $PROD_APP_DIR/src \
           $PROD_APP_DIR/public \
           $PROD_APP_DIR/scripts \
           $PROD_APP_DIR/data/targets/blackbox \
           $PROD_APP_DIR/data/targets/snmp \
           /etc/prometheus/targets/blackbox \
           /etc/prometheus/targets/snmp \
           /etc/nginx/sites-available
"

# Rsync release components
rsync -avz --delete -e "ssh $SSH_OPTS" dist/ "$PROD_SSH_USER@$PROD_SERVER_IP:$PROD_APP_DIR/dist/"
rsync -avz --exclude="node_modules" -e "ssh $SSH_OPTS" server/ "$PROD_SSH_USER@$PROD_SERVER_IP:$PROD_APP_DIR/server/"
if [ -d config ]; then
  rsync -avz -e "ssh $SSH_OPTS" config/ "$PROD_SSH_USER@$PROD_SERVER_IP:$PROD_APP_DIR/config/"
fi
rsync -avz -e "ssh $SSH_OPTS" src/ "$PROD_SSH_USER@$PROD_SERVER_IP:$PROD_APP_DIR/src/"
rsync -avz -e "ssh $SSH_OPTS" public/ "$PROD_SSH_USER@$PROD_SERVER_IP:$PROD_APP_DIR/public/"
rsync -avz -e "ssh $SSH_OPTS" scripts/ "$PROD_SSH_USER@$PROD_SERVER_IP:$PROD_APP_DIR/scripts/"
rsync -avz -e "ssh $SSH_OPTS" data/defaultDevices.json data/devices.template.json "$PROD_SSH_USER@$PROD_SERVER_IP:$PROD_APP_DIR/data/"
rsync -avz -e "ssh $SSH_OPTS" docker-compose.yml Dockerfile package.json package-lock.json index.html vite.config.js .env.example "$PROD_SSH_USER@$PROD_SERVER_IP:$PROD_APP_DIR/"

# 4. Remote Process Reload (Smart Docker Compose vs Native PM2/Systemd Detection)
echo -e "\n[4/5] Updating production dependencies & reloading service..."
ssh $SSH_OPTS "$PROD_SSH_USER@$PROD_SERVER_IP" "
  set -e
  cd $PROD_APP_DIR

  IS_DOCKER_RUNNING=false
  if command -v docker >/dev/null 2>&1; then
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -Eq '^netmonitor-(app|nginx|prometheus)$'; then
      IS_DOCKER_RUNNING=true
    fi
  fi

  if [ \"$DEPLOY_MODE\" = \"docker\" ] || ([ \"$DEPLOY_MODE\" = \"auto\" ] && [ \"\$IS_DOCKER_RUNNING\" = \"true\" ]); then
    echo 'Deploying via Docker Compose...'
    if [ ! -f .env ] && [ -f .env.example ]; then
      cp .env.example .env
    fi
    chown -R 10001:10001 data/ 2>/dev/null || chmod -R 777 data/ 2>/dev/null || true

    if docker compose version >/dev/null 2>&1; then
      docker compose up -d --build
    else
      docker-compose up -d --build
    fi

    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^netmonitor-app$'; then
      docker cp $PROD_APP_DIR/dist/. netmonitor-app:/app/dist/ 2>/dev/null || true
    fi
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^netmonitor-nginx$'; then
      docker exec netmonitor-nginx nginx -s reload 2>/dev/null || true
    fi
  else
    echo 'Deploying via Native PM2 / Systemd / Node Process Manager...'
    cd $PROD_APP_DIR/server
    npm ci --omit=dev --prefer-offline --no-audit || npm install --omit=dev --no-audit

    if command -v pm2 >/dev/null 2>&1; then
      if pm2 list | grep -q 'netmonitor-backend'; then
        pm2 reload netmonitor-backend --update-env || pm2 restart netmonitor-backend --update-env
      elif pm2 list | grep -q 'netmonitor'; then
        pm2 reload netmonitor --update-env || pm2 restart netmonitor --update-env
      elif pm2 list | grep -q 'server'; then
        pm2 reload server --update-env || pm2 restart server --update-env
      else
        pm2 start server.js --name netmonitor-backend
      fi
      pm2 save || true
    elif command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet netmonitor-backend 2>/dev/null; then
      systemctl restart netmonitor-backend
    elif command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet netmonitor 2>/dev/null; then
      systemctl restart netmonitor
    else
      pkill -f 'node.*server\.js' 2>/dev/null || true
      sleep 1
      nohup node server.js > /var/log/netmonitor.log 2>&1 &
    fi

    if command -v nginx >/dev/null 2>&1; then
      nginx -t 2>/dev/null && (systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null) || true
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
  HTTP_CODE_5001=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://$PROD_SERVER_IP:5001/api/health" || echo "000")
  if [ "$HTTP_CODE_5001" = "200" ]; then
    echo "✅ Healthcheck SUCCESS on port 5001 (HTTP 200). Service is healthy!"
    curl -s "http://$PROD_SERVER_IP:5001/api/health"
    echo ""
    exit 0
  fi
  echo "Attempt $i/15: Received HTTP80=$HTTP_CODE HTTP5001=$HTTP_CODE_5001, retrying in 3s..."
  sleep 3
done

echo "❌ [ERROR] Healthcheck failed after 15 attempts."
exit 1
