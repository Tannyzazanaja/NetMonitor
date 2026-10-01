import React, { useState, useEffect } from 'react';
import { Activity, Radio, Shield, Clock, CheckCircle2, AlertCircle, User, LogOut, Menu } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useDevices } from '../../context/DeviceContext';
import { useAlerts } from '../../context/AlertContext';
import { useAuth } from '../../context/AuthContext';

export function Navbar({ onMenuClick, isSidebarCollapsed }) {
  const { settings, isConnected } = useSettings();
  const { devices } = useDevices();
  const { criticalCount } = useAlerts();
  const { user, logout } = useAuth();
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('th-TH', { hour12: false }) + ' ICT');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = devices.filter(d => d.status === 'online').length;
  const pUrl = settings.prometheusUrl || settings.proxyUrl || (typeof window !== 'undefined' ? `http://${window.location.hostname}:9090` : 'http://localhost:9090');

  return (
    <header
      className="top-navbar"
      style={{
        position: 'fixed',
        top: 0,
        left: isSidebarCollapsed ? 0 : 'var(--sidebar-width)',
        transition: 'left 0.3s ease',
        right: 0,
        height: 'var(--navbar-height)',
        background: 'rgba(6, 9, 19, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isSidebarCollapsed ? '0 32px 0 64px' : '0 32px',
      }}
    >
      {/* Left: Org Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 34,
              height: 34,
              minWidth: 34,
              flexShrink: 0,
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, rgba(0,212,255,0.2) 0%, rgba(139,92,246,0.2) 100%)',
              border: '1px solid rgba(0,212,255,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 12px rgba(0,212,255,0.2)',
            }}
          >
            <Activity size={18} color="var(--primary)" />
          </div>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <div
              className="navbar-brand-title"
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 800,
                fontSize: 'clamp(13px, 3.5vw, 15px)',
                color: 'var(--text-primary)',
                letterSpacing: '0.5px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {settings.orgName}
            </div>
            <div
              className="navbar-subtitle"
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Infrastructure Telemetry & Topology
            </div>
          </div>
        </div>
      </div>

      {/* Right: Metrics, User Profile & System Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {/* Device Status Summary */}
        <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Devices:</span>
            <strong style={{ color: 'var(--text-primary)' }}>{devices.length}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)' }}>
            <span className="status-dot online"></span>
            <span>Online: <strong>{onlineCount}</strong></span>
          </div>
          {criticalCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--red)' }}>
              <span className="status-dot offline"></span>
              <span>Alerts: <strong>{criticalCount}</strong></span>
            </div>
          )}
        </div>

        <div className="hide-on-mobile" style={{ width: 1, height: 24, background: 'var(--border)' }}></div>

        {/* Live Clock */}
        <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          <Clock size={14} color="var(--primary)" />
          <span>{timeStr}</span>
        </div>

        {/* Prometheus Connection Pill */}
        <div
          className={`badge ${isConnected ? 'badge-online' : 'badge-offline'} hide-on-mobile`}
          style={{ padding: '4px 10px', fontSize: 11 }}
          title={`Prometheus Server: ${pUrl}`}
        >
          {isConnected ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
          <span>{isConnected ? 'Prometheus OK' : 'Disconnected'}</span>
        </div>

        {/* Logged in User Badge & Logout */}
        {user && (
          <div
            className="navbar-user-box"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 8px 4px 6px',
              borderRadius: 'var(--radius)',
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid var(--border)',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                minWidth: 24,
                flexShrink: 0,
                borderRadius: '50%',
                background: user.isEmergency ? 'rgba(245, 158, 11, 0.25)' : (user.role === 'Admin' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(249, 115, 22, 0.2)'),
                border: `1px solid ${user.isEmergency ? 'rgba(245, 158, 11, 0.5)' : (user.role === 'Admin' ? 'rgba(0, 212, 255, 0.4)' : 'rgba(249, 115, 22, 0.4)')}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <User size={13} color={user.isEmergency ? '#f59e0b' : (user.role === 'Admin' ? 'var(--primary)' : '#fb923c')} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, minWidth: 0 }}>
              <div
                className="navbar-username"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  maxWidth: 90,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.name || user.login}
              </div>
              <div
                className="navbar-user-role"
                style={{
                  fontSize: 10,
                  color: user.isEmergency ? '#fbbf24' : (user.role === 'Admin' ? 'var(--cyan)' : '#fb923c'),
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                <span className="navbar-role-full">
                  {user.isEmergency ? '🚨 Admin (Break-Glass)' : `${user.role} (Grafana SSO)`}
                </span>
                <span className="navbar-role-short">
                  {user.isEmergency ? '🚨 Break-Glass' : user.role}
                </span>
              </div>
            </div>
            <button
              onClick={logout}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                marginLeft: 2,
                transition: 'color 0.2s',
                flexShrink: 0,
              }}
              title="ออกจากระบบ (Sign Out)"
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--red)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
