/**
 * Prometheus API Client Service
 * High-performance direct connection to Prometheus Server API (Proxy via Nginx)
 */

export class PrometheusClient {
  constructor(baseUrl = '/api/prometheus') {
    this.baseUrl = (baseUrl || '').replace(/\/+$/, '');
  }

  setBaseUrl(url) {
    this.baseUrl = (url || '').replace(/\/+$/, '');
  }

  getEffectiveBaseUrl() {
    if (typeof window !== 'undefined') {
      // In browser environment, direct calls to :9090 violate CORS because Prometheus does not emit CORS headers.
      // Transparently route all browser calls through the /api/prometheus reverse proxy.
      if (!this.baseUrl || this.baseUrl.includes(':9090') || this.baseUrl.includes('localhost') || this.baseUrl.includes('127.0.0.1')) {
        return '/api/prometheus';
      }
    }
    return this.baseUrl || '/api/prometheus';
  }

  async instantQuery(query, time = null) {
    if (!query) return [];

    const effectiveBase = this.getEffectiveBaseUrl();
    let url = `${effectiveBase}/api/v1/query?query=${encodeURIComponent(query)}`;
    if (time) url += `&time=${time}`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (data.status !== 'success') throw new Error(data.error || 'Query failed');
      return data.data?.result || [];
    } catch (err) {
      // If direct query failed and not already using /api/prometheus, try /api/prometheus fallback
      if (effectiveBase !== '/api/prometheus' && typeof window !== 'undefined') {
        try {
          const fallbackUrl = `/api/prometheus/api/v1/query?query=${encodeURIComponent(query)}${time ? `&time=${time}` : ''}`;
          const fRes = await fetch(fallbackUrl, { signal: AbortSignal.timeout(6000) });
          if (fRes.ok) {
            const fData = await fRes.json();
            if (fData.status === 'success') {
              this.baseUrl = '/api/prometheus';
              return fData.data?.result || [];
            }
          }
        } catch {}
      }
      console.warn(`[Prometheus] Query error (${query}):`, err.message);
      return [];
    }
  }

  async rangeQuery(query, start, end, step = '15s') {
    if (!query) return [];

    const effectiveBase = this.getEffectiveBaseUrl();
    const url = `${effectiveBase}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${step}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (data.status !== 'success') throw new Error(data.error || 'Range query failed');
      return data.data?.result || [];
    } catch (err) {
      if (effectiveBase !== '/api/prometheus' && typeof window !== 'undefined') {
        try {
          const fallbackUrl = `/api/prometheus/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${step}`;
          const fRes = await fetch(fallbackUrl, { signal: AbortSignal.timeout(8000) });
          if (fRes.ok) {
            const fData = await fRes.json();
            if (fData.status === 'success') {
              this.baseUrl = '/api/prometheus';
              return fData.data?.result || [];
            }
          }
        } catch {}
      }
      console.warn(`[Prometheus] Range query error:`, err.message);
      return [];
    }
  }

  async getTargets() {
    const effectiveBase = this.getEffectiveBaseUrl();
    try {
      const res = await fetch(`${effectiveBase}/api/v1/targets`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === 'success') {
        return data.data?.activeTargets || [];
      }
      return [];
    } catch (err) {
      if (effectiveBase !== '/api/prometheus' && typeof window !== 'undefined') {
        try {
          const fRes = await fetch(`/api/prometheus/api/v1/targets`, { signal: AbortSignal.timeout(6000) });
          if (fRes.ok) {
            const fData = await fRes.json();
            if (fData.status === 'success') {
              this.baseUrl = '/api/prometheus';
              return fData.data?.activeTargets || [];
            }
          }
        } catch {}
      }
      console.warn('[Prometheus] Fetch targets error:', err.message);
      return [];
    }
  }

  async testConnection() {
    const effectiveBase = this.getEffectiveBaseUrl();
    try {
      const res = await fetch(`${effectiveBase}/api/v1/query?query=up`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = await res.json();
      if (data.status === 'success') {
        const count = data.data?.result?.length || 0;
        return { ok: true, count, message: `Connected to Prometheus! (${count} targets reporting)` };
      }
      return { ok: false, message: data.error || 'Unknown error' };
    } catch (err) {
      if (effectiveBase !== '/api/prometheus' && typeof window !== 'undefined') {
        try {
          const fRes = await fetch(`/api/prometheus/api/v1/query?query=up`, { signal: AbortSignal.timeout(4000) });
          if (fRes.ok) {
            const fData = await fRes.json();
            if (fData.status === 'success') {
              this.baseUrl = '/api/prometheus';
              const count = fData.data?.result?.length || 0;
              return { ok: true, count, message: `Connected via proxy to Prometheus! (${count} targets reporting)` };
            }
          }
        } catch {}
      }
      return { ok: false, message: err.message };
    }
  }

  async queryDeviceAutoDetect(ip) {
    const cleanIp = (ip || '').trim().replace(/:\d+$/, '');
    if (!cleanIp) return null;

    try {
      const [rName, rDescr, rLldp, rCdp, rProbe] = await Promise.allSettled([
        this.instantQuery(`sysName{instance=~".*${cleanIp}.*"}`),
        this.instantQuery(`sysDescr{instance=~".*${cleanIp}.*"}`),
        this.instantQuery(`lldpRemSysName{instance=~".*${cleanIp}.*"}`),
        this.instantQuery(`cdpCacheDeviceId{instance=~".*${cleanIp}.*"}`),
        this.instantQuery(`probe_success{target=~".*${cleanIp}.*"}`),
      ]);

      const sysName = rName.status === 'fulfilled' && rName.value?.[0]
        ? (rName.value[0].metric?.sysName || rName.value[0].value?.[1] || '')
        : '';

      const sysDescr = rDescr.status === 'fulfilled' && rDescr.value?.[0]
        ? (rDescr.value[0].metric?.sysDescr || rDescr.value[0].value?.[1] || '')
        : '';

      const isOnline = rProbe.status === 'fulfilled' && rProbe.value?.[0]
        ? rProbe.value[0].value?.[1] === '1'
        : true;

      const neighbors = [];
      if (rLldp.status === 'fulfilled' && Array.isArray(rLldp.value)) {
        rLldp.value.forEach(item => {
          const n = item.metric?.lldpRemSysName || item.value?.[1];
          if (n) neighbors.push(n);
        });
      }
      if (rCdp.status === 'fulfilled' && Array.isArray(rCdp.value)) {
        rCdp.value.forEach(item => {
          const n = item.metric?.cdpCacheDeviceId || item.value?.[1];
          if (n) neighbors.push(n);
        });
      }

      return {
        ip: cleanIp,
        sysName,
        sysDescr,
        isOnline,
        neighbors,
      };
    } catch (e) {
      console.warn('[Prometheus] Auto-detect error:', e);
      return null;
    }
  }

  async fetchDevicePerformance(ip) {
    const cleanIp = (ip || '').trim().replace(/:\d+$/, '');
    if (!cleanIp) return null;

    try {
      // We attempt to query real metrics (Cisco or generic Host Resources)
      // If none are found, we'll return null for those fields and let the UI handle simulation.
      const [rCpu, rMemUsed, rMemFree, rSysUpTime] = await Promise.allSettled([
        // Try Huawei hwEntityCpuUsage OR Cisco cpmCPUTotal5minRev OR Cisco SMB rlCpuUtilDuringLast5Minutes OR HP hpSwitchCpuStat OR generic hrProcessorLoad
        this.instantQuery(`hwEntityCpuUsage{instance=~".*${cleanIp}.*"} or cpmCPUTotal5minRev{instance=~".*${cleanIp}.*"} or rlCpuUtilDuringLast5Minutes{instance=~".*${cleanIp}.*"} or hpSwitchCpuStat{instance=~".*${cleanIp}.*"} or avg by(instance)(hrProcessorLoad{instance=~".*${cleanIp}.*"})`),
        // Try Huawei hwEntityMemUsage OR Cisco cpmCPUMemoryUsed OR ciscoMemoryPoolUsed OR HP hpSwitchMemoryAllocated OR generic hrStorageUsed
        this.instantQuery(`hwEntityMemUsage{instance=~".*${cleanIp}.*"} or cpmCPUMemoryUsed{instance=~".*${cleanIp}.*"} or ciscoMemoryPoolUsed{instance=~".*${cleanIp}.*"} or hpSwitchMemoryAllocated{instance=~".*${cleanIp}.*"} or sum by(instance)(hrStorageUsed{instance=~".*${cleanIp}.*"})`),
        // Try Cisco cpmCPUMemoryFree OR ciscoMemoryPoolFree OR HP hpSwitchMemoryTotal OR generic hrStorageSize
        this.instantQuery(`cpmCPUMemoryFree{instance=~".*${cleanIp}.*"} or ciscoMemoryPoolFree{instance=~".*${cleanIp}.*"} or hpSwitchMemoryTotal{instance=~".*${cleanIp}.*"} or sum by(instance)(hrStorageSize{instance=~".*${cleanIp}.*"})`),
        // Uptime (sysUpTime)
        this.instantQuery(`sysUpTime{instance=~".*${cleanIp}.*"}`)
      ]);

      let cpu = null;
      let memory = null;
      let uptime = null;

      // Extract CPU
      if (rCpu.status === 'fulfilled' && rCpu.value?.[0]) {
        cpu = parseFloat(rCpu.value[0].value?.[1]);
      }

      // Extract Memory
      if (rMemUsed.status === 'fulfilled' && rMemUsed.value?.[0]) {
        const usedMetric = rMemUsed.value[0].metric;
        const used = parseFloat(rMemUsed.value[0].value?.[1]);

        if (usedMetric && usedMetric.__name__ === 'hwEntityMemUsage') {
          memory = used; // Huawei returns percentage directly
        } else if (rMemFree.status === 'fulfilled' && rMemFree.value?.[0]) {
          const freeMetric = rMemFree.value[0].metric;
          const freeOrSize = parseFloat(rMemFree.value[0].value?.[1]);
          
          let total = 0;
          // If it's hrStorageSize or hpSwitchMemoryTotal, it represents total size
          if (freeMetric && (freeMetric.__name__ === 'hrStorageSize' || freeMetric.__name__ === 'hpSwitchMemoryTotal')) {
            total = freeOrSize;
          } else {
            total = used + freeOrSize;
          }

          if (total > 0) {
            memory = (used / total) * 100;
          }
        }
      }

      // Extract Uptime
      if (rSysUpTime.status === 'fulfilled' && rSysUpTime.value?.[0]) {
        uptime = parseFloat(rSysUpTime.value[0].value?.[1]); // This is usually in hundredths of a second (centiseconds) or seconds
      }

      return {
        cpu: cpu !== null && !isNaN(cpu) ? Math.min(Math.max(cpu, 0), 100) : null,
        memory: memory !== null && !isNaN(memory) ? Math.min(Math.max(memory, 0), 100) : null,
        uptime: uptime !== null && !isNaN(uptime) ? uptime : null
      };
    } catch (e) {
      console.warn('[Prometheus] Performance fetch error:', e);
      return null;
    }
  }

  /**
   * Batch query CPU, Memory, and Uptime across all Prometheus instances in 4 queries total.
   * Replaces per-device query loops (which executed 4 queries * N devices).
   * Returns: { [cleanIp]: { cpu: number|null, memory: number|null, uptime: number|null } }
   */
  async fetchBatchPerformance() {
    if (!this.baseUrl) return {};

    try {
      const [rCpu, rMemUsed, rMemFree, rSysUpTime] = await Promise.allSettled([
        // CPU metrics across all vendor MIBs and host-resources
        this.instantQuery(
          'hwEntityCpuUsage or cpmCPUTotal5minRev or rlCpuUtilDuringLast5Minutes or hpSwitchCpuStat or avg by(instance)(hrProcessorLoad)'
        ),
        // Memory used metrics
        this.instantQuery(
          'hwEntityMemUsage or cpmCPUMemoryUsed or ciscoMemoryPoolUsed or hpSwitchMemoryAllocated or sum by(instance)(hrStorageUsed)'
        ),
        // Memory free or total size metrics
        this.instantQuery(
          'cpmCPUMemoryFree or ciscoMemoryPoolFree or hpSwitchMemoryTotal or sum by(instance)(hrStorageSize)'
        ),
        // System Uptime metrics
        this.instantQuery('sysUpTime')
      ]);

      const result = {};

      const ensureIpEntry = (ip) => {
        if (!result[ip]) {
          result[ip] = { cpu: null, memory: null, uptime: null };
        }
        return result[ip];
      };

      // 1. Process CPU
      if (rCpu.status === 'fulfilled' && Array.isArray(rCpu.value)) {
        rCpu.value.forEach(item => {
          const ip = normalizeIp(item.metric?.instance || item.metric?.target);
          const val = parseFloat(item.value?.[1]);
          if (ip && !isNaN(val)) {
            const entry = ensureIpEntry(ip);
            entry.cpu = Math.min(Math.max(val, 0), 100);
          }
        });
      }

      // 2. Process Memory
      const memUsedMap = {};
      if (rMemUsed.status === 'fulfilled' && Array.isArray(rMemUsed.value)) {
        rMemUsed.value.forEach(item => {
          const ip = normalizeIp(item.metric?.instance || item.metric?.target);
          const val = parseFloat(item.value?.[1]);
          if (ip && !isNaN(val)) {
            memUsedMap[ip] = {
              val,
              metricName: item.metric?.__name__
            };
          }
        });
      }

      const memFreeMap = {};
      if (rMemFree.status === 'fulfilled' && Array.isArray(rMemFree.value)) {
        rMemFree.value.forEach(item => {
          const ip = normalizeIp(item.metric?.instance || item.metric?.target);
          const val = parseFloat(item.value?.[1]);
          if (ip && !isNaN(val)) {
            memFreeMap[ip] = {
              val,
              metricName: item.metric?.__name__
            };
          }
        });
      }

      Object.keys(memUsedMap).forEach(ip => {
        const usedObj = memUsedMap[ip];
        const entry = ensureIpEntry(ip);

        if (usedObj.metricName === 'hwEntityMemUsage') {
          // Huawei returns utilization directly in %
          entry.memory = Math.min(Math.max(usedObj.val, 0), 100);
        } else if (memFreeMap[ip]) {
          const freeObj = memFreeMap[ip];
          let total = 0;
          if (freeObj.metricName === 'hrStorageSize' || freeObj.metricName === 'hpSwitchMemoryTotal') {
            total = freeObj.val;
          } else {
            total = usedObj.val + freeObj.val;
          }
          if (total > 0) {
            const pct = (usedObj.val / total) * 100;
            entry.memory = Math.min(Math.max(pct, 0), 100);
          }
        }
      });

      // 3. Process Uptime
      if (rSysUpTime.status === 'fulfilled' && Array.isArray(rSysUpTime.value)) {
        rSysUpTime.value.forEach(item => {
          const ip = normalizeIp(item.metric?.instance || item.metric?.target);
          const val = parseFloat(item.value?.[1]);
          if (ip && !isNaN(val)) {
            const entry = ensureIpEntry(ip);
            entry.uptime = val;
          }
        });
      }

      return result;
    } catch (e) {
      console.warn('[Prometheus] Batch performance fetch error:', e);
      return {};
    }
  }
}

/**
 * Normalizes an instance, address, or target string into a clean IPv4 address.
 * Examples:
 * - "192.0.2.1:161" -> "192.0.2.1"
 * - "http://192.0.2.10:9115/probe?target=192.0.2.10" -> "192.0.2.10"
 * - "192.0.2.20" -> "192.0.2.20"
 */
export function normalizeIp(str) {
  if (!str) return '';
  const match = String(str).match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  if (match) return match[1];
  return String(str).replace(/:\d+$/, '').trim();
}

export const defaultPromClient = new PrometheusClient('/api/prometheus');

/**
 * Builds a robust PromQL query for WAN / Gateway / Uplink traffic.
 * Uses a prioritized hierarchy:
 * 1. User-configured WAN interface (and optional device IP).
 * 2. Interfaces with WAN / Internet / ISP / Gateway / Firewall aliases.
 * 3. Uplink / Backbone aliases and TenGigabit / Port-channel interfaces.
 * 4. Core switch / highest traffic device throughput fallback.
 * 5. Safe vector(0) baseline.
 */
export function buildWanPromQL(dir = 'in', wanIf = '', wanIp = '') {
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

