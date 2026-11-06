import React, { useState, useEffect } from 'react';
import {
  Settings, Save, RotateCcw, CheckCircle2, AlertCircle, RefreshCw,
  KeyRound, Eye, EyeOff, ShieldCheck, Check, Bell, BellOff,
  AlertTriangle, Cpu, MemoryStick, Wifi, Zap, Thermometer, Fan
} from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useAlerts } from '../../context/AlertContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_SETTINGS } from '../../services/storageService';
import { DEFAULT_ALERT_RULES } from '../../services/alertStorage';
import { AuthService } from '../../services/authService';

export function SettingsView() {
  const { settings, updateSettings, checkConnection, isConnected, isChecking, targetCount } = useSettings();
  const { alertRules, updateAlertRules, notificationsEnabled, toggleNotifications } = useAlerts();
  const { showToast } = useToast();
  const { isAdmin, user } = useAuth();

  const [settingCategory, setSettingCategory] = useState('all'); // 'all' | 'system' | 'alerts'

  const [formData, setFormData] = useState({
    ...settings,
    prometheusUrl: settings.prometheusUrl || settings.proxyUrl || DEFAULT_SETTINGS.prometheusUrl,
  });
  const [alertForm, setAlertForm] = useState({
    ...DEFAULT_ALERT_RULES,
    ...alertRules,
  });
  const [alertSaved, setAlertSaved] = useState(false);

  const [emergencyUser, setEmergencyUser] = useState(settings?.emergencyUsername || 'emergency');
  const [newEmergencyPass, setNewEmergencyPass] = useState('');
  const [confirmEmergencyPass, setConfirmEmergencyPass] = useState('');
  const [showEmergencyPass, setShowEmergencyPass] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passSuccessMessage, setPassSuccessMessage] = useState('');
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (settings) {
      setFormData((prev) => ({
        ...prev,
        ...settings,
        prometheusUrl: settings.prometheusUrl || settings.proxyUrl || DEFAULT_SETTINGS.prometheusUrl,
      }));
      if (settings.emergencyUsername) {
        setEmergencyUser(settings.emergencyUsername);
      }
    }
  }, [settings]);

  useEffect(() => {
    if (alertRules) {
      setAlertForm((prev) => ({
        ...prev,
        ...DEFAULT_ALERT_RULES,
        ...alertRules,
      }));
    }
  }, [alertRules]);

  const handleChange = (field, val) => {
    if (!isAdmin) return;
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const handleAlertRuleChange = (field, val) => {
    if (!isAdmin) return;
    setAlertForm((prev) => ({ ...prev, [field]: val }));
  };

  const handleSaveAlertSettings = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!isAdmin) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถปรับตั้งค่าการแจ้งเตือน (Alert Settings) ได้');
      return;
    }
    try {
      await updateAlertRules(alertForm);
      setAlertSaved(true);
      setTimeout(() => setAlertSaved(false), 3000);
      showToast('success', 'บันทึกการตั้งค่า Alert สำเร็จ', 'เกณฑ์การแจ้งเตือน (Alert Thresholds) ถูกบันทึกและเริ่มประมวลผลบน Backend ทันที');
    } catch (err) {
      showToast('error', 'บันทึกไม่สำเร็จ', err.message || 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่าการแจ้งเตือน');
    }
  };

  const handleResetAlertSettings = async () => {
    if (!isAdmin) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถรีเซ็ตค่าการแจ้งเตือนได้');
      return;
    }
    if (window.confirm('คุณต้องการคืนค่าเกณฑ์การแจ้งเตือน (Alert Settings) ทั้งหมดกลับเป็นค่ามาตรฐานเริ่มต้นหรือไม่?')) {
      const defaults = { ...DEFAULT_ALERT_RULES };
      setAlertForm(defaults);
      await updateAlertRules(defaults);
      showToast('warning', 'คืนค่าเริ่มต้น Alert สำเร็จ', 'รีเซ็ตเกณฑ์การแจ้งเตือนทั้งหมดกลับเป็นค่ามาตรฐานเรียบร้อยแล้ว');
    }
  };

  const handleToggleBrowserNotif = async () => {
    if (!isAdmin) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถปรับตั้งค่าการแจ้งเตือนได้');
      return;
    }
    const nextState = !notificationsEnabled;
    const granted = await toggleNotifications(nextState);
    if (nextState && !granted) {
      showToast('warning', 'ไม่ได้รับอนุญาตจากเบราว์เซอร์', 'กรุณาอนุญาตการแจ้งเตือน (Notification Permission) บนเบราว์เซอร์ของคุณ');
    } else {
      showToast(
        'info',
        granted ? 'เปิดการแจ้งเตือนเบราว์เซอร์และเสียงแล้ว' : 'ปิดการแจ้งเตือนเบราว์เซอร์และเสียงแล้ว',
        granted ? 'ระบบจะแสดงป๊อปอัพและส่งเสียงเตือนเมื่อเกิดเหตุการณ์ใหม่' : 'ระงับการแจ้งเตือนป๊อปอัพและเสียงเตือนชั่วคราว'
      );
    }
  };

  const handleChangeEmergencyPassword = async () => {
    if (!isAdmin) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเปลี่ยนรหัสผ่านฉุกเฉินได้');
      return;
    }
    if (!newEmergencyPass) {
      showToast('error', 'กรุณาระบุรหัสผ่าน', 'กรุณากรอกรหัสผ่านฉุกเฉินใหม่');
      return;
    }
    if (newEmergencyPass.length < 6) {
      showToast('error', 'รหัสผ่านสั้นเกินไป', 'รหัสผ่านฉุกเฉินต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (newEmergencyPass !== confirmEmergencyPass) {
      showToast('error', 'รหัสผ่านไม่ตรงกัน', 'รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setIsChangingPass(true);
    try {
      const res = await AuthService.changeEmergencyPassword(newEmergencyPass, emergencyUser);
      if (res.success) {
        showToast('success', 'เปลี่ยนรหัสผ่านฉุกเฉินสำเร็จ', res.message || 'บันทึกรหัสผ่าน Break-Glass Admin เรียบร้อยแล้ว');
        setPassSuccessMessage('เปลี่ยนรหัสผ่านฉุกเฉินเรียบร้อยแล้ว');
        setNewEmergencyPass('');
        setConfirmEmergencyPass('');
        setTimeout(() => setPassSuccessMessage(''), 4000);
      } else {
        showToast('error', 'เปลี่ยนรหัสผ่านไม่สำเร็จ', res.error || 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน');
      }
    } catch (err) {
      showToast('error', 'เกิดข้อผิดพลาด', err.message || 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้');
    } finally {
      setIsChangingPass(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถแก้ไขการตั้งค่าได้');
      return;
    }

    // Client-side validation
    const interval = parseInt(formData.refreshInterval, 10);
    if (isNaN(interval) || interval < 3 || interval > 120) {
      showToast('error', 'ค่าไม่ถูกต้อง', 'Refresh Interval ต้องอยู่ระหว่าง 3 ถึง 120 วินาที');
      return;
    }

    if (!formData.prometheusUrl || !/^https?:\/\/.+/i.test(formData.prometheusUrl.trim())) {
      showToast('error', 'URL ไม่ถูกต้อง', 'Prometheus Server URL ต้องขึ้นต้นด้วย http:// หรือ https://');
      return;
    }

    // Check emergency password if entered in form
    if (newEmergencyPass) {
      if (newEmergencyPass.length < 6) {
        showToast('error', 'รหัสผ่านสั้นเกินไป', 'รหัสผ่านฉุกเฉินต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
        return;
      }
      if (newEmergencyPass !== confirmEmergencyPass) {
        showToast('error', 'รหัสผ่านไม่ตรงกัน', 'รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน');
        return;
      }
    }

    // Do not send mask '***' back to server
    const payload = { ...formData };
    if (payload.defaultCommunity === '***') delete payload.defaultCommunity;
    if (payload.lineChannelToken === '***') delete payload.lineChannelToken;
    if (payload.lineTargetId === '***') delete payload.lineTargetId;
    delete payload.emergencyPassword;

    if (newEmergencyPass) {
      payload.emergencyPassword = newEmergencyPass;
    }
    payload.emergencyUsername = emergencyUser || 'emergency';

    const res = await updateSettings(payload);
    if (res && res.ok === false) {
      showToast('error', 'บันทึกการตั้งค่าไม่สำเร็จ', res.error || 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
      return;
    }

    // Also persist Alert Rules if Admin saves from main form
    await updateAlertRules(alertForm);

    if (newEmergencyPass) {
      setNewEmergencyPass('');
      setConfirmEmergencyPass('');
      showToast('success', 'บันทึกการตั้งค่าแล้ว', 'การตั้งค่าระบบ เกณฑ์การแจ้งเตือน และรหัสผ่านฉุกเฉินถูกปรับใช้ที่ Runtime เรียบร้อย');
    } else {
      showToast('success', 'บันทึกการตั้งค่าแล้ว', 'การตั้งค่าระบบ รอบการ Polling และเกณฑ์การแจ้งเตือนถูกปรับใช้ที่ Runtime เรียบร้อย');
    }
  };

  const handleReset = () => {
    if (!isAdmin) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถรีเซ็ตการตั้งค่าได้');
      return;
    }
    if (window.confirm('คุณต้องการรีเซ็ตการตั้งค่าทั้งหมดกลับเป็นค่าเริ่มต้นหรือไม่?')) {
      setFormData({ ...DEFAULT_SETTINGS });
      updateSettings({ ...DEFAULT_SETTINGS });
      showToast('warning', 'รีเซ็ตค่าเริ่มต้น', 'คืนค่าการตั้งค่าเริ่มต้นเรียบร้อยแล้ว');
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    const res = await checkConnection();
    setTestResult(res);
    if (res.ok) {
      showToast('success', 'เชื่อมต่อสำเร็จ!', res.message);
    } else {
      showToast('error', 'เชื่อมต่อไม่สำเร็จ', res.message);
    }
  };

  const activeUrl = formData.prometheusUrl || formData.proxyUrl || DEFAULT_SETTINGS.prometheusUrl;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860, margin: '0 auto', width: '100%' }}>
      {/* Header & Category Tabs */}
      <div className="panel" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius)',
                background: 'rgba(0, 212, 255, 0.15)',
                border: '1px solid rgba(0, 212, 255, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Settings size={22} color="var(--primary)" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
                ตั้งค่าระบบและการแจ้งเตือน (System & Alert Settings)
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                จัดการการเชื่อมต่อ Prometheus, SNMP, รหัสผ่านฉุกเฉิน และหมวดหมู่ตั้งค่าเกณฑ์การแจ้งเตือน (Alert Settings)
              </div>
            </div>
          </div>

          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '5px 12px',
              borderRadius: 999,
              background: isAdmin ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)',
              border: `1px solid ${isAdmin ? 'rgba(16, 185, 129, 0.35)' : 'rgba(59, 130, 246, 0.35)'}`,
              color: isAdmin ? 'var(--green)' : '#60a5fa',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ShieldCheck size={14} />
            {isAdmin ? 'สิทธิ์แก้ไข: ผู้ดูแลระบบ (Admin)' : `โหมดอ่านอย่างเดียว (${user?.role || 'Viewer'})`}
          </span>
        </div>

        {/* Category Filter Tabs */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setSettingCategory('all')}
            className={`btn ${settingCategory === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            <Settings size={13} />
            <span>ทั้งหมด (All Settings)</span>
          </button>
          <button
            type="button"
            onClick={() => setSettingCategory('system')}
            className={`btn ${settingCategory === 'system' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            <RefreshCw size={13} />
            <span>หมวดหมู่ตั้งค่าระบบ (System & Connection)</span>
          </button>
          <button
            type="button"
            onClick={() => setSettingCategory('alerts')}
            className={`btn ${settingCategory === 'alerts' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            <Bell size={13} />
            <span>หมวดหมู่ตั้งค่าการแจ้งเตือน (Alert Settings)</span>
          </button>
        </div>
      </div>

      {!isAdmin && (
        <div
          className="panel"
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius)',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            color: '#93c5fd',
            fontSize: 13,
            lineHeight: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <AlertCircle size={18} color="#60a5fa" style={{ flexShrink: 0 }} />
          <div>
            <strong>โหมดอ่านอย่างเดียว (Read-Only Mode):</strong> คุณเข้าสู่ระบบด้วยบทบาท <strong>{user?.role || 'Viewer'}</strong> การปรับตั้งค่าระบบ การตั้งค่าการแจ้งเตือน (Alert Settings) และการจัดการรหัสผ่านฉุกเฉิน สงวนสิทธิ์เฉพาะผู้ดูแลระบบ (<strong>Admin</strong>) เท่านั้น
          </div>
        </div>
      )}

      {/* Connection Test Banner */}
      {(settingCategory === 'all' || settingCategory === 'system') && (
      <div
        className="panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          borderLeft: `4px solid ${isConnected ? 'var(--green)' : 'var(--red)'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isConnected ? (
            <CheckCircle2 size={24} color="var(--green)" />
          ) : (
            <AlertCircle size={24} color="var(--red)" />
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
              Prometheus Server: {isConnected ? 'เชื่อมต่อตรงสำเร็จ (Direct Connected)' : 'ขาดการเชื่อมต่อ (Disconnected)'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Target URL: {activeUrl} · Targets Reporting: {targetCount}
            </div>
            {testResult && (
              <div style={{ fontSize: 11, color: testResult.ok ? 'var(--green)' : 'var(--red)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                {testResult.message}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleTest}
          disabled={isChecking}
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: '7px 14px' }}
        >
          <RefreshCw size={13} className={isChecking ? 'animate-spin' : ''} />
          <span>{isChecking ? 'กำลังทดสอบ...' : '⚡ ทดสอบการเชื่อมต่อ'}</span>
        </button>
      </div>
      )}

      {/* System Settings Form */}
      {(settingCategory === 'all' || settingCategory === 'system') && (
      <form onSubmit={handleSave} className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={18} color="var(--primary)" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>
              หมวดหมู่ตั้งค่าระบบและการเชื่อมต่อ (System & Connection Settings)
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            🛡️ เฉพาะผู้ดูแลระบบ (Admin Only)
          </span>
        </div>
        <div className="input-group">
          <label className="input-label">Prometheus Server Direct URL (Port 9090) *</label>
          <input
            type="text"
            value={formData.prometheusUrl || ''}
            onChange={(e) => handleChange('prometheusUrl', e.target.value)}
            disabled={!isAdmin}
            placeholder="http://localhost:9090"
            className="form-input"
            style={{ fontFamily: 'var(--font-mono)' }}
            required
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            ต่อตรงไปยัง Prometheus API Server (เช่น <code>http://localhost:9090</code>)
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Grafana Auth & User Management URL (Port 3000) *</label>
          <input
            type="text"
            value={formData.grafanaUrl || ''}
            onChange={(e) => handleChange('grafanaUrl', e.target.value)}
            disabled={!isAdmin}
            placeholder="http://localhost:3000"
            className="form-input"
            style={{ fontFamily: 'var(--font-mono)' }}
            required
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            URL ของ Grafana Server ที่ใช้สำหรับการตรวจสอบสิทธิ์เข้าสู่ระบบและจัดการผู้ใช้ (User Management) เช่น <code>http://localhost:3000</code> หรือ <code>http://&lt;GRAFANA_IP&gt;:3000</code> (หาก Grafana เปลี่ยน IP สามารถล็อกอินด้วยบัญชีฉุกเฉินเข้ามาอัปเดตที่นี่ได้)
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">ชื่อองค์กร (Organization Name)</label>
          <input
            type="text"
            value={formData.orgName}
            onChange={(e) => handleChange('orgName', e.target.value)}
            disabled={!isAdmin}
            className="form-input"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Default SNMP Community</span>
              <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>🔒 จัดเก็บปลอดภัยบน Backend</span>
            </label>
            <input
              type="password"
              value={formData.defaultCommunity || ''}
              onChange={(e) => handleChange('defaultCommunity', e.target.value)}
              disabled={!isAdmin}
              placeholder="(คงค่าเดิมไว้บน Backend)"
              className="form-input"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              ระบุเพื่อเปลี่ยนค่า หรือเว้นว่างไว้เพื่อคงค่าเดิมบน Backend Server
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Default SNMP Module</label>
            <select
              value={formData.defaultModule || 'if_mib'}
              onChange={(e) => handleChange('defaultModule', e.target.value)}
              disabled={!isAdmin}
              className="form-select"
            >
              <option value="if_mib">if_mib (Standard Interfaces)</option>
              <option value="cisco_switch">cisco_switch (Cisco Switches & Routers)</option>
              <option value="aruba_switch">aruba_switch (HP / Aruba Switches)</option>
              <option value="host_resources">host_resources (Linux / Windows Servers)</option>
              <option value="synology">synology (Storage / NAS)</option>
              <option value="apcups">apcups (APC Smart-UPS)</option>
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              MIB profile เริ่มต้นสำหรับอุปกรณ์ที่เพิ่มใหม่หรือค้นพบผ่าน Network Scan
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">WAN Interface Name</label>
            <input
              type="text"
              value={formData.wanInterface || ''}
              onChange={(e) => handleChange('wanInterface', e.target.value)}
              disabled={!isAdmin}
              placeholder="เช่น GigabitEthernet0/0/0 หรือ TenGigabitEthernet1/0/1"
              className="form-input"
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              ระบุชื่อ Interface ขา WAN ที่จะนำมาพล็อตบนกราฟ Traffic อัตโนมัติ
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Refresh Interval (วินาที)</label>
            <input
              type="number"
              min="3"
              max="120"
              value={formData.refreshInterval || 10}
              onChange={(e) => handleChange('refreshInterval', parseInt(e.target.value, 10) || 10)}
              disabled={!isAdmin}
              className="form-input"
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              ควบคุมรอบการดึง Telemetry และ Polling บน Frontend & Backend (3 - 120s)
            </div>
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Default Discovery Subnet / CIDR</label>
          <input
            type="text"
            value={formData.defaultDiscoveryCidr || ''}
            onChange={(e) => handleChange('defaultDiscoveryCidr', e.target.value)}
            disabled={!isAdmin}
            placeholder="192.168.1.0/24"
            className="form-input"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Subnet เริ่มต้นสำหรับระบบค้นหาอุปกรณ์อัตโนมัติ (Auto-Discovery Scanner)
          </div>
        </div>

        {/* Emergency Break-Glass Authentication Section - Strictly Admin Only */}
        {isAdmin && (
          <div style={{
            padding: '16px 18px',
            borderRadius: 'var(--radius)',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={18} color="#f59e0b" />
                <span style={{ fontWeight: 800, fontSize: 14, color: '#fbbf24' }}>
                  ระบบเข้าสู่ระบบฉุกเฉิน (Emergency Break-Glass Authentication)
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <ShieldCheck size={14} /> สิทธิ์ Admin ในเครื่อง (Local Fallback)
              </span>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              ใช้สำหรับล็อกอินเข้าจัดการระบบกรณีฉุกเฉินหรือกู้คืนระบบ (Break-Glass Local Admin)
              โดยระบบจะตรวจสอบสิทธิ์กับ Backend โดยตรงและมอบสิทธิ์ <strong>Admin</strong> เพื่อกู้คืนระบบทันที
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <div className="input-group">
                <label className="input-label">ชื่อผู้ใช้ฉุกเฉิน (Emergency Username)</label>
                <input
                  type="text"
                  value={emergencyUser}
                  onChange={(e) => setEmergencyUser(e.target.value)}
                  placeholder="emergency"
                  className="form-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  ชื่อบัญชีสำหรับ Break-Glass Login (ค่าเริ่มต้น: <code>emergency</code>)
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>รหัสผ่านฉุกเฉินใหม่ (New Password)</span>
                  <button
                    type="button"
                    onClick={() => setShowEmergencyPass(!showEmergencyPass)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      padding: 0,
                    }}
                    title={showEmergencyPass ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showEmergencyPass ? <EyeOff size={13} /> : <Eye size={13} />}
                    <span>{showEmergencyPass ? 'ซ่อน' : 'แสดง'}</span>
                  </button>
                </label>
                <input
                  type={showEmergencyPass ? 'text' : 'password'}
                  value={newEmergencyPass}
                  onChange={(e) => setNewEmergencyPass(e.target.value)}
                  placeholder="(เว้นว่างไว้หากไม่ต้องการเปลี่ยน)"
                  className="form-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  autoComplete="new-password"
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  ความยาวอย่างน้อย 6 ตัวอักษร
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">ยืนยันรหัสผ่านฉุกเฉิน (Confirm Password)</label>
                <input
                  type={showEmergencyPass ? 'text' : 'password'}
                  value={confirmEmergencyPass}
                  onChange={(e) => setConfirmEmergencyPass(e.target.value)}
                  placeholder="(ยืนยันรหัสผ่านใหม่)"
                  className="form-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  autoComplete="new-password"
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  พิมพ์รหัสผ่านใหม่อีกครั้งให้ตรงกัน
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
              <div>
                {passSuccessMessage && (
                  <span style={{ fontSize: 12, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Check size={14} /> {passSuccessMessage}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleChangeEmergencyPassword}
                disabled={isChangingPass || !newEmergencyPass}
                className="btn btn-secondary"
                style={{
                  fontSize: 12,
                  padding: '6px 14px',
                  borderColor: 'rgba(245, 158, 11, 0.4)',
                  color: newEmergencyPass ? '#fbbf24' : 'var(--text-muted)',
                }}
              >
                <KeyRound size={13} className={isChangingPass ? 'animate-spin' : ''} />
                <span>{isChangingPass ? 'กำลังบันทึกรหัสผ่าน...' : 'บันทึกรหัสผ่านฉุกเฉินเฉพาะส่วน'}</span>
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={handleReset}
            disabled={!isAdmin}
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '8px 16px', opacity: !isAdmin ? 0.5 : 1, cursor: !isAdmin ? 'not-allowed' : 'pointer' }}
          >
            <RotateCcw size={14} />
            <span>คืนค่าเริ่มต้นระบบ</span>
          </button>
          <button
            type="submit"
            disabled={!isAdmin}
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '8px 22px', opacity: !isAdmin ? 0.5 : 1, cursor: !isAdmin ? 'not-allowed' : 'pointer' }}
          >
            <Save size={14} />
            <span>{isAdmin ? 'บันทึกการตั้งค่าระบบ (Save System Settings)' : 'อ่านอย่างเดียว (Admin เท่านั้น)'}</span>
          </button>
        </div>
      </form>
      )}

      {/* ── Dedicated Alert Settings Category (Admin Only) ── */}
      {(settingCategory === 'all' || settingCategory === 'alerts') && (
        <form onSubmit={handleSaveAlertSettings} className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 'var(--radius)',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Bell size={18} color="var(--yellow)" />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>
                  หมวดหมู่การตั้งค่าการแจ้งเตือน (Alert Settings & Thresholds)
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  กำหนดเกณฑ์แจ้งเตือนอัตโนมัติ (CPU, Memory, Latency, PoE, อุณหภูมิ, อุปกรณ์ออฟไลน์ และสถานะฮาร์ดแวร์)
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={handleToggleBrowserNotif}
                disabled={!isAdmin}
                className={`btn ${notificationsEnabled ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  fontSize: 11,
                  padding: '6px 12px',
                  opacity: !isAdmin ? 0.5 : 1,
                  cursor: !isAdmin ? 'not-allowed' : 'pointer',
                }}
              >
                {notificationsEnabled ? <Bell size={13} /> : <BellOff size={13} />}
                <span>{notificationsEnabled ? 'แจ้งเตือนเบราว์เซอร์ & เสียง: เปิด' : 'แจ้งเตือนเบราว์เซอร์ & เสียง: ปิด'}</span>
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                🛡️ เฉพาะ Admin
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {/* 1. CPU Threshold */}
            <div style={{ padding: 14, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Cpu size={16} color="var(--primary)" />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>CPU Load Threshold</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isAdmin ? 'pointer' : 'not-allowed', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={alertForm.cpuEnabled ?? true}
                    disabled={!isAdmin}
                    onChange={(e) => handleAlertRuleChange('cpuEnabled', e.target.checked)}
                    style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
                  />
                  <span>เปิดใช้งาน</span>
                </label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range"
                  min={50}
                  max={100}
                  value={alertForm.cpuThreshold ?? 80}
                  disabled={!isAdmin || !alertForm.cpuEnabled}
                  onChange={(e) => handleAlertRuleChange('cpuThreshold', Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--primary)' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    min={50}
                    max={100}
                    value={alertForm.cpuThreshold ?? 80}
                    disabled={!isAdmin || !alertForm.cpuEnabled}
                    onChange={(e) => handleAlertRuleChange('cpuThreshold', Math.min(100, Math.max(50, Number(e.target.value) || 80)))}
                    className="form-input"
                    style={{ width: 64, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>%</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                แจ้งเตือน Warning เมื่อเกินค่าที่ตั้งไว้ และ Critical เมื่อสูงกว่า 95%
              </div>
            </div>

            {/* 2. Memory Threshold */}
            <div style={{ padding: 14, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MemoryStick size={16} color="var(--purple)" />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Memory Usage Threshold</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isAdmin ? 'pointer' : 'not-allowed', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={alertForm.memoryEnabled ?? true}
                    disabled={!isAdmin}
                    onChange={(e) => handleAlertRuleChange('memoryEnabled', e.target.checked)}
                    style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
                  />
                  <span>เปิดใช้งาน</span>
                </label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range"
                  min={50}
                  max={100}
                  value={alertForm.memoryThreshold ?? 85}
                  disabled={!isAdmin || !alertForm.memoryEnabled}
                  onChange={(e) => handleAlertRuleChange('memoryThreshold', Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--purple)' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    min={50}
                    max={100}
                    value={alertForm.memoryThreshold ?? 85}
                    disabled={!isAdmin || !alertForm.memoryEnabled}
                    onChange={(e) => handleAlertRuleChange('memoryThreshold', Math.min(100, Math.max(50, Number(e.target.value) || 85)))}
                    className="form-input"
                    style={{ width: 64, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple)' }}>%</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                แจ้งเตือนเมื่อหน่วยความจำ RAM ของอุปกรณ์เกินเกณฑ์ที่กำหนด
              </div>
            </div>

            {/* 3. Latency Threshold */}
            <div style={{ padding: 14, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Wifi size={16} color="var(--yellow)" />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>High Latency Threshold</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isAdmin ? 'pointer' : 'not-allowed', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={alertForm.latencyEnabled ?? true}
                    disabled={!isAdmin}
                    onChange={(e) => handleAlertRuleChange('latencyEnabled', e.target.checked)}
                    style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
                  />
                  <span>เปิดใช้งาน</span>
                </label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range"
                  min={10}
                  max={500}
                  step={10}
                  value={alertForm.latencyThreshold ?? 150}
                  disabled={!isAdmin || !alertForm.latencyEnabled}
                  onChange={(e) => handleAlertRuleChange('latencyThreshold', Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--yellow)' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    min={10}
                    max={1000}
                    step={5}
                    value={alertForm.latencyThreshold ?? 150}
                    disabled={!isAdmin || !alertForm.latencyEnabled}
                    onChange={(e) => handleAlertRuleChange('latencyThreshold', Math.min(1000, Math.max(10, Number(e.target.value) || 150)))}
                    className="form-input"
                    style={{ width: 70, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--yellow)' }}>ms</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                แจ้งเตือนเมื่อค่าหน่วงเวลา (ICMP Ping Latency) สูงเกินค่าที่ตั้งไว้
              </div>
            </div>

            {/* 4. Offline Detection & Grace Delay */}
            <div style={{ padding: 14, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} color="var(--red)" />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Offline Detection & Delay</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isAdmin ? 'pointer' : 'not-allowed', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={alertForm.offlineEnabled ?? true}
                    disabled={!isAdmin}
                    onChange={(e) => handleAlertRuleChange('offlineEnabled', e.target.checked)}
                    style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
                  />
                  <span>เปิดใช้งาน</span>
                </label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={5}
                  value={alertForm.offlineTimeout ?? 10}
                  disabled={!isAdmin || !alertForm.offlineEnabled}
                  onChange={(e) => handleAlertRuleChange('offlineTimeout', Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--red)' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    step={5}
                    value={alertForm.offlineTimeout ?? 10}
                    disabled={!isAdmin || !alertForm.offlineEnabled}
                    onChange={(e) => handleAlertRuleChange('offlineTimeout', Math.min(120, Math.max(0, Number(e.target.value) || 0)))}
                    className="form-input"
                    style={{ width: 64, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>วินาที</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                หน่วงเวลาตรวจสอบซ้ำก่อนแจ้งเตือน Critical เมื่ออุปกรณ์ขาดการติดต่อ
              </div>
            </div>

            {/* 5. PoE Power Budget Threshold */}
            <div style={{ padding: 14, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Zap size={16} color="#f59e0b" />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>PoE Power Budget Threshold</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isAdmin ? 'pointer' : 'not-allowed', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={alertForm.poeEnabled ?? true}
                    disabled={!isAdmin}
                    onChange={(e) => handleAlertRuleChange('poeEnabled', e.target.checked)}
                    style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
                  />
                  <span>เปิดใช้งาน</span>
                </label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range"
                  min={50}
                  max={100}
                  value={alertForm.poeThreshold ?? 80}
                  disabled={!isAdmin || !(alertForm.poeEnabled ?? true)}
                  onChange={(e) => handleAlertRuleChange('poeThreshold', Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#f59e0b' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    min={50}
                    max={100}
                    value={alertForm.poeThreshold ?? 80}
                    disabled={!isAdmin || !(alertForm.poeEnabled ?? true)}
                    onChange={(e) => handleAlertRuleChange('poeThreshold', Math.min(100, Math.max(50, Number(e.target.value) || 80)))}
                    className="form-input"
                    style={{ width: 64, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>%</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                แจ้งเตือนเมื่อกำลังไฟ PoE (Allocated หรือ Actual Consumption) เกินงบพลังงาน
              </div>
            </div>

            {/* 6. Chassis Temperature Threshold */}
            <div style={{ padding: 14, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Thermometer size={16} color="#ef4444" />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Temperature Threshold</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isAdmin ? 'pointer' : 'not-allowed', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={alertForm.tempEnabled ?? true}
                    disabled={!isAdmin}
                    onChange={(e) => handleAlertRuleChange('tempEnabled', e.target.checked)}
                    style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
                  />
                  <span>เปิดใช้งาน</span>
                </label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range"
                  min={40}
                  max={90}
                  value={alertForm.tempThreshold ?? 65}
                  disabled={!isAdmin || !(alertForm.tempEnabled ?? true)}
                  onChange={(e) => handleAlertRuleChange('tempThreshold', Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#ef4444' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    min={40}
                    max={90}
                    value={alertForm.tempThreshold ?? 65}
                    disabled={!isAdmin || !(alertForm.tempEnabled ?? true)}
                    onChange={(e) => handleAlertRuleChange('tempThreshold', Math.min(90, Math.max(40, Number(e.target.value) || 65)))}
                    className="form-input"
                    style={{ width: 64, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>°C</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                แจ้งเตือนเมื่ออุณหภูมิภายในตัวเครื่อง Switch/Router สูงเกินกำหนด (Critical ที่ ≥ 75°C)
              </div>
            </div>

            {/* 7. Hardware Health & Reboot Detection */}
            <div style={{ padding: 14, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Fan size={16} color="var(--green)" />
                <span style={{ fontSize: 13, fontWeight: 700 }}>Hardware Health & Device Reboot Detection</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 'var(--radius)', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', cursor: isAdmin ? 'pointer' : 'not-allowed' }}>
                  <input
                    type="checkbox"
                    checked={alertForm.hardwareEnabled ?? true}
                    disabled={!isAdmin}
                    onChange={(e) => handleAlertRuleChange('hardwareEnabled', e.target.checked)}
                    style={{ accentColor: 'var(--primary)', width: 16, height: 16, marginTop: 2 }}
                  />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      แจ้งเตือน PSU & พัดลมระบายความร้อนผิดปกติ (PSU / Cooling Fan Fault)
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      ตรวจสอบสถานะ Power Supply และพัดลมผ่าน CISCO-ENVMON-MIB อัตโนมัติ
                    </div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 'var(--radius)', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', cursor: isAdmin ? 'pointer' : 'not-allowed' }}>
                  <input
                    type="checkbox"
                    checked={alertForm.rebootEnabled ?? true}
                    disabled={!isAdmin}
                    onChange={(e) => handleAlertRuleChange('rebootEnabled', e.target.checked)}
                    style={{ accentColor: 'var(--primary)', width: 16, height: 16, marginTop: 2 }}
                  />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      แจ้งเตือนเมื่ออุปกรณ์เพิ่งรีบูตใหม่ (Device Rebooted &lt; 10 นาที)
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      ตรวจสอบค่า sysUpTime และแจ้งเตือนเมื่อพบอุปกรณ์รีสตาร์ทหรือไฟตก
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              onClick={handleResetAlertSettings}
              disabled={!isAdmin}
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '8px 16px', opacity: !isAdmin ? 0.5 : 1, cursor: !isAdmin ? 'not-allowed' : 'pointer' }}
            >
              <RotateCcw size={14} />
              <span>คืนค่าเริ่มต้น Alert</span>
            </button>

            <button
              type="submit"
              disabled={!isAdmin}
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '8px 22px', opacity: !isAdmin ? 0.5 : 1, cursor: !isAdmin ? 'not-allowed' : 'pointer' }}
            >
              {alertSaved ? <Check size={14} /> : <Save size={14} />}
              <span>
                {!isAdmin
                  ? 'อ่านอย่างเดียว (เฉพาะ Admin เท่านั้น)'
                  : alertSaved
                  ? 'บันทึกการตั้งค่า Alert เรียบร้อยแล้ว!'
                  : 'บันทึกการตั้งค่า Alert (Save Alert Settings)'}
              </span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
