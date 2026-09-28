import React, { useState, useCallback } from 'react';
import {
  AlertTriangle, ShieldAlert, CheckCircle2, RefreshCw,
  Bell, BellOff, History, Settings2, ChevronDown, ChevronUp,
  X, Check, Clock, Cpu, MemoryStick, Wifi, RotateCcw
} from 'lucide-react';
import { useAlerts } from '../../context/AlertContext';
import { useAuth } from '../../context/AuthContext';

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
  const isCritical = entry.severity === 'critical';
  const start = entry.startTime ? new Date(entry.startTime).toLocaleString('th-TH') : '-';
  const end = entry.endTime ? new Date(entry.endTime).toLocaleString('th-TH') : '-';
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
        opacity: 0.8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
        <CheckCircle2 size={20} color="var(--green)" style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{entry.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {entry.deviceName ? `${entry.deviceName} · ` : ''}{entry.instance}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <SeverityBadge severity={entry.severity} />
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

// ─── Custom Rules Panel ──────────────────────────────────────────────────────
function RulesPanel({ rules, onUpdate }) {
  const [local, setLocal] = useState({ ...rules });

  const handleSave = () => onUpdate(local);
  const set = (key, val) => setLocal(prev => ({ ...prev, [key]: val }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>
        ⚙ กำหนด Threshold การแจ้งเตือน
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {/* CPU */}
        <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--cyan)' }}>
              <Cpu size={14} /> CPU Utilization
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={local.cpuEnabled} onChange={e => set('cpuEnabled', e.target.checked)} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>เปิด</span>
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range" min={50} max={100} step={5}
              value={local.cpuThreshold}
              disabled={!local.cpuEnabled}
              onChange={e => set('cpuThreshold', Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', minWidth: 40, textAlign: 'right' }}>
              {local.cpuThreshold}%
            </span>
          </div>
        </div>

        {/* Memory */}
        <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--purple)' }}>
              <MemoryStick size={14} /> Memory Usage
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={local.memoryEnabled} onChange={e => set('memoryEnabled', e.target.checked)} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>เปิด</span>
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range" min={50} max={100} step={5}
              value={local.memoryThreshold}
              disabled={!local.memoryEnabled}
              onChange={e => set('memoryThreshold', Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', minWidth: 40, textAlign: 'right' }}>
              {local.memoryThreshold}%
            </span>
          </div>
        </div>

        {/* Latency */}
        <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>
              <Wifi size={14} /> Latency
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={local.latencyEnabled} onChange={e => set('latencyEnabled', e.target.checked)} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>เปิด</span>
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range" min={10} max={1000} step={10}
              value={local.latencyThreshold}
              disabled={!local.latencyEnabled}
              onChange={e => set('latencyThreshold', Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', minWidth: 50, textAlign: 'right' }}>
              {local.latencyThreshold}ms
            </span>
          </div>
        </div>

        {/* Offline */}
        <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
              <AlertTriangle size={14} /> Offline Detection
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={local.offlineEnabled} onChange={e => set('offlineEnabled', e.target.checked)} />
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
              disabled={!local.offlineEnabled}
              onChange={e => set('offlineTimeout', Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', minWidth: 40, textAlign: 'right' }}>
              {local.offlineTimeout ?? 10} วิ
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleSave} className="btn btn-primary" style={{ fontSize: 12, padding: '7px 18px' }}>
          💾 บันทึก Rules
        </button>
      </div>
    </div>
  );
}

// ─── Main AlertsView ─────────────────────────────────────────────────────────
export function AlertsView() {
  const { canEdit } = useAuth();
  const {
    activeAlerts, acknowledgedAlerts, resolvedHistory,
    alerts, criticalCount,
    filterSeverity, setFilterSeverity,
    pollAlerts,
    acknowledgeAlert, unacknowledgeAlert,
    alertRules, updateAlertRules,
    notificationsEnabled, toggleNotifications,
  } = useAlerts();

  const [tab, setTab] = useState('active'); // 'active' | 'acknowledged' | 'history'
  const [showRules, setShowRules] = useState(false);

  const filteredActive = filterSeverity === 'all'
    ? activeAlerts
    : activeAlerts.filter(a => a.severity === filterSeverity);

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
              แจ้งเตือนความผิดปกติ · Custom Rules · History
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

          <button onClick={pollAlerts} className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 10px' }}>
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Rules Panel (collapsible) */}
      {showRules && (
        <div className="panel" style={{ padding: '18px 20px' }}>
          <RulesPanel rules={alertRules} onUpdate={rules => { updateAlertRules(rules); setShowRules(false); }} />
        </div>
      )}

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
                {s === 'all' ? `ทั้งหมด (${activeAlerts.length})` : s === 'critical' ? `Critical (${activeAlerts.filter(a => a.severity === 'critical').length})` : `Warning (${activeAlerts.filter(a => a.severity === 'warning').length})`}
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
          acknowledgedAlerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 24px', background: 'rgba(15,23,42,0.6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>ยังไม่มีรายการที่รับทราบแล้ว</div>
            </div>
          ) : (
            acknowledgedAlerts.map(a => (
              <AlertCard key={a.id} alert={a} onAcknowledge={acknowledgeAlert} onUnacknowledge={unacknowledgeAlert} isAcknowledged={true} canEdit={canEdit} />
            ))
          )
        )}

        {/* History Tab */}
        {tab === 'history' && (
          resolvedHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 24px', background: 'rgba(15,23,42,0.6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
              <History size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px', display: 'block' }} />
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>ยังไม่มีประวัติการแจ้งเตือน</div>
            </div>
          ) : (
            resolvedHistory.map((entry, i) => (
              <HistoryCard key={`${entry.id}-${i}`} entry={entry} />
            ))
          )
        )}
      </div>
    </div>
  );
}
