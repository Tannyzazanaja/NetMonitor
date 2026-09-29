/**
 * Storage Service
 * Manages localStorage synchronization for settings, custom devices, and node positions
 */

import DEFAULT_DEVICES from './defaultDevices.json';

const STORAGE_KEYS = {
  SETTINGS: 'netmonitor_settings_v1',
  DEVICES: 'network_devices_v2',
  TOPOLOGY_POSITIONS: 'topology_node_positions_v2',
  TOPOLOGY_DATA: 'topology_full_data_v2',
  DELETED_IPS: 'netmonitor_deleted_ips_v1',
};

export const DEFAULT_SETTINGS = {
  prometheusUrl: '/api/prometheus',
  grafanaUrl: typeof window !== 'undefined' ? `http://${window.location.hostname}:3000` : 'http://localhost:3000',
  refreshInterval: 10, // seconds
  orgName: 'Enterprise Network Monitoring Platform',
  wanInterface: 'GigabitEthernet0/0/0',
  defaultCommunity: 'public',
  defaultModule: 'if_mib',
  emergencyUsername: 'emergency',
};

const API_BASE = '/api/storage';

async function apiRequest(endpoint, method = 'GET', data = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    };
    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    if (!res.ok) {
      console.warn(`[Storage API] ${method} ${endpoint} failed with HTTP ${res.status}`);
      return null;
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.warn(`[Storage API] ${method} ${endpoint} returned non-JSON response`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[Storage API] ${method} ${endpoint} network error:`, err.message);
    return null;
  }
}

export const StorageService = {
  // Load entire state from Server & Auto-seed or merge local devices if needed
  async loadServerState() {
    const res = await apiRequest('/all');
    const localRawDevices = localStorage.getItem(STORAGE_KEYS.DEVICES);
    const localRawPositions = localStorage.getItem(STORAGE_KEYS.TOPOLOGY_POSITIONS);

    if (res && res.ok && res.data) {
      let serverDevices = Array.isArray(res.data.devices) ? res.data.devices : [];
      let serverSettings = res.data.settings || {};
      let serverTopology = res.data.topology || null;
      let serverPositions = res.data.topologyPositions || (serverTopology && serverTopology.positions) || {};
      let serverDeletedIps = Array.isArray(res.data.deletedIps) ? res.data.deletedIps : [];

      // 1. If server database is empty and default devices template exists, seed it
      if (serverDevices.length === 0 && Array.isArray(DEFAULT_DEVICES) && DEFAULT_DEVICES.length > 0) {
        serverDevices = [...DEFAULT_DEVICES];
        await apiRequest('/devices', 'POST', { devices: serverDevices });
      } else if (localRawDevices) {
        // 2. If server has devices, merge any unique devices from this machine that are not yet on the server
        try {
          const localDevices = JSON.parse(localRawDevices);
          if (Array.isArray(localDevices) && localDevices.length > 0) {
            let hasNew = false;
            const devMap = new Map();
            serverDevices.forEach(d => { if (d.ip) devMap.set(d.ip, d); });
            localDevices.forEach(d => {
              if (d.ip && !devMap.has(d.ip) && !serverDeletedIps.includes(d.ip)) {
                devMap.set(d.ip, d);
                hasNew = true;
              }
            });
            if (hasNew) {
              serverDevices = Array.from(devMap.values());
              await apiRequest('/devices', 'POST', { devices: serverDevices });
            }
          }
        } catch (e) {
          console.warn('[StorageService] Merge error:', e);
        }
      }

      // Merge local topology positions if server is empty or merge existing
      if ((!serverPositions || Object.keys(serverPositions).length === 0) && localRawPositions) {
        try {
          const localPos = JSON.parse(localRawPositions);
          if (localPos && Object.keys(localPos).length > 0) {
            serverPositions = localPos;
            await apiRequest('/topology', 'POST', { topologyPositions: serverPositions });
          }
        } catch {}
      } else if (localRawPositions && serverPositions && typeof serverPositions === 'object') {
        try {
          const localPos = JSON.parse(localRawPositions);
          if (localPos && typeof localPos === 'object') {
            serverPositions = { ...localPos, ...serverPositions };
          }
        } catch {}
      }

      // Update local storage cache
      try { localStorage.setItem(STORAGE_KEYS.DEVICES, JSON.stringify(serverDevices)); } catch {}
      try { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(serverSettings)); } catch {}
      if (serverPositions && Object.keys(serverPositions).length > 0) {
        try { localStorage.setItem(STORAGE_KEYS.TOPOLOGY_POSITIONS, JSON.stringify(serverPositions)); } catch {}
      }
      if (serverTopology) {
        try { localStorage.setItem(STORAGE_KEYS.TOPOLOGY_DATA, JSON.stringify(serverTopology)); } catch {}
      }
      try { localStorage.setItem(STORAGE_KEYS.DELETED_IPS, JSON.stringify(serverDeletedIps)); } catch {}

      return {
        devices: serverDevices,
        settings: serverSettings,
        topologyPositions: serverPositions,
        topology: serverTopology,
        deletedIps: serverDeletedIps,
      };
    }
    return null;
  },

  getSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      let pUrl = parsed.prometheusUrl || parsed.proxyUrl || DEFAULT_SETTINGS.prometheusUrl;
      if (pUrl.includes(':9091') || pUrl.includes(':9090')) {
        pUrl = '/api/prometheus';
      }
      return { ...DEFAULT_SETTINGS, ...parsed, prometheusUrl: pUrl };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  async saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings to localStorage:', e);
    }
    return await apiRequest('/settings', 'POST', { settings });
  },

  getCustomDevices() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DEVICES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
      return Array.isArray(DEFAULT_DEVICES) ? [...DEFAULT_DEVICES] : [];
    } catch {
      return Array.isArray(DEFAULT_DEVICES) ? [...DEFAULT_DEVICES] : [];
    }
  },

  async saveCustomDevices(devices) {
    try {
      localStorage.setItem(STORAGE_KEYS.DEVICES, JSON.stringify(devices));
    } catch (e) {
      console.error('Failed to save devices to localStorage:', e);
    }
    return await apiRequest('/devices', 'POST', { devices });
  },

  async getPrometheusTargetsPreview() {
    return await apiRequest('/prometheus-targets', 'GET');
  },

  getTopology() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TOPOLOGY_DATA);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async saveTopology(topologyData) {
    try {
      localStorage.setItem(STORAGE_KEYS.TOPOLOGY_DATA, JSON.stringify(topologyData));
      if (topologyData && topologyData.positions) {
        localStorage.setItem(STORAGE_KEYS.TOPOLOGY_POSITIONS, JSON.stringify(topologyData.positions));
      }
    } catch (e) {
      console.error('Failed to save topology to localStorage:', e);
    }
    return await apiRequest('/topology', 'POST', topologyData);
  },

  getTopologyPositions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TOPOLOGY_POSITIONS);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },

  saveTopologyPositions(positions) {
    try {
      localStorage.setItem(STORAGE_KEYS.TOPOLOGY_POSITIONS, JSON.stringify(positions));
    } catch (e) {
      console.error('Failed to save topology positions to localStorage:', e);
    }
    // Async save to server
    apiRequest('/topology', 'POST', { topologyPositions: positions });
    return true;
  },

  getDeletedIps() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DELETED_IPS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveDeletedIps(ips) {
    try {
      localStorage.setItem(STORAGE_KEYS.DELETED_IPS, JSON.stringify(ips));
    } catch (e) {
      console.error('Failed to save deleted ips to localStorage:', e);
    }
    // Async save to server
    apiRequest('/deleted-ips', 'POST', { deletedIps: ips });
    return true;
  },
};
