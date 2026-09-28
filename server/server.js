/**
 * NetMonitor Server-Side Storage API
 * High-performance, lightweight backend server (zero external dependencies).
 * Stores devices, settings, topology coordinates, and deleted IPs on server disk.
 */

const http = require('http');
const crypto = require('crypto');

const sessions = new Map();
const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// 5-Minute In-Memory Cache Layer for Prometheus Historical Analytics
const analyticsServerCache = new Map();
const ANALYTICS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const fs = require('fs');
const path = require('path');
const { scanNetwork } = require('./scanner');
const { resolveDeviceModule, resolveAuthProfile } = require('./snmpMapper');
const ping = require('ping');
const snmp = require('net-snmp');

const PORT = parseInt(process.env.PORT, 10) || 5001;
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const DEFAULT_DEVICES_FILE = path.resolve(__dirname, '../src/services/defaultDevices.json');
const PERF_HISTORY_FILE = path.join(DATA_DIR, 'perf_history.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load default seed data
function getDefaultData() {
  let devices = [];
  try {
    if (fs.existsSync(DEFAULT_DEVICES_FILE)) {
      devices = JSON.parse(fs.readFileSync(DEFAULT_DEVICES_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('[Server] Could not load defaultDevices.json:', e.message);
  }

  return {
    devices,
    settings: {
      prometheusUrl: 'http://192.168.109.147:9090',
      grafanaUrl: 'http://192.168.109.147:3000',
      snmpJob: 'snmp',
      blackboxJob: 'blackbox_icmp',
      refreshInterval: 10,
      orgName: 'SEAVL ENTERPRISE NETWORK',
      wanInterface: 'GigabitEthernet0/0/0',
      defaultCommunity: 'seavl77',
      defaultModule: 'if_mib',
      lineChannelToken: '',
      lineTargetId: '',
    },
    topology: {
      nodes: [],
      edges: [],
      positions: {},
      metadata: {
        lastDiscovered: null,
        algorithm: 'semi-automatic',
        layoutType: 'hierarchical',
        nodeCount: 0,
        edgeCount: 0,
      },
    },
    topologyPositions: {},
    deletedIps: [],
    updatedAt: new Date().toISOString(),
  };
}

// Read database from disk
function readDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        ...parsed, // Include any dynamic keys like alert_history, alert_rules, etc.
        devices: Array.isArray(parsed.devices) ? parsed.devices : [],
        settings: parsed.settings || getDefaultData().settings,
        topology: parsed.topology || {
          nodes: [],
          edges: [],
          positions: parsed.topologyPositions || {},
          metadata: { lastDiscovered: null, algorithm: 'semi-automatic', layoutType: 'hierarchical' },
        },
        topologyPositions: parsed.topologyPositions || (parsed.topology && parsed.topology.positions) || {},
        deletedIps: Array.isArray(parsed.deletedIps) ? parsed.deletedIps : [],
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch (err) {
    console.error('[Server] Read db.json error, resetting to defaults:', err.message);
  }

  const initial = getDefaultData();
  writeDb(initial);
  return initial;
}

// Write database to disk safely (atomic write via temp file)
function writeDb(data) {
  try {
    data.updatedAt = new Date().toISOString();
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, DB_FILE);
    return true;
  } catch (err) {
    console.error('[Server] Write db.json error:', err.message);
    return false;
  }
}

// Global DB write lock to prevent race conditions during simultaneous requests
let dbLock = Promise.resolve();

async function updateDb(updateFn) {
  dbLock = dbLock.then(async () => {
    const db = readDb();
    await updateFn(db);
    writeDb(db);
  }).catch(err => {
    console.error('[Server] DB Write Error:', err);
  });
  return dbLock;
}

// =============================================================================
// RUNTIME SETTINGS VALIDATION & SENSITIVE DATA SANITIZATION
// =============================================================================

const ALLOWED_MODULES = ['if_mib', 'cisco_switch', 'aruba_switch', 'host_resources', 'synology', 'apcups'];

function validateSettings(inputSettings) {
  if (!inputSettings || typeof inputSettings !== 'object') {
    return { valid: false, errors: ['Settings must be an object'], cleanSettings: {} };
  }

  const errors = [];
  const cleanSettings = {};

  // refreshInterval: integer 3 - 120 (seconds)
  if (inputSettings.refreshInterval !== undefined) {
    const val = Number(inputSettings.refreshInterval);
    if (!Number.isFinite(val) || val < 3 || val > 120) {
      errors.push('refreshInterval must be between 3 and 120 seconds');
    } else {
      cleanSettings.refreshInterval = Math.round(val);
    }
  }

  // prometheusUrl: valid HTTP/HTTPS URL
  if (inputSettings.prometheusUrl !== undefined) {
    const val = String(inputSettings.prometheusUrl).trim();
    if (!/^https?:\/\/.+/i.test(val)) {
      errors.push('prometheusUrl must be a valid HTTP or HTTPS URL (e.g. http://192.168.109.147:9090)');
    } else {
      cleanSettings.prometheusUrl = val.replace(/\/+$/, '');
    }
  }

  // grafanaUrl: optional valid HTTP/HTTPS URL
  if (inputSettings.grafanaUrl !== undefined) {
    const val = String(inputSettings.grafanaUrl).trim();
    if (val && !/^https?:\/\/.+/i.test(val)) {
      errors.push('grafanaUrl must be a valid HTTP or HTTPS URL if specified');
    } else {
      cleanSettings.grafanaUrl = val.replace(/\/+$/, '');
    }
  }

  // defaultModule: must be one of the known supported SNMP profiles
  if (inputSettings.defaultModule !== undefined) {
    const val = String(inputSettings.defaultModule).trim();
    if (!ALLOWED_MODULES.includes(val)) {
      errors.push(`defaultModule must be one of: ${ALLOWED_MODULES.join(', ')}`);
    } else {
      cleanSettings.defaultModule = val;
    }
  }

  // defaultCommunity: sensitive SNMP community string
  if (inputSettings.defaultCommunity !== undefined) {
    const val = String(inputSettings.defaultCommunity).trim();
    // Ignore placeholder '***' so backend doesn't overwrite real community with mask
    if (val && val !== '***') {
      if (val.length > 64) {
        errors.push('defaultCommunity must not exceed 64 characters');
      } else {
        cleanSettings.defaultCommunity = val;
      }
    }
  }

  // wanInterface: string identifier
  if (inputSettings.wanInterface !== undefined) {
    const val = String(inputSettings.wanInterface).trim();
    cleanSettings.wanInterface = val;
  }

  // wanIp: optional string IP
  if (inputSettings.wanIp !== undefined) {
    cleanSettings.wanIp = String(inputSettings.wanIp).trim();
  }

  // orgName: organization display name
  if (inputSettings.orgName !== undefined) {
    const val = String(inputSettings.orgName).trim();
    cleanSettings.orgName = val || 'SEAVL ENTERPRISE NETWORK';
  }

  // lineChannelToken: sensitive token or empty
  if (inputSettings.lineChannelToken !== undefined) {
    const val = String(inputSettings.lineChannelToken).trim();
    if (val && val !== '***') {
      cleanSettings.lineChannelToken = val;
    } else if (val === '') {
      cleanSettings.lineChannelToken = '';
    }
  }

  // lineTargetId: sensitive target or empty
  if (inputSettings.lineTargetId !== undefined) {
    const val = String(inputSettings.lineTargetId).trim();
    if (val && val !== '***') {
      cleanSettings.lineTargetId = val;
    } else if (val === '') {
      cleanSettings.lineTargetId = '';
    }
  }

  // emergencyUsername: local emergency admin username (default 'emergency')
  if (inputSettings.emergencyUsername !== undefined) {
    const val = String(inputSettings.emergencyUsername).trim();
    if (val.length > 32) {
      errors.push('emergencyUsername must not exceed 32 characters');
    } else {
      cleanSettings.emergencyUsername = val || 'emergency';
    }
  }

  // emergencyPassword: local break-glass password (sensitive)
  if (inputSettings.emergencyPassword !== undefined) {
    const val = String(inputSettings.emergencyPassword).trim();
    if (val && val !== '***') {
      if (val.length < 6) {
        errors.push('emergencyPassword must be at least 6 characters');
      } else if (val.length > 64) {
        errors.push('emergencyPassword must not exceed 64 characters');
      } else {
        cleanSettings.emergencyPassword = val;
      }
    }
  }

  // Pass-through harmless options
  if (inputSettings.enableAutoRefresh !== undefined) {
    cleanSettings.enableAutoRefresh = !!inputSettings.enableAutoRefresh;
  }
  if (inputSettings.theme !== undefined) {
    cleanSettings.theme = String(inputSettings.theme);
  }

  return {
    valid: errors.length === 0,
    errors,
    cleanSettings
  };
}

// Sanitize DB payload for frontend consumption
// Strips plaintext SNMP communities and masks sensitive credentials
function sanitizeDbForFrontend(data, userRole = 'Viewer') {
  if (!data || typeof data !== 'object') return data;
  const copy = JSON.parse(JSON.stringify(data));

  // 1. Strip community strings from devices
  if (Array.isArray(copy.devices)) {
    copy.devices = copy.devices.map(d => {
      if (d && typeof d === 'object') {
        const { community, ...safeDevice } = d;
        return safeDevice;
      }
      return d;
    });
  }

  // 2. Protect sensitive settings
  if (copy.settings && typeof copy.settings === 'object') {
    const hasComm = !!copy.settings.defaultCommunity;
    const hasLineToken = !!copy.settings.lineChannelToken;
    const hasLineTarget = !!copy.settings.lineTargetId;

    copy.settings.hasDefaultCommunity = hasComm;
    copy.settings.hasLineChannelToken = hasLineToken;
    copy.settings.hasLineTargetId = hasLineTarget;

    // Mask sensitive fields
    copy.settings.defaultCommunity = hasComm ? '***' : '';
    copy.settings.lineChannelToken = hasLineToken ? '***' : '';
    copy.settings.lineTargetId = hasLineTarget ? '***' : '';
    copy.settings.emergencyUsername = copy.settings.emergencyUsername || 'emergency';
    copy.settings.emergencyPassword = '***';
    copy.settings.hasEmergencyAuth = true;
  }

  return copy;
}

// CORS & Response Helper

// Auth & Session Helpers
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
    });
  }
  return list;
}

function checkSession(req) {
  const cookies = parseCookies(req);
  const token = cookies['nm_session'];
  if (!token) return null;
  const session = sessions.get(token);
  if (session && session.expires > Date.now()) {
    session.expires = Date.now() + SESSION_EXPIRY; // rolling session
    return session;
  }
  if (session) sessions.delete(token);
  return null;
}

// Emergency Break-Glass Authentication Helper
function verifyEmergencyCredentials(username, password, dbSettings = {}) {
  const configuredUser = (dbSettings.emergencyUsername || 'emergency').trim().toLowerCase();
  const configuredPass = dbSettings.emergencyPassword || 'emergency@netmon';
  const inputUser = String(username || '').trim().toLowerCase();
  const inputPass = String(password || '');

  // Accept configured emergency username, 'emergency', 'localadmin', and 'admin' in emergency mode
  const allowedUsers = [configuredUser, 'emergency', 'localadmin', 'admin'];
  if (!allowedUsers.includes(inputUser)) {
    return false;
  }

  if (inputPass.length !== configuredPass.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(inputPass), Buffer.from(configuredPass));
  } catch (e) {
    return inputPass === configuredPass;
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  });
  res.end(JSON.stringify(payload));
}

// Parse request JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e7) { // 10MB limit
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

// Initialize database on startup
readDb();

const trafficSubscribers = new Set();
let latestTrafficData = null;
let trafficPollerStarted = false;

function buildWanPromQL(dir = 'in', wanIf = '', wanIp = '') {
  const metricHC = dir === 'in' ? 'ifHCInOctets' : 'ifHCOutOctets';
  const metricStd = dir === 'in' ? 'ifInOctets' : 'ifOutOctets';

  const clauses = [];

  // Clause 1: Explicit interface configured by user (if specified and not 'auto'/'default')
  const cleanIf = (wanIf || '').trim();
  const cleanIp = (wanIp || '').trim();
  if (cleanIf && !['auto', 'default', 'none'].includes(cleanIf.toLowerCase())) {
    if (cleanIp) {
      clauses.push(`((sum(rate(${metricHC}{instance=~".*${cleanIp}.*", ifDescr=~".*${cleanIf}.*"}[5m]) or rate(${metricStd}{instance=~".*${cleanIp}.*", ifDescr=~".*${cleanIf}.*"}[5m])) * 8 / 1000000) > 0)`);
    } else {
      clauses.push(`((sum(rate(${metricHC}{ifDescr=~".*${cleanIf}.*"}[5m]) or rate(${metricStd}{ifDescr=~".*${cleanIf}.*"}[5m])) * 8 / 1000000) > 0)`);
      clauses.push(`((sum(rate(${metricHC}{ifName=~".*${cleanIf}.*"}[5m]) or rate(${metricStd}{ifName=~".*${cleanIf}.*"}[5m])) * 8 / 1000000) > 0)`);
      clauses.push(`((sum(rate(${metricHC}{ifAlias=~".*${cleanIf}.*"}[5m]) or rate(${metricStd}{ifAlias=~".*${cleanIf}.*"}[5m])) * 8 / 1000000) > 0)`);
    }
  }

  // Clause 2: Standard WAN/Internet/ISP aliases
  clauses.push(`((sum(rate(${metricHC}{ifAlias=~"(?i).*(internet|palo|wan|tot|ais|true|isp|gateway).*"}[5m]) or rate(${metricStd}{ifAlias=~"(?i).*(internet|palo|wan|tot|ais|true|isp|gateway).*"}[5m])) * 8 / 1000000) > 0)`);

  // Clause 3: Uplink / Backbone aliases and TenGigabit/Port-channel interfaces
  clauses.push(`((sum(rate(${metricHC}{ifAlias=~"(?i).*(uplink|core|backbone).*"}[5m]) or rate(${metricStd}{ifAlias=~"(?i).*(uplink|core|backbone).*"}[5m])) * 8 / 1000000) > 0)`);
  clauses.push(`((sum(rate(${metricHC}{ifDescr=~"(?i)(ten|twenty|port-channel).*"}[5m]) or rate(${metricStd}{ifDescr=~"(?i)(ten|twenty|port-channel).*"}[5m])) * 8 / 1000000) > 0)`);

  // Clause 4: Top switch / Core throughput fallback
  clauses.push(`((max(sum by (instance) (rate(${metricHC}[5m]) or rate(${metricStd}[5m]))) * 8 / 1000000) > 0)`);

  // Clause 5: Safe zero baseline
  clauses.push(`vector(0)`);

  return clauses.join(' or ');
}



let trafficTimer = null;
let alertTimer = null;
let perfTimer = null;

function getBackendRefreshIntervalMs() {
  try {
    const db = readDb();
    const sec = parseInt(db.settings?.refreshInterval, 10);
    if (!isNaN(sec) && sec >= 3 && sec <= 120) {
      return sec * 1000;
    }
  } catch {}
  return 10000;
}

async function pollTraffic() {
  try {
    const db = readDb();
    const promUrl = db.settings.prometheusUrl || 'http://127.0.0.1:9090';
    const wanIf = (db.settings && db.settings.wanInterface) ? db.settings.wanInterface : '';
    const wanIp = (db.settings && db.settings.wanIp) ? db.settings.wanIp : '';
    
    const syncTime = Math.floor(Date.now() / 15000) * 15;
    const start = syncTime - 60 * 15;
    const step = '15s';
    
    const wanInPromQL = buildWanPromQL('in', wanIf, wanIp);
    const wanOutPromQL = buildWanPromQL('out', wanIf, wanIp);
    
    const queries = [
      encodeURIComponent(wanInPromQL),
      encodeURIComponent(wanOutPromQL),
      encodeURIComponent('sum by (instance) (rate(ifHCInOctets[5m]) or rate(ifInOctets[5m])) * 8 / 1000000'),
      encodeURIComponent('sum by (instance) (rate(ifHCOutOctets[5m]) or rate(ifOutOctets[5m])) * 8 / 1000000')
    ];
    
    const [rIn, rOut, rDevIn, rDevOut] = await Promise.all([
      fetch(promUrl + '/api/v1/query_range?query=' + queries[0] + '&start=' + start + '&end=' + syncTime + '&step=' + step).then(r=>r.json()).catch(()=>null),
      fetch(promUrl + '/api/v1/query_range?query=' + queries[1] + '&start=' + start + '&end=' + syncTime + '&step=' + step).then(r=>r.json()).catch(()=>null),
      fetch(promUrl + '/api/v1/query?query=' + queries[2] + '&time=' + syncTime).then(r=>r.json()).catch(()=>null),
      fetch(promUrl + '/api/v1/query?query=' + queries[3] + '&time=' + syncTime).then(r=>r.json()).catch(()=>null)
    ]);
    
    if (rIn && rIn.status === 'success') {
      latestTrafficData = {
        time: syncTime,
        resIn: rIn.data.result,
        resOut: rOut && rOut.data ? rOut.data.result : null,
        resDevIn: rDevIn && rDevIn.data ? rDevIn.data.result : null,
        resDevOut: rDevOut && rDevOut.data ? rDevOut.data.result : null
      };
      
      const payload = JSON.stringify(latestTrafficData);
      trafficSubscribers.forEach(res => {
        res.write('data: ' + payload + '\n\n');
      });
    }
  } catch (e) {
    console.warn('[Server] Traffic poller error:', e.message);
  }
}

function restartBackendPollers() {
  const intervalMs = getBackendRefreshIntervalMs();
  console.log(`[Pollers] Rescheduling runtime pollers: traffic=${intervalMs/1000}s, alerts=${Math.max(intervalMs, 5000)/1000}s, perf=${Math.max(intervalMs * 2, 10000)/1000}s`);

  if (trafficTimer) clearInterval(trafficTimer);
  if (alertTimer) clearInterval(alertTimer);
  if (perfTimer) clearInterval(perfTimer);

  trafficTimer = setInterval(pollTraffic, intervalMs);
  if (typeof pollAlerts === 'function') {
    alertTimer = setInterval(pollAlerts, Math.max(intervalMs, 5000));
  }
  if (typeof pollPerf === 'function') {
    perfTimer = setInterval(pollPerf, Math.max(intervalMs * 2, 10000));
  }
}

/// --- Unified Alert Engine & LINE Integration (Backend Source of Truth) ---
const ALERT_HISTORY_FILE = path.join(DATA_DIR, 'alert_history.json');
const ALERT_ACK_FILE = path.join(DATA_DIR, 'alert_ack.json');

const alertSubscribers = new Set();
let activeAlertsMap = new Map(); // id -> normalized alert
let acknowledgedAlertIds = new Set(); // Set of alert IDs
let backendAlertHistory = []; // Array of resolved alert records
let notifiedAlertIds = new Set(); // Set of firing alert IDs that have already notified LINE
let latestAlerts = []; // Array of normalized alerts for SSE & GET
let latestIcmpStatus = {};

function loadAlertState() {
  try {
    if (fs.existsSync(ALERT_ACK_FILE)) {
      const raw = fs.readFileSync(ALERT_ACK_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        acknowledgedAlertIds = new Set(parsed);
        console.log(`[AlertEngine] Loaded ${acknowledgedAlertIds.size} acknowledged alert IDs.`);
      }
    }
  } catch (err) {
    console.warn('[AlertEngine] Could not load alert_ack.json:', err.message);
  }

  try {
    if (fs.existsSync(ALERT_HISTORY_FILE)) {
      const raw = fs.readFileSync(ALERT_HISTORY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        backendAlertHistory = parsed;
        console.log(`[AlertEngine] Loaded ${backendAlertHistory.length} alert history records.`);
      }
    }
  } catch (err) {
    console.warn('[AlertEngine] Could not load alert_history.json:', err.message);
  }
}

function saveAcknowledgedAlerts() {
  try {
    const tmp = `${ALERT_ACK_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Array.from(acknowledgedAlertIds)), 'utf8');
    fs.renameSync(tmp, ALERT_ACK_FILE);
  } catch (err) {
    console.warn('[AlertEngine] Could not save alert_ack.json:', err.message);
  }
}

function saveAlertHistory() {
  try {
    const tmp = `${ALERT_HISTORY_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(backendAlertHistory.slice(-1000)), 'utf8');
    fs.renameSync(tmp, ALERT_HISTORY_FILE);
  } catch (err) {
    console.warn('[AlertEngine] Could not save alert_history.json:', err.message);
  }
}

loadAlertState();

function broadcastActiveAlerts() {
  latestAlerts = Array.from(activeAlertsMap.values());
  const payload = JSON.stringify(latestAlerts);
  alertSubscribers.forEach(sub => {
    try {
      sub.write('data: ' + payload + '\n\n');
    } catch {}
  });
}

function normalizeAlert(raw) {
  const cleanIp = (raw.deviceIp || raw.instance || raw.target || '').replace(/:\d+$/, '').trim();
  const alertName = raw.title || raw.name || 'Alert';
  const startsAt = typeof raw.startsAt === 'number' ? raw.startsAt : (raw.startsAt ? new Date(raw.startsAt).getTime() : Date.now());

  return {
    id: raw.id,
    type: raw.type || 'prometheus',
    severity: raw.severity === 'critical' ? 'critical' : (raw.severity === 'warning' ? 'warning' : 'info'),
    deviceIp: cleanIp,
    deviceName: raw.deviceName || cleanIp,
    title: alertName,
    message: raw.message || raw.description || 'Threshold exceeded',
    startsAt,
    status: raw.status || 'firing',
    acknowledged: !!raw.acknowledged,
    // UI compatibility aliases
    name: alertName,
    description: raw.message || raw.description || 'Threshold exceeded',
    instance: cleanIp,
    time: new Date(startsAt).toLocaleTimeString('th-TH')
  };
}

async function sendLineNotification(token, targetId, alert, isRecovery = false) {
  if (!token || !targetId) return;
  const icon = isRecovery 
    ? '🟢' 
    : (alert.severity === 'critical' ? '🔴' : (alert.severity === 'warning' ? '🟡' : '🔵'));
  const org = (readDb().settings?.orgName || 'SEAVL ENTERPRISE NETWORK').trim();
  const message = `${icon} [${org}]: ${alert.title || alert.name}\n📍 Device: ${alert.deviceName ? `${alert.deviceName} (${alert.deviceIp || alert.instance})` : (alert.deviceIp || alert.instance)}\n📝 Detail: ${alert.message || alert.description}\n🕒 Time: ${new Date().toLocaleTimeString('th-TH')}`;

  try {
    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        to: targetId,
        messages: [{ type: 'text', text: message }]
      }),
      signal: AbortSignal.timeout(6000)
    });
  } catch (err) {
    console.error('[AlertEngine] Failed to send LINE Push Message:', err.message);
  }
}

async function pollAlerts() {
    try {
      const db = readDb();
      const promUrl = (db.settings?.prometheusUrl || 'http://127.0.0.1:9090').replace(/\/+$/, '');
      const lineToken = db.settings?.lineChannelToken;
      const lineTargetId = db.settings?.lineTargetId;
      const alertRules = db.alert_rules || {
        cpuThreshold: 80,
        memoryThreshold: 85,
        latencyThreshold: 150,
        offlineEnabled: true,
        cpuEnabled: true,
        memoryEnabled: true,
        latencyEnabled: true,
      };

      const [resAlerts, probeRes, upRes] = await Promise.allSettled([
        fetch(promUrl + '/api/v1/query?query=' + encodeURIComponent('ALERTS{alertstate="firing"}'), { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
        fetch(promUrl + '/api/v1/query?query=' + encodeURIComponent('probe_success'), { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
        fetch(promUrl + '/api/v1/query?query=' + encodeURIComponent('up'), { signal: AbortSignal.timeout(5000) }).then(r => r.json())
      ]);

      const newAlertsMap = new Map();

      // Device IP -> Device Name map
      const devNameMap = {};
      (db.devices || []).forEach(d => {
        if (d && d.ip) devNameMap[d.ip.trim()] = d.name || d.ip.trim();
      });

      // 1. Process Prometheus Native ALERTS{alertstate="firing"}
      if (resAlerts.status === 'fulfilled' && resAlerts.value?.status === 'success' && Array.isArray(resAlerts.value?.data?.result)) {
        resAlerts.value.data.result.forEach(r => {
          const rawInst = r.metric?.instance || r.metric?.target || 'unknown';
          const cleanIp = rawInst.replace(/:\d+$/, '').trim();
          const alertName = r.metric?.alertname || 'PrometheusAlert';
          const id = `prom-${alertName.toLowerCase()}-${cleanIp}`;

          const lowerName = alertName.toLowerCase();
          let type = 'prometheus';
          if (lowerName.includes('cpu')) type = 'cpu';
          else if (lowerName.includes('mem')) type = 'memory';
          else if (lowerName.includes('latency') || lowerName.includes('ping')) type = 'latency';
          else if (lowerName.includes('interface') || lowerName.includes('link')) type = 'interface';

          const existing = activeAlertsMap.get(id);
          const startsAt = existing ? existing.startsAt : Date.now();

          newAlertsMap.set(id, normalizeAlert({
            id,
            type,
            severity: r.metric?.severity || 'warning',
            deviceIp: cleanIp,
            deviceName: devNameMap[cleanIp] || cleanIp,
            title: alertName,
            message: r.metric?.description || r.metric?.summary || 'Metric threshold exceeded in Prometheus',
            startsAt,
            status: 'firing',
            acknowledged: acknowledgedAlertIds.has(id),
          }));
        });
      }

      // 2. Map ICMP Probe Results (blackbox)
      const icmpStatus = {};
      if (probeRes.status === 'fulfilled' && probeRes.value?.status === 'success' && Array.isArray(probeRes.value?.data?.result)) {
        probeRes.value.data.result.forEach(r => {
          const inst = (r.metric?.instance || r.metric?.target || '').replace(/:\d+$/, '').trim();
          const isSuccess = r.value && r.value[1] === '1';
          const job = r.metric?.job || '';
          const module = r.metric?.module || '';
          if (job.startsWith('blackbox') || module === 'icmp') {
            if (inst) icmpStatus[inst] = (icmpStatus[inst] === true) || isSuccess;
          }
        });
      }

      // 3. Evaluate Offline State for every device in inventory (Backend Source of Truth!)
      if (Array.isArray(db.devices) && alertRules.offlineEnabled !== false) {
        for (const d of db.devices) {
          if (!d || !d.ip) continue;
          const ip = d.ip.trim();
          if (db.deletedIps?.includes(ip)) continue;
          if (d.enabled === false || d.disabled === true || d.status === 'disabled') continue;

          let isAlive = icmpStatus[ip];
          if (isAlive === undefined) {
            try {
              const pRes = await ping.promise.probe(ip, { timeout: 2 });
              isAlive = pRes && pRes.alive === true;
              icmpStatus[ip] = isAlive;
            } catch {
              isAlive = false;
            }
          }

          if (isAlive === false) {
            const id = `offline-${ip}`;
            const existing = activeAlertsMap.get(id);
            const startsAt = existing ? existing.startsAt : Date.now();

            newAlertsMap.set(id, normalizeAlert({
              id,
              type: 'offline',
              severity: 'critical',
              deviceIp: ip,
              deviceName: d.name || ip,
              title: 'Device Offline',
              message: `The device is not responding to ICMP ping requests (Ping failed).`,
              startsAt,
              status: 'firing',
              acknowledged: acknowledgedAlertIds.has(id),
            }));
          }
        }
      }

      // 4. Evaluate Hardware Telemetry Thresholds from Backend SNMP Poller
      if (Array.isArray(db.devices)) {
        for (const d of db.devices) {
          if (!d || !d.ip) continue;
          const ip = d.ip.trim();
          if (icmpStatus[ip] === false) continue; // Don't trigger CPU/Mem if offline

          const perf = devicePerfCache[ip];
          if (!perf) continue;

          // CPU threshold
          if (alertRules.cpuEnabled && perf.cpu != null && perf.cpu > (alertRules.cpuThreshold || 80)) {
            const id = `cpu-${ip}`;
            const existing = activeAlertsMap.get(id);
            const startsAt = existing ? existing.startsAt : Date.now();
            newAlertsMap.set(id, normalizeAlert({
              id,
              type: 'cpu',
              severity: perf.cpu > 90 ? 'critical' : 'warning',
              deviceIp: ip,
              deviceName: d.name || ip,
              title: 'High CPU Utilization',
              message: `CPU usage reached ${perf.cpu.toFixed(1)}% (Threshold: ${alertRules.cpuThreshold || 80}%)`,
              startsAt,
              status: 'firing',
              acknowledged: acknowledgedAlertIds.has(id),
            }));
          }

          // Memory threshold
          if (alertRules.memoryEnabled && perf.memory != null && perf.memory > (alertRules.memoryThreshold || 85)) {
            const id = `mem-${ip}`;
            const existing = activeAlertsMap.get(id);
            const startsAt = existing ? existing.startsAt : Date.now();
            newAlertsMap.set(id, normalizeAlert({
              id,
              type: 'memory',
              severity: perf.memory > 95 ? 'critical' : 'warning',
              deviceIp: ip,
              deviceName: d.name || ip,
              title: 'High Memory Usage',
              message: `Memory usage reached ${perf.memory.toFixed(1)}% (Threshold: ${alertRules.memoryThreshold || 85}%)`,
              startsAt,
              status: 'firing',
              acknowledged: acknowledgedAlertIds.has(id),
            }));
          }
        }
      }

      // 5. Detect Resolved Alerts (Transition: Firing -> Resolved)
      let historyChanged = false;
      const now = Date.now();
      for (const [id, oldAlert] of activeAlertsMap.entries()) {
        if (!newAlertsMap.has(id)) {
          const resolvedEntry = {
            ...oldAlert,
            status: 'resolved',
            endsAt: now,
            endTime: now,
            resolvedAt: now,
            startTime: oldAlert.startsAt,
            durationSeconds: Math.round((now - oldAlert.startsAt) / 1000)
          };
          backendAlertHistory.push(resolvedEntry);
          historyChanged = true;

          if (acknowledgedAlertIds.has(id)) {
            acknowledgedAlertIds.delete(id);
            saveAcknowledgedAlerts();
          }

          if (notifiedAlertIds.has(id)) {
            notifiedAlertIds.delete(id);
            if (lineToken && lineTargetId) {
              sendLineNotification(lineToken, lineTargetId, oldAlert, true);
            }
          }

          console.log(`[AlertEngine] Alert resolved: ${id} (${oldAlert.title} on ${oldAlert.deviceIp})`);
        }
      }

      if (historyChanged) {
        saveAlertHistory();
      }

      // 6. Send LINE Notification for NEW Firing Alerts (Transition: Resolved/None -> Firing)
      if (lineToken && lineTargetId) {
        for (const [id, alert] of newAlertsMap.entries()) {
          if (!notifiedAlertIds.has(id)) {
            sendLineNotification(lineToken, lineTargetId, alert, false);
            notifiedAlertIds.add(id);
            console.log(`[AlertEngine] Sent LINE alert notification for ${id}`);
          }
        }
      }

      // 7. Update activeAlertsMap & Broadcast to SSE
      activeAlertsMap = newAlertsMap;
      latestIcmpStatus = icmpStatus;
      broadcastActiveAlerts();
    } catch (e) {
      console.warn('[AlertEngine] Poller error:', e.message);
    }
}

// =============================================================================
// REAL SNMP PERFORMANCE & HARDWARE HEALTH COLLECTOR (CPU, Mem, Temp, PSU, Fan, PoE)
// =============================================================================
let devicePerfCache = {}; // { [ip]: { ip, cpu, memory, uptime, serial, temp, psu, fans, poe, rebootRecent, health, lastUpdated } }
let devicePerfHistory = {}; // { [ip]: [ { t: timestamp, cpu: number|null, mem: number|null }, ... ] }

function loadPerfHistory() {
  try {
    if (fs.existsSync(PERF_HISTORY_FILE)) {
      const raw = fs.readFileSync(PERF_HISTORY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        devicePerfHistory = parsed;
        console.log(`[Server] Loaded performance history for ${Object.keys(devicePerfHistory).length} devices.`);
      }
    }
  } catch (err) {
    console.warn('[Server] Could not load perf_history.json:', err.message);
  }
}

function savePerfHistory() {
  try {
    const tmp = `${PERF_HISTORY_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(devicePerfHistory), 'utf8');
    fs.renameSync(tmp, PERF_HISTORY_FILE);
  } catch (err) {
    console.warn('[Server] Could not save perf_history.json:', err.message);
  }
}

/**
 * Synthesizes Prometheus Range Query format from NetMonitor's real SNMP telemetry history.
 * Used when Prometheus TSDB has 0 series for CPU/Memory (e.g. due to if_mib or Catalyst SMB switches).
 */
function synthesizePerfHistorySeries(isCpu, startSec, endSec) {
  const startMs = startSec * 1000;
  const endMs = endSec * 1000;
  const result = [];

  for (const [ip, points] of Object.entries(devicePerfHistory)) {
    if (!Array.isArray(points) || points.length === 0) continue;

    let inWindow = points.filter(p => p && p.t >= startMs && p.t <= endMs);
    if (inWindow.length === 0 && points.length > 0) {
      inWindow = points.slice(-Math.min(points.length, 120));
    }
    if (inWindow.length === 0) continue;

    const values = [];
    inWindow.forEach(p => {
      const val = isCpu ? p.cpu : p.mem;
      if (val !== null && val !== undefined && !isNaN(val)) {
        const sec = Math.floor(p.t / 1000);
        values.push([sec, String(val)]);
      }
    });

    if (values.length > 0) {
      result.push({
        metric: { instance: ip, job: 'snmp' },
        values
      });
    }
  }

  return result;
}

loadPerfHistory();
const savePerfInterval = setInterval(savePerfHistory, 60000); // Auto-save memory history every 1 minute
if (savePerfInterval.unref) savePerfInterval.unref();

process.on('SIGINT', () => {
  savePerfHistory();
  process.exit(0);
});
process.on('SIGTERM', () => {
  savePerfHistory();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.warn('[Server] Handled unhandledRejection:', reason ? (reason.message || reason) : 'Unknown reason');
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Handled uncaughtException:', err.message);
});

function queryDevicePerformance(ip, community) {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, community, {
      timeout: 1500,
      retries: 1,
      version: snmp.Version2c
    });

    const scalarOids = [
      '1.3.6.1.2.1.1.3.0', // sysUpTime
      '1.3.6.1.2.1.1.1.0', // sysDescr
      '1.3.6.1.4.1.9.2.1.57.0', // cisco avgBusy5
      '1.3.6.1.4.1.9.6.1.101.1.8.0', // cisco smb cpu 5min
      '1.3.6.1.4.1.9.6.1.101.1.7.0', // cisco smb cpu 1min
      '1.3.6.1.4.1.11.2.14.11.5.1.9.6.1.0', // hpSwitchCpuStat
      '1.3.6.1.4.1.6574.1.1.0', // synoCPU
      '1.3.6.1.4.1.6574.1.3.0', // synoMemory
    ];

    const tableRoots = [
      '1.3.6.1.2.1.47.1.1.1.1.11',     // entPhysicalSerialNum
      '1.3.6.1.4.1.9.9.109.1.1.1.1.5', // cpmCPUTotal5minRev
      '1.3.6.1.4.1.9.9.48.1.1.1.5',    // ciscoMemoryPoolUsed
      '1.3.6.1.4.1.9.9.48.1.1.1.6',    // ciscoMemoryPoolFree
      '1.3.6.1.4.1.11.2.14.11.5.1.1.2.1.1.1.5', // hpSwitchMemoryTotal
      '1.3.6.1.4.1.11.2.14.11.5.1.1.2.1.1.1.7', // hpSwitchMemoryAllocated
      '1.3.6.1.2.1.25.3.3.1.2',       // hrProcessorLoad
      '1.3.6.1.4.1.9.9.13.1.3.1.3',    // ciscoEnvMonTemperatureValue
      '1.3.6.1.4.1.9.9.91.1.1.1.1.4',  // entSensorValue
      '1.3.6.1.4.1.9.6.1.101.53.15.1.10', // ciscoSmbTemperature (Catalyst 1200/1300/CBS)
      '1.3.6.1.4.1.9.9.13.1.5.1.3',    // ciscoEnvMonSupplyState
      '1.3.6.1.4.1.9.9.13.1.4.1.3',    // ciscoEnvMonFanState
      '1.3.6.1.2.1.105.1.3.1.1.2',     // pethMainPsePower
      '1.3.6.1.2.1.105.1.3.1.1.4',     // pethMainPseConsumptionPower
    ];

    session.get(scalarOids, (err1, vbs1) => {
      session.getNext(tableRoots, (err2, vbs2) => {
        session.close();
        const map = {};
        if (!err1 && vbs1) {
          vbs1.forEach(vb => {
            if (!snmp.isVarbindError(vb)) map[vb.oid] = vb.value.toString();
          });
        }
        if (!err2 && vbs2) {
          vbs2.forEach(vb => {
            if (!snmp.isVarbindError(vb)) map[vb.oid] = vb.value.toString();
          });
        }

        // 1. Uptime & Reboot Detection
        let uptime = null;
        let rebootRecent = false;
        if (map['1.3.6.1.2.1.1.3.0']) {
          uptime = parseInt(map['1.3.6.1.2.1.1.3.0'], 10);
          if (!isNaN(uptime) && uptime > 0 && uptime < 60000) { // < 10 mins (600s = 60,000 centiseconds)
            rebootRecent = true;
          }
        }

        // 2. Serial Number
        let serial = null;
        for (const k in map) {
          if (k.startsWith('1.3.6.1.2.1.47.1.1.1.1.11.')) {
            const s = (map[k] || '').trim();
            if (s && s.length >= 4 && !s.includes('\0')) {
              serial = s;
              break;
            }
          }
        }

        // 3. CPU (%)
        let cpu = null;
        // 3.1 Cisco Catalyst IOS / IOS-XE
        for (const k in map) {
          if (k.startsWith('1.3.6.1.4.1.9.9.109.1.1.1.1.5.')) {
            cpu = parseFloat(map[k]);
            break;
          }
        }
        // 3.2 Cisco SMB (Catalyst 1200 / 1300)
        if (cpu === null && map['1.3.6.1.4.1.9.6.1.101.1.8.0']) {
          cpu = parseFloat(map['1.3.6.1.4.1.9.6.1.101.1.8.0']);
        }
        if (cpu === null && map['1.3.6.1.4.1.9.6.1.101.1.7.0']) {
          cpu = parseFloat(map['1.3.6.1.4.1.9.6.1.101.1.7.0']);
        }
        // 3.3 Cisco legacy avgBusy5
        if (cpu === null && map['1.3.6.1.4.1.9.2.1.57.0']) {
          cpu = parseFloat(map['1.3.6.1.4.1.9.2.1.57.0']);
        }
        // 3.4 HP / Aruba 2530
        if (cpu === null && map['1.3.6.1.4.1.11.2.14.11.5.1.9.6.1.0']) {
          cpu = parseFloat(map['1.3.6.1.4.1.11.2.14.11.5.1.9.6.1.0']);
        }
        // 3.5 Synology CPU
        if (cpu === null && map['1.3.6.1.4.1.6574.1.1.0']) {
          cpu = parseFloat(map['1.3.6.1.4.1.6574.1.1.0']);
        }
        // 3.6 Host Resources
        if (cpu === null) {
          for (const k in map) {
            if (k.startsWith('1.3.6.1.2.1.25.3.3.1.2.')) {
              cpu = parseFloat(map[k]);
              break;
            }
          }
        }

        // 4. Memory (%)
        let memory = null;
        // 4.1 Cisco Memory Pool
        let ciscoUsed = null, ciscoFree = null;
        for (const k in map) {
          if (k.startsWith('1.3.6.1.4.1.9.9.48.1.1.1.5.')) ciscoUsed = parseFloat(map[k]);
          if (k.startsWith('1.3.6.1.4.1.9.9.48.1.1.1.6.')) ciscoFree = parseFloat(map[k]);
        }
        if (ciscoUsed !== null && ciscoFree !== null && (ciscoUsed + ciscoFree) > 0) {
          memory = (ciscoUsed / (ciscoUsed + ciscoFree)) * 100;
        }

        // 4.2 HP / Aruba Memory
        let hpTotal = null, hpAlloc = null;
        for (const k in map) {
          if (k.startsWith('1.3.6.1.4.1.11.2.14.11.5.1.1.2.1.1.1.5.')) hpTotal = parseFloat(map[k]);
          if (k.startsWith('1.3.6.1.4.1.11.2.14.11.5.1.1.2.1.1.1.7.')) hpAlloc = parseFloat(map[k]);
        }
        if (hpTotal !== null && hpAlloc !== null && hpTotal > 0) {
          memory = (hpAlloc / hpTotal) * 100;
        }

        // 4.3 Synology Memory
        if (memory === null && map['1.3.6.1.4.1.6574.1.3.0']) {
          memory = parseFloat(map['1.3.6.1.4.1.6574.1.3.0']);
        }

        // 5. Environmental: Temperature (°C)
        let temp = null;
        for (const k in map) {
          if (
            k.startsWith('1.3.6.1.4.1.9.9.13.1.3.1.3.') ||
            k.startsWith('1.3.6.1.4.1.9.9.91.1.1.1.1.4.') ||
            k.startsWith('1.3.6.1.4.1.9.6.1.101.53.15.1.10.')
          ) {
            const val = parseFloat(map[k]);
            if (!isNaN(val) && val >= 10 && val <= 120) {
              if (temp === null || val > temp) temp = val;
            }
          }
        }

        // 6. Environmental: Power Supply (PSU)
        let psuStatus = 'normal';
        let psuLabel = 'Normal';
        const psuStates = [];
        for (const k in map) {
          if (k.startsWith('1.3.6.1.4.1.9.9.13.1.5.1.3.')) {
            psuStates.push(parseInt(map[k], 10));
          }
        }
        if (psuStates.length > 0) {
          const hasFault = psuStates.some(s => s === 3 || s === 4);
          const hasWarning = psuStates.some(s => s === 2);
          if (hasFault) {
            psuStatus = 'critical';
            psuLabel = 'PSU Fault';
          } else if (hasWarning) {
            psuStatus = 'warning';
            psuLabel = 'PSU Warning';
          } else if (psuStates.length >= 2) {
            psuStatus = 'normal';
            psuLabel = 'Dual PSU: OK';
          } else {
            psuStatus = 'normal';
            psuLabel = 'Single PSU: OK';
          }
        }

        // 7. Environmental: Cooling Fan
        let fanStatus = 'normal';
        let fanLabel = 'Normal';
        const fanStates = [];
        for (const k in map) {
          if (k.startsWith('1.3.6.1.4.1.9.9.13.1.4.1.3.')) {
            fanStates.push(parseInt(map[k], 10));
          }
        }
        if (fanStates.length > 0) {
          const hasFault = fanStates.some(s => s === 3 || s === 4);
          const hasWarning = fanStates.some(s => s === 2);
          if (hasFault) {
            fanStatus = 'critical';
            fanLabel = 'Fan Failure';
          } else if (hasWarning) {
            fanStatus = 'warning';
            fanLabel = 'Fan Warning';
          } else {
            fanStatus = 'normal';
            fanLabel = 'All Fans OK';
          }
        }

        // 8. PoE Power Utilization (Watts)
        let poe = null;
        let poeBudget = null, poeConsumed = null;
        for (const k in map) {
          if (k.startsWith('1.3.6.1.2.1.105.1.3.1.1.2.')) poeBudget = parseFloat(map[k]);
          if (k.startsWith('1.3.6.1.2.1.105.1.3.1.1.4.')) poeConsumed = parseFloat(map[k]);
        }
        if (poeBudget !== null && poeConsumed !== null && poeBudget > 0) {
          poe = {
            budgetWatts: poeBudget,
            usedWatts: poeConsumed,
            percent: Math.round((poeConsumed / poeBudget) * 100)
          };
        }

        // 9. Overall Health Assessment
        let health = 'normal';
        if ((temp !== null && temp > 70) || psuStatus === 'critical' || fanStatus === 'critical') {
          health = 'critical';
        } else if (
          (cpu !== null && cpu > 75) ||
          (memory !== null && memory > 80) ||
          (temp !== null && temp > 60) ||
          rebootRecent ||
          psuStatus === 'warning' ||
          fanStatus === 'warning'
        ) {
          health = 'warning';
        }

        resolve({
          ip,
          cpu: cpu !== null && !isNaN(cpu) ? Math.min(Math.max(cpu, 0), 100) : null,
          memory: memory !== null && !isNaN(memory) ? Math.min(Math.max(memory, 0), 100) : null,
          uptime: uptime !== null && !isNaN(uptime) ? uptime : null,
          serial,
          temp,
          psu: { status: psuStatus, label: psuLabel },
          fans: { status: fanStatus, label: fanLabel },
          poe,
          rebootRecent,
          health,
          lastUpdated: Date.now()
        });
      });
    });
  });
}

let isPerfPolling = false;

async function pollPerf() {
  if (isPerfPolling) return;
  isPerfPolling = true;

  try {
    const db = readDb();
    const defaultCommunity = db.settings?.defaultCommunity || 'seavl77';
    const devices = (db.devices || []).filter(d => !db.deletedIps?.includes(d.ip));

    const now = Date.now();

    // Separate online devices from offline devices
    // User requirement: Strictly rely on ping! Only query devices that are alive via ICMP.
    const onlineDevices = [];
    for (const d of devices) {
      const isAlive = latestIcmpStatus[d.ip];
      if (isAlive === false) {
        devicePerfCache[d.ip] = {
          ip: d.ip,
          cpu: 0,
          memory: 0,
          uptime: null,
          serial: null,
          temp: null,
          psu: { status: 'offline', label: 'Offline' },
          fans: { status: 'offline', label: 'Offline' },
          poe: null,
          rebootRecent: false,
          health: 'offline',
          lastUpdated: now
        };

        if (!devicePerfHistory[d.ip]) devicePerfHistory[d.ip] = [];
        devicePerfHistory[d.ip].push({ t: now, cpu: 0, mem: 0 });
        if (devicePerfHistory[d.ip].length > 2880) devicePerfHistory[d.ip].shift();
      } else {
        onlineDevices.push(d);
      }
    }

    // Query online devices in parallel
    const results = await Promise.allSettled(
      onlineDevices.map(d => queryDevicePerformance(d.ip, d.community || defaultCommunity))
    );

    results.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value) {
        const devIp = onlineDevices[idx].ip;
        devicePerfCache[devIp] = r.value;

        const memVal = r.value.memory !== null && !isNaN(r.value.memory) ? Math.round(r.value.memory * 10) / 10 : null;
        const cpuVal = r.value.cpu !== null && !isNaN(r.value.cpu) ? Math.round(r.value.cpu * 10) / 10 : null;

        if (!devicePerfHistory[devIp]) {
          devicePerfHistory[devIp] = [];
        }

        // If history is newly initialized, seed baseline samples for smooth initial chart rendering
        if (devicePerfHistory[devIp].length === 0 && (memVal !== null || cpuVal !== null)) {
          for (let i = 5; i >= 1; i--) {
            devicePerfHistory[devIp].push({
              t: now - (i * 30000),
              cpu: cpuVal,
              mem: memVal
            });
          }
        }

        devicePerfHistory[devIp].push({
          t: now,
          cpu: cpuVal,
          mem: memVal
        });

        if (devicePerfHistory[devIp].length > 2880) {
          devicePerfHistory[devIp].shift();
        }
      }
    });

    // Persist to disk immediately so historical data is never lost across restarts
    savePerfHistory();
  } catch (e) {
    console.warn('[Server] Perf poller error:', e.message);
  } finally {
    isPerfPolling = false;
  }
}

// =============================================================================
// PROMETHEUS TARGET GENERATION ENGINE (Single Source of Truth)
// =============================================================================

function resolveTargetPaths() {
  const customBase = process.env.PROMETHEUS_TARGETS_DIR;
  let baseDir = customBase || '/etc/prometheus/targets';

  // Fallback for dev environments (e.g. Windows) where /etc/prometheus is unavailable
  if (!customBase && process.platform === 'win32' && !fs.existsSync('/etc/prometheus')) {
    baseDir = path.resolve(DATA_DIR, 'targets');
  }

  return {
    baseDir,
    blackboxDir: path.join(baseDir, 'blackbox'),
    blackboxFile: path.join(baseDir, 'blackbox', 'netmonitor.yml'),
    snmpDir: path.join(baseDir, 'snmp'),
    snmpFile: path.join(baseDir, 'snmp', 'netmonitor.yml'),
    legacyTargetDirs: ['/etc/prometheus/target', '/etc/prometheus/targets'],
  };
}

function getActiveDevices(db) {
  const deletedSet = new Set((db.deletedIps || []).map(ip => String(ip).trim()));
  return (db.devices || []).filter(d => {
    if (!d || !d.ip || typeof d.ip !== 'string') return false;
    const ip = d.ip.trim();
    if (!ip) return false;
    if (deletedSet.has(ip)) return false;
    if (d.enabled === false || d.disabled === true || d.status === 'disabled') return false;
    return true;
  });
}

function generateTargetsYaml(activeDevices, defaultSettings = {}) {
  // Requirement 8: If no devices exist, return valid empty list []
  if (!activeDevices || activeDevices.length === 0) {
    const emptyYaml = "# Auto-generated by NetMonitor Backend Server (empty target list)\n[]\n";
    return {
      blackboxYaml: emptyYaml,
      snmpYaml: emptyYaml,
      targetCount: 0,
    };
  }

  // 1. Blackbox ICMP YAML (Requirement 6: only targets for ICMP)
  let blackboxYaml = `# Auto-generated by NetMonitor Backend Server\n# Job: blackbox-icmp\n- targets:\n`;
  activeDevices.forEach(d => {
    blackboxYaml += `    - '${d.ip.trim()}'\n`;
  });
  blackboxYaml += `  labels:\n    job: 'blackbox-icmp'\n    module: 'icmp'\n`;

  // 2. SNMP YAML (Single generic job, module & auth labels)
  let snmpYaml = `# Auto-generated by NetMonitor Backend Server\n# Job: snmp\n`;
  activeDevices.forEach(d => {
    const ip = d.ip.trim();
    // Use central SNMP mapping engine (eliminates phantom modules & maps community to auth profiles)
    const mod = resolveDeviceModule(d);
    const auth = resolveAuthProfile(d.community || defaultSettings.defaultCommunity);
    const safeName = (d.name || ip).replace(/['"\\]/g, '');
    const safeType = (d.type || 'switch').replace(/['"\\]/g, '');
    const safeVendor = (d.vendor || '').replace(/['"\\]/g, '');
    const safeLocation = (d.location || '').replace(/['"\\]/g, '');

    snmpYaml += `- targets:\n    - '${ip}'\n`;
    snmpYaml += `  labels:\n`;
    snmpYaml += `    job: 'snmp'\n`;
    snmpYaml += `    target: '${ip}'\n`;
    snmpYaml += `    module: '${mod}'\n`;
    snmpYaml += `    auth: '${auth}'\n`;
    if (safeName) snmpYaml += `    name: '${safeName}'\n`;
    if (safeType) snmpYaml += `    type: '${safeType}'\n`;
    if (safeVendor) snmpYaml += `    vendor: '${safeVendor}'\n`;
    if (safeLocation) snmpYaml += `    location: '${safeLocation}'\n`;
    snmpYaml += `\n`;
  });

  return {
    blackboxYaml,
    snmpYaml,
    targetCount: activeDevices.length,
  };
}

function atomicWriteFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, filePath);
}

let lastTargetHash = null;
let isSyncingTargets = false;
let queuedSyncReason = null;
let syncDebounceTimer = null;
let pendingSyncReason = null;

async function performSyncTargets(reason = 'unknown') {
  try {
    const db = readDb();
    const activeDevices = getActiveDevices(db);
    const { blackboxYaml, snmpYaml, targetCount } = generateTargetsYaml(activeDevices, db.settings || {});

    // Compute hash to detect if target contents changed
    const currentHash = crypto.createHash('sha256').update(`${blackboxYaml}###${snmpYaml}`).digest('hex');

    const paths = resolveTargetPaths();

    // Check if on-disk files already match
    let filesMatchDisk = false;
    try {
      if (fs.existsSync(paths.blackboxFile) && fs.existsSync(paths.snmpFile)) {
        const diskBlackbox = fs.readFileSync(paths.blackboxFile, 'utf8');
        const diskSnmp = fs.readFileSync(paths.snmpFile, 'utf8');
        if (diskBlackbox === blackboxYaml && diskSnmp === snmpYaml) {
          filesMatchDisk = true;
        }
      }
    } catch {}

    if (filesMatchDisk && currentHash === lastTargetHash) {
      // Content unchanged, skip writing and reload
      console.log(`[Prometheus] Targets unchanged (hash: ${currentHash.slice(0, 8)}) - skipping reload`);
      return;
    }

    console.log(`[Prometheus] Target changed (reason: ${reason}, active devices: ${targetCount})`);
    console.log(`[Prometheus] Writing config to ${paths.blackboxFile} and ${paths.snmpFile}`);

    // Atomic writes
    atomicWriteFile(paths.blackboxFile, blackboxYaml);
    atomicWriteFile(paths.snmpFile, snmpYaml);

    // Backward compatibility: Also write targets to legacy dirs (e.g. /etc/prometheus/target/)
    paths.legacyTargetDirs.forEach(dir => {
      try {
        if (fs.existsSync(dir)) {
          atomicWriteFile(path.join(dir, 'netmonitor_blackbox.yml'), blackboxYaml);
          atomicWriteFile(path.join(dir, 'netmonitor_snmp.yml'), snmpYaml);
          const oldFile = path.join(dir, 'netmonitor_devices.yml');
          if (fs.existsSync(oldFile)) {
            fs.writeFileSync(oldFile, '# Deprecated: targets moved to netmonitor_blackbox.yml and netmonitor_snmp.yml\n[]\n', 'utf8');
          }
        }
      } catch (err) {
        console.warn('[Prometheus] Legacy target write notice:', err.message);
      }
    });

    lastTargetHash = currentHash;

    // Reload Prometheus (only when target changed)
    const promUrl = (db.settings?.prometheusUrl || 'http://127.0.0.1:9090').replace(/\/+$/, '');
    try {
      const res = await fetch(promUrl + '/-/reload', { method: 'POST', signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        console.log(`[Prometheus] Reload successful (HTTP ${res.status})`);
      } else {
        console.warn(`[Prometheus] Reload failed: HTTP ${res.status} ${res.statusText}`);
      }
    } catch (reloadErr) {
      console.warn(`[Prometheus] Reload failed: ${reloadErr.message}`);
    }
  } catch (err) {
    // If config generation or write failed: do NOT reload Prometheus
    console.error('[Prometheus] Target generation/write failed - skipping reload:', err.message);
  }
}

/**
 * Concurrency-safe Module-level function to synchronize Prometheus targets.
 */
async function syncPrometheusTargets(options = {}) {
  const reason = options.reason || 'manual';

  if (isSyncingTargets) {
    queuedSyncReason = reason;
    console.log(`[Prometheus] Sync already in progress, queued next sync (reason: ${reason})`);
    return;
  }

  isSyncingTargets = true;
  try {
    let currentReason = reason;
    do {
      queuedSyncReason = null;
      await performSyncTargets(currentReason);
      if (queuedSyncReason) {
        currentReason = queuedSyncReason;
      }
    } while (queuedSyncReason);
  } catch (err) {
    console.error('[Prometheus] Target sync error:', err.message);
  } finally {
    isSyncingTargets = false;
  }
}

/**
 * Debounced trigger for Prometheus target synchronization.
 * Coalesces rapid sequential CRUD operations (e.g. within 1.5s) into a single generation & reload.
 */
function schedulePrometheusSync(reason = 'device_update', delayMs = 1500) {
  pendingSyncReason = reason;
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    const currentReason = pendingSyncReason || reason;
    pendingSyncReason = null;
    syncPrometheusTargets({ reason: currentReason });
  }, delayMs);
}

const server = http.createServer(async (req, res) => {
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  // 1. Auth Endpoints
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { username, password, isEmergency } = body;
      if (!username || !password) return sendJson(res, 400, { success: false, error: 'Missing credentials' });

      const db = readDb();
      const settings = db.settings || {};
      const inputUser = String(username).trim();
      const lowerUser = inputUser.toLowerCase();

      // Explicit Emergency Login (via flag or emergency username)
      const isExplicitEmergency = isEmergency === true || lowerUser === 'emergency' || lowerUser === 'localadmin';
      if (isExplicitEmergency) {
        if (verifyEmergencyCredentials(inputUser, password, settings)) {
          const token = crypto.randomBytes(32).toString('hex');
          sessions.set(token, {
            username: inputUser,
            name: 'Emergency Administrator',
            role: 'Admin',
            isEmergency: true,
            expires: Date.now() + SESSION_EXPIRY
          });
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `nm_session=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`,
          });
          return res.end(JSON.stringify({
            success: true,
            user: { username: inputUser, role: 'Admin', name: 'Emergency Administrator', isEmergency: true },
            message: 'เข้าสู่ระบบฉุกเฉิน (Emergency Break-Glass) สำเร็จ'
          }));
        } else {
          return sendJson(res, 401, {
            success: false,
            error: 'รหัสผ่านเข้าสู่ระบบฉุกเฉิน (Emergency Break-Glass) ไม่ถูกต้อง'
          });
        }
      }

      // Normal Login: Attempt Grafana SSO with a 5-second timeout
      const grafanaUrl = (settings.grafanaUrl || 'http://127.0.0.1:3000').replace(/\/+$/, '');
      const authHeader = 'Basic ' + Buffer.from(inputUser + ':' + password).toString('base64');
      
      let userRes;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        userRes = await fetch(grafanaUrl + '/api/user', {
          headers: { 'Authorization': authHeader },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      } catch (e) {
        // Grafana unreachable / down / timed out: check if credentials match emergency fallback!
        if (verifyEmergencyCredentials(inputUser, password, settings)) {
          const token = crypto.randomBytes(32).toString('hex');
          sessions.set(token, {
            username: inputUser,
            name: 'Emergency Administrator',
            role: 'Admin',
            isEmergency: true,
            expires: Date.now() + SESSION_EXPIRY
          });
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `nm_session=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`,
          });
          return res.end(JSON.stringify({
            success: true,
            user: { username: inputUser, role: 'Admin', name: 'Emergency Administrator', isEmergency: true },
            notice: 'Grafana ไม่พร้อมใช้งาน - เข้าสู่ระบบด้วยบัญชีฉุกเฉินอัตโนมัติ'
          }));
        }

        return sendJson(res, 502, {
          success: false,
          error: 'ไม่สามารถเชื่อมต่อกับ Grafana Server ได้ (คุณสามารถคลิก "เข้าสู่ระบบฉุกเฉิน" เพื่อเข้าจัดการระบบได้)',
          canUseEmergency: true
        });
      }

      if (userRes.status === 401 || userRes.status === 403) {
        // If Grafana rejects, also check if credentials match emergency credentials
        if (verifyEmergencyCredentials(inputUser, password, settings)) {
          const token = crypto.randomBytes(32).toString('hex');
          sessions.set(token, {
            username: inputUser,
            name: 'Emergency Administrator',
            role: 'Admin',
            isEmergency: true,
            expires: Date.now() + SESSION_EXPIRY
          });
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `nm_session=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`,
          });
          return res.end(JSON.stringify({
            success: true,
            user: { username: inputUser, role: 'Admin', name: 'Emergency Administrator', isEmergency: true }
          }));
        }
        return sendJson(res, 401, { success: false, error: 'Invalid credentials' });
      }

      if (!userRes.ok) {
        if (verifyEmergencyCredentials(inputUser, password, settings)) {
          const token = crypto.randomBytes(32).toString('hex');
          sessions.set(token, {
            username: inputUser,
            name: 'Emergency Administrator',
            role: 'Admin',
            isEmergency: true,
            expires: Date.now() + SESSION_EXPIRY
          });
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `nm_session=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`,
          });
          return res.end(JSON.stringify({
            success: true,
            user: { username: inputUser, role: 'Admin', name: 'Emergency Administrator', isEmergency: true }
          }));
        }
        return sendJson(res, 500, { success: false, error: 'Grafana error' });
      }

      const userData = await userRes.json();
      const isAnon = !userData.login || userData.login.toLowerCase() === 'anonymous';
      if (isAnon) return sendJson(res, 401, { success: false, error: 'Invalid credentials (Anonymous)' });

      let role = userData.isGrafanaAdmin ? 'Admin' : 'Viewer';
      if (!userData.isGrafanaAdmin) {
        try {
          const orgsRes = await fetch(grafanaUrl + '/api/user/orgs', { headers: { 'Authorization': authHeader } });
          if (orgsRes.ok) {
            const orgs = await orgsRes.json();
            const currentOrg = orgs.find(o => o.orgId === userData.orgId);
            if (currentOrg && currentOrg.role) {
              role = currentOrg.role;
            }
          }
        } catch (e) {}
      }

      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, {
        username: userData.login,
        name: userData.name || userData.login,
        role: role,
        isEmergency: false,
        expires: Date.now() + SESSION_EXPIRY
      });

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `nm_session=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`,
      });
      return res.end(JSON.stringify({ success: true, user: { username: userData.login, role, name: userData.name || userData.login, isEmergency: false } }));
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const session = checkSession(req);
    if (!session) return sendJson(res, 401, { error: 'Unauthorized' });
    return sendJson(res, 200, {
      user: {
        username: session.username,
        role: session.role,
        name: session.name,
        isEmergency: !!session.isEmergency
      }
    });
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const cookies = parseCookies(req);
    const token = cookies['nm_session'];
    if (token) sessions.delete(token);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'nm_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax',
    });
    return res.end(JSON.stringify({ success: true }));
  }

  // Change Emergency Admin Password Endpoint
  if (pathname === '/api/auth/emergency-password' && req.method === 'POST') {
    const session = checkSession(req);
    if (!session) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
    if (session.role !== 'Admin') return sendJson(res, 403, { success: false, error: 'Forbidden. Admin role required.' });

    try {
      const body = await parseBody(req);
      const targetPass = body.newPassword || body.emergencyPassword;
      const targetUser = body.newUsername || body.emergencyUsername;

      if (!targetPass) {
        return sendJson(res, 400, { success: false, error: 'กรุณาระบุรหัสผ่านฉุกเฉินใหม่' });
      }
      const strPass = String(targetPass).trim();
      if (strPass.length < 6) {
        return sendJson(res, 400, { success: false, error: 'รหัสผ่านฉุกเฉินต้องมีความยาวอย่างน้อย 6 ตัวอักษร' });
      }
      if (strPass.length > 64) {
        return sendJson(res, 400, { success: false, error: 'รหัสผ่านฉุกเฉินต้องมีความยาวไม่เกิน 64 ตัวอักษร' });
      }

      await updateDb(db => {
        if (!db.settings) db.settings = {};
        db.settings.emergencyPassword = strPass;
        if (targetUser && String(targetUser).trim()) {
          db.settings.emergencyUsername = String(targetUser).trim();
        }
      });

      return sendJson(res, 200, {
        success: true,
        message: 'เปลี่ยนรหัสผ่านฉุกเฉินสำเร็จเรียบร้อย',
        emergencyUsername: targetUser ? String(targetUser).trim() : 'emergency'
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // Health check endpoint (Public, no auth needed)
  if (req.method === 'GET' && (pathname === '/api/health' || pathname === '/health')) {
    return sendJson(res, 200, {
      status: 'ok',
      backend: 'running',
      port: PORT,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    });
  }

  // 2. Protect Storage API (exempt telemetry/stream read endpoints)
  if (
    (pathname === '/api/storage' || pathname.startsWith('/api/storage/')) &&
    !pathname.startsWith('/api/storage/stream/') &&
    pathname !== '/api/storage/device_performance' &&
    pathname !== '/api/storage/devices/performance' &&
    !pathname.startsWith('/api/storage/device_history')
  ) {
    const session = checkSession(req);
    if (!session) return sendJson(res, 401, { error: 'Unauthorized' });
    req.user = session; // Attach user to request
  }


  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${pathname}`);

  try {
    // Traffic SSE Stream
    if (pathname === '/api/storage/stream/traffic') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no'
      });
      trafficSubscribers.add(res);
      if (latestTrafficData) {
        res.write('data: ' + JSON.stringify(latestTrafficData) + '\n\n');
      }
      req.on('close', () => trafficSubscribers.delete(res));
      return;
    }

    // Alerts SSE Stream
    if (pathname === '/api/storage/stream/alerts') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no'
      });
      alertSubscribers.add(res);
      if (latestAlerts) {
        res.write('data: ' + JSON.stringify(latestAlerts) + '\n\n');
      }
      req.on('close', () => alertSubscribers.delete(res));
      return;
    }

    // --- Unified Alert API Endpoints (Backend Source of Truth) ---
    if (pathname === '/api/alerts/active' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, alerts: Array.from(activeAlertsMap.values()) });
    }

    if ((pathname === '/api/alerts/history' || pathname === '/api/storage/alert_history') && req.method === 'GET') {
      const list = backendAlertHistory.slice(-500).reverse();
      return sendJson(res, 200, { ok: true, data: list, history: list });
    }

    if (pathname === '/api/alerts/acknowledged' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, acknowledgedIds: Array.from(acknowledgedAlertIds) });
    }

    if (pathname === '/api/alerts/acknowledge' && req.method === 'POST') {
      try {
        const body = await parseBody(req);
        const id = body.id;
        if (!id) return sendJson(res, 400, { ok: false, error: 'Alert ID is required' });
        acknowledgedAlertIds.add(id);
        saveAcknowledgedAlerts();
        const alert = activeAlertsMap.get(id);
        if (alert) alert.acknowledged = true;
        broadcastActiveAlerts();
        return sendJson(res, 200, { ok: true, id, acknowledged: true });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    if (pathname === '/api/alerts/unacknowledge' && req.method === 'POST') {
      try {
        const body = await parseBody(req);
        const id = body.id;
        if (!id) return sendJson(res, 400, { ok: false, error: 'Alert ID is required' });
        acknowledgedAlertIds.delete(id);
        saveAcknowledgedAlerts();
        const alert = activeAlertsMap.get(id);
        if (alert) alert.acknowledged = false;
        broadcastActiveAlerts();
        return sendJson(res, 200, { ok: true, id, acknowledged: false });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    if (pathname === '/api/alerts/acknowledge-all' && req.method === 'POST') {
      for (const [id, alert] of activeAlertsMap.entries()) {
        acknowledgedAlertIds.add(id);
        alert.acknowledged = true;
      }
      saveAcknowledgedAlerts();
      broadcastActiveAlerts();
      return sendJson(res, 200, { ok: true, count: activeAlertsMap.size });
    }

    if (pathname === '/api/alerts/clear-history' && req.method === 'POST') {
      backendAlertHistory = [];
      saveAlertHistory();
      return sendJson(res, 200, { ok: true, message: 'Alert history cleared' });
    }

    // --- Historical Analytics API Endpoints (Batch query_range + 5m Server Cache) ---
    if (pathname === '/api/analytics/query_range' && (req.method === 'GET' || req.method === 'POST')) {
      let query = url.searchParams.get('query');
      let start = url.searchParams.get('start');
      let end = url.searchParams.get('end');
      let step = url.searchParams.get('step') || '30s';
      let bypassCache = url.searchParams.get('bypassCache') === 'true';

      if (req.method === 'POST') {
        try {
          const body = await parseBody(req);
          if (body.query) query = body.query;
          if (body.start) start = body.start;
          if (body.end) end = body.end;
          if (body.step) step = body.step;
          if (body.bypassCache !== undefined) bypassCache = !!body.bypassCache;
        } catch {}
      }

      if (!query || !start || !end) {
        return sendJson(res, 400, { ok: false, error: 'Missing required parameters: query, start, end' });
      }

      const cacheKey = `${query}:${start}:${end}:${step}`;
      const now = Date.now();

      // Check 5-minute cache
      if (!bypassCache) {
        const cached = analyticsServerCache.get(cacheKey);
        if (cached && (now - cached.time) < ANALYTICS_CACHE_TTL) {
          return sendJson(res, 200, {
            ok: true,
            cached: true,
            cacheAgeMs: now - cached.time,
            data: cached.data
          });
        }
      }

      const db = readDb();
      const promBase = (db.settings?.prometheusUrl || 'http://127.0.0.1:9090').replace(/\/+$/, '');
      const promUrl = `${promBase}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${step}`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const pRes = await fetch(promUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!pRes.ok) {
          throw new Error(`Prometheus returned HTTP ${pRes.status}`);
        }

        const pJson = await pRes.json();
        if (pJson.status !== 'success') {
          throw new Error(pJson.error || 'Prometheus query failed');
        }

        let resultData = pJson.data?.result || [];

        // Check if query is for CPU or Memory
        const isCpuQuery = query.includes('cpmCPUTotal') || query.includes('Cpu') || query.includes('hrProcessorLoad');
        const isMemQuery = query.includes('ciscoMemoryPool') || query.includes('Mem') || query.includes('hrStorageUsed');

        // If Prometheus returned 0 series for CPU or Memory (due to if_mib or Catalyst SMB switches),
        // synthesize from NetMonitor's real SNMP telemetry history (devicePerfHistory)!
        if (resultData.length === 0 && (isCpuQuery || isMemQuery)) {
          const synth = synthesizePerfHistorySeries(isCpuQuery, parseInt(start, 10), parseInt(end, 10));
          if (synth.length > 0) {
            resultData = synth;
          }
        }

        analyticsServerCache.set(cacheKey, { time: now, data: resultData });

        // Prune cache if over 300 entries
        if (analyticsServerCache.size > 300) {
          for (const [k, v] of analyticsServerCache.entries()) {
            if (now - v.time > ANALYTICS_CACHE_TTL) analyticsServerCache.delete(k);
          }
        }

        return sendJson(res, 200, { ok: true, cached: false, data: resultData });
      } catch (err) {
        console.warn(`[Server] Analytics range query failed (${err.message}). Checking fallback...`);
        const isCpuQuery = query && (query.includes('cpmCPUTotal') || query.includes('Cpu') || query.includes('hrProcessorLoad'));
        const isMemQuery = query && (query.includes('ciscoMemoryPool') || query.includes('Mem') || query.includes('hrStorageUsed'));

        if (isCpuQuery || isMemQuery) {
          const synth = synthesizePerfHistorySeries(isCpuQuery, parseInt(start, 10), parseInt(end, 10));
          if (synth.length > 0) {
            analyticsServerCache.set(cacheKey, { time: now, data: synth });
            return sendJson(res, 200, { ok: true, cached: false, data: synth });
          }
        }

        return sendJson(res, 200, {
          ok: false,
          unavailable: true,
          error: 'Analytics unavailable',
          message: 'ไม่สามารถเชื่อมต่อกับ Prometheus Server ได้',
          data: []
        });
      }
    }

    if (pathname === '/api/analytics/clear-cache' && req.method === 'POST') {
      const count = analyticsServerCache.size;
      analyticsServerCache.clear();
      return sendJson(res, 200, { ok: true, message: `Cleared ${count} entries from analytics cache` });
    }

    // Real SNMP Performance Endpoints (CPU, Memory, Uptime)
    if (req.method === 'GET' && (
      pathname === '/api/devices/performance' ||
      pathname === '/api/storage/device_performance' ||
      pathname === '/api/storage/devices/performance'
    )) {
      return sendJson(res, 200, { ok: true, data: devicePerfCache });
    }

    const singlePerfMatch = pathname.match(/^\/api\/devices\/([^/]+)\/performance$/);
    if (req.method === 'GET' && singlePerfMatch) {
      const targetIp = singlePerfMatch[1];
      const perf = devicePerfCache[targetIp] || null;
      return sendJson(res, 200, { ok: true, data: perf });
    }

    // Historical Telemetry Endpoints (CPU & Memory Time-Series)
    const historyMatch = pathname.match(/^\/api\/devices\/([^/]+)\/history$/) ||
                         pathname.match(/^\/api\/storage\/device_history\/([^/]+)$/);
    if (req.method === 'GET' && (historyMatch || pathname === '/api/storage/device_history')) {
      let targetIp = (historyMatch ? historyMatch[1] : (url.searchParams.get('ip') || '')).trim().replace(/:\d+$/, '');
      if (!targetIp) {
        return sendJson(res, 400, { ok: false, error: 'Target IP is required' });
      }

      const range = (url.searchParams.get('range') || '1h').toLowerCase();
      let durationMs = 3600 * 1000; // default 1h
      if (range === '12h') durationMs = 12 * 3600 * 1000;
      else if (range === '24h') durationMs = 24 * 3600 * 1000;

      const cutoff = Date.now() - durationMs;
      let rawList = devicePerfHistory[targetIp] || [];

      // If history is empty, check cache or query SNMP on-demand
      if (rawList.length === 0) {
        let perf = devicePerfCache[targetIp];
        if (!perf) {
          const db = readDb();
          const d = (db.devices || []).find(dev => dev.ip === targetIp);
          if (d) {
            const defaultCommunity = db.settings?.defaultCommunity || 'seavl77';
            try {
              perf = await queryDevicePerformance(targetIp, d.community || defaultCommunity);
              if (perf) devicePerfCache[targetIp] = perf;
            } catch {}
          }
        }

        if (perf && (perf.cpu !== null || perf.memory !== null)) {
          const now = Date.now();
          const memVal = perf.memory !== null && !isNaN(perf.memory) ? Math.round(perf.memory * 10) / 10 : null;
          const cpuVal = perf.cpu !== null && !isNaN(perf.cpu) ? Math.round(perf.cpu * 10) / 10 : null;
          devicePerfHistory[targetIp] = [];
          for (let i = 5; i >= 0; i--) {
            devicePerfHistory[targetIp].push({
              t: now - (i * 30000),
              cpu: cpuVal,
              mem: memVal
            });
          }
          savePerfHistory();
          rawList = devicePerfHistory[targetIp];
        }
      }

      const filtered = rawList.filter(item => item.t >= cutoff);
      return sendJson(res, 200, { ok: true, ip: targetIp, range, history: filtered });
    }

    // Health check
    if (pathname === '/health' || pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, message: 'NetMonitor Storage API is running', timestamp: new Date().toISOString() });
    }

    // POST /api/storage/scan - Subnet Scanner
    if (req.method === 'POST' && pathname === '/api/storage/scan') {
      if (req.user.role === 'Viewer') return sendJson(res, 403, { error: 'Forbidden. Editor or Admin only.' });
      try {
        const body = await parseBody(req);
        const ipRange = body.ipRange || '';
        if (!ipRange) {
          return sendJson(res, 400, { ok: false, error: 'ipRange is required' });
        }
        const db = readDb();
        const defaultCommunity = db.settings?.defaultCommunity || 'seavl77';
        const defaultModule = db.settings?.defaultModule || 'if_mib';
        const community = (body.community && body.community !== '***') ? body.community : defaultCommunity;
        
        console.log(`[Server] Starting scan for ${ipRange} with community '${community}', defaultModule='${defaultModule}'`);
        const results = await scanNetwork(ipRange, community, defaultModule);
        return sendJson(res, 200, { ok: true, data: results });
      } catch (err) {
        console.error('[Server] Scan error:', err);
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    // GET all server storage state
    if (req.method === 'GET' && (pathname === '/api/storage' || pathname === '/api/storage/all')) {
      const db = readDb();
      const safeDb = sanitizeDbForFrontend(db, req.user.role);
      return sendJson(res, 200, { ok: true, data: safeDb });
    }

    // POST /api/storage/all - Full Sync / Batch save
    if (req.method === 'POST' && (pathname === '/api/storage' || pathname === '/api/storage/all')) {
      if (req.user?.role === 'Viewer') return sendJson(res, 403, { error: 'Forbidden. Editor or Admin only.' });
      const body = await parseBody(req);
      let devicesOrSnmpChanged = false;
      let pollerChanged = false;

      await updateDb(db => {
        if (Array.isArray(body.devices)) {
          const existingCommunityMap = new Map();
          (db.devices || []).forEach(d => {
            if (d && d.ip) existingCommunityMap.set(d.ip, d.community);
          });
          const defaultCommunity = db.settings?.defaultCommunity || 'seavl77';

          const mergedDevices = body.devices.map(d => {
            let comm = d.community;
            if (!comm || comm === '***') {
              comm = existingCommunityMap.get(d.ip) || defaultCommunity;
            }
            return {
              ...d,
              community: comm
            };
          });

          if (JSON.stringify(db.devices) !== JSON.stringify(mergedDevices)) {
            db.devices = mergedDevices;
            devicesOrSnmpChanged = true;
          }
        }
        if (body.settings && typeof body.settings === 'object') {
          const validation = validateSettings(body.settings);
          if (validation.valid) {
            const prev = db.settings || {};
            const next = { ...prev, ...validation.cleanSettings };
            if (
              prev.defaultCommunity !== next.defaultCommunity ||
              prev.defaultModule !== next.defaultModule ||
              prev.prometheusUrl !== next.prometheusUrl
            ) {
              devicesOrSnmpChanged = true;
            }
            if (prev.refreshInterval !== next.refreshInterval) {
              pollerChanged = true;
            }
            db.settings = next;
          }
        }
        if (body.topologyPositions && typeof body.topologyPositions === 'object') {
          db.topologyPositions = body.topologyPositions;
        }
        if (Array.isArray(body.deletedIps)) {
          if (JSON.stringify(db.deletedIps) !== JSON.stringify(body.deletedIps)) {
            db.deletedIps = body.deletedIps;
            devicesOrSnmpChanged = true;
          }
        }
      });
      if (devicesOrSnmpChanged) {
        schedulePrometheusSync('storage_batch_update');
      }
      if (pollerChanged) {
        restartBackendPollers();
      }
      const updatedDb = readDb();
      const safeDb = sanitizeDbForFrontend(updatedDb, req.user.role);
      return sendJson(res, 200, { ok: true, message: 'Server database updated', data: safeDb });
    }

    // GET / POST /api/storage/devices
    if (pathname === '/api/storage/devices') {
      if (req.method === 'GET') {
        const db = readDb();
        const safeDb = sanitizeDbForFrontend(db, req.user.role);
        return sendJson(res, 200, { ok: true, devices: safeDb.devices });
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        if (req.user.role === 'Viewer') return sendJson(res, 403, { error: 'Forbidden. Editor or Admin only.' });
        const body = await parseBody(req);
        const incomingDevices = Array.isArray(body) ? body : (Array.isArray(body.devices) ? body.devices : null);
        if (!incomingDevices) {
          return sendJson(res, 400, { ok: false, error: 'Expected array of devices' });
        }
        await updateDb(db => {
          const existingCommunityMap = new Map();
          (db.devices || []).forEach(d => {
            if (d && d.ip) existingCommunityMap.set(d.ip, d.community);
          });
          const defaultCommunity = db.settings?.defaultCommunity || 'seavl77';

          db.devices = incomingDevices.map(d => {
            let comm = d.community;
            if (!comm || comm === '***') {
              comm = existingCommunityMap.get(d.ip) || defaultCommunity;
            }
            return {
              ...d,
              community: comm
            };
          });
        });
        schedulePrometheusSync('devices_updated');
        return sendJson(res, 200, { ok: true, count: incomingDevices.length, message: `Saved ${incomingDevices.length} devices to server` });
      }
      if (req.method === 'DELETE') {
        if (req.user.role === 'Viewer') return sendJson(res, 403, { error: 'Forbidden. Editor or Admin only.' });
        // Handle delete if needed
      }
    }

    // GET / POST /api/storage/settings
    if (pathname === '/api/storage/settings') {
      if (req.method === 'GET') {
        const db = readDb();
        const safeDb = sanitizeDbForFrontend(db, req.user.role);
        return sendJson(res, 200, { ok: true, settings: safeDb.settings });
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        if (req.user.role !== 'Admin') return sendJson(res, 403, { error: 'Forbidden. Admin only.' });
        const body = await parseBody(req);
        const incoming = body.settings || body;
        if (!incoming || typeof incoming !== 'object') {
          return sendJson(res, 400, { ok: false, error: 'Expected settings object' });
        }

        const validation = validateSettings(incoming);
        if (!validation.valid) {
          return sendJson(res, 400, { ok: false, error: validation.errors.join('; '), errors: validation.errors });
        }

        let snmpChanged = false;
        let pollerChanged = false;

        await updateDb(db => {
          const prev = db.settings || {};
          const next = { ...prev, ...validation.cleanSettings };
          if (
            prev.defaultCommunity !== next.defaultCommunity ||
            prev.defaultModule !== next.defaultModule ||
            prev.prometheusUrl !== next.prometheusUrl
          ) {
            snmpChanged = true;
          }
          if (prev.refreshInterval !== next.refreshInterval) {
            pollerChanged = true;
          }
          db.settings = next;
        });

        if (snmpChanged) {
          schedulePrometheusSync('settings_snmp_changed');
        }

        if (pollerChanged) {
          restartBackendPollers();
        }

        const updatedDb = readDb();
        const safeDb = sanitizeDbForFrontend(updatedDb, req.user.role);
        return sendJson(res, 200, { ok: true, settings: safeDb.settings, message: 'Saved settings to server' });
      }
    }

    // GET / POST /api/storage/topology
    if (pathname === '/api/storage/topology') {
      if (req.method === 'GET') {
        const db = readDb();
        return sendJson(res, 200, {
          ok: true,
          topology: db.topology || { nodes: [], edges: [], positions: db.topologyPositions || {}, metadata: {} },
          topologyPositions: db.topologyPositions || (db.topology && db.topology.positions) || {},
        });
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        if (req.user.role === 'Viewer') return sendJson(res, 403, { error: 'Forbidden.' });
        const body = await parseBody(req);
        if (!body || typeof body !== 'object') {
          return sendJson(res, 400, { ok: false, error: 'Expected topology object or positions' });
        }
        await updateDb(db => {
          if (body.nodes || body.edges || body.metadata) {
            // Full topology payload
            const positions = body.positions || body.topologyPositions || (db.topology && db.topology.positions) || db.topologyPositions || {};
            db.topology = {
              nodes: Array.isArray(body.nodes) ? body.nodes : (db.topology?.nodes || []),
              edges: Array.isArray(body.edges) ? body.edges : (db.topology?.edges || []),
              positions,
              metadata: {
                ...(db.topology?.metadata || {}),
                ...(body.metadata || {}),
                lastUpdated: new Date().toISOString(),
              },
            };
            db.topologyPositions = positions;
          } else {
            // Legacy positions payload: { [id]: { x, y } } or { topologyPositions: ... }
            const positions = body.topologyPositions || body;
            db.topologyPositions = positions;
            if (db.topology) {
              db.topology.positions = positions;
            }
          }
        });
        return sendJson(res, 200, { ok: true, message: 'Saved topology to server' });
      }
    }

    // GET / POST /api/storage/deleted-ips
    if (pathname === '/api/storage/deleted-ips') {
      if (req.method === 'GET') {
        const db = readDb();
        return sendJson(res, 200, { ok: true, deletedIps: db.deletedIps });
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        if (req.user.role === 'Viewer') return sendJson(res, 403, { error: 'Forbidden. Editor or Admin only.' });
        const body = await parseBody(req);
        const ips = Array.isArray(body) ? body : (Array.isArray(body.deletedIps) ? body.deletedIps : []);
        await updateDb(db => {
          db.deletedIps = ips;
        });
        schedulePrometheusSync('deleted_ips_updated');
        return sendJson(res, 200, { ok: true, message: 'Saved deleted IPs to server' });
      }
    }

    // GET /api/storage/prometheus-targets - Preview generated target configs
    if (req.method === 'GET' && (pathname === '/api/storage/prometheus-targets' || pathname === '/api/storage/prometheus-yaml')) {
      const db = readDb();
      const activeDevices = getActiveDevices(db);
      const { blackboxYaml, snmpYaml, targetCount } = generateTargetsYaml(activeDevices, db.settings || {});
      return sendJson(res, 200, {
        ok: true,
        targetCount,
        blackbox: blackboxYaml,
        snmp: snmpYaml,
      });
    }

    // POST /api/storage/prometheus-yaml - Deprecated / disabled
    if (req.method === 'POST' && pathname === '/api/storage/prometheus-yaml') {
      return sendJson(res, 400, {
        ok: false,
        error: 'Direct YAML upload has been deprecated. Target generation is managed automatically by the backend server.'
      });
    }

    // Dynamic fallback for any other /api/storage/:key (e.g. alert_history, alert_rules)
    if (pathname.startsWith('/api/storage/')) {
      const key = pathname.replace('/api/storage/', '');
      if (key) {
        const db = readDb();
        if (req.method === 'GET') {
          let data = db[key];
          if (key === 'settings') {
            data = sanitizeDbForFrontend({ settings: data }, req.user.role).settings;
          }
          return sendJson(res, 200, { ok: true, data });
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          if (key === 'settings') {
            if (req.user.role !== 'Admin') return sendJson(res, 403, { error: 'Forbidden. Admin only.' });
            const body = await parseBody(req);
            const val = body.value !== undefined ? body.value : body;
            const validation = validateSettings(val);
            if (!validation.valid) {
              return sendJson(res, 400, { ok: false, error: validation.errors.join('; '), errors: validation.errors });
            }
            let pollerChanged = false;
            let snmpChanged = false;
            await updateDb(db => {
              const prev = db.settings || {};
              const next = { ...prev, ...validation.cleanSettings };
              if (
                prev.defaultCommunity !== next.defaultCommunity ||
                prev.defaultModule !== next.defaultModule ||
                prev.prometheusUrl !== next.prometheusUrl
              ) {
                snmpChanged = true;
              }
              if (prev.refreshInterval !== next.refreshInterval) {
                pollerChanged = true;
              }
              db.settings = next;
            });
            if (snmpChanged) schedulePrometheusSync('settings_snmp_changed');
            if (pollerChanged) restartBackendPollers();
            const safeDb = sanitizeDbForFrontend(readDb(), req.user.role);
            return sendJson(res, 200, { ok: true, message: `Saved settings to server`, data: safeDb.settings });
          }

          if (key === 'alert_history' || key === 'alert_acknowledged_ids') {
             // Editor can ack alerts
             if (req.user.role === 'Viewer') return sendJson(res, 403, { error: 'Forbidden.' });
          } else {
             // For arbitrary keys, only Editor/Admin allowed
             if (req.user.role !== 'Admin' && req.user.role !== 'Editor') return sendJson(res, 403, { error: 'Forbidden.' });
          }

          const body = await parseBody(req);
          const value = body.value !== undefined ? body.value : body;
          await updateDb(db => {
            db[key] = value;
          });
          return sendJson(res, 200, { ok: true, message: `Saved ${key} to server` });
        }
      }
    }

    // 404 Not Found
    return sendJson(res, 404, { ok: false, error: 'Endpoint not found', path: pathname });
  } catch (err) {
    console.error('[Server] Handler error:', err);
    return sendJson(res, 500, { ok: false, error: err.message || 'Internal server error' });
  }
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🚀 NetMonitor Server Storage API running on port ${PORT}`);
    console.log(`📁 Database file: ${DB_FILE}`);
    console.log(`====================================================`);

    // Initial sync on startup
    syncPrometheusTargets({ reason: 'startup' });

    // Initial poller executions
    pollAlerts();
    setTimeout(pollPerf, 500);

    // Dynamic poller scheduling based on runtime settings
    restartBackendPollers();
  });
}

module.exports = {
  server,
  validateSettings,
  sanitizeDbForFrontend,
  verifyEmergencyCredentials,
  sessions,
  restartBackendPollers,
  generateTargetsYaml,
  getActiveDevices,
  pollAlerts,
  pollPerf,
  analyticsServerCache,
  ANALYTICS_CACHE_TTL
};
