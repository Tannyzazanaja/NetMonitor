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

// ─── Custom Rules Panel (Admin Only) ─────────────────────────────────────────
function RulesPanel({ rules, onUpdate, isAdmin }) {
  const [local, setLocal] = useState({ ...rules });

  const handleSave = () => {
    if (!isAdmin) return;
    onUpdate(local);
  };
  const set = (key, val) => {
    if (!isAdmin) return;
    setLocal(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
          ⚙ กำหนด Threshold การแจ้งเตือน (Custom Alert Rules)
        </div>
        <span style={{ fontSize: 11, color: isAdmin ? 'var(--green)' : 'var(--amber)', fontWeight: 600 }}>
          {isAdmin ? '🛡️ สิทธิ์ผู้ดูแลระบบ (Admin Editable)' : '🔒 เฉพาะผู้ดูแลระบบ (Admin Only - Read Only)'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, opacity: isAdmin ? 1 : 0.65 }}>
        {/* CPU */}
        <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--cyan)' }}>
              <Cpu size={14} /> CPU Utilization
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isAdmin ? 'pointer' : 'not-allowed' }}>
              <input type="checkbox" disabled={!isAdmin} checked={local.cpuEnabled !== false} onChange={e => set('cpuEnabled', e.target.checked)} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>เปิด</span>
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range" min={50} max={100} step={5}
              value={local.cpuThreshold ?? 80}
              disabled={!isAdmin || local.cpuEnabled === false}
              onChange={e => set('cpuThreshold', Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', minWidth: 40, textAlign: 'right' }}>
              {local.cpuThreshold ?? 80}%
            </span>
          </div>
        </div>

        {/* Memory */}
        <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--purple)' }}>
              <MemoryStick size={14} /> Memory Usage
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isAdmin ? 'pointer' : 'not-allowed' }}>
              <input type="checkbox" disabled={!isAdmin} checked={local.memoryEnabled !== false} onChange={e => set('memoryEnabled', e.target.checked)} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>เปิด</span>
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range" min={50} max={100} step={5}
              value={local.memoryThreshold ?? 85}
              disabled={!isAdmin || local.memoryEnabled === false}
              onChange={e => set('memoryThreshold', Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', minWidth: 40, textAlign: 'right' }}>
              {local.memoryThreshold ?? 85}%
            </span>
          </div>
        </div>

        {/* Latency */}
        <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>
              <Wifi size={14} /> Latency (ICMP)
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isAdmin ? 'pointer' : 'not-allowed' }}>
              <input type="checkbox" disabled={!isAdmin} checked={local.latencyEnabled !== false} onChange={e => set('latencyEnabled', e.target.checked)} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>เปิด</span>
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range" min={10} max={1000} step={10}
              value={local.latencyThreshold ?? 150}
              disabled={!isAdmin || local.latencyEnabled === false}
              onChange={e => set('latencyThreshold', Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', minWidth: 50, textAlign: 'right' }}>
              {local.latencyThreshold ?? 150}ms
            </span>
          </div>
        </div>

        {/* Offline */}
        <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
              <AlertTriangle size={14} /> Offline Detection
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isAdmin ? 'pointer' : 'not-allowed' }}>
              <input type="checkbox" disabled={!isAdmin} checked={local.offlineEnabled !== false} onChange={e => set('offlineEnabled', e.target.checked)} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>เปิด</span>
            </label>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            ตั้งหน่วงเวลา (Delay) ก่อนแจ้งเตือน
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range" min={0} max={60} step={5}
              value={local.offlineTimeout ?? 10}
              disabled={!isAdmin || local.offlineEnabled === false}
              onChange={e => set('offlineTimeout', Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', minWidth: 40, textAlign: 'right' }}>
              {local.offlineTimeout ?? 10} วิ
            </span>
          </div>
        </div>

        {/* PoE Power Budget */}
        <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
              <Zap size={14} /> PoE Power Budget
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isAdmin ? 'pointer' : 'not-allowed' }}>
              <input type="checkbox" disabled={!isAdmin} checked={local.poeEnabled !== false} onChange={e => set('poeEnabled', e.target.checked)} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>เปิด</span>
            </label>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            แจ้งเตือนเมื่อ Allocated หรือ Actual เกิน
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range" min={50} max={100} step={5}
              value={local.poeThreshold ?? 80}
              disabled={!isAdmin || local.poeEnabled === false}
              onChange={e => set('poeThreshold', Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', minWidth: 40, textAlign: 'right' }}>
              {local.poeThreshold ?? 80}%
            </span>
          </div>
        </div>

        {/* Temperature */}
        <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#fb923c' }}>
              <Thermometer size={14} /> Temperature (°C)
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isAdmin ? 'pointer' : 'not-allowed' }}>
              <input type="checkbox" disabled={!isAdmin} checked={local.tempEnabled !== false} onChange={e => set('tempEnabled', e.target.checked)} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>เปิด</span>
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range" min={40} max={90} step={5}
              value={local.tempThreshold ?? 65}
              disabled={!isAdmin || local.tempEnabled === false}
              onChange={e => set('tempThreshold', Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', minWidth: 45, textAlign: 'right' }}>
              {local.tempThreshold ?? 65}°C
            </span>
          </div>
        </div>

        {/* Hardware PSU / Fan & Reboot */}
        <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>
            <Fan size={14} /> Hardware & Reboot
          </div>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: isAdmin ? 'pointer' : 'not-allowed', fontSize: 11, color: 'var(--text-secondary)' }}>
            <span>PSU & Cooling Fan Fault</span>
            <input type="checkbox" disabled={!isAdmin} checked={local.hardwareEnabled !== false} onChange={e => set('hardwareEnabled', e.target.checked)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: isAdmin ? 'pointer' : 'not-allowed', fontSize: 11, color: 'var(--text-secondary)' }}>
            <span>Device Reboot (&lt; 10 นาที)</span>
            <input type="checkbox" disabled={!isAdmin} checked={local.rebootEnabled !== false} onChange={e => set('rebootEnabled', e.target.checked)} />
          </label>
        </div>
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleSave} className="btn btn-primary" style={{ fontSize: 12, padding: '7px 18px' }}>
            💾 บันทึก Rules
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main AlertsView ─────────────────────────────────────────────────────────
export function AlertsView() {
  const { canEdit, isAdmin } = useAuth();
  const { showToast } = useToast();
  const {
    activeAlerts, acknowledgedAlerts, resolvedHistory,
    alerts, criticalCount, warningCount,
    filterSeverity, setFilterSeverity,
    pollAlerts,
    acknowledgeAlert, unacknowledgeAlert, acknowledgeAllAlerts, clearHistory,
    alertRules, updateAlertRules,
    notificationsEnabled, toggleNotifications,
  } = useAlerts();

  const [tab, setTab] = useState('active'); // 'active' | 'acknowledged' | 'history'
  const [showRules, setShowRules] = useState(false);
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

          {/* Rules Toggle */}
          <button
            onClick={() => setShowRules(v => !v)}
            style={{
              padding: '6px 10px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 5,
              background: showRules ? 'rgba(0,212,255,0.1)' : 'rgba(15,23,42,0.7)',
              border: `1px solid ${showRules ? 'var(--primary)' : 'var(--border)'}`,
              color: showRules ? 'var(--primary)' : 'var(--text-secondary)',
            }}
          >
            <Settings2 size={13} />
            <span>Alert Rules</span>
            {showRules ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          <button onClick={pollAlerts} className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 10px' }} title="รีเฟรชรายการแจ้งเตือน">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Rules Panel (collapsible) */}
      {showRules && (
        <div className="panel" style={{ padding: '18px 20px' }}>
          <RulesPanel isAdmin={isAdmin} rules={alertRules} onUpdate={rules => { updateAlertRules(rules); setShowRules(false); showToast('success', 'บันทึก Alert Rules สำเร็จ', 'อัปเดตเกณฑ์การแจ้งเตือนเรียบร้อยแล้ว'); }} />
        </div>
      )}

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
