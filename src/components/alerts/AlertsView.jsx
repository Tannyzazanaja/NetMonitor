import React, { useState, useMemo } from 'react';
import {
  AlertTriangle, ShieldAlert, CheckCircle2, RefreshCw,
  Bell, BellOff, History, Settings2, ChevronDown, ChevronUp,
  X, Check, Clock, Cpu, MemoryStick, Wifi, RotateCcw,
  Zap, Thermometer, Fan, Search, Trash2, CheckCheck
} from 'lucide-react';
import { useAlerts } from '../../context/AlertContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

function formatDuration(sec) {
  if (sec == null || isNaN(sec) || sec <= 0) return null;
  const s = Math.round(sec);
  if (s < 60) return `${s} วินาที`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return remS > 0 ? `${m} นาที ${remS} วิ` : `${m} นาที`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h} ชม. ${remM} นาที` : `${h} ชม.`;
}

// ─── Severity Badge ─────────────────────────────────────────────────────────
function SeverityBadge({ severity }) {
  const color = severity === 'critical' ? '#f87171' : '#fbbf24';
  const bg = severity === 'critical' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)';
  const border = severity === 'critical' ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '3px 8px',
      borderRadius: 9999, background: bg, color, border: `1px solid ${border}`,
    }}>
      {severity.toUpperCase()}
    </span>
  );
}

// ─── Alert Card ──────────────────────────────────────────────────────────────
function AlertCard({ alert, onAcknowledge, onUnacknowledge, isAcknowledged, canEdit }) {
  const isCritical = alert.severity === 'critical';
  return (
    <div
      className="panel"
      style={{
        padding: '14px 18px',
        borderLeft: `4px solid ${isCritical ? 'var(--red)' : 'var(--amber)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        opacity: isAcknowledged ? 0.65 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 'var(--radius-sm)', flexShrink: 0,
          background: isCritical ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <AlertTriangle size={18} color={isCritical ? 'var(--red)' : 'var(--amber)'} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{alert.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{alert.description}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
            {alert.deviceName ? `${alert.deviceName} · ` : ''}{alert.instance}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <SeverityBadge severity={alert.severity} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{alert.time}</div>
        </div>

        {canEdit && (
          isAcknowledged ? (
            <button
              onClick={() => onUnacknowledge(alert.id)}
              title="ยกเลิกการรับทราบ"
              style={{
                background: 'rgba(15,23,42,0.7)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)',
                padding: '5px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <RotateCcw size={11} /> ยกเลิก
            </button>
          ) : (
            <button
              onClick={() => onAcknowledge(alert.id)}
              title="รับทราบการแจ้งเตือน"
              style={{
                background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: 'var(--radius-sm)', color: 'var(--green)',
                padding: '5px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.1)'}
            >
              <Check size={11} /> รับทราบ
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ─── History Card ────────────────────────────────────────────────────────────
function HistoryCard({ entry }) {
  const start = entry.startTime ? new Date(entry.startTime).toLocaleString('th-TH') : '-';
  const end = entry.endTime ? new Date(entry.endTime).toLocaleString('th-TH') : '-';
  const durationLabel = formatDuration(entry.durationSeconds);
  return (
    <div
      className="panel"
      style={{
        padding: '12px 18px',
        borderLeft: `4px solid var(--border)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        opacity: 0.85,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
        <CheckCircle2 size={20} color="var(--green)" style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{entry.name}</div>
          {entry.description && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{entry.description}</div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
            {entry.deviceName ? `${entry.deviceName} · ` : ''}{entry.instance}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          {durationLabel && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 9999,
              background: 'rgba(0,212,255,0.1)', color: 'var(--primary)', border: '1px solid rgba(0,212,255,0.3)'
            }}>
              ⏱ {durationLabel}
            </span>
          )}
          <SeverityBadge severity={entry.severity} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
          <span title="เริ่มต้น">▶ {start}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
          <span title="สิ้นสุด">■ {end}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main AlertsView ─────────────────────────────────────────────────────────
export function AlertsView({ onOpenAlertSettings }) {
  const { canEdit, isAdmin } = useAuth();
  const { showToast } = useToast();
  const {
    activeAlerts, acknowledgedAlerts, resolvedHistory,
    alerts, criticalCount, warningCount,
    filterSeverity, setFilterSeverity,
    pollAlerts,
    acknowledgeAlert, unacknowledgeAlert, acknowledgeAllAlerts, clearHistory,
    notificationsEnabled, toggleNotifications,
  } = useAlerts();

  const [tab, setTab] = useState('active'); // 'active' | 'acknowledged' | 'history'
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');

  const matchesSearchAndType = (item) => {
    if (filterType !== 'all' && item.type !== filterType) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      (item.name || item.title || '').toLowerCase().includes(q) ||
      (item.description || item.message || '').toLowerCase().includes(q) ||
      (item.deviceName || '').toLowerCase().includes(q) ||
      (item.instance || item.deviceIp || '').toLowerCase().includes(q)
    );
  };

  const filteredActive = useMemo(() => {
    return activeAlerts.filter(a => {
      if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false;
      return matchesSearchAndType(a);
    });
  }, [activeAlerts, filterSeverity, filterType, searchQuery]);

  const filteredAcknowledged = useMemo(() => {
    return acknowledgedAlerts.filter(matchesSearchAndType);
  }, [acknowledgedAlerts, filterType, searchQuery]);

  const filteredHistory = useMemo(() => {
    return resolvedHistory.filter(matchesSearchAndType);
  }, [resolvedHistory, filterType, searchQuery]);

  const handleAckAll = async () => {
    if (!canEdit || activeAlerts.length === 0) return;
    await acknowledgeAllAlerts();
    showToast('success', 'รับทราบทั้งหมดแล้ว', `รับทราบรายการแจ้งเตือนทั้งหมด ${activeAlerts.length} รายการเรียบร้อย`);
  };

  const handleClearHistory = async () => {
    if (!isAdmin || resolvedHistory.length === 0) return;
    if (window.confirm('คุณต้องการล้างประวัติการแจ้งเตือนที่แก้ไขแล้วทั้งหมดหรือไม่?')) {
      await clearHistory();
      showToast('info', 'ล้างประวัติเรียบร้อย', 'ล้างรายการประวัติการแจ้งเตือนทั้งหมดแล้ว');
    }
  };

  const TabBtn = ({ id, label, count }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        border: '1px solid',
        borderColor: tab === id ? 'var(--primary)' : 'var(--border)',
        borderRadius: 'var(--radius)',
        background: tab === id ? 'rgba(0,212,255,0.1)' : 'transparent',
        color: tab === id ? 'var(--primary)' : 'var(--text-secondary)',
        transition: 'all 0.15s',
      }}
    >
      {label} {count != null && <span style={{ fontSize: 11, opacity: 0.8 }}>({count})</span>}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div className="panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 'var(--radius)',
            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle size={22} color="var(--red)" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
              Alert Management
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              แจ้งเตือนความผิดปกติ · PoE &amp; Hardware Rules · History
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Bulk Actions */}
          {canEdit && tab === 'active' && activeAlerts.length > 0 && (
            <button
              onClick={handleAckAll}
              style={{
                padding: '6px 12px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: 'var(--green)',
              }}
              title="รับทราบรายการแจ้งเตือนที่ Active ทั้งหมด"
            >
              <CheckCheck size={13} />
              <span>รับทราบทั้งหมด ({activeAlerts.length})</span>
            </button>
          )}

          {isAdmin && tab === 'history' && resolvedHistory.length > 0 && (
            <button
              onClick={handleClearHistory}
              style={{
                padding: '6px 12px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171',
              }}
              title="ล้างประวัติการแจ้งเตือนทั้งหมด"
            >
              <Trash2 size={13} />
              <span>ล้างประวัติ</span>
            </button>
          )}

          {/* Notification Toggle */}
          <button
            onClick={() => toggleNotifications(!notificationsEnabled)}
            title={notificationsEnabled ? 'ปิด Browser Notification' : 'เปิด Browser Notification'}
            style={{
              padding: '6px 10px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 5,
              background: notificationsEnabled ? 'rgba(34,197,94,0.1)' : 'rgba(15,23,42,0.7)',
              border: `1px solid ${notificationsEnabled ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
              color: notificationsEnabled ? 'var(--green)' : 'var(--text-muted)',
            }}
          >
            {notificationsEnabled ? <Bell size={13} /> : <BellOff size={13} />}
            <span>{notificationsEnabled ? 'Notify: ON' : 'Notify: OFF'}</span>
          </button>

          {/* Open Alert Settings in Settings Page */}
          {onOpenAlertSettings && (
            <button
              onClick={onOpenAlertSettings}
              style={{
                padding: '6px 12px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(0,212,255,0.1)',
                border: '1px solid rgba(0,212,255,0.35)',
                color: 'var(--primary)',
              }}
              title="ไปที่หน้าตั้งค่าเกณฑ์การแจ้งเตือนอย่างละเอียด (Settings > Alert Settings)"
            >
              <Settings2 size={13} />
              <span>ตั้งค่า Alert (Settings)</span>
            </button>
          )}

          <button onClick={pollAlerts} className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 10px' }} title="รีเฟรชรายการแจ้งเตือน">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="panel" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่ออุปกรณ์, IP, หรือรายละเอียดการแจ้งเตือน..."
            className="form-input"
            style={{ paddingLeft: 32, paddingRight: searchQuery ? 28 : 12, fontSize: 12, height: 34 }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'ทุกหมวดหมู่' },
            { id: 'offline', label: 'Offline' },
            { id: 'cpu', label: 'CPU' },
            { id: 'memory', label: 'Memory' },
            { id: 'latency', label: 'Latency' },
            { id: 'poe', label: 'PoE Power' },
            { id: 'hardware', label: 'Hardware/Temp' },
            { id: 'reboot', label: 'Reboot' },
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setFilterType(cat.id)}
              style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 9999,
                border: '1px solid',
                borderColor: filterType === cat.id ? 'var(--primary)' : 'var(--border)',
                background: filterType === cat.id ? 'rgba(0,212,255,0.12)' : 'rgba(15,23,42,0.5)',
                color: filterType === cat.id ? 'var(--primary)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <TabBtn id="active" label="🔴 Active" count={activeAlerts.length} />
        <TabBtn id="acknowledged" label="✅ รับทราบแล้ว" count={acknowledgedAlerts.length} />
        <TabBtn id="history" label="📋 History" count={resolvedHistory.length} />

        {tab === 'active' && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            {['all', 'critical', 'warning'].map(s => (
              <button
                key={s}
                onClick={() => setFilterSeverity(s)}
                style={{
                  padding: '5px 12px', fontSize: 11, cursor: 'pointer', borderRadius: 'var(--radius)',
                  border: '1px solid',
                  borderColor: filterSeverity === s
                    ? (s === 'critical' ? 'rgba(239,68,68,0.5)' : s === 'warning' ? 'rgba(245,158,11,0.5)' : 'var(--primary)')
                    : 'var(--border)',
                  background: filterSeverity === s ? (s === 'critical' ? 'rgba(239,68,68,0.1)' : s === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(0,212,255,0.08)') : 'transparent',
                  color: filterSeverity === s ? (s === 'critical' ? 'var(--red)' : s === 'warning' ? 'var(--amber)' : 'var(--primary)') : 'var(--text-muted)',
                }}
              >
                {s === 'all' ? `ทั้งหมด (${activeAlerts.length})` : s === 'critical' ? `Critical (${criticalCount})` : `Warning (${warningCount})`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Active Tab */}
        {tab === 'active' && (
          filteredActive.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px', background: 'rgba(15,23,42,0.6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
              <CheckCircle2 size={48} color="var(--green)" style={{ margin: '0 auto 12px', display: 'block' }} />
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 4 }}>ไม่มีรายการแจ้งเตือนที่ผิดปกติ</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>อุปกรณ์ทั้งหมดในโครงข่ายทำงานได้ตามปกติ</div>
            </div>
          ) : (
            filteredActive.map(a => (
              <AlertCard key={a.id} alert={a} onAcknowledge={acknowledgeAlert} onUnacknowledge={unacknowledgeAlert} isAcknowledged={false} canEdit={canEdit} />
            ))
          )
        )}

        {/* Acknowledged Tab */}
        {tab === 'acknowledged' && (
          filteredAcknowledged.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 24px', background: 'rgba(15,23,42,0.6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>ยังไม่มีรายการที่รับทราบแล้ว</div>
            </div>
          ) : (
            filteredAcknowledged.map(a => (
              <AlertCard key={a.id} alert={a} onAcknowledge={acknowledgeAlert} onUnacknowledge={unacknowledgeAlert} isAcknowledged={true} canEdit={canEdit} />
            ))
          )
        )}

        {/* History Tab */}
        {tab === 'history' && (
          filteredHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 24px', background: 'rgba(15,23,42,0.6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
              <History size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px', display: 'block' }} />
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>ยังไม่มีประวัติการแจ้งเตือน</div>
            </div>
          ) : (
            filteredHistory.map((entry, i) => (
              <HistoryCard key={`${entry.id}-${i}`} entry={entry} />
            ))
          )
        )}
      </div>
    </div>
  );
}
