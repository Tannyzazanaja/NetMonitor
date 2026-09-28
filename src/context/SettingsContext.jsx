import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { StorageService, DEFAULT_SETTINGS } from '../services/storageService';
import { PrometheusClient } from '../services/prometheusService';
import { useToast } from './ToastContext';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => StorageService.getSettings());
  const [promClient, setPromClient] = useState(
    () => new PrometheusClient(settings.prometheusUrl || settings.proxyUrl || DEFAULT_SETTINGS.prometheusUrl)
  );
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [targetCount, setTargetCount] = useState(0);
  const { showToast } = useToast();

  const updateSettings = useCallback(async (newSettings) => {
    const merged = { ...settings, ...newSettings };
    const pUrl = merged.prometheusUrl || merged.proxyUrl || DEFAULT_SETTINGS.prometheusUrl;
    merged.prometheusUrl = pUrl;
    setSettings(merged);
    setPromClient(new PrometheusClient(pUrl));
    const res = await StorageService.saveSettings(merged);
    if (res && res.settings) {
      setSettings((prev) => ({ ...prev, ...res.settings }));
    }
    return res;
  }, [settings]);

  const checkConnection = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await promClient.testConnection();
      setIsConnected(res.ok);
      if (res.ok) {
        setTargetCount(res.count || 0);
      }
      return res;
    } catch (e) {
      setIsConnected(false);
      return { ok: false, message: e.message };
    } finally {
      setIsChecking(false);
    }
  }, [promClient]);

  useEffect(() => {
    const syncSettingsFromServer = async () => {
      try {
        const data = await StorageService.loadServerState();
        if (data && data.settings && typeof data.settings === 'object') {
          const merged = { ...DEFAULT_SETTINGS, ...data.settings };
          setSettings(merged);
          setPromClient(new PrometheusClient(merged.prometheusUrl || DEFAULT_SETTINGS.prometheusUrl));
        }
      } catch (e) {
        console.warn('[SettingsContext] Server sync error:', e);
      }
    };
    syncSettingsFromServer();
  }, []);

  useEffect(() => {
    checkConnection();
    const timer = setInterval(checkConnection, 30000);
    return () => clearInterval(timer);
  }, [checkConnection]);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        promClient,
        isConnected,
        isChecking,
        targetCount,
        checkConnection,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
