import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StorageService } from '../services/storageService';
import { detectOSAndType } from '../services/deviceClassifier';
import { useSettings } from './SettingsContext';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';

const DeviceContext = createContext(null);

export function DeviceProvider({ children }) {
  const { canEdit } = useAuth();
  const [customDevices, setCustomDevices] = useState(() => StorageService.getCustomDevices());
  const [deletedIps, setDeletedIps] = useState(() => StorageService.getDeletedIps());
  const [deviceStats, setDeviceStats] = useState({}); // { [ip]: { isOnline, latency, sysName, sysDescr, uptime } }
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const { settings, promClient } = useSettings();
  const { showToast } = useToast();
  const isPollingRef = useRef(false);

  // Dynamic refresh interval from settings (default 10s, min safety 3s)
  const intervalMs = Math.max((Number(settings?.refreshInterval) || 10) * 1000, 3000);

  // Save custom devices to storage & server (Backend automatically regenerates Prometheus targets)
  const persistCustomDevices = useCallback((newList) => {
    setCustomDevices(newList);
    StorageService.saveCustomDevices(newList);
  }, []);

  // Fetch latest state from Server Storage
  const fetchServerState = useCallback(async () => {
    try {
      const data = await StorageService.loadServerState();
      if (data) {
        if (Array.isArray(data.devices)) {
          setCustomDevices(data.devices);
        }
        if (Array.isArray(data.deletedIps)) {
          setDeletedIps(data.deletedIps);
        }
      }
    } catch (e) {
      console.warn('[DeviceContext] Server sync error:', e);
    }
  }, []);

  // Sync from Server Storage on mount & tab focus
  useEffect(() => {
    fetchServerState();

    const handleFocus = () => fetchServerState();
    window.addEventListener('focus', handleFocus);

    const interval = setInterval(fetchServerState, 30000); // 30s background sync across machines
    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [fetchServerState]);

  // Poll SNMP & ICMP metrics for all devices via Batch Query Architecture
  const pollDeviceMetrics = useCallback(async () => {
    if (!promClient || customDevices.length === 0) return;
    if (isPollingRef.current) {
      console.debug('[DeviceContext] Polling cycle already active, skipping tick to avoid overlap');
      return;
    }
    isPollingRef.current = true;

    try {
      // 1. Parallel Batch Queries across all devices:
      // - ICMP probe status (probe_success)
      // - Latency duration (probe_duration_seconds)
      // - Hostname (sysName)
      // - Exporter up status (up)
      // - Batch performance (CPU, Memory used, Memory free/total, Uptime for ALL instances in 4 queries)
      // - Backend performance cache (Real SNMP health, temp, psu, fans, poe, serial)
      const [rProbe, rDuration, rSysName, rUp, rBatchPerf, rBackendPerf] = await Promise.allSettled([
        promClient.instantQuery('probe_success'),
        promClient.instantQuery('probe_duration_seconds'),
        promClient.instantQuery('sysName'),
        promClient.instantQuery('up'),
        promClient.fetchBatchPerformance(),
        fetch('/api/storage/device_performance')
          .then(res => res.ok ? res.json() : null)
          .catch(() => null),
      ]);

      const probeMap = {};
      if (rProbe.status === 'fulfilled' && Array.isArray(rProbe.value)) {
        rProbe.value.forEach(item => {
          const t = (item.metric?.target || item.metric?.instance || '').replace(/:\d+$/, '');
          const job = item.metric?.job || '';
          const module = item.metric?.module || '';
          // Only evaluate ICMP ping probes for probeMap (blackbox exporter)
          if (job.startsWith('blackbox') || module === 'icmp') {
            const isSuccess = item.value?.[1] === '1';
            if (t) {
              probeMap[t] = (probeMap[t] === true) || isSuccess;
            }
          }
        });
      }

      const snmpUpMap = {};
      if (rProbe.status === 'fulfilled' && Array.isArray(rProbe.value)) {
        rProbe.value.forEach(item => {
          const t = (item.metric?.target || item.metric?.instance || '').replace(/:\d+$/, '');
          const job = item.metric?.job || '';
          if (job.startsWith('snmp')) {
            const isSuccess = item.value?.[1] === '1';
            if (t) {
              snmpUpMap[t] = (snmpUpMap[t] === true) || isSuccess;
            }
          }
        });
      }
      if (rUp.status === 'fulfilled' && Array.isArray(rUp.value)) {
        rUp.value.forEach(item => {
          const t = (item.metric?.target || item.metric?.instance || '').replace(/:\d+$/, '');
          const isSuccess = item.value?.[1] === '1';
          const job = item.metric?.job || '';
          if (t && job.startsWith('snmp')) {
            snmpUpMap[t] = (snmpUpMap[t] === true) || isSuccess;
          }
          // NEVER touch probeMap here! Blackbox up{job="blackbox-icmp"} measures exporter daemon, not target ping.
        });
      }

      const durationMap = {};
      if (rDuration.status === 'fulfilled' && Array.isArray(rDuration.value)) {
        rDuration.value.forEach(item => {
          const t = (item.metric?.target || item.metric?.instance || '').replace(/:\d+$/, '');
          const job = item.metric?.job || '';
          const module = item.metric?.module || '';
          const ms = Math.round(parseFloat(item.value?.[1] || 0) * 1000);
          // Only record duration for blackbox ICMP ping probes when ping actually succeeded (< 10000ms)
          if ((job.startsWith('blackbox') || module === 'icmp') && t && ms > 0 && ms < 10000) {
            if (probeMap[t] === true) {
              if (!durationMap[t] || ms < durationMap[t]) {
                durationMap[t] = ms;
              }
            }
          }
        });
      }

      const sysNameMap = {};
      if (rSysName.status === 'fulfilled' && Array.isArray(rSysName.value)) {
        rSysName.value.forEach(item => {
          const t = (item.metric?.instance || '').replace(/:\d+$/, '');
          const n = item.metric?.sysName || item.value?.[1];
          if (t && n) sysNameMap[t] = n;
        });
      }

      // Backend hardware SNMP cache
      let backendPerfMap = {};
      if (rBackendPerf.status === 'fulfilled' && rBackendPerf.value?.data && typeof rBackendPerf.value.data === 'object') {
        backendPerfMap = rBackendPerf.value.data;
      }

      // Batch performance map from Prometheus
      const promPerfMap = (rBatchPerf.status === 'fulfilled' && rBatchPerf.value) ? rBatchPerf.value : {};

      setDeviceStats(prev => {
        const newStats = {};
        const now = Date.now();
        
        customDevices.forEach(d => {
          const ip = d.ip;
          const isPingAlive = probeMap[ip] === true;
          const isPingFailed = probeMap[ip] === false;

          const cached = backendPerfMap[ip];
          const promPerf = promPerfMap[ip] || {};

          // Prioritize backend SNMP poller metrics if present, else fallback to Prometheus batch metrics
          const cpuVal = cached?.cpu !== null && cached?.cpu !== undefined 
            ? cached.cpu 
            : (promPerf.cpu !== null && promPerf.cpu !== undefined ? promPerf.cpu : null);

          const memVal = cached?.memory !== null && cached?.memory !== undefined 
            ? cached.memory 
            : (promPerf.memory !== null && promPerf.memory !== undefined ? promPerf.memory : null);

          const uptimeVal = cached?.uptime !== null && cached?.uptime !== undefined 
            ? cached.uptime 
            : (promPerf.uptime !== null && promPerf.uptime !== undefined ? promPerf.uptime : null);

          const snmpSuccess = snmpUpMap[ip] === true || !!sysNameMap[ip] || (cpuVal != null || memVal != null);

          // User Requirement: ยึดการ ping (ICMP) เป็นหลักเด็ดขาด ถ้า ping ไม่ติดคือตีตกเป็น Offline ไปเลย!
          let isNowOnline = false;
          if (isPingFailed) {
            // Ping failed -> Offline immediately!
            isNowOnline = false;
          } else if (isPingAlive) {
            // Ping succeeded -> Online!
            isNowOnline = true;
          } else {
            // If Prometheus has no Blackbox ICMP record yet, fallback to previous or default true for newly added
            isNowOnline = prev[ip]?.isOnline ?? true;
          }

          const wasOnline = prev[ip]?.isOnline ?? false;
          let offlineSince = prev[ip]?.offlineSince || null;

          if (!isNowOnline && wasOnline) {
            offlineSince = now; // Just went offline
          } else if (isNowOnline) {
            offlineSince = null; // Back online
          }

          newStats[ip] = {
            isOnline: isNowOnline,
            icmpOnline: isPingAlive,
            snmpOnline: snmpSuccess,
            offlineSince,
            latency: isNowOnline ? (durationMap[ip] ?? 2) : 0,
            sysName: sysNameMap[ip] || d.name,
            cpu: isNowOnline ? cpuVal : null,
            memory: isNowOnline ? memVal : null,
            uptime: isNowOnline ? uptimeVal : null,
            serial: isNowOnline ? (cached?.serial ?? null) : null,
            temp: isNowOnline ? (cached?.temp ?? null) : null,
            psu: isNowOnline ? (cached?.psu ?? null) : null,
            fans: isNowOnline ? (cached?.fans ?? null) : null,
            poe: isNowOnline ? (cached?.poe ?? null) : null,
            rebootRecent: isNowOnline ? (cached?.rebootRecent ?? false) : false,
            switchHealth: isNowOnline ? (cached?.health ?? 'normal') : 'offline',
            isSimulated: false
          };
        });
        return newStats;
      });
    } catch (e) {
      console.warn('[DeviceContext] Metrics poll error:', e);
    } finally {
      isPollingRef.current = false;
    }
  }, [promClient, customDevices]);

  useEffect(() => {
    pollDeviceMetrics();
    const interval = setInterval(pollDeviceMetrics, intervalMs);
    return () => clearInterval(interval);
  }, [pollDeviceMetrics, intervalMs]);

  // Merge custom devices with runtime stats & classifications
  const devices = useMemo(() => {
    return customDevices
      .filter(d => !deletedIps.includes(d.ip))
      .map(d => {
        const stats = deviceStats[d.ip] || {};
        const profile = detectOSAndType({
          name: d.name,
          type: d.type,
          model: d.model,
          raw: `${d.name} ${d.type} ${d.vendor || ''}`,
        });

        return {
          ...d,
          ...profile,
          category: d.category || profile.category,
          vendor: d.vendor || profile.vendor,
          model: d.model || profile.model || d.os || '',
          os: d.os || profile.os,
          status: stats.isOnline === false ? 'offline' : (stats.latency > 100 ? 'warning' : 'online'),
          isOnline: stats.isOnline ?? true,
          icmpOnline: stats.icmpOnline ?? false,
          snmpOnline: stats.snmpOnline ?? false,
          latency: stats.isOnline === false ? 0 : (stats.latency ?? 2),
          sysName: stats.sysName || d.name,
          isCore: profile.isCore,
          isFirewall: profile.isFirewall,
          isNetwork: profile.isNetwork,
          cpu: stats.cpu,
          memory: stats.memory,
          uptime: stats.uptime,
          serial: stats.serial,
          temp: stats.temp,
          psu: stats.psu,
          fans: stats.fans,
          poe: stats.poe,
          rebootRecent: stats.rebootRecent,
          switchHealth: stats.switchHealth,
          offlineSince: stats.offlineSince || null,
          isSimulated: stats.isSimulated
        };
      });
  }, [customDevices, deletedIps, deviceStats]);

  // Filtered devices for table/grid views
  const filteredDevices = useMemo(() => {
    return devices.filter(d => {
      if (categoryFilter !== 'all') {
        const cat = d.category || (d.isNetwork ? 'network' : 'endpoint');
        if (categoryFilter === 'network' && cat !== 'network') return false;
        if (categoryFilter === 'endpoint' && cat !== 'endpoint') return false;
        if (categoryFilter === 'server' && cat !== 'server') return false;
      }
      if (typeFilter !== 'all' && d.type !== typeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const text = `${d.name} ${d.ip} ${d.location || ''} ${d.type} ${d.vendor || ''} ${d.model || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [devices, categoryFilter, typeFilter, searchQuery]);

  const addOrUpdateDevice = useCallback((deviceInput, isEdit = false, originalIp = null) => {
    if (!canEdit) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ (Permission Denied)', 'เฉพาะผู้ใช้ระดับ Editor หรือ Admin เท่านั้นที่สามารถเพิ่มหรือแก้ไขอุปกรณ์ได้');
      throw new Error('Forbidden: Viewer role cannot add or edit devices');
    }
    const ip = (deviceInput.ip || '').trim();
    if (!ip) throw new Error('IP Address is required');

    const rawName = (deviceInput.name || ip).trim();
    const cleanNameLower = rawName.toLowerCase();

    // Strict duplicate check: If adding (not edit mode), check if IP already exists in devices list
    if (!isEdit) {
      const existing = devices.find(d => d.ip === ip);
      if (existing) {
        throw new Error(
          `IP Address "${ip}" มีอยู่ในระบบแล้ว (ชื่อ: ${existing.name || existing.ip}) ไม่สามารถเพิ่มซ้ำได้ ต้องลบอุปกรณ์เดิมออกก่อน หรือแก้ไขข้อมูลเดิมแทน`
        );
      }
      const existingName = devices.find(d => (d.name || '').trim().toLowerCase() === cleanNameLower);
      if (existingName) {
        throw new Error(
          `ชื่ออุปกรณ์ "${rawName}" มีอยู่ในระบบแล้ว (IP: ${existingName.ip}) กรุณาตั้งชื่ออื่นที่ไม่ซ้ำกัน`
        );
      }
    } else if (originalIp && originalIp !== ip) {
      // In edit mode and user changed the IP: check if new IP conflicts with another device
      const conflict = devices.find(d => d.ip === ip && d.ip !== originalIp);
      if (conflict) {
        throw new Error(
          `ไม่สามารถเปลี่ยนเป็น IP "${ip}" ได้ เนื่องจากถูกใช้งานโดยอุปกรณ์ "${conflict.name || conflict.ip}" อยู่แล้ว`
        );
      }
      const conflictName = devices.find(
        d => (d.name || '').trim().toLowerCase() === cleanNameLower && d.ip !== originalIp
      );
      if (conflictName) {
        throw new Error(
          `ไม่สามารถตั้งชื่อ "${rawName}" ได้ เนื่องจากถูกใช้งานโดยอุปกรณ์ IP "${conflictName.ip}" อยู่แล้ว`
        );
      }
    } else {
      // In edit mode (same IP): check if another device has this name
      const conflictName = devices.find(
        d => (d.name || '').trim().toLowerCase() === cleanNameLower && d.ip !== ip
      );
      if (conflictName) {
        throw new Error(
          `ไม่สามารถตั้งชื่อ "${rawName}" ได้ เนื่องจากถูกใช้งานโดยอุปกรณ์ IP "${conflictName.ip}" อยู่แล้ว`
        );
      }
    }

    const profile = detectOSAndType(deviceInput);
    const newDevice = {
      ip,
      name: deviceInput.name || ip,
      type: deviceInput.type || profile.type,
      category: ['switch', 'coreswitch', 'distswitch', 'firewall', 'router', 'ap'].includes(deviceInput.type || profile.type)
        ? 'network' : (deviceInput.type === 'server' ? 'server' : 'endpoint'),
      location: deviceInput.location || '',
      community: deviceInput.community || 'public',
      module: deviceInput.module || 'if_mib',
      vendor: deviceInput.vendor || profile.vendor,
      model: deviceInput.model || profile.model || deviceInput.os || '',
      os: deviceInput.os || profile.os,
      updatedAt: new Date().toISOString(),
    };

    let updatedList;
    if (isEdit && originalIp && originalIp !== ip) {
      // Replace old IP device with new IP device
      updatedList = customDevices.filter(d => d.ip !== originalIp && d.ip !== ip).concat(newDevice);
    } else {
      const existingIdx = customDevices.findIndex(d => d.ip === ip);
      if (existingIdx >= 0) {
        updatedList = [...customDevices];
        updatedList[existingIdx] = { ...updatedList[existingIdx], ...newDevice };
      } else {
        updatedList = [...customDevices, newDevice];
      }
    }

    persistCustomDevices(updatedList);

    // If IP was in deleted list, restore it
    if (deletedIps.includes(ip)) {
      const newDeleted = deletedIps.filter(item => item !== ip);
      setDeletedIps(newDeleted);
      StorageService.saveDeletedIps(newDeleted);
    }

    return newDevice;
  }, [devices, customDevices, deletedIps, persistCustomDevices, canEdit, showToast]);

  const addDevicesBulk = useCallback((deviceInputs) => {
    if (!canEdit) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ (Permission Denied)', 'เฉพาะผู้ใช้ระดับ Editor หรือ Admin เท่านั้นที่สามารถเพิ่มอุปกรณ์ได้');
      return 0;
    }
    let updatedList = [...customDevices];
    let newDeletedIps = [...deletedIps];
    const addedDevices = [];
    const now = new Date().toISOString();

    for (const deviceInput of deviceInputs) {
      const ip = (deviceInput.ip || '').trim();
      if (!ip) continue;

      const rawName = (deviceInput.name || ip).trim();
      const cleanNameLower = rawName.toLowerCase();

      // Skip if IP already exists
      if (updatedList.find(d => d.ip === ip)) continue;
      // Skip if Name already exists
      if (updatedList.find(d => (d.name || '').trim().toLowerCase() === cleanNameLower)) continue;

      const profile = detectOSAndType(deviceInput);
      const newDevice = {
        ip,
        name: rawName,
        type: deviceInput.type || profile.type,
        category: ['switch', 'coreswitch', 'distswitch', 'firewall', 'router', 'ap'].includes(deviceInput.type || profile.type)
          ? 'network' : (deviceInput.type === 'server' ? 'server' : 'endpoint'),
        location: deviceInput.location || '',
        community: deviceInput.community || 'public',
        module: deviceInput.module || 'if_mib',
        vendor: deviceInput.vendor || profile.vendor,
        model: deviceInput.model || profile.model || deviceInput.os || '',
        os: deviceInput.os || profile.os,
        updatedAt: now,
      };

      updatedList.push(newDevice);
      addedDevices.push(newDevice);

      // Restore if it was in deleted list
      newDeletedIps = newDeletedIps.filter(item => item !== ip);
    }

    if (addedDevices.length > 0) {
      persistCustomDevices(updatedList);
      if (newDeletedIps.length !== deletedIps.length) {
        setDeletedIps(newDeletedIps);
        StorageService.saveDeletedIps(newDeletedIps);
      }
    }

    return addedDevices.length;
  }, [customDevices, deletedIps, persistCustomDevices, canEdit, showToast]);

  const updateDeviceIp = useCallback((oldIp, newIp) => {
    if (!canEdit) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ (Permission Denied)', 'เฉพาะผู้ใช้ระดับ Editor หรือ Admin เท่านั้นที่สามารถเปลี่ยน IP อุปกรณ์ได้');
      return;
    }
    const cleanOld = (oldIp || '').trim();
    const cleanNew = (newIp || '').trim();
    if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;

    // Check if new IP conflicts with another device
    const conflict = devices.find(d => d.ip === cleanNew && d.ip !== cleanOld);
    if (conflict) {
      showToast('error', 'IP ซ้ำกับอุปกรณ์อื่น', `IP ${cleanNew} มีอยู่ในระบบแล้ว (อุปกรณ์: ${conflict.name || conflict.ip}) กรุณาใช้ IP อื่น`);
      return;
    }

    const targetDev = customDevices.find(d => d.ip === cleanOld);
    if (!targetDev) return;

    const updatedDev = { ...targetDev, ip: cleanNew, updatedAt: new Date().toISOString() };
    const updatedList = customDevices.filter(d => d.ip !== cleanOld && d.ip !== cleanNew).concat(updatedDev);
    persistCustomDevices(updatedList);
    showToast('success', 'อัพเดต IP สำเร็จ', `เปลี่ยน IP ของ ${targetDev.name} จาก ${cleanOld} เป็น ${cleanNew} เรียบร้อยแล้ว`);
  }, [devices, customDevices, persistCustomDevices, showToast, canEdit]);

  const deleteDevice = useCallback((ip) => {
    if (!canEdit) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ (Permission Denied)', 'เฉพาะผู้ใช้ระดับ Editor หรือ Admin เท่านั้นที่สามารถลบอุปกรณ์ได้');
      return;
    }
    const updatedList = customDevices.filter(d => d.ip !== ip);
    persistCustomDevices(updatedList);

    const newDeleted = [...new Set([...deletedIps, ip])];
    setDeletedIps(newDeleted);
    StorageService.saveDeletedIps(newDeleted);

    showToast('warning', 'ลบอุปกรณ์แล้ว', `ลบอุปกรณ์ ${ip} ออกจากระบบเรียบร้อยแล้ว`);
  }, [customDevices, deletedIps, persistCustomDevices, showToast, canEdit]);

  const autoDetect = useCallback(async (ip) => {
    if (!promClient) return null;
    return await promClient.queryDeviceAutoDetect(ip);
  }, [promClient]);

  const uploadToServer = useCallback(async () => {
    if (!canEdit) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ (Permission Denied)', 'เฉพาะผู้ใช้ระดับ Editor หรือ Admin เท่านั้นที่สามารถบันทึกข้อมูลขึ้นเซิร์ฟเวอร์ได้');
      return false;
    }
    try {
      const res = await StorageService.saveCustomDevices(customDevices);
      if (res && res.ok) {
        showToast('success', 'บันทึกขึ้น Server สำเร็จ', `อัปโหลดอุปกรณ์ ${customDevices.length} เครื่องขึ้น Server เรียบร้อยแล้ว`);
        return true;
      } else {
        showToast('error', 'อัปโหลดไม่สำเร็จ', 'ไม่สามารถเชื่อมต่อ Server Storage API (/api/storage/devices) ได้ กรุณาตรวจสอบ Nginx / Node service');
        return false;
      }
    } catch (e) {
      showToast('error', 'เกิดข้อผิดพลาด', e.message);
      return false;
    }
  }, [customDevices, showToast, canEdit]);

  const refreshFromServer = useCallback(async () => {
    try {
      const data = await StorageService.loadServerState();
      if (data && Array.isArray(data.devices) && data.devices.length > 0) {
        setCustomDevices(data.devices);
        showToast('success', 'ดึงข้อมูลสำเร็จ', `ดึงข้อมูลอุปกรณ์ ${data.devices.length} เครื่องจาก Server เรียบร้อยแล้ว`);
        return true;
      } else {
        showToast('warning', 'ไม่พบข้อมูลบน Server', 'ฐานข้อมูลบน Server ยังไม่มีอุปกรณ์ หรือไม่สามารถเชื่อมต่อได้');
        return false;
      }
    } catch (e) {
      showToast('error', 'เกิดข้อผิดพลาด', e.message);
      return false;
    }
  }, [showToast]);

  return (
    <DeviceContext.Provider
      value={{
        devices,
        filteredDevices,
        customDevices,
        addOrUpdateDevice,
        addDevicesBulk,
        updateDeviceIp,
        deleteDevice,
        autoDetect,
        searchQuery,
        setSearchQuery,
        categoryFilter,
        setCategoryFilter,
        typeFilter,
        setTypeFilter,
        pollDeviceMetrics,
        uploadToServer,
        refreshFromServer,
      }}
    >
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevices() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevices must be used within DeviceProvider');
  return ctx;
}
