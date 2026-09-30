/**
 * Analytics Platform Service
 * High-performance batch query, caching, and aggregation engine for Prometheus Historical Data.
 * Strictly adheres to /api/v1/query_range and 5-minute TTL caching.
 */

import { normalizeIp } from './prometheusService';

// In-Memory Client-Side Cache (5-Minute TTL)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const analyticsClientCache = new Map();

/**
 * Analytics Module Definitions
 */
export const ANALYTICS_MODULES = {
  cpu: {
    id: 'cpu',
    label: 'CPU Usage Trend',
    titleTh: 'แนวโน้มการใช้งาน CPU',
    unit: '%',
    yMin: 0,
    yMax: 100,
    color: '#00d4ff', // Cyan
    gradientFrom: 'rgba(0, 212, 255, 0.4)',
    gradientTo: 'rgba(0, 212, 255, 0.0)',
    // Unified batch query covering Huawei, Cisco IOS-XE, Cisco SMB Catalyst 1200/1300, HP/Aruba, and Linux Host Resources
    query: 'hwEntityCpuUsage or cpmCPUTotal5minRev or rlCpuUtilDuringLast5Minutes or hpSwitchCpuStat or avg by (instance) (hrProcessorLoad)'
  },
  memory: {
    id: 'memory',
    label: 'Memory Usage Trend',
    titleTh: 'แนวโน้มการใช้งาน Memory',
    unit: '%',
    yMin: 0,
    yMax: 100,
    color: '#a855f7', // Purple
    gradientFrom: 'rgba(168, 85, 247, 0.4)',
    gradientTo: 'rgba(168, 85, 247, 0.0)',
    // Memory utilization in percentage across vendors (Cisco, HP/Aruba, Huawei, Ruckus, Host Resources)
    query: 'snAgGblDynMemUtil or hwEntityMemUsage or (cpmCPUMemoryUsed / (cpmCPUMemoryUsed + cpmCPUMemoryFree) * 100) or (ciscoMemoryPoolUsed / (ciscoMemoryPoolUsed + ciscoMemoryPoolFree) * 100) or (sum by (instance) (hrStorageUsed) / sum by (instance) (hrStorageSize) * 100) or (hpSwitchMemoryAllocated / hpSwitchMemoryTotal * 100)'
  },
  bandwidth: {
    id: 'bandwidth',
    label: 'Bandwidth Trend',
    titleTh: 'ปริมาณทราฟฟิก Bandwidth รวม',
    unit: 'Mbps',
    color: '#10b981', // Emerald
    gradientFrom: 'rgba(16, 185, 129, 0.4)',
    gradientTo: 'rgba(16, 185, 129, 0.0)',
    subTypes: ['in', 'out', 'combined'],
    queries: {
      in: 'sum by (instance) (rate(ifHCInOctets[5m]) or rate(ifInOctets[5m])) * 8 / 1000000',
      out: 'sum by (instance) (rate(ifHCOutOctets[5m]) or rate(ifOutOctets[5m])) * 8 / 1000000',
      combined: 'sum by (instance) (rate(ifHCInOctets[5m]) + rate(ifHCOutOctets[5m]) or rate(ifInOctets[5m]) + rate(ifOutOctets[5m])) * 8 / 1000000'
    }
  },
  interface_util: {
    id: 'interface_util',
    label: 'Interface Utilization',
    titleTh: 'อัตราการใช้งานพอร์ตสวิตช์สูงสุด',
    unit: '%',
    yMin: 0,
    yMax: 100,
    color: '#f59e0b', // Amber
    gradientFrom: 'rgba(245, 158, 11, 0.4)',
    gradientTo: 'rgba(245, 158, 11, 0.0)',
    query: 'max by (instance) (((rate(ifHCInOctets[5m]) + rate(ifHCOutOctets[5m])) * 8) / ((ifHighSpeed > 0) * 1000000 or (ifSpeed > 0)) * 100)'
  },
  latency: {
    id: 'latency',
    label: 'Latency Trend (RTT)',
    titleTh: 'แนวโน้มค่าความหน่วง (Ping Latency)',
    unit: 'ms',
    color: '#3b82f6', // Blue
    gradientFrom: 'rgba(59, 130, 246, 0.4)',
    gradientTo: 'rgba(59, 130, 246, 0.0)',
    // Blackbox ICMP probe duration in milliseconds
    query: 'probe_duration_seconds * 1000'
  },
  packet_loss: {
    id: 'packet_loss',
    label: 'Packet Loss Trend',
    titleTh: 'อัตราการสูญหายของแพ็กเก็ต (Packet Loss)',
    unit: '%',
    yMin: 0,
    yMax: 100,
    color: '#ef4444', // Red
    gradientFrom: 'rgba(239, 68, 68, 0.4)',
    gradientTo: 'rgba(239, 68, 68, 0.0)',
    // 0% when success, 100% when dropped (or moving average)
    query: '(1 - probe_success) * 100'
  },
  availability: {
    id: 'availability',
    label: 'Device Availability',
    titleTh: 'ความพร้อมใช้งานของอุปกรณ์ (SLA Availability)',
    unit: '%',
    yMin: 0,
    yMax: 100,
    color: '#06b6d4', // Cyan Teal
    gradientFrom: 'rgba(6, 182, 212, 0.4)',
    gradientTo: 'rgba(6, 182, 212, 0.0)',
    // Rolling SLA percentage based on probe_success
    query: 'avg_over_time(probe_success[5m]) * 100'
  }
};

/**
 * Standard Presets for Time Ranges
 */
export const TIME_RANGE_PRESETS = [
  { id: '1h', label: 'Last 1 Hour', durationSec: 3600, step: '30s' },
  { id: '6h', label: 'Last 6 Hours', durationSec: 21600, step: '1m' },
  { id: '24h', label: 'Last 24 Hours', durationSec: 86400, step: '5m' },
  { id: '7d', label: 'Last 7 Days', durationSec: 604800, step: '30m' },
  { id: '30d', label: 'Last 30 Days', durationSec: 2592000, step: '2h' },
  { id: 'custom', label: 'Custom Range' }
];

/**
 * Calculates start, end timestamps and dynamic optimal step for range queries.
 */
export function calculateTimeRange(rangeId, customStart = null, customEnd = null) {
  const now = Math.floor(Date.now() / 1000);

  if (rangeId === 'custom' && customStart && customEnd) {
    const start = Math.floor(new Date(customStart).getTime() / 1000);
    const end = Math.floor(new Date(customEnd).getTime() / 1000);
    const durationSec = Math.max(end - start, 60);

    // Dynamically calculate step targeting ~200 points for optimal rendering performance
    const stepSec = Math.max(15, Math.floor(durationSec / 200));
    let step = `${stepSec}s`;
    if (stepSec >= 3600) {
      step = `${Math.floor(stepSec / 3600)}h`;
    } else if (stepSec >= 60) {
      step = `${Math.floor(stepSec / 60)}m`;
    }

    return {
      start,
      end,
      step,
      durationSec,
      label: 'Custom Range'
    };
  }

  const preset = TIME_RANGE_PRESETS.find(p => p.id === rangeId) || TIME_RANGE_PRESETS[0];
  const start = now - preset.durationSec;
  const end = now;

  return {
    start,
    end,
    step: preset.step,
    durationSec: preset.durationSec,
    label: preset.label
  };
}

/**
 * Formats a timestamp into human-readable date & time
 */
export function formatTimestamp(unixSeconds, durationSec = 3600) {
  const d = new Date(unixSeconds * 1000);
  if (durationSec <= 86400) {
    // 24 hours or less: show HH:mm:ss
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } else if (durationSec <= 604800) {
    // 7 days: show Mon DD HH:mm
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  }
  // 30 days or custom long: show YYYY-MM-DD HH:mm
  return `${d.toLocaleDateString([], { year: '2-digit', month: 'numeric', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

/**
 * Calculates summary statistics (Current, Avg, Max, Min) from time series values.
 */
export function calculateStatistics(points = []) {
  if (!points || points.length === 0) {
    return { current: 0, avg: 0, max: 0, min: 0, count: 0 };
  }

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let validCount = 0;
  let latestVal = 0;

  for (let i = 0; i < points.length; i++) {
    const rawVal = points[i][1];
    const val = typeof rawVal === 'number' ? rawVal : parseFloat(rawVal);
    if (!isNaN(val)) {
      sum += val;
      if (val < min) min = val;
      if (val > max) max = val;
      validCount++;
      latestVal = val;
    }
  }

  if (validCount === 0) {
    return { current: 0, avg: 0, max: 0, min: 0, count: 0 };
  }

  return {
    current: Number(latestVal.toFixed(2)),
    avg: Number((sum / validCount).toFixed(2)),
    max: Number(max.toFixed(2)),
    min: Number(min.toFixed(2)),
    count: validCount
  };
}

/**
 * Checks cache for existing query result within 5 minutes TTL
 */
export function getCachedQueryResult(cacheKey) {
  const cached = analyticsClientCache.get(cacheKey);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    analyticsClientCache.delete(cacheKey);
    return null;
  }

  return cached;
}

/**
 * Stores query result in client-side cache
 */
export function setCachedQueryResult(cacheKey, result) {
  // Prune cache if it gets too large
  if (analyticsClientCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of analyticsClientCache.entries()) {
      if (now - v.timestamp > CACHE_TTL_MS) {
        analyticsClientCache.delete(k);
      }
    }
  }

  analyticsClientCache.set(cacheKey, {
    data: result,
    timestamp: Date.now()
  });
}

/**
 * Clears the analytics cache manually
 */
export function clearAnalyticsCache() {
  analyticsClientCache.clear();
}

/**
 * Parses Prometheus step string (e.g. '30s', '1m', '5m', '2h') into integer seconds
 */
export function parseStepToSeconds(stepStr = '30s') {
  const match = String(stepStr).match(/^(\d+)([smhd])?$/);
  if (!match) return 30;
  const num = parseInt(match[1], 10);
  const unit = match[2] || 's';
  if (unit === 's') return num;
  if (unit === 'm') return num * 60;
  if (unit === 'h') return num * 3600;
  if (unit === 'd') return num * 86400;
  return num;
}

/**
 * Single Batch Query Executor across all devices
 * Queries backend proxy /api/analytics/query_range first (with 5m caching & SNMP history fallback),
 * then falls back to direct promClient.rangeQuery.
 */
export async function fetchAnalyticsData({
  moduleKey = 'cpu',
  subType = 'in',
  timeRange = '1h',
  customStart = null,
  customEnd = null,
  promClient = null,
  bypassCache = false
}) {
  const modDef = ANALYTICS_MODULES[moduleKey] || ANALYTICS_MODULES.cpu;
  const timeParams = calculateTimeRange(timeRange, customStart, customEnd);

  // Resolve query string
  let queryStr = modDef.query;
  if (moduleKey === 'bandwidth' && modDef.queries) {
    queryStr = modDef.queries[subType] || modDef.queries.in;
  }

  const cacheKey = `${queryStr}:${timeParams.start}:${timeParams.end}:${timeParams.step}`;

  // 1. Check Cache Layer (5-Minute TTL)
  if (!bypassCache) {
    const cachedEntry = getCachedQueryResult(cacheKey);
    if (cachedEntry) {
      return {
        ok: true,
        cached: true,
        cacheAgeMs: Date.now() - cachedEntry.timestamp,
        timestamp: cachedEntry.timestamp,
        timeParams,
        moduleDef: modDef,
        ...cachedEntry.data
      };
    }
  }

  // 2. Query Prometheus rangeQuery via backend proxy first (/api/analytics/query_range),
  // which contains 5-minute caching and telemetry synthesis for CPU/Memory,
  // with fallback to promClient.rangeQuery if backend is unreachable.
  try {
    let rawResult = [];
    let backendFetched = false;

    // Try backend analytics endpoint first
    try {
      const backendUrl = `/api/analytics/query_range?query=${encodeURIComponent(queryStr)}&start=${timeParams.start}&end=${timeParams.end}&step=${timeParams.step}${bypassCache ? '&bypassCache=true' : ''}`;
      const res = await fetch(backendUrl, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.data) && json.data.length > 0) {
          rawResult = json.data;
          backendFetched = true;
        } else if (json.unavailable) {
          return {
            ok: false,
            unavailable: true,
            error: 'Analytics unavailable - Prometheus server is unreachable or offline'
          };
        }
      }
    } catch (e) {
      // Backend proxy unreachable (e.g. running standalone dev), fall back to promClient
    }

    if (!backendFetched && promClient && typeof promClient.rangeQuery === 'function') {
      const promRes = await promClient.rangeQuery(queryStr, timeParams.start, timeParams.end, timeParams.step);
      if (Array.isArray(promRes) && promRes.length > 0) {
        rawResult = promRes;
      }
    }

    if (!Array.isArray(rawResult)) {
      rawResult = [];
    }

    // 3. Process Batch Result and map to device IPs
    const deviceSeriesMap = {}; // { [ip]: { values: [[ts, val]], stats: {...}, metric: {...} } }
    const stepSec = parseStepToSeconds(timeParams.step);
    const bucketMap = new Map(); // bucket timestamp -> Map(ip -> val)

    rawResult.forEach((item) => {
      const metric = item.metric || {};
      const ip = normalizeIp(metric.instance || metric.target || metric.ip);
      const values = item.values || [];

      if (!ip) return;

      if (!deviceSeriesMap[ip]) {
        deviceSeriesMap[ip] = {
          ip,
          metric,
          values: [...values],
          stats: calculateStatistics(values)
        };
      } else {
        const existing = deviceSeriesMap[ip];
        const valMap = new Map(existing.values);
        values.forEach(([ts, v]) => {
          const prev = parseFloat(valMap.get(ts) || 0);
          const curr = parseFloat(v || 0);
          valMap.set(ts, Math.max(prev, curr));
        });
        const mergedVals = Array.from(valMap.entries()).sort((a, b) => a[0] - b[0]);
        deviceSeriesMap[ip] = {
          ip,
          metric,
          values: mergedVals,
          stats: calculateStatistics(mergedVals)
        };
      }

      // Add to quantized bucket for aligned network-wide aggregation
      values.forEach(([ts, v]) => {
        const val = parseFloat(v);
        if (!isNaN(val)) {
          const bucket = Math.floor(ts / stepSec) * stepSec;
          if (!bucketMap.has(bucket)) bucketMap.set(bucket, new Map());
          bucketMap.get(bucket).set(ip, val);
        }
      });
    });

    const sortedBuckets = Array.from(bucketMap.keys()).sort((a, b) => a - b);

    // 4. Calculate Network-Wide Overall Aggregate Series (Average & Max across all devices)
    const aggregatedValues = sortedBuckets.map((bucketTs) => {
      const devMap = bucketMap.get(bucketTs);
      let sum = 0;
      let count = 0;
      let peak = 0;

      devMap.forEach((val) => {
        sum += val;
        count++;
        if (val > peak) peak = val;
      });

      const avg = count > 0 ? sum / count : 0;
      return [bucketTs, Number(avg.toFixed(2)), Number(peak.toFixed(2))];
    });

    const overallStats = calculateStatistics(aggregatedValues.map(([ts, avg]) => [ts, avg]));

    const processedData = {
      deviceSeriesMap,
      aggregatedValues,
      overallStats,
      timestamps: sortedBuckets,
      deviceCount: Object.keys(deviceSeriesMap).length
    };

    // 5. Store in 5-Minute Cache Layer
    setCachedQueryResult(cacheKey, processedData);

    return {
      ok: true,
      cached: false,
      timestamp: Date.now(),
      timeParams,
      moduleDef: modDef,
      ...processedData
    };
  } catch (err) {
    console.warn('[AnalyticsService] Query error:', err.message);
    return {
      ok: false,
      unavailable: true,
      error: 'Analytics unavailable - Prometheus server is unreachable or offline'
    };
  }
}

/**
 * Formats series data into CSV string formatted as:
 * Timestamp,Value
 */
export function formatDataToCsv(seriesData = [], durationSec = 3600, deviceIp = 'All') {
  const lines = ['Timestamp,Value'];

  seriesData.forEach(([ts, val]) => {
    const formattedDate = new Date(ts * 1000).toISOString().replace('T', ' ').replace(/\..+/, '');
    const cleanVal = typeof val === 'number' ? val.toFixed(2) : parseFloat(val || 0).toFixed(2);
    lines.push(`"${formattedDate}",${cleanVal}`);
  });

  return lines.join('\n');
}

/**
 * Triggers a browser download for a CSV string
 */
export function downloadCsvFile(csvContent, filename = 'analytics_data.csv') {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Triggers a high-resolution PNG export of a Chart.js canvas
 */
export function downloadChartPng(chartRef, filename = 'analytics_chart.png') {
  if (!chartRef || !chartRef.current) return false;

  let dataUrl = null;
  if (typeof chartRef.current.toBase64Image === 'function') {
    dataUrl = chartRef.current.toBase64Image('image/png', 1.0);
  } else if (chartRef.current.canvas && typeof chartRef.current.canvas.toDataURL === 'function') {
    dataUrl = chartRef.current.canvas.toDataURL('image/png');
  }

  if (!dataUrl) return false;

  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}
