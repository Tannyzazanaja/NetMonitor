import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import {
  fetchActiveAlerts,
  loadAlertHistory,
  saveAlertRules,
  loadAlertRules,
  DEFAULT_ALERT_RULES,
  loadAcknowledgedIds,
  acknowledgeAlertApi,
  unacknowledgeAlertApi,
  acknowledgeAllAlertsApi,
  clearAlertHistoryApi,
  sendBrowserNotification,
  playAlertBeep,
  getNotificationsEnabled,
  setNotificationsEnabled,
  requestNotificationPermission,
} from '../services/alertStorage';

const AlertContext = createContext(null);

export function AlertProvider({ children }) {
  const { canEdit } = useAuth();

  // ── Active alerts from Backend (Source of Truth) ────────────
  const [backendAlerts, setBackendAlerts] = useState([]);

  // ── Alert History (resolved & historical alerts) ───────────
  const [alertHistory, setAlertHistory] = useState([]);

  // ── Acknowledged alert IDs (synced with Server) ─────────────
  const [acknowledgedIds, setAcknowledgedIds] = useState(new Set());

  // ── Custom Rules ────────────────────────────────────────────
  const [alertRules, setAlertRules] = useState(DEFAULT_ALERT_RULES);

  // ── UI Filter State ─────────────────────────────────────────
  const [filterSeverity, setFilterSeverity] = useState('all');

  // ── Browser Notifications Enabled ───────────────────────────
  const [notificationsEnabled, setNotificationsEnabledState] = useState(() => {
    try {
      return localStorage.getItem('nm_notifications_enabled') === 'true';
    } catch { return false; }
  });

  // Track notified alert IDs to avoid duplicate toasts / sound bursts
  const notifiedAlertIdsRef = useRef(new Set());
  const isInitialMount = useRef(true);

  // Helper to handle incoming active alerts (from SSE or Poller)
  const handleIncomingAlerts = useCallback((rawList) => {
    if (!Array.isArray(rawList)) return;

    // Deduplicate by ID
    const dedupedMap = new Map();
    rawList.forEach(a => {
      if (a && a.id) {
        dedupedMap.set(a.id, a);
      }
    });
    const list = Array.from(dedupedMap.values());
    setBackendAlerts(list);

    // Sync acknowledgedIds from alert objects
    setAcknowledgedIds(prev => {
      let changed = false;
      const next = new Set(prev);
      list.forEach(a => {
        if (a.acknowledged && !next.has(a.id)) {
          next.add(a.id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    const currentIds = new Set(list.map(a => a.id));

    if (isInitialMount.current) {
      // Seed existing alerts on startup so user is not spammed on refresh
      currentIds.forEach(id => notifiedAlertIdsRef.current.add(id));
      isInitialMount.current = false;
    } else {
      // Trigger notification & audio alert only for brand-new firing alerts
      list.forEach(alert => {
        if (!notifiedAlertIdsRef.current.has(alert.id)) {
          notifiedAlertIdsRef.current.add(alert.id);
          if (getNotificationsEnabled() && !alert.acknowledged) {
            sendBrowserNotification(alert);
            if (alert.severity === 'critical') {
              playAlertBeep('critical');
            } else {
              playAlertBeep('warning');
            }
          }
        }
      });

      // Remove resolved alerts from notified set so they can alert again in the future if recurring
      for (const id of notifiedAlertIdsRef.current) {
        if (!currentIds.has(id)) {
          notifiedAlertIdsRef.current.delete(id);
        }
      }
    }
  }, []);

  // ── Initial Data Load ───────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetchActiveAlerts(),
      loadAlertHistory(),
      loadAlertRules(),
      loadAcknowledgedIds()
    ]).then(([active, history, rules, ackIds]) => {
      if (Array.isArray(active) && active.length > 0) {
        handleIncomingAlerts(active);
      }
      if (Array.isArray(history)) {
        setAlertHistory(history);
      }
      if (rules) {
        setAlertRules(rules);
      }
      if (ackIds instanceof Set) {
        setAcknowledgedIds(prev => new Set([...prev, ...ackIds]));
      }
    }).catch(err => {
      console.warn('[AlertContext] Failed to load initial alert data:', err);
    });

    // Sync notification status with saved user preference
    const savedNotif = localStorage.getItem('nm_notifications_enabled') === 'true';
    if (savedNotif && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }
  }, [handleIncomingAlerts]);

  // ── Stream Alerts via SSE with Auto-Reconnect (Exponential Backoff) ────────
  useEffect(() => {
    let es = null;
    let retryDelay = 1000;
    let reconnectTimer = null;
    let isMounted = true;

    function connectSSE() {
      if (!isMounted) return;
      try {
        es = new EventSource('/api/storage/stream/alerts');

        es.onopen = () => {
          retryDelay = 1000;
        };

        es.onmessage = (event) => {
          try {
            const list = JSON.parse(event.data);
            if (Array.isArray(list)) {
              handleIncomingAlerts(list);
            }
          } catch (e) {
            console.warn('[AlertContext] SSE Parse error:', e);
          }
        };

        es.onerror = () => {
          if (es) {
            es.close();
            es = null;
          }
          if (isMounted && !reconnectTimer) {
            const delay = retryDelay;
            retryDelay = Math.min(retryDelay * 2, 30000);
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              connectSSE();
            }, delay);
          }
        };
      } catch (err) {
        if (isMounted && !reconnectTimer) {
          const delay = retryDelay;
          retryDelay = Math.min(retryDelay * 2, 30000);
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connectSSE();
          }, delay);
        }
      }
    }

    connectSSE();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (es) es.close();
    };
  }, [handleIncomingAlerts]);

  // ── Polling / Manual Refresh Helper ─────────────────────────
  const pollAlerts = useCallback(async () => {
    try {
      const [active, history, ackIds] = await Promise.all([
        fetchActiveAlerts(),
        loadAlertHistory(),
        loadAcknowledgedIds()
      ]);
      if (Array.isArray(active)) {
        handleIncomingAlerts(active);
      }
      if (Array.isArray(history)) {
        setAlertHistory(history);
      }
      if (ackIds instanceof Set) {
        setAcknowledgedIds(prev => new Set([...prev, ...ackIds]));
      }
    } catch (err) {
      console.warn('[AlertContext] Manual poll failed:', err);
    }
  }, [handleIncomingAlerts]);

  // ── Acknowledge / Unacknowledge Actions ──────────────────────
  const acknowledgeAlert = useCallback(async (id) => {
    // Optimistic UI update
    setAcknowledgedIds(prev => new Set([...prev, id]));
    setBackendAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
    await acknowledgeAlertApi(id);
  }, []);

  const unacknowledgeAlert = useCallback(async (id) => {
    // Optimistic UI update
    setAcknowledgedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setBackendAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: false } : a));
    await unacknowledgeAlertApi(id);
  }, []);

  const acknowledgeAllAlerts = useCallback(async () => {
    const allIds = backendAlerts.map(a => a.id);
    setAcknowledgedIds(prev => new Set([...prev, ...allIds]));
    setBackendAlerts(prev => prev.map(a => ({ ...a, acknowledged: true })));
    await acknowledgeAllAlertsApi();
  }, [backendAlerts]);

  const clearHistory = useCallback(async () => {
    setAlertHistory([]);
    await clearAlertHistoryApi();
  }, []);

  // ── Derived Alerts for Views ─────────────────────────────────
  const activeAlerts = useMemo(() =>
    backendAlerts.filter(a => !a.acknowledged && !acknowledgedIds.has(a.id)),
    [backendAlerts, acknowledgedIds]
  );

  const acknowledgedAlerts = useMemo(() =>
    backendAlerts.filter(a => a.acknowledged || acknowledgedIds.has(a.id)),
    [backendAlerts, acknowledgedIds]
  );

  const resolvedHistory = useMemo(() =>
    alertHistory.filter(h => h.status === 'resolved' || h.endsAt || h.endTime).slice(-100),
    [alertHistory]
  );

  const filteredAlerts = useMemo(() => {
    if (filterSeverity === 'all') return activeAlerts;
    return activeAlerts.filter(a => a.severity === filterSeverity);
  }, [activeAlerts, filterSeverity]);

  const criticalCount = useMemo(() =>
    activeAlerts.filter(a => a.severity === 'critical').length,
    [activeAlerts]
  );

  const warningCount = useMemo(() =>
    activeAlerts.filter(a => a.severity === 'warning').length,
    [activeAlerts]
  );

  // ── Custom Rules Update ─────────────────────────────────────
  const updateAlertRules = useCallback(async (newRules) => {
    const merged = { ...alertRules, ...newRules };
    setAlertRules(merged);
    await saveAlertRules(merged);
  }, [alertRules]);

  // ── Notification Permission & Toggle ────────────────────────
  const toggleNotifications = useCallback(async (enable) => {
    if (enable) {
      const granted = await requestNotificationPermission();
      setNotificationsEnabledState(granted);
      setNotificationsEnabled(granted);
      try { localStorage.setItem('nm_notifications_enabled', String(granted)); } catch {}
      return granted;
    } else {
      setNotificationsEnabledState(false);
      setNotificationsEnabled(false);
      try { localStorage.setItem('nm_notifications_enabled', 'false'); } catch {}
      return false;
    }
  }, []);

  return (
    <AlertContext.Provider
      value={{
        // Alerts
        alerts: backendAlerts,
        activeAlerts,
        acknowledgedAlerts,
        resolvedHistory,
        filteredAlerts,
        criticalCount,
        warningCount,
        // Filters
        filterSeverity,
        setFilterSeverity,
        // Actions
        pollAlerts,
        acknowledgeAlert,
        unacknowledgeAlert,
        acknowledgeAllAlerts,
        clearHistory,
        // Rules
        alertRules,
        updateAlertRules,
        // Notifications
        notificationsEnabled,
        toggleNotifications,
      }}
    >
      {children}
    </AlertContext.Provider>
  );
}

export function useAlerts() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlerts must be used within AlertProvider');
  return ctx;
}
