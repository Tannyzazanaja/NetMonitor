/**
 * Alert Storage Service
 * Manages Alert History and Custom Alert Rules via Server Storage API
 */

export const API_BASE = '/api/storage';
const HISTORY_KEY = 'alert_history';
const RULES_KEY = 'alert_rules';
const MAX_HISTORY = 500;

async function apiGet(key) {
  const res = await fetch(`${API_BASE}/${key}`, { 
    credentials: 'include',
    signal: AbortSignal.timeout(5000) 
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // server.js sends { ok: true, data: [...] } for GET
  return data?.data !== undefined ? data.data : (data?.value ?? null);
}

async function apiSet(key, value) {
  try {
    await fetch(`${API_BASE}/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
      credentials: 'include',
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error('[alertStorage] apiSet error:', key, err);
  }
}

// ─────────────────────────────────────────────
// Alert History & Active Alerts
// ─────────────────────────────────────────────

export async function fetchActiveAlerts() {
  try {
    const res = await fetch('/api/alerts/active', {
      credentials: 'include',
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data?.alerts) ? data.alerts : [];
    }
  } catch (err) {
    console.warn('[alertStorage] fetchActiveAlerts error:', err.message);
  }
  return [];
}

export async function loadAlertHistory() {
  try {
    const res = await fetch('/api/alerts/history', {
      credentials: 'include',
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const list = data?.history || data?.data;
      if (Array.isArray(list)) return list;
    }
  } catch {}
  try {
    const data = await apiGet(HISTORY_KEY);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function saveAlertHistory(history) {
  // Keep only the most recent MAX_HISTORY entries
  const trimmed = history.slice(-MAX_HISTORY);
  await apiSet(HISTORY_KEY, trimmed);
}

export async function clearAlertHistoryApi() {
  try {
    const res = await fetch('/api/alerts/clear-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    console.error('[alertStorage] clearAlertHistoryApi error:', err);
    return false;
  }
}

/**
 * Merge a new batch of active alerts into the history (fallback utility).
 */
export function mergeAlertsIntoHistory(history, currentActiveAlerts) {
  const now = new Date().toISOString();
  const updated = [...history];

  // Mark previously active alerts as resolved if they no longer appear
  const currentIds = new Set(currentActiveAlerts.map(a => a.id));
  for (const entry of updated) {
    if (entry.status === 'active' && !currentIds.has(entry.id)) {
      entry.status = 'resolved';
      entry.endTime = now;
      entry.endsAt = Date.now();
    }
  }

  // Add new alerts that aren't in history yet
  const existingIds = new Set(updated.filter(e => e.status === 'active').map(e => e.id));
  for (const alert of currentActiveAlerts) {
    if (!existingIds.has(alert.id)) {
      updated.push({
        ...alert,
        status: 'active',
        startTime: now,
        startsAt: alert.startsAt || Date.now(),
        endTime: null,
      });
    }
  }

  return updated;
}

// ─────────────────────────────────────────────
// Custom Alert Rules
// ─────────────────────────────────────────────

export const DEFAULT_ALERT_RULES = {
  cpuThreshold: 80,       // % — Alert when CPU > this
  memoryThreshold: 85,    // % — Alert when Memory > this
  latencyThreshold: 150,  // ms — Alert when latency > this
  offlineEnabled: true,   // Alert when device goes offline
  offlineTimeout: 10,     // seconds - Delay before triggering offline alert
  cpuEnabled: true,
  memoryEnabled: true,
  latencyEnabled: true,
};

export async function loadAlertRules() {
  try {
    const data = await apiGet(RULES_KEY);
    if (data && typeof data === 'object') {
      return { ...DEFAULT_ALERT_RULES, ...data };
    }
    return { ...DEFAULT_ALERT_RULES };
  } catch {
    return null;
  }
}

export async function saveAlertRules(rules) {
  await apiSet(RULES_KEY, rules);
}

// ─────────────────────────────────────────────
// Acknowledged Alerts
// ─────────────────────────────────────────────
const ACK_KEY = 'alert_acknowledged_ids';

export async function loadAcknowledgedIds() {
  try {
    const res = await fetch('/api/alerts/acknowledged', {
      credentials: 'include',
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.acknowledgedIds)) {
        return new Set(data.acknowledgedIds);
      }
    }
  } catch (err) {
    console.warn('[alertStorage] loadAcknowledgedIds API error:', err.message);
  }
  try {
    const data = await apiGet(ACK_KEY);
    return Array.isArray(data) ? new Set(data) : new Set();
  } catch (err) {
    console.error('Failed to load Acknowledged IDs:', err);
    return new Set();
  }
}

export async function saveAcknowledgedIds(idsSet) {
  await apiSet(ACK_KEY, Array.from(idsSet));
}

export async function acknowledgeAlertApi(id) {
  try {
    const res = await fetch('/api/alerts/acknowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
      credentials: 'include',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    console.error('[alertStorage] acknowledgeAlertApi error:', err);
    return false;
  }
}

export async function unacknowledgeAlertApi(id) {
  try {
    const res = await fetch('/api/alerts/unacknowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
      credentials: 'include',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    console.error('[alertStorage] unacknowledgeAlertApi error:', err);
    return false;
  }
}

export async function acknowledgeAllAlertsApi() {
  try {
    const res = await fetch('/api/alerts/acknowledge-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    console.error('[alertStorage] acknowledgeAllAlertsApi error:', err);
    return false;
  }
}

// ─────────────────────────────────────────────
// Browser Notification Helpers
// ─────────────────────────────────────────────

let _notificationsEnabled = false;

export function getNotificationsEnabled() {
  return _notificationsEnabled;
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') {
    _notificationsEnabled = true;
    return true;
  }
  if (Notification.permission !== 'denied') {
    const result = await Notification.requestPermission();
    _notificationsEnabled = result === 'granted';
    return _notificationsEnabled;
  }
  return false;
}

export function setNotificationsEnabled(val) {
  _notificationsEnabled = val;
}

export function sendBrowserNotification(alert) {
  if (!_notificationsEnabled || Notification.permission !== 'granted') return;
  try {
    new Notification(`🚨 ${alert.severity.toUpperCase()}: ${alert.name}`, {
      body: `${alert.deviceName || alert.instance}\n${alert.description}`,
      icon: '/favicon.ico',
      tag: alert.id, // Prevents duplicate notifications for the same alert
    });
  } catch {}
}

/** Play a short beep using Web Audio API — no audio file needed */
export function playAlertBeep(severity = 'warning') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Critical = lower frequency (more urgent), Warning = higher
    oscillator.frequency.value = severity === 'critical' ? 440 : 880;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
  } catch {}
}
