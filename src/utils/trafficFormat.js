/**
 * trafficFormat.js
 * Centralized Traffic Rate & Unit Formatting Engine
 *
 * Adheres strictly to Section 20, 21, and 22 of Master Development Prompt:
 * - Eliminates unit confusion (Mbps vs MB/s)
 * - Explicitly differentiates between "0.00 Mbps" (Zero traffic) and "No Data" (Missing/Disconnected)
 * - Canonical scale: bps <-> Kbps <-> Mbps <-> Gbps
 */

/**
 * Format traffic from Megabits per second (Mbps)
 * @param {number|string|null|undefined} mbps 
 * @returns {{ val: string, unit: string, isNoData: boolean, formatted: string }}
 */
export function formatTrafficMbps(mbps) {
  if (mbps === null || mbps === undefined || mbps === '' || mbps === 'No Data' || (typeof mbps === 'number' && isNaN(mbps))) {
    return { val: 'No Data', unit: '', isNoData: true, formatted: 'No Data' };
  }
  const val = Number(mbps);
  if (isNaN(val)) {
    return { val: 'No Data', unit: '', isNoData: true, formatted: 'No Data' };
  }
  if (val <= 0) {
    return { val: '0.00', unit: 'Mbps', isNoData: false, formatted: '0.00 Mbps' };
  }
  if (val >= 1000) {
    const v = (val / 1000).toFixed(2);
    return { val: v, unit: 'Gbps', isNoData: false, formatted: `${v} Gbps` };
  }
  if (val >= 0.1) {
    const v = val.toFixed(2);
    return { val: v, unit: 'Mbps', isNoData: false, formatted: `${v} Mbps` };
  }
  if (val >= 0.0001) {
    const v = (val * 1000).toFixed(1);
    return { val: v, unit: 'Kbps', isNoData: false, formatted: `${v} Kbps` };
  }
  const v = (val * 1000000).toFixed(0);
  return { val: v, unit: 'bps', isNoData: false, formatted: `${v} bps` };
}

/**
 * Format traffic from raw bits per second (bps)
 * @param {number|string|null|undefined} bps 
 * @returns {{ val: string, unit: string, isNoData: boolean, formatted: string }}
 */
export function formatTrafficRate(bps) {
  if (bps === null || bps === undefined || bps === '' || isNaN(Number(bps))) {
    return { val: 'No Data', unit: '', isNoData: true, formatted: 'No Data' };
  }
  return formatTrafficMbps(Number(bps) / 1000000);
}

/**
 * Format byte transfer rate from Bytes per second (B/s)
 * Used specifically for disk storage or memory transfers, strictly distinct from network bits/s (bps)
 * @param {number|string|null|undefined} bytesPerSec 
 * @returns {{ val: string, unit: string, isNoData: boolean, formatted: string }}
 */
export function formatTrafficBytesPerSec(bytesPerSec) {
  if (bytesPerSec === null || bytesPerSec === undefined || isNaN(Number(bytesPerSec))) {
    return { val: 'No Data', unit: '', isNoData: true, formatted: 'No Data' };
  }
  const bytes = Number(bytesPerSec);
  if (bytes <= 0) return { val: '0.00', unit: 'B/s', isNoData: false, formatted: '0.00 B/s' };
  if (bytes >= 1073741824) {
    const v = (bytes / 1073741824).toFixed(2);
    return { val: v, unit: 'GB/s', isNoData: false, formatted: `${v} GB/s` };
  }
  if (bytes >= 1048576) {
    const v = (bytes / 1048576).toFixed(2);
    return { val: v, unit: 'MB/s', isNoData: false, formatted: `${v} MB/s` };
  }
  if (bytes >= 1024) {
    const v = (bytes / 1024).toFixed(1);
    return { val: v, unit: 'KB/s', isNoData: false, formatted: `${v} KB/s` };
  }
  return { val: bytes.toFixed(0), unit: 'B/s', isNoData: false, formatted: `${bytes.toFixed(0)} B/s` };
}

// Backward-compatible alias
export const formatTrafficSpeed = formatTrafficMbps;

export default {
  formatTrafficMbps,
  formatTrafficRate,
  formatTrafficBytesPerSec,
  formatTrafficSpeed
};
