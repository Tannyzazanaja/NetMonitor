const ping = require('ping');
const snmp = require('net-snmp');
const net = require('net');
const { resolveDeviceModule } = require('./snmpMapper');

const isWin = process.platform === 'win32';

// OIDs for Discovery
const OID_SYSDESCR = '1.3.6.1.2.1.1.1.0';
const OID_SYSOBJID = '1.3.6.1.2.1.1.2.0';
const OID_SYSNAME  = '1.3.6.1.2.1.1.5.0';

// Worker pool to execute items with concurrency limit
async function mapPool(items, concurrency, fn) {
  if (!items || items.length === 0) return [];
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await fn(items[cur], cur);
    }
  });
  await Promise.all(workers);
  return results;
}

// Parse IP range like "192.168.1.1-254", "192.168.1.0/24", or comma-separated lists
function generateIpList(ipRange) {
  const ips = [];
  const trimRange = (ipRange || '').trim();
  if (!trimRange) return ips;

  // Comma-separated list support (e.g. 192.168.1.1, 192.168.1.2)
  if (trimRange.includes(',')) {
    const splitIps = trimRange.split(',').map(s => s.trim()).filter(Boolean);
    for (const item of splitIps) {
      ips.push(...generateIpList(item));
    }
    return [...new Set(ips)];
  }

  if (trimRange.includes('-')) {
    // 192.168.1.1-254 or 192.168.1.1-192.168.1.254
    const parts = trimRange.split('-');
    if (parts.length === 2) {
      const startParts = parts[0].trim().split('.');
      if (startParts.length === 4) {
        const base = `${startParts[0]}.${startParts[1]}.${startParts[2]}`;
        const start = parseInt(startParts[3], 10);
        let end = parseInt(parts[1].trim(), 10);
        
        // Handle cases like 192.168.1.10-192.168.1.50
        if (parts[1].includes('.')) {
          const endParts = parts[1].trim().split('.');
          end = parseInt(endParts[3], 10);
        }

        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let i = start; i <= end; i++) {
            ips.push(`${base}.${i}`);
          }
        }
      }
    }
  } else if (trimRange.includes('/24')) {
    // 192.168.1.0/24 -> 192.168.1.1 to 192.168.1.254
    const baseIp = trimRange.split('/')[0];
    const baseParts = baseIp.split('.');
    if (baseParts.length === 4) {
      const base = `${baseParts[0]}.${baseParts[1]}.${baseParts[2]}`;
      for (let i = 1; i <= 254; i++) {
        ips.push(`${base}.${i}`);
      }
    }
  } else {
    // Single IP
    ips.push(trimRange);
  }

  return ips;
}

// SNMP Get with non-blocking UDP and optimized timeout
function getSnmpData(ip, community, oids, timeout = 750) {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, community, {
      timeout,
      retries: 0, // no slow retries for dead/empty IPs
      version: snmp.Version2c
    });

    session.get(oids, (error, varbinds) => {
      session.close();
      if (error || !varbinds) {
        resolve(null);
      } else {
        const result = {};
        for (let i = 0; i < varbinds.length; i++) {
          if (snmp.isVarbindError(varbinds[i])) {
            continue;
          }
          result[oids[i]] = varbinds[i].value.toString();
        }
        resolve(result);
      }
    });
  });
}

// Fast In-Process TCP Probe (Checks ports 80, 443, 22, 445)
// If port is listening -> connect succeeds (host is alive)
// If port is closed -> OS sends TCP RST (ECONNREFUSED) in < 5ms (host is alive!)
function fastTcpProbe(ip, timeout = 300) {
  const ports = [80, 443, 22, 445];
  return Promise.any(ports.map(port => new Promise((resolve, reject) => {
    const s = new net.Socket();
    s.setTimeout(timeout);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', (e) => {
      s.destroy();
      if (e.code === 'ECONNREFUSED') resolve(true);
      else reject(e);
    });
    s.on('timeout', () => { s.destroy(); reject(new Error('timeout')); });
    s.connect(port, ip);
  }))).then(() => true).catch(() => false);
}

// OS-Optimized ICMP Ping Probe
function fastPingProbe(ip, timeoutSec = 0.5) {
  // On Windows: NEVER pass extra: ['-c', '1'] because -c requires admin and fails!
  const config = isWin 
    ? { timeout: timeoutSec, min_reply: 1 } 
    : { timeout: 1, min_reply: 1, extra: ['-c', '1'] };
  return ping.promise.probe(ip, config)
    .then(res => Boolean(res && res.alive))
    .catch(() => false);
}

function detectDevice(raw, name) {
  const rawLower = (raw || '').toLowerCase();
  const nameLower = (name || '').toLowerCase();
  
  // Default
  let type = 'switch';
  let vendor = 'Other';

  if (/fortigate|fortios|fg-\d+/.test(rawLower)) { type = 'firewall'; vendor = 'Fortinet'; }
  else if (/palo alto|pan-os/.test(rawLower)) { type = 'firewall'; vendor = 'Palo Alto'; }
  else if (/pfsense/.test(rawLower)) { type = 'firewall'; vendor = 'Netgate'; }
  else if (/sophos/.test(rawLower)) { type = 'firewall'; vendor = 'Sophos'; }
  else if (/router|rtr|wan|isr|asr/.test(rawLower)) { 
    type = 'router'; 
    vendor = rawLower.includes('mikrotik') ? 'MikroTik' : 'Cisco'; 
  }
  else if (/ap|wap|access point|aironet|unifi|aruba ap|reyee|ruckus|zoneflex|unleashed/.test(rawLower) || /ap|wap/.test(nameLower)) {
    type = 'ap';
    if (/unifi|ubiquiti/.test(rawLower)) vendor = 'Ubiquiti';
    else if (/aruba/.test(rawLower)) vendor = 'Aruba';
    else if (/reyee|ruijie/.test(rawLower)) vendor = 'Ruijie';
    else if (/ruckus|zoneflex/.test(rawLower)) vendor = 'Ruckus';
    else vendor = 'Cisco';
  }
  else if (/catalyst|procurve|h3c|vrp|s5700|edgeswitch|routeros|switchos|icx|fastiron/.test(rawLower) || /sw|switch/.test(nameLower)) {
    type = 'switch';
    if (/huawei/.test(rawLower)) vendor = 'Huawei';
    else if (/aruba|procurve|hp/.test(rawLower)) vendor = 'Aruba';
    else if (/mikrotik/.test(rawLower)) vendor = 'MikroTik';
    else if (/ubiquiti/.test(rawLower)) vendor = 'Ubiquiti';
    else if (/ruijie|reyee/.test(rawLower)) vendor = 'Ruijie';
    else if (/ruckus|icx/.test(rawLower)) vendor = 'Ruckus';
    else vendor = 'Cisco';
  }
  else if (/linux/.test(rawLower)) { type = 'server'; vendor = 'Linux'; }
  else if (/windows/.test(rawLower)) { type = 'server'; vendor = 'Windows'; }
  else if (/printer|jetdirect/.test(rawLower)) { type = 'printer'; vendor = 'Other'; }

  return { type, vendor };
}

async function scanNetwork(ipRange, community = 'public', defaultModule = 'if_mib') {
  const ips = generateIpList(ipRange);
  if (ips.length === 0) return [];
  if (ips.length > 512) {
    throw new Error('IP range too large (max 512 IPs per scan)');
  }

  const startTime = Date.now();
  console.log(`[Scanner] Starting ultra-fast discovery for ${ips.length} IPs...`);

  // Parallel Track 1 & Track 2:
  // Run SNMP sweep and Fast TCP Probe simultaneously across all IPs with high concurrency
  const snmpConcurrency = parseInt(process.env.SCANNER_SNMP_CONCURRENCY, 10) || 64;
  const tcpConcurrency = parseInt(process.env.SCANNER_TCP_CONCURRENCY, 10) || 64;

  const [snmpResults, tcpResults] = await Promise.all([
    mapPool(ips, snmpConcurrency, ip => getSnmpData(ip, community, [OID_SYSNAME, OID_SYSDESCR, OID_SYSOBJID], 750)),
    mapPool(ips, tcpConcurrency, ip => fastTcpProbe(ip, 300))
  ]);

  const discoveredDevices = [];
  const needPingIps = [];

  ips.forEach((ip, idx) => {
    const snmpData = snmpResults[idx];
    const isTcpAlive = tcpResults[idx];

    if (snmpData) {
      // 1. Device responded to SNMP (Highest priority)
      const sysName = snmpData[OID_SYSNAME] || ip;
      const sysDescr = snmpData[OID_SYSDESCR] || '';
      const sysObjId = snmpData[OID_SYSOBJID] || '';

      const { type, vendor } = detectDevice(sysDescr + ' ' + sysObjId, sysName);

      const resolvedModule = resolveDeviceModule({
        sysObjectID: sysObjId,
        sysDescr,
        vendor,
        type,
        name: sysName,
      });

      discoveredDevices.push({
        ip,
        sysName,
        type,
        vendor,
        sysDescr,
        status: 'snmp_success',
        sysObjectID: sysObjId,
        module: resolvedModule || defaultModule || 'if_mib'
      });
    } else if (isTcpAlive) {
      // 2. Device responded to TCP (Web/SSH/SMB) but not SNMP
      discoveredDevices.push({
        ip,
        sysName: '',
        type: 'computer',
        vendor: 'Other',
        sysDescr: 'Active host (TCP Service / No SNMP)',
        status: 'ping_only',
        module: defaultModule || 'if_mib'
      });
    } else {
      // Needs fallback ICMP ping
      needPingIps.push(ip);
    }
  });

  // Track 3: Fast ICMP Ping fallback only for unconfirmed IPs
  if (needPingIps.length > 0) {
    const pingConcurrency = parseInt(process.env.SCANNER_PING_CONCURRENCY, 10) || 32;
    const pingResults = await mapPool(needPingIps, pingConcurrency, ip => fastPingProbe(ip, 0.4));
    
    needPingIps.forEach((ip, idx) => {
      if (pingResults[idx]) {
        discoveredDevices.push({
          ip,
          sysName: '',
          type: 'computer',
          vendor: 'Other',
          sysDescr: 'Active host (ICMP Ping only / No SNMP)',
          status: 'ping_only',
          module: defaultModule || 'if_mib'
        });
      }
    });
  }

  // Sort discovered devices naturally by numerical IP address
  discoveredDevices.sort((a, b) => {
    const toNum = ip => ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
    return toNum(a.ip) - toNum(b.ip);
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[Scanner] Discovery complete in ${durationSec}s. Found ${discoveredDevices.length} devices.`);

  return discoveredDevices;
}

module.exports = {
  scanNetwork,
  generateIpList,
  detectDevice
};
