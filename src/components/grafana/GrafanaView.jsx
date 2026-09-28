import React, { useState, useRef } from 'react';
import {
  BarChart3,
  ExternalLink,
  RefreshCw,
  Clock,
  Settings,
  Layers,
  Activity,
  Server,
  Zap,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Copy,
  Terminal,
  ShieldCheck
} from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../common/Modal';

export function GrafanaView() {
  const { settings, updateSettings } = useSettings();
  const { showToast } = useToast();

  const grafanaBaseUrl = settings.grafanaUrl || `http://${window.location.hostname}:3000`;

  // Preset Dashboard Views
  const DASHBOARD_PRESETS = [
    {
      id: 'home',
      label: 'หน้ารวม Dashboards',
      sublabel: 'รายการแดชบอร์ดทั้งหมดใน Grafana',
      icon: Layers,
      path: '/dashboards',
      description: 'แสดงรายการแดชบอร์ดทั้งหมดที่มีอยู่ในเซิร์ฟเวอร์ Grafana ของคุณ',
    },
    {
      id: 'overview',
      label: 'Network Overview',
      sublabel: 'ภาพรวมทราฟฟิก In/Out ทั้งระบบ',
      icon: Activity,
      path: '/d/network-overview/network-overview?orgId=1',
      description: 'สรุปแบนด์วิดท์รวม, ทราฟฟิกระดับ Core Switch และท็อปพอร์ตที่มีการใช้งานสูงสุด',
    },
    {
      id: 'interfaces',
      label: 'Interface Deep-Dive',
      sublabel: 'วิเคราะห์ทราฟฟิกแยกรายพอร์ต',
      icon: Server,
      path: '/d/snmp-interfaces/snmp-interfaces-deep-dive?orgId=1',
      description: 'กราฟ Inbound/Outbound Mbps รายพอร์ต (Cisco / Edge Switch), Packet Errors และ Discards',
    },
  ];

  const [activePreset, setActivePreset] = useState(DASHBOARD_PRESETS[0]);
  const [timeRange, setTimeRange] = useState('now-24h');
  const [refreshInterval, setRefreshInterval] = useState('10s');
  const [isKiosk, setIsKiosk] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [customUrl, setCustomUrl] = useState(grafanaBaseUrl);

  const iframeRef = useRef(null);

  // Time ranges options
  const TIME_OPTIONS = [
    { label: '15 นาที', value: 'now-15m' },
    { label: '1 ชม.', value: 'now-1h' },
    { label: '6 ชม.', value: 'now-6h' },
    { label: '24 ชม.', value: 'now-24h' },
    { label: '7 วัน', value: 'now-7d' },
    { label: '30 วัน', value: 'now-30d' },
  ];

  // Refresh interval options
  const REFRESH_OPTIONS = [
    { label: 'Off', value: '' },
    { label: '5s', value: '5s' },
    { label: '10s', value: '10s' },
    { label: '30s', value: '30s' },
    { label: '1m', value: '1m' },
  ];

  // Build target Grafana URL
  const buildGrafanaUrl = () => {
    let cleanBase = grafanaBaseUrl.replace(/\/+$/, '');
    let url = `${cleanBase}${activePreset.path}`;

    // Add query params
    const delimiter = url.includes('?') ? '&' : '?';
    const params = new URLSearchParams();

    params.set('theme', 'dark');
    params.set('from', timeRange);
    params.set('to', 'now');
    if (refreshInterval) {
      params.set('refresh', refreshInterval);
    }
    if (isKiosk) {
      params.set('kiosk', 'tv');
    }

    return `${url}${delimiter}${params.toString()}`;
  };

  const currentUrl = buildGrafanaUrl();

  const handleReload = () => {
    setIsLoading(true);
    setIframeKey((prev) => prev + 1);
  };

  const handleOpenExternal = () => {
    window.open(currentUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSaveConfig = (e) => {
    e.preventDefault();
    const clean = customUrl.trim().replace(/\/+$/, '');
    if (!clean) return;
    updateSettings({ grafanaUrl: clean });
    setIsConfigOpen(false);
    showToast('success', 'บันทึก URL สำเร็จ', `อัพเดต Grafana URL เป็น ${clean}`);
    handleReload();
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showToast('success', 'คัดลอกคำสั่งแล้ว', 'นำคำสั่งนี้ไปวางใน Terminal ของ Proxmox LXC ได้เลย');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: 'calc(100vh - var(--navbar-height) - 40px)' }}>
      {/* Top Header & Control Bar */}
      <div
        className="panel"
        style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          flexShrink: 0,
        }}
      >
        {/* Left: Branding & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(249, 115, 22, 0.35)',
            }}
          >
            <BarChart3 size={20} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>
                Grafana Analytics Center
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: 'rgba(249, 115, 22, 0.15)',
                  color: '#fb923c',
                  border: '1px solid rgba(249, 115, 22, 0.3)',
                  letterSpacing: '0.5px',
                }}
              >
                PROMETHEUS TELEMETRY
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>เซิร์ฟเวอร์:</span>
              <code style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>{grafanaBaseUrl}</code>
            </div>
          </div>
        </div>

        {/* Middle: Dashboard Presets Switcher */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(15, 23, 42, 0.7)',
            padding: 4,
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            gap: 4,
          }}
        >
          {DASHBOARD_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const isSelected = activePreset.id === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => {
                  setActivePreset(preset);
                  setIsLoading(true);
                }}
                className="btn"
                style={{
                  fontSize: 12,
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: isSelected ? 'var(--primary)' : 'transparent',
                  color: isSelected ? '#030712' : 'var(--text-secondary)',
                  fontWeight: isSelected ? 700 : 500,
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s',
                }}
              >
                <Icon size={14} color={isSelected ? '#030712' : 'currentColor'} />
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Controls & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Time Range Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(15, 23, 42, 0.6)', padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <Clock size={13} color="var(--text-muted)" />
            <select
              value={timeRange}
              onChange={(e) => {
                setTimeRange(e.target.value);
                setIsLoading(true);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: 11,
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {TIME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} style={{ background: '#0f172a' }}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh Interval Select */}
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(e.target.value)}
            title="Auto Refresh Rate"
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              fontSize: 11,
              borderRadius: 'var(--radius-sm)',
              padding: '5px 8px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {REFRESH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} style={{ background: '#0f172a' }}>
                {opt.label ? `🔄 ${opt.label}` : 'No Auto-Refresh'}
              </option>
            ))}
          </select>

          {/* Reload Button */}
          <button
            onClick={handleReload}
            className="btn btn-secondary"
            style={{ padding: '6px 10px', fontSize: 11 }}
            title="รีเฟรชแดชบอร์ด"
          >
            <RefreshCw size={13} />
          </button>

          {/* Open in Grafana Fullscreen */}
          <button
            onClick={handleOpenExternal}
            className="btn btn-primary"
            style={{
              padding: '6px 12px',
              fontSize: 11,
              background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
              color: '#ffffff',
              border: 'none',
              gap: 5,
            }}
            title="เปิดในแท็บใหม่ของ Grafana"
          >
            <ExternalLink size={13} />
            <span>เปิดใน Grafana</span>
          </button>

          {/* Settings & Setup Guide */}
          <button
            onClick={() => setIsConfigOpen(true)}
            className="btn btn-secondary"
            style={{ padding: '6px 8px' }}
            title="ตั้งค่า Grafana URL"
          >
            <Settings size={14} />
          </button>

          <button
            onClick={() => setIsHelpOpen(true)}
            className="btn btn-secondary"
            style={{ padding: '6px 8px' }}
            title="คู่มือการตั้งค่า Grafana และวิธีเปิดการแสดงผล Iframe"
          >
            <HelpCircle size={14} color="var(--primary)" />
          </button>
        </div>
      </div>

      {/* Main Iframe Viewer Area */}
      <div
        className="panel"
        style={{
          flex: 1,
          padding: 0,
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
      >
        {/* Loading Spinner Overlay */}
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(8, 12, 24, 0.85)',
              backdropFilter: 'blur(4px)',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            <RefreshCw size={28} className="animate-spin" color="var(--primary)" />
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
              กำลังโหลดข้อมูล Telemetry จาก Grafana...
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Preset: {activePreset.label} · แหล่งข้อมูล: Prometheus ({settings.prometheusUrl})
            </div>
          </div>
        )}

        {/* Embedded Iframe */}
        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={currentUrl}
          title="Grafana Dashboard"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            flex: 1,
            background: '#0b0f19',
          }}
          onLoad={() => setIsLoading(false)}
        />
      </div>

      {/* Configuration Modal */}
      <Modal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        title="⚙️ ตั้งค่า Grafana Server Connection"
        maxWidth={500}
      >
        <form onSubmit={handleSaveConfig} className="modal-body" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="input-group">
              <label className="input-label">Grafana Base URL</label>
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="http://192.168.109.147:3000"
                className="form-input"
                style={{ fontFamily: 'var(--font-mono)' }}
                required
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                ระบุ URL ของ Grafana Server ที่รันอยู่บน Proxmox LXC หรือเครื่องเซิร์ฟเวอร์
              </div>
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: 4 }}>
                💡 ข้อแนะนำการเชื่อมต่อ
              </div>
              หาก Grafana รันอยู่บนเครื่องเดียวกันกับ Prometheus (CT100) สามารถใช้ค่าเริ่มต้น <code>http://192.168.109.147:3000</code> ได้ทันที
            </div>
          </div>

          <div className="modal-footer" style={{ marginTop: 20, padding: 0 }}>
            <button type="button" onClick={() => setIsConfigOpen(false)} className="btn btn-secondary">
              ยกเลิก
            </button>
            <button type="submit" className="btn btn-primary">
              บันทึกการตั้งค่า
            </button>
          </div>
        </form>
      </Modal>

      {/* Help & Setup Guide Modal */}
      <Modal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        title="📘 คู่มือการตั้งค่า Grafana สำหรับโปรเจกต์ ปวส."
        maxWidth={720}
      >
        <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18, fontSize: 13 }}>
          {/* Section 1: Concept */}
          <div style={{ padding: '14px', borderRadius: 'var(--radius)', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <ShieldCheck size={16} />
              <span>บทบาทของ Grafana ในรายงานโปรเจกต์ ปวส.</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              ในโปรเจกต์นี้ <strong>Prometheus</strong> ทำหน้าที่เป็น Time-Series Database คอยดึงข้อมูลจาก SNMP Exporter ส่วน <strong>NetMonitor (React)</strong> ทำหน้าที่เป็นศูนย์ควบคุมและวาดผัง Topology อัตโนมัติ และ <strong>Grafana</strong> ทำหน้าที่เป็นระบบวิเคราะห์ข้อมูลเชิงลึกย้อนหลัง (Deep Historical Telemetry) เพื่อส่งมอบแดชบอร์ดที่สวยงามให้แก่ผู้บริหาร
            </div>
          </div>

          {/* Section 2: Installation on Ubuntu LXC */}
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Terminal size={15} color="var(--amber)" />
              <span>ขั้นตอนที่ 1: ติดตั้ง Grafana บน Ubuntu LXC (192.168.109.147)</span>
            </div>
            <div style={{ background: '#090d16', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 11, position: 'relative' }}>
              <pre style={{ margin: 0, color: '#38bdf8' }}>
{`sudo apt-get install -y apt-transport-https software-properties-common wget
sudo mkdir -p /etc/apt/keyrings/
wget -q -O - https://apt.grafana.com/gpg.key | gpg --dearmor | sudo tee /etc/apt/keyrings/grafana.gpg > /dev/null
echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" | sudo tee -a /etc/apt/sources.list.d/grafana.list
sudo apt-get update
sudo apt-get install -y grafana
sudo systemctl enable --now grafana-server`}
              </pre>
              <button
                onClick={() => copyToClipboard(`sudo apt-get install -y apt-transport-https software-properties-common wget\nsudo mkdir -p /etc/apt/keyrings/\nwget -q -O - https://apt.grafana.com/gpg.key | gpg --dearmor | sudo tee /etc/apt/keyrings/grafana.gpg > /dev/null\necho "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" | sudo tee -a /etc/apt/sources.list.d/grafana.list\nsudo apt-get update\nsudo apt-get install -y grafana\nsudo systemctl enable --now grafana-server`)}
                className="btn btn-secondary"
                style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, padding: '3px 8px' }}
              >
                <Copy size={11} /> คัดลอก
              </button>
            </div>
          </div>

          {/* Section 2.5: Enable Iframe Embedding in grafana.ini */}
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={15} color="var(--green)" />
              <span>ขั้นตอนที่ 2: เปิดให้ฝังหน้าเว็บใน Iframe ได้ (แก้ไฟล์ /etc/grafana/grafana.ini)</span>
            </div>
            <div style={{ background: '#090d16', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 11, position: 'relative' }}>
              <pre style={{ margin: 0, color: '#a7f3d0' }}>
{`# 1. เปิดไฟล์ตั้งค่า
sudo nano /etc/grafana/grafana.ini

# 2. แก้ไขในส่วน [security] และ [auth.anonymous] ดังนี้:
[security]
allow_embedding = true

[auth.anonymous]
enabled = true
org_role = Viewer

# 3. รีสตาร์ท Grafana เพื่อใช้งาน
sudo systemctl restart grafana-server`}
              </pre>
              <button
                onClick={() => copyToClipboard(`sudo sed -i 's/;allow_embedding = false/allow_embedding = true/g' /etc/grafana/grafana.ini\nsudo sed -i 's/;enabled = false/enabled = true/g' /etc/grafana/grafana.ini\nsudo systemctl restart grafana-server`)}
                className="btn btn-secondary"
                style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, padding: '3px 8px' }}
              >
                <Copy size={11} /> คัดลอก Quick-Patch
              </button>
            </div>
          </div>

          {/* Section 3: Add Prometheus Data Source */}
          <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: 'var(--text-secondary)' }}>
            <div style={{ fontWeight: 700, color: 'var(--amber)', marginBottom: 4 }}>
              ขั้นตอนที่ 3: แอด Prometheus Data Source ใน Grafana
            </div>
            เปิดเบราว์เซอร์ไปที่ <code>http://192.168.109.147:3000</code> &gt; ไปที่ <strong>Connections &gt; Data Sources &gt; Add Prometheus</strong> &gt; ใส่ URL เป็น <code>http://localhost:9090</code> แล้วกด <strong>Save &amp; Test</strong>
          </div>
        </div>

        <div className="modal-footer" style={{ padding: '14px 24px' }}>
          <button type="button" onClick={() => setIsHelpOpen(false)} className="btn btn-primary">
            เข้าใจแล้ว ปิดหน้าต่าง
          </button>
        </div>
      </Modal>
    </div>
  );
}
