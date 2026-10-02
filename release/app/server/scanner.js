const ping = require('ping');
const snmp = require('net-snmp');
const { resolveDeviceModule } = require('./snmpMapper');

// Parse IP range like "192.168.1.1-254" or "192.168.1.0/24" (naive /24 implementation)
function generateIpList(ipRange) {
  const ips = [];
  const trimRange = (ipRange || '').trim();
  if (!trimRange) return ips;
  
  if (trimRange.includes('-')) {
    // 192.168.1.1-254
    const parts = trimRange.split('-');
    if (parts.length === 2) {
      const startParts = parts[0].split('.');
      if (startParts.length === 4) {
        const base = `${startParts[0]}.${startParts[1]}.${startParts[2]}`;
        const start = parseInt(startParts[3], 10);
        let end = parseInt(parts[1], 10);
        
        // Handle cases like 192.168.1.10-192.168.1.50
        if (parts[1].includes('.')) {
            const endParts = parts[1].split('.');
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

// SNMP Get Promise Wrapper
function getSnmpData(ip, community, oids) {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, community, {
      timeout: 1000,
      retries: 1,
      version: snmp.Version2c
    });

    session.get(oids, (error, varbinds) => {
      session.close();
      if (error) {
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

  // 1. Ping Sweep with Concurrency Limiter
  console.log(`[Scanner] Pinging ${ips.length} IPs...`);
  const pingConcurrency = parseInt(process.env.SCANNER_PING_CONCURRENCY, 10) || 20;
  const pingResults = [];
  for (let i = 0; i < ips.length; i += pingConcurrency) {
    const chunk = ips.slice(i, i + pingConcurrency);
    const chunkRes = await Promise.allSettled(chunk.map(ip => ping.promise.probe(ip, { timeout: 1, extra: ['-c', '1'] })));
    pingResults.push(...chunkRes);
  }
  
  const aliveIps = [];
  pingResults.forEach((res, idx) => {
    if (res.status === 'fulfilled' && res.value.alive) {
      aliveIps.push(ips[idx]);
    }
  });

  console.log(`[Scanner] Found ${aliveIps.length} alive IPs. Checking SNMP...`);

  // 2. SNMP Query for alive IPs with Concurrency Limiter (Section 24)
  const OID_SYSDESCR = '1.3.6.1.2.1.1.1.0';
  const OID_SYSOBJID = '1.3.6.1.2.1.1.2.0';
  const OID_SYSNAME = '1.3.6.1.2.1.1.5.0';

  const snmpConcurrency = parseInt(process.env.SNMP_CONCURRENCY_LIMIT, 10) || 5;
  const snmpResults = [];
  for (let i = 0; i < aliveIps.length; i += snmpConcurrency) {
    const chunk = aliveIps.slice(i, i + snmpConcurrency);
    const chunkRes = await Promise.allSettled(chunk.map(ip => getSnmpData(ip, community, [OID_SYSNAME, OID_SYSDESCR, OID_SYSOBJID])));
    snmpResults.push(...chunkRes);
  }

  const discoveredDevices = [];
  aliveIps.forEach((ip, idx) => {
    const snmpRes = snmpResults[idx];
    if (snmpRes.status === 'fulfilled' && snmpRes.value) {
      const data = snmpRes.value;
      const sysName = data[OID_SYSNAME] || ip;
      const sysDescr = data[OID_SYSDESCR] || '';
      const sysObjId = data[OID_SYSOBJID] || '';

      const { type, vendor } = detectDevice(sysDescr + ' ' + sysObjId, sysName);

      // Smart MIB Auto-Discovery: Assign Prometheus module via central SNMP Mapper or fallback to defaultModule
      const resolvedModule = resolveDeviceModule({
        sysObjectID: sysObjId,
        sysDescr,
        vendor,
        type,
        name: sysName,
      });

      discoveredDevices.push({
        ip,
        sysName: sysName,
        type,
        vendor,
        sysDescr: sysDescr,
        status: 'snmp_success',
        sysObjectID: sysObjId,
        module: resolvedModule || defaultModule || 'if_mib'
      });
    } else {
      // Offline or No SNMP: assign defaultModule configured by admin
      discoveredDevices.push({
        ip,
        sysName: '',
        type: 'computer',
        vendor: 'Other',
        sysDescr: 'No SNMP response',
        status: 'ping_only',
        module: defaultModule || 'if_mib'
      });
    }
  });

  return discoveredDevices;
}

module.exports = {
  scanNetwork,
  generateIpList
};
