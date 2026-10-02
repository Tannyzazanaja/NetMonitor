import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Network,
  Server,
  Activity,
  BarChart3,
  HeartPulse,
  AlertTriangle,
  Settings,
  PlusCircle,
  User,
  LogOut,
} from 'lucide-react';
import { useDevices } from '../../context/DeviceContext';
import { useAlerts } from '../../context/AlertContext';
import { useTopology } from '../../context/TopologyContext';
import { useAuth } from '../../context/AuthContext';

export function Sidebar({ activeTab, setActiveTab, onOpenAddDevice, isMobileMenuOpen, isCollapsed }) {
  const { devices } = useDevices();
  const { topoLinks } = useTopology();
  const { criticalCount } = useAlerts();
  const { user, logout } = useAuth();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp, badge: 'NEW', badgeType: 'info' },
    { id: 'topology', label: 'Topology Map', icon: Network, badge: topoLinks.length > 0 ? `${topoLinks.length} links` : null },
    { id: 'devices', label: 'Device Manager', icon: Server, badge: devices.length },
    { id: 'traffic', label: 'Traffic & WAN', icon: Activity },
    { id: 'services', label: 'Service Health', icon: HeartPulse },
    { id: 'alerts', label: 'Alert History', icon: AlertTriangle, badge: criticalCount > 0 ? criticalCount : null, badgeType: 'danger' },
    { id: 'grafana', label: 'Grafana Analytics', icon: BarChart3, badge: 'NOC', badgeType: 'warning' },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside
      className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: isCollapsed ? 0 : 'var(--sidebar-width)',
        transition: 'width 0.3s ease, transform 0.3s ease-in-out',
        background: isMobileMenuOpen ? '#0b1022' : 'rgba(7, 11, 24, 0.95)',
        backdropFilter: isMobileMenuOpen ? 'none' : 'blur(16px)',
        borderRight: isCollapsed ? 'none' : '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: isMobileMenuOpen ? 1100 : 101,
        overflowX: 'hidden',
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          height: 'var(--navbar-height)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: isCollapsed ? 0 : '0 16px',
          justifyContent: isCollapsed ? "center" : "flex-start",
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            minWidth: 32,
            borderRadius: 'var(--radius-sm)',
            background: 'linear-gradient(135deg, #00d4ff 0%, #3b82f6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 16px rgba(0, 212, 255, 0.4)',
            flexShrink: 0,
          }}
        >
          <Network size={18} color="#030712" strokeWidth={2.5} />
        </div>
        {!isCollapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 800,
                fontSize: 16,
                letterSpacing: '0.5px',
                color: 'var(--text-primary)',
              }}
            >
              NetMonitor
            </div>
            <div style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 700, letterSpacing: '1px', whiteSpace: 'nowrap' }}>
              IT SUPPORT&SERVICE
            </div>
          </div>
        )}
      </div>

      {/* Quick Action: Add Device */}
      <div style={{ padding: '16px 16px 8px 16px' }}>
        <button
          onClick={onOpenAddDevice}
          className="btn btn-primary"
          style={{ width: "100%", fontSize: 12, padding: isCollapsed ? "9px 0" : "9px 12px", justifyContent: isCollapsed ? "center" : "flex-start" }}
        >
          <PlusCircle size={15} />
          {!isCollapsed && <span>เพิ่มอุปกรณ์ (Add Device)</span>}
        </button>
      </div>

      {/* Navigation List */}
      <nav style={{ flex: 1, padding: isCollapsed ? 0 : '8px 12px', overflowY: 'auto' }}>
        {!isCollapsed && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', padding: '8px 12px' }}>
          Navigation
        </div>}
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCollapsed ? 'center' : 'space-between',
                    padding: isCollapsed ? '10px 0' : '10px 14px',
                    borderRadius: 'var(--radius)',
                    background: isActive ? 'rgba(0, 212, 255, 0.12)' : 'transparent',
                    border: '1px solid',
                    borderColor: isActive ? 'rgba(0, 212, 255, 0.4)' : 'transparent',
                    color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: isActive ? 700 : 500,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Icon size={17} color={isActive ? 'var(--primary)' : 'currentColor'} />
                    <span>{item.label}</span>
                  </div>
                  {!isCollapsed && item.badge && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 9999,
                        background: item.badgeType === 'danger' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0, 212, 255, 0.15)',
                        color: item.badgeType === 'danger' ? '#f87171' : 'var(--primary)',
                        border: '1px solid',
                        borderColor: item.badgeType === 'danger' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(0, 212, 255, 0.3)',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer User Info & Logout */}
      {user && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', background: 'rgba(6, 9, 19, 0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'rgba(0, 212, 255, 0.15)',
                  border: '1px solid rgba(0, 212, 255, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <User size={14} color={user.isEmergency ? '#f59e0b' : 'var(--primary)'} />
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  {user.name || user.login}
                </div>
                <div style={{ fontSize: 10, color: user.isEmergency ? '#fbbf24' : 'var(--cyan)', fontWeight: 600 }}>
                  {user.isEmergency ? '🚨 Admin (Break-Glass)' : `${user.role} (Grafana SSO)`}
                </div>
              </div>
            </div>
            <button
              onClick={logout}
              className="btn-icon"
              style={{ width: 28, height: 28, flexShrink: 0 }}
              title="ออกจากระบบ"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
