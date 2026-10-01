import React, { useEffect, useState, useMemo } from 'react';
import { HeartPulse, Activity, Server, Clock, Zap, Thermometer, Wind, AlertTriangle, Search, X, Network, Filter } from 'lucide-react';
import { useDevices } from '../../context/DeviceContext';

import { PerformanceModal } from './PerformanceModal';

export function ServicesView() {
  const { devices } = useDevices();
  const [now, setNow] = useState(Date.now());
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'switch', 'online', 'warning', 'offline'

  // Trigger UI re-render every second for real-time feel if needed (especially for simulations)
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const getBarColor = (val) => {
    if (val >= 90) return 'var(--red)';
    if (val >= 70) return 'var(--orange)';
    return 'var(--green)';
  };

  const formatUptime = (ticks) => {
    if (!ticks) return 'N/A';
    // sysUpTime is usually centiseconds (1/100th of a second)
    const seconds = Math.floor(ticks / 100);
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    return `${d}d ${h}h ${m}m`;
  };

  const isSwitchDevice = (dev) => {
    const type = (dev.type || '').toLowerCase();
    const cat = (dev.category || '').toLowerCase();
    const name = (dev.name || '').toLowerCase();
    return dev.isCore || 
           dev.isNetwork || 
           type.includes('switch') || 
           cat === 'network' || 
           cat.includes('switch') || 
           name.includes('-sw') || 
           name.includes('switch');
  };

  const switchCount = useMemo(() => devices.filter(isSwitchDevice).length, [devices]);
  const onlineCount = useMemo(() => devices.filter(d => d.status === 'online').length, [devices]);
  const offlineCount = useMemo(() => devices.filter(d => d.status === 'offline').length, [devices]);
  const warningCount = useMemo(() => {
    return devices.filter(d => 
      d.status === 'warning' || 
      d.switchHealth === 'warning' || 
      (d.cpu || 0) > 75 || 
      (d.memory || 0) > 80 || 
      (d.temp || 0) > 60 || 
      d.rebootRecent || 
      (d.latency > 100)
    ).length;
  }, [devices]);

  const filteredDevices = useMemo(() => {
    return devices.filter(dev => {
      // 1. Tab Filter
      if (activeTab === 'switch' && !isSwitchDevice(dev)) return false;
      if (activeTab === 'online' && dev.status !== 'online') return false;
      if (activeTab === 'offline' && dev.status === 'online') return false;
      if (activeTab === 'warning') {
        const isWarn = dev.status === 'warning' || 
                       dev.switchHealth === 'warning' || 
                       (dev.cpu || 0) > 75 || 
                       (dev.memory || 0) > 80 || 
                       (dev.temp || 0) > 60 || 
                       dev.rebootRecent ||
                       (dev.latency > 100);
        if (!isWarn) return false;
      }

      // 2. Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (dev.name || '').toLowerCase().includes(q);
        const matchIp = (dev.ip || '').includes(q);
        const matchModel = (dev.model || '').toLowerCase().includes(q);
        const matchVendor = (dev.vendor || '').toLowerCase().includes(q);
        const matchSerial = (dev.serial || '').toLowerCase().includes(q);
        const matchLoc = (dev.location || dev.rack || '').toLowerCase().includes(q);
        return matchName || matchIp || matchModel || matchVendor || matchSerial || matchLoc;
      }

      return true;
    });
  }, [devices, activeTab, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div className="panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--radius)',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Activity size={22} color="var(--green)" />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
            Performance & Service Health (CPU, Memory, ICMP)
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            ตรวจสอบสถานะเชิงลึกแบบ Real-time ดึงข้อมูลผ่าน Prometheus / SNMP Exporter (คลิกที่อุปกรณ์เพื่อดูกราฟย้อนหลัง)
          </div>
        </div>
      </div>

      {/* 2. Search & Filter Toolbar */}
      <div 
        className="panel" 
        style={{ 
          padding: '14px 18px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          flexWrap: 'wrap', 
          gap: 12 
        }}
      >
        {/* Quick Filter Tabs */}
        <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.8)', padding: 3, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', flexWrap: 'wrap', gap: 4 }}>
          <button
            onClick={() => setActiveTab('all')}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'all' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'all' ? '#030712' : 'var(--text-secondary)',
              transition: 'all 0.15s ease'
            }}
          >
            ทั้งหมด ({devices.length})
          </button>
          <button
            onClick={() => setActiveTab('switch')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'switch' ? 'var(--cyan)' : 'transparent',
              color: activeTab === 'switch' ? '#030712' : 'var(--cyan)',
              transition: 'all 0.15s ease'
            }}
          >
            <Network size={13} />
            <span>เฉพาะ Switch ({switchCount})</span>
          </button>
          <button
            onClick={() => setActiveTab('online')}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'online' ? 'var(--green)' : 'transparent',
              color: activeTab === 'online' ? '#030712' : 'var(--text-secondary)',
              transition: 'all 0.15s ease'
            }}
          >
            Online ({onlineCount})
          </button>
          <button
            onClick={() => setActiveTab('warning')}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'warning' ? 'var(--amber)' : 'transparent',
              color: activeTab === 'warning' ? '#030712' : 'var(--text-secondary)',
              transition: 'all 0.15s ease'
            }}
          >
            Issues / Warning ({warningCount})
          </button>
          <button
            onClick={() => setActiveTab('offline')}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'offline' ? 'var(--red)' : 'transparent',
              color: activeTab === 'offline' ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all 0.15s ease'
            }}
          >
            Offline ({offlineCount})
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, maxWidth: 360, minWidth: 160, position: 'relative' }}>
          <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="ค้นหา Switch, IP, Model, Serial, Location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 30px 7px 32px',
              fontSize: 12,
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: 2,
              }}
              title="ล้างคำค้นหา"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Probes Grid */}
      {filteredDevices.length === 0 ? (
        <div className="panel" style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Filter size={36} color="var(--text-muted)" style={{ opacity: 0.5 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไขการค้นหา
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 400 }}>
            {searchQuery ? `ไม่พบผลลัพธ์สำหรับ "${searchQuery}"` : 'ไม่มีอุปกรณ์ในหมวดหมู่นี้'}
          </div>
          {(searchQuery || activeTab !== 'all') && (
            <button
              onClick={() => { setSearchQuery(''); setActiveTab('all'); }}
              className="btn btn-secondary"
              style={{ marginTop: 8, fontSize: 12 }}
            >
              ล้างตัวกรองทั้งหมด
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
          {filteredDevices.map((dev) => {
          const isOffline = dev.status !== 'online';
          const cpu = dev.cpu || 0;
          const mem = dev.memory || 0;
          
          return (
            <div 
              key={dev.ip} 
              className="panel" 
              style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16, opacity: isOffline ? 0.6 : 1, cursor: 'pointer', transition: 'transform 0.15s ease' }}
              onClick={() => setSelectedDevice(dev)}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              {/* Header: Name and IP */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {dev.name}
                    {dev.isSimulated && <span title="Simulated Data (if_mib used)" style={{fontSize: 10, padding: '2px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: 4, color: 'var(--text-muted)'}}>SIM</span>}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)' }}>{dev.ip}</div>
                </div>
                <span className={`status-dot ${dev.status}`}></span>
              </div>

              {/* ICMP & Uptime Row */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, background: 'rgba(6, 9, 19, 0.4)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                  <Zap size={14} color="var(--amber)" />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>Ping Latency</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: dev.latency > 100 ? 'var(--red)' : 'var(--green)' }}>
                      {isOffline ? 'Timeout' : `${dev.latency} ms`}
                    </strong>
                  </div>
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, background: 'rgba(6, 9, 19, 0.4)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                  <Clock size={14} color="var(--blue)" />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>Uptime</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {isOffline ? 'Offline' : formatUptime(dev.uptime)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Progress Bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* CPU Bar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>CPU Utilization</span>
                    <strong style={{ color: getBarColor(cpu) }}>{cpu.toFixed(1)}%</strong>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ width: `${cpu}%`, height: '100%', background: getBarColor(cpu), transition: 'width 0.5s ease-out, background 0.3s ease' }} />
                  </div>
                </div>

                {/* Memory Bar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Memory Usage</span>
                    <strong style={{ color: getBarColor(mem) }}>{mem.toFixed(1)}%</strong>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ width: `${mem}%`, height: '100%', background: getBarColor(mem), transition: 'width 0.5s ease-out, background 0.3s ease' }} />
                  </div>
                </div>
              </div>

              {/* Environmental & Hardware Tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11 }}>
                {dev.temp != null && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 4, background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border)', color: dev.temp > 60 ? 'var(--red)' : 'var(--text-secondary)' }}>
                    <Thermometer size={11} color={dev.temp > 60 ? 'var(--red)' : 'var(--orange)'} /> {dev.temp}°C
                  </span>
                )}
                {dev.psu?.label && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 4, background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border)', color: dev.psu.status === 'critical' ? 'var(--red)' : 'var(--text-secondary)' }}>
                    <Zap size={11} color="var(--amber)" /> {dev.psu.label}
                  </span>
                )}
                {dev.fans?.label && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 4, background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border)', color: dev.fans.status === 'critical' ? 'var(--red)' : 'var(--text-secondary)' }}>
                    <Wind size={11} color="var(--cyan)" /> {dev.fans.label}
                  </span>
                )}
                {dev.poe && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 4, background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }} title={`PoE: ${dev.poe.usedWatts}W / ${dev.poe.budgetWatts}W`}>
                    <Zap size={11} color="var(--green)" /> PoE {dev.poe.usedWatts}W ({dev.poe.percent}%)
                  </span>
                )}
                {dev.serial && (
                  <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border)', color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                    SN: {dev.serial}
                  </span>
                )}
              </div>

              {/* Recent Reboot Alert */}
              {dev.rebootRecent && (
                <div style={{ fontSize: 10, color: '#fcd34d', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 4, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={12} color="var(--amber)" /> เพิ่ง Reboot ใหม่ (&lt; 10 นาที)
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginTop: -4 }}>
                <span>Module: {dev.module || 'if_mib'}</span>
                {dev.status === 'online' ? (
                  dev.switchHealth === 'critical' ? (
                    <span style={{ color: 'var(--red)', fontWeight: 700 }}>🔴 CRITICAL</span>
                  ) : dev.switchHealth === 'warning' ? (
                    <span style={{ color: 'var(--amber)', fontWeight: 700 }}>🟡 WARNING</span>
                  ) : (
                    <span style={{ color: 'var(--green)', fontWeight: 700 }}>🟢 HEALTHY</span>
                  )
                ) : (
                  <span style={{ color: 'var(--red)', fontWeight: 700 }}>🔴 OFFLINE</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {selectedDevice && (
        <PerformanceModal
          isOpen={!!selectedDevice}
          onClose={() => setSelectedDevice(null)}
          device={selectedDevice}
        />
      )}
    </div>
  );
}
