import React, { useState, useEffect } from 'react';
import {
  Settings, Save, RotateCcw, CheckCircle2, AlertCircle, RefreshCw,
  KeyRound, Eye, EyeOff, ShieldCheck, Check, Bell, BellOff,
  AlertTriangle, Cpu, MemoryStick, Wifi, Zap, Thermometer, Fan, Volume2
} from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useAlerts } from '../../context/AlertContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_SETTINGS } from '../../services/storageService';
import { DEFAULT_ALERT_RULES, playAlertBeep } from '../../services/alertStorage';
import { AuthService } from '../../services/authService';

export function SettingsView({ initialCategory = 'all' }) {
  const { settings, updateSettings, checkConnection, isConnected, isChecking, targetCount } = useSettings();
  const { alertRules, updateAlertRules, notificationsEnabled, toggleNotifications } = useAlerts();
  const { showToast } = useToast();
  const { isAdmin, canEdit, user } = useAuth();

  const [settingCategory, setSettingCategory] = useState(initialCategory || 'all'); // 'all' | 'system' | 'alerts'
  const [alertSubCategory, setAlertSubCategory] = useState('all'); // 'all' | 'connectivity' | 'resources' | 'hardware_poe' | 'notification'

  useEffect(() => {
    if (initialCategory) {
      setSettingCategory(initialCategory);
    }
  }, [initialCategory]);

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
    if (!canEdit) return;
    setAlertForm((prev) => ({ ...prev, [field]: val }));
  };

  const handleSaveAlertSettings = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!canEdit) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ดูแลระบบ (Admin) หรือผู้แก้ไข (Editor) เท่านั้นที่สามารถปรับตั้งค่าการแจ้งเตือน (Alert Settings) ได้');
      return;
    }
    try {
      await updateAlertRules(alertForm);
      setAlertSaved(true);
      setTimeout(() => setAlertSaved(false), 3000);
      showToast('success', 'บันทึกการตั้งค่า Alert สำเร็จ', 'เกณฑ์การแจ้งเตือนอย่างละเอียดถูกบันทึกและประมวลผลบน Backend ทันที');
    } catch (err) {
      showToast('error', 'บันทึกไม่สำเร็จ', err.message || 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่าการแจ้งเตือน');
    }
  };

  const handleResetAlertSettings = async () => {
    if (!canEdit) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ดูแลระบบ (Admin) หรือผู้แก้ไข (Editor) เท่านั้นที่สามารถรีเซ็ตค่าการแจ้งเตือนได้');
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
    if (!canEdit) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ดูแลระบบ (Admin) หรือผู้แก้ไข (Editor) เท่านั้นที่สามารถปรับตั้งค่าการแจ้งเตือนได้');
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
              background: isAdmin ? 'rgba(16, 185, 129, 0.12)' : canEdit ? 'rgba(245, 158, 11, 0.12)' : 'rgba(59, 130, 246, 0.12)',
              border: `1px solid ${isAdmin ? 'rgba(16, 185, 129, 0.35)' : canEdit ? 'rgba(245, 158, 11, 0.35)' : 'rgba(59, 130, 246, 0.35)'}`,
              color: isAdmin ? 'var(--green)' : canEdit ? 'var(--yellow)' : '#60a5fa',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ShieldCheck size={14} />
            {isAdmin
              ? 'สิทธิ์แก้ไขเต็มรูปแบบ (Admin)'
              : canEdit
              ? 'สิทธิ์แก้ไขการแจ้งเตือน (Editor)'
              : `โหมดอ่านอย่างเดียว (${user?.role || 'Viewer'})`}
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
            background: canEdit ? 'rgba(245, 158, 11, 0.08)' : 'rgba(59, 130, 246, 0.1)',
            border: `1px solid ${canEdit ? 'rgba(245, 158, 11, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
            color: canEdit ? '#fcd34d' : '#93c5fd',
            fontSize: 13,
            lineHeight: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <AlertCircle size={18} color={canEdit ? '#f59e0b' : '#60a5fa'} style={{ flexShrink: 0 }} />
          <div>
            {canEdit ? (
              <>
                <strong>สิทธิ์ผู้แก้ไข (Editor Mode):</strong> คุณเข้าสู่ระบบด้วยบทบาท <strong>{user?.role || 'Editor'}</strong> สามารถปรับตั้งค่าและบันทึก <strong>หมวดหมู่การตั้งค่าการแจ้งเตือน (Alert Settings)</strong> ได้อย่างละเอียด ส่วนการตั้งค่าระบบหลัก (System &amp; Connection) สงวนสิทธิ์เฉพาะ <strong>Admin</strong>
              </>
            ) : (
              <>
                <strong>โหมดอ่านอย่างเดียว (Read-Only Mode):</strong> คุณเข้าสู่ระบบด้วยบทบาท <strong>{user?.role || 'Viewer'}</strong> การปรับตั้งค่าระบบสงวนสิทธิ์เฉพาะ <strong>Admin</strong> และการตั้งค่าการแจ้งเตือน (Alert Settings) สงวนสิทธิ์เฉพาะ <strong>Admin / Editor</strong> เท่านั้น
              </>
            )}
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

      {/* ── Dedicated Alert Settings Category (Admin & Editor Editable) ── */}
      {(settingCategory === 'all' || settingCategory === 'alerts') && (
        <form onSubmit={handleSaveAlertSettings} className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 'var(--radius)',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Bell size={20} color="var(--yellow)" />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>
                  หมวดหมู่การตั้งค่าการแจ้งเตือนอย่างละเอียด (Detailed Alert Settings)
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  ตั้งค่าเกณฑ์ Warning / Critical, เวลาหน่วง (Delay), โหมดตรวจสอบ PoE, ฮาร์ดแวร์ และเสียงแจ้งเตือนแยกตามหมวดหมู่
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: canEdit ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                  border: `1px solid ${canEdit ? 'rgba(16, 185, 129, 0.35)' : 'rgba(59, 130, 246, 0.35)'}`,
                  color: canEdit ? 'var(--green)' : '#60a5fa',
                }}
              >
                {canEdit ? '🛡️ สิทธิ์แก้ไข: Admin & Editor' : '🔒 เฉพาะ Admin & Editor'}
              </span>
            </div>
          </div>

          {/* Sub-Category Filter Bar inside Alert Settings */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            {[
              { id: 'all', label: 'ทุกหมวดหมู่ย่อย (All Alert Categories)' },
              { id: 'connectivity', label: '🌐 1. การเชื่อมต่อ & เครือข่าย (Offline / Latency / Reboot)' },
              { id: 'resources', label: '💻 2. ทรัพยากรระบบ (CPU & Memory)' },
              { id: 'hardware_poe', label: '⚡ 3. PoE & ฮาร์ดแวร์/อุณหภูมิ (PoE / Temp / PSU / Fan)' },
              { id: 'notification', label: '🔔 4. ช่องทางแจ้งเตือน & เสียงเตือน (Browser & Audio)' },
            ].map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => setAlertSubCategory(sub.id)}
                style={{
                  padding: '6px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  borderRadius: 999,
                  border: '1px solid',
                  borderColor: alertSubCategory === sub.id ? 'var(--primary)' : 'var(--border)',
                  background: alertSubCategory === sub.id ? 'rgba(0, 212, 255, 0.14)' : 'rgba(15, 23, 42, 0.5)',
                  color: alertSubCategory === sub.id ? 'var(--primary)' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}
              >
                {sub.label}
              </button>
            ))}
          </div>

          {/* ── SUB-CATEGORY 1: CONNECTIVITY & NETWORK REACHABILITY ── */}
          {(alertSubCategory === 'all' || alertSubCategory === 'connectivity') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: 'var(--primary)', paddingTop: 4 }}>
                <Wifi size={16} />
                <span>หมวดหมู่ย่อยที่ 1: การเชื่อมต่อและสถานะเครือข่าย (Connectivity &amp; Network Reachability)</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                {/* 1.1 Offline Detection & Grace Delay */}
                <div style={{ padding: 16, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertTriangle size={16} color="var(--red)" />
                      <span style={{ fontSize: 13, fontWeight: 700 }}>Device Offline Detection</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: canEdit ? 'pointer' : 'not-allowed', fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={alertForm.offlineEnabled ?? true}
                        disabled={!canEdit}
                        onChange={(e) => handleAlertRuleChange('offlineEnabled', e.target.checked)}
                        style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
                      />
                      <span>เปิดใช้งาน</span>
                    </label>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>เวลาหน่วงก่อนแจ้งเตือน (Grace Period Delay)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>{alertForm.offlineTimeout ?? 10} วินาที</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="range"
                        min={0}
                        max={120}
                        step={5}
                        value={alertForm.offlineTimeout ?? 10}
                        disabled={!canEdit || !alertForm.offlineEnabled}
                        onChange={(e) => handleAlertRuleChange('offlineTimeout', Number(e.target.value))}
                        style={{ flex: 1, accentColor: 'var(--red)' }}
                      />
                      <input
                        type="number"
                        min={0}
                        max={300}
                        step={5}
                        value={alertForm.offlineTimeout ?? 10}
                        disabled={!canEdit || !alertForm.offlineEnabled}
                        onChange={(e) => handleAlertRuleChange('offlineTimeout', Math.min(300, Math.max(0, Number(e.target.value) || 0)))}
                        className="form-input"
                        style={{ width: 68, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      ระดับความรุนแรงเมื่ออุปกรณ์ Offline (Alert Severity)
                    </label>
                    <select
                      value={alertForm.offlineSeverity || 'critical'}
                      disabled={!canEdit || !alertForm.offlineEnabled}
                      onChange={(e) => handleAlertRuleChange('offlineSeverity', e.target.value)}
                      className="form-select"
                      style={{ fontSize: 12, padding: '6px 10px' }}
                    >
                      <option value="critical">🔴 Critical (วิกฤต - แนะนำ)</option>
                      <option value="warning">🟡 Warning (เฝ้าระวัง)</option>
                    </select>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    ป้องกันการแจ้งเตือนลวง (False Positive) จากแพ็กเก็ต ICMP ตกชั่วคราวโดยรอจนครบเวลาหน่วงที่กำหนด
                  </div>
                </div>

                {/* 1.2 ICMP Ping Latency (Warning & Critical) */}
                <div style={{ padding: 16, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Wifi size={16} color="var(--yellow)" />
                      <span style={{ fontSize: 13, fontWeight: 700 }}>ICMP Network Latency (ms)</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: canEdit ? 'pointer' : 'not-allowed', fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={alertForm.latencyEnabled ?? true}
                        disabled={!canEdit}
                        onChange={(e) => handleAlertRuleChange('latencyEnabled', e.target.checked)}
                        style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
                      />
                      <span>เปิดใช้งาน</span>
                    </label>
                  </div>

                  {/* Warning Threshold */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>🟡 เกณฑ์เฝ้าระวัง (Warning Threshold)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--yellow)' }}>&gt; {alertForm.latencyThreshold ?? 150} ms</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="range"
                        min={10}
                        max={500}
                        step={10}
                        value={alertForm.latencyThreshold ?? 150}
                        disabled={!canEdit || !alertForm.latencyEnabled}
                        onChange={(e) => handleAlertRuleChange('latencyThreshold', Number(e.target.value))}
                        style={{ flex: 1, accentColor: 'var(--yellow)' }}
                      />
                      <input
                        type="number"
                        min={5}
                        max={1000}
                        step={5}
                        value={alertForm.latencyThreshold ?? 150}
                        disabled={!canEdit || !alertForm.latencyEnabled}
                        onChange={(e) => handleAlertRuleChange('latencyThreshold', Math.min(1000, Math.max(5, Number(e.target.value) || 150)))}
                        className="form-input"
                        style={{ width: 68, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  {/* Critical Threshold */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>🔴 เกณฑ์วิกฤต (Critical Threshold)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>&ge; {alertForm.latencyCriticalThreshold ?? 300} ms</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="range"
                        min={50}
                        max={1000}
                        step={10}
                        value={alertForm.latencyCriticalThreshold ?? 300}
                        disabled={!canEdit || !alertForm.latencyEnabled}
                        onChange={(e) => handleAlertRuleChange('latencyCriticalThreshold', Math.max(alertForm.latencyThreshold ?? 150, Number(e.target.value)))}
                        style={{ flex: 1, accentColor: 'var(--red)' }}
                      />
                      <input
                        type="number"
                        min={20}
                        max={2000}
                        step={10}
                        value={alertForm.latencyCriticalThreshold ?? 300}
                        disabled={!canEdit || !alertForm.latencyEnabled}
                        onChange={(e) => handleAlertRuleChange('latencyCriticalThreshold', Math.min(2000, Math.max(alertForm.latencyThreshold ?? 150, Number(e.target.value) || 300)))}
                        className="form-input"
                        style={{ width: 68, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    แยกการแจ้งเตือนความหน่วงเครือข่ายเป็น 2 ระดับ (Warning และ Critical) ตามเวลาตอบสนอง Ping จริง
                  </div>
                </div>

                {/* 1.3 Device Reboot Detection */}
                <div style={{ padding: 16, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <RefreshCw size={16} color="#38bdf8" />
                      <span style={{ fontSize: 13, fontWeight: 700 }}>Device Reboot Detection</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: canEdit ? 'pointer' : 'not-allowed', fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={alertForm.rebootEnabled ?? true}
                        disabled={!canEdit}
                        onChange={(e) => handleAlertRuleChange('rebootEnabled', e.target.checked)}
                        style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
                      />
                      <span>เปิดใช้งาน</span>
                    </label>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>ช่วงเวลา Uptime หลังรีสตาร์ทที่จะแจ้งเตือน</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38bdf8' }}>&lt; {alertForm.rebootWindowMinutes ?? 10} นาที</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="range"
                        min={1}
                        max={60}
                        step={1}
                        value={alertForm.rebootWindowMinutes ?? 10}
                        disabled={!canEdit || !alertForm.rebootEnabled}
                        onChange={(e) => handleAlertRuleChange('rebootWindowMinutes', Number(e.target.value))}
                        style={{ flex: 1, accentColor: '#38bdf8' }}
                      />
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={alertForm.rebootWindowMinutes ?? 10}
                        disabled={!canEdit || !alertForm.rebootEnabled}
                        onChange={(e) => handleAlertRuleChange('rebootWindowMinutes', Math.min(60, Math.max(1, Number(e.target.value) || 10)))}
                        className="form-input"
                        style={{ width: 68, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      ระดับความรุนแรงเมื่อพบอุปกรณ์รีบูต (Alert Severity)
                    </label>
                    <select
                      value={alertForm.rebootSeverity || 'warning'}
                      disabled={!canEdit || !alertForm.rebootEnabled}
                      onChange={(e) => handleAlertRuleChange('rebootSeverity', e.target.value)}
                      className="form-select"
                      style={{ fontSize: 12, padding: '6px 10px' }}
                    >
                      <option value="warning">🟡 Warning (เฝ้าระวัง - แนะนำ)</option>
                      <option value="critical">🔴 Critical (วิกฤต)</option>
                    </select>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    ตรวจสอบค่า SNMP <code>sysUpTime</code> เพื่อตรวจจับกรณีอุปกรณ์เพิ่งรีบูตใหม่หรือเกิดไฟกระชาก
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── SUB-CATEGORY 2: SYSTEM RESOURCE UTILIZATION (CPU & MEMORY) ── */}
          {(alertSubCategory === 'all' || alertSubCategory === 'resources') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: 'var(--purple)', paddingTop: 6 }}>
                <Cpu size={16} />
                <span>หมวดหมู่ย่อยที่ 2: ทรัพยากรประมวลผลของอุปกรณ์ (CPU &amp; Memory Utilization)</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                {/* 2.1 CPU Utilization (Warning & Critical) */}
                <div style={{ padding: 16, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Cpu size={16} color="var(--primary)" />
                      <span style={{ fontSize: 13, fontWeight: 700 }}>CPU Load Utilization (%)</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: canEdit ? 'pointer' : 'not-allowed', fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={alertForm.cpuEnabled ?? true}
                        disabled={!canEdit}
                        onChange={(e) => handleAlertRuleChange('cpuEnabled', e.target.checked)}
                        style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
                      />
                      <span>เปิดใช้งาน</span>
                    </label>
                  </div>

                  {/* CPU Warning */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>🟡 เกณฑ์เฝ้าระวัง (Warning Threshold)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--yellow)' }}>&gt; {alertForm.cpuThreshold ?? 80}%</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="range"
                        min={30}
                        max={99}
                        value={alertForm.cpuThreshold ?? 80}
                        disabled={!canEdit || !alertForm.cpuEnabled}
                        onChange={(e) => handleAlertRuleChange('cpuThreshold', Number(e.target.value))}
                        style={{ flex: 1, accentColor: 'var(--yellow)' }}
                      />
                      <input
                        type="number"
                        min={30}
                        max={99}
                        value={alertForm.cpuThreshold ?? 80}
                        disabled={!canEdit || !alertForm.cpuEnabled}
                        onChange={(e) => handleAlertRuleChange('cpuThreshold', Math.min(99, Math.max(30, Number(e.target.value) || 80)))}
                        className="form-input"
                        style={{ width: 64, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  {/* CPU Critical */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>🔴 เกณฑ์วิกฤต (Critical Threshold)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>&ge; {alertForm.cpuCriticalThreshold ?? 90}%</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="range"
                        min={50}
                        max={100}
                        value={alertForm.cpuCriticalThreshold ?? 90}
                        disabled={!canEdit || !alertForm.cpuEnabled}
                        onChange={(e) => handleAlertRuleChange('cpuCriticalThreshold', Math.max(alertForm.cpuThreshold ?? 80, Number(e.target.value)))}
                        style={{ flex: 1, accentColor: 'var(--red)' }}
                      />
                      <input
                        type="number"
                        min={50}
                        max={100}
                        value={alertForm.cpuCriticalThreshold ?? 90}
                        disabled={!canEdit || !alertForm.cpuEnabled}
                        onChange={(e) => handleAlertRuleChange('cpuCriticalThreshold', Math.min(100, Math.max(alertForm.cpuThreshold ?? 80, Number(e.target.value) || 90)))}
                        className="form-input"
                        style={{ width: 64, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    กำหนดระดับแจ้งเตือนแยกกันระหว่าง Warning และ Critical สำหรับโหลดซีพียูของ Switch / Router / Server
                  </div>
                </div>

                {/* 2.2 Memory Usage (Warning & Critical) */}
                <div style={{ padding: 16, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <MemoryStick size={16} color="var(--purple)" />
                      <span style={{ fontSize: 13, fontWeight: 700 }}>Memory (RAM) Usage (%)</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: canEdit ? 'pointer' : 'not-allowed', fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={alertForm.memoryEnabled ?? true}
                        disabled={!canEdit}
                        onChange={(e) => handleAlertRuleChange('memoryEnabled', e.target.checked)}
                        style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
                      />
                      <span>เปิดใช้งาน</span>
                    </label>
                  </div>

                  {/* Memory Warning */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>🟡 เกณฑ์เฝ้าระวัง (Warning Threshold)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--yellow)' }}>&gt; {alertForm.memoryThreshold ?? 85}%</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="range"
                        min={30}
                        max={99}
                        value={alertForm.memoryThreshold ?? 85}
                        disabled={!canEdit || !alertForm.memoryEnabled}
                        onChange={(e) => handleAlertRuleChange('memoryThreshold', Number(e.target.value))}
                        style={{ flex: 1, accentColor: 'var(--yellow)' }}
                      />
                      <input
                        type="number"
                        min={30}
                        max={99}
                        value={alertForm.memoryThreshold ?? 85}
                        disabled={!canEdit || !alertForm.memoryEnabled}
                        onChange={(e) => handleAlertRuleChange('memoryThreshold', Math.min(99, Math.max(30, Number(e.target.value) || 85)))}
                        className="form-input"
                        style={{ width: 64, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  {/* Memory Critical */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>🔴 เกณฑ์วิกฤต (Critical Threshold)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>&ge; {alertForm.memoryCriticalThreshold ?? 95}%</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="range"
                        min={50}
                        max={100}
                        value={alertForm.memoryCriticalThreshold ?? 95}
                        disabled={!canEdit || !alertForm.memoryEnabled}
                        onChange={(e) => handleAlertRuleChange('memoryCriticalThreshold', Math.max(alertForm.memoryThreshold ?? 85, Number(e.target.value)))}
                        style={{ flex: 1, accentColor: 'var(--red)' }}
                      />
                      <input
                        type="number"
                        min={50}
                        max={100}
                        value={alertForm.memoryCriticalThreshold ?? 95}
                        disabled={!canEdit || !alertForm.memoryEnabled}
                        onChange={(e) => handleAlertRuleChange('memoryCriticalThreshold', Math.min(100, Math.max(alertForm.memoryThreshold ?? 85, Number(e.target.value) || 95)))}
                        className="form-input"
                        style={{ width: 64, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    ตรวจสอบสัดส่วนหน่วยความจำที่ถูกใช้งานจริงเทียบกับหน่วยความจำทั้งหมดของอุปกรณ์
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── SUB-CATEGORY 3: PoE POWER & ENVIRONMENTAL HARDWARE HEALTH ── */}
          {(alertSubCategory === 'all' || alertSubCategory === 'hardware_poe') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: '#f59e0b', paddingTop: 6 }}>
                <Zap size={16} />
                <span>หมวดหมู่ย่อยที่ 3: ระบบจ่ายไฟ PoE และสภาพแวดล้อมฮาร์ดแวร์ (PoE Power &amp; Environmental Health)</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                {/* 3.1 PoE Power Budget */}
                <div style={{ padding: 16, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Zap size={16} color="#f59e0b" />
                      <span style={{ fontSize: 13, fontWeight: 700 }}>PoE Power Budget (%)</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: canEdit ? 'pointer' : 'not-allowed', fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={alertForm.poeEnabled ?? true}
                        disabled={!canEdit}
                        onChange={(e) => handleAlertRuleChange('poeEnabled', e.target.checked)}
                        style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
                      />
                      <span>เปิดใช้งาน</span>
                    </label>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      โหมดการประเมินพลังงาน PoE (Evaluation Mode)
                    </label>
                    <select
                      value={alertForm.poeEvalMode || 'both'}
                      disabled={!canEdit || !(alertForm.poeEnabled ?? true)}
                      onChange={(e) => handleAlertRuleChange('poeEvalMode', e.target.value)}
                      className="form-select"
                      style={{ fontSize: 12, padding: '6px 10px' }}
                    >
                      <option value="both">⚡ ตรวจทั้งไฟที่จอง (Allocated) และไฟที่ใช้จริง (Actual) [แนะนำ]</option>
                      <option value="actual">🔌 เฉพาะกำลังไฟที่ใช้จริง (PoE Actual Consumption เท่านั้น)</option>
                      <option value="allocated">📌 เฉพาะกำลังไฟที่จัดสรร/จอง (PoE Allocated Power เท่านั้น)</option>
                    </select>
                  </div>

                  {/* PoE Warning */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>🟡 เกณฑ์เฝ้าระวัง (Warning Threshold)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--yellow)' }}>&ge; {alertForm.poeThreshold ?? 80}%</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="range"
                        min={30}
                        max={99}
                        value={alertForm.poeThreshold ?? 80}
                        disabled={!canEdit || !(alertForm.poeEnabled ?? true)}
                        onChange={(e) => handleAlertRuleChange('poeThreshold', Number(e.target.value))}
                        style={{ flex: 1, accentColor: 'var(--yellow)' }}
                      />
                      <input
                        type="number"
                        min={30}
                        max={99}
                        value={alertForm.poeThreshold ?? 80}
                        disabled={!canEdit || !(alertForm.poeEnabled ?? true)}
                        onChange={(e) => handleAlertRuleChange('poeThreshold', Math.min(99, Math.max(30, Number(e.target.value) || 80)))}
                        className="form-input"
                        style={{ width: 64, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  {/* PoE Critical */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>🔴 เกณฑ์วิกฤต (Critical Threshold)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>&ge; {alertForm.poeCriticalThreshold ?? 90}%</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="range"
                        min={50}
                        max={100}
                        value={alertForm.poeCriticalThreshold ?? 90}
                        disabled={!canEdit || !(alertForm.poeEnabled ?? true)}
                        onChange={(e) => handleAlertRuleChange('poeCriticalThreshold', Math.max(alertForm.poeThreshold ?? 80, Number(e.target.value)))}
                        style={{ flex: 1, accentColor: 'var(--red)' }}
                      />
                      <input
                        type="number"
                        min={50}
                        max={100}
                        value={alertForm.poeCriticalThreshold ?? 90}
                        disabled={!canEdit || !(alertForm.poeEnabled ?? true)}
                        onChange={(e) => handleAlertRuleChange('poeCriticalThreshold', Math.min(100, Math.max(alertForm.poeThreshold ?? 80, Number(e.target.value) || 90)))}
                        className="form-input"
                        style={{ width: 64, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                      />
                    </div>
                  </div>
                </div>

                {/* 3.2 Chassis Temperature (°C) */}
                <div style={{ padding: 16, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Thermometer size={16} color="#ef4444" />
                      <span style={{ fontSize: 13, fontWeight: 700 }}>Chassis Temperature (°C)</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: canEdit ? 'pointer' : 'not-allowed', fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={alertForm.tempEnabled ?? true}
                        disabled={!canEdit}
                        onChange={(e) => handleAlertRuleChange('tempEnabled', e.target.checked)}
                        style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
                      />
                      <span>เปิดใช้งาน</span>
                    </label>
                  </div>

                  {/* Temp Warning */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>🟡 อุณหภูมิเฝ้าระวัง (Warning Threshold)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--yellow)' }}>&ge; {alertForm.tempThreshold ?? 65}°C</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="range"
                        min={35}
                        max={90}
                        value={alertForm.tempThreshold ?? 65}
                        disabled={!canEdit || !(alertForm.tempEnabled ?? true)}
                        onChange={(e) => handleAlertRuleChange('tempThreshold', Number(e.target.value))}
                        style={{ flex: 1, accentColor: 'var(--yellow)' }}
                      />
                      <input
                        type="number"
                        min={35}
                        max={90}
                        value={alertForm.tempThreshold ?? 65}
                        disabled={!canEdit || !(alertForm.tempEnabled ?? true)}
                        onChange={(e) => handleAlertRuleChange('tempThreshold', Math.min(90, Math.max(35, Number(e.target.value) || 65)))}
                        className="form-input"
                        style={{ width: 64, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  {/* Temp Critical */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>🔴 อุณหภูมิวิกฤต (Critical Threshold)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>&ge; {alertForm.tempCriticalThreshold ?? 75}°C</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="range"
                        min={45}
                        max={100}
                        value={alertForm.tempCriticalThreshold ?? 75}
                        disabled={!canEdit || !(alertForm.tempEnabled ?? true)}
                        onChange={(e) => handleAlertRuleChange('tempCriticalThreshold', Math.max(alertForm.tempThreshold ?? 65, Number(e.target.value)))}
                        style={{ flex: 1, accentColor: 'var(--red)' }}
                      />
                      <input
                        type="number"
                        min={45}
                        max={100}
                        value={alertForm.tempCriticalThreshold ?? 75}
                        disabled={!canEdit || !(alertForm.tempEnabled ?? true)}
                        onChange={(e) => handleAlertRuleChange('tempCriticalThreshold', Math.min(100, Math.max(alertForm.tempThreshold ?? 65, Number(e.target.value) || 75)))}
                        className="form-input"
                        style={{ width: 64, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    ตรวจสอบเซนเซอร์วัดอุณหภูมิภายใน Switch / Router ผ่าน CISCO-ENVMON-MIB และ ENTITY-SENSOR-MIB
                  </div>
                </div>

                {/* 3.3 Hardware PSU & Cooling Fan Status */}
                <div style={{ padding: 16, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Fan size={16} color="var(--green)" />
                      <span style={{ fontSize: 13, fontWeight: 700 }}>สถานะภาคจ่ายไฟและพัดลมระบายความร้อน (PSU &amp; Cooling Fan Health)</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: canEdit ? 'pointer' : 'not-allowed', fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={alertForm.hardwareEnabled ?? true}
                        disabled={!canEdit}
                        onChange={(e) => handleAlertRuleChange('hardwareEnabled', e.target.checked)}
                        style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
                      />
                      <span>เปิดใช้งานหมวดฮาร์ดแวร์</span>
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 'var(--radius)', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', cursor: canEdit && (alertForm.hardwareEnabled ?? true) ? 'pointer' : 'not-allowed', opacity: (alertForm.hardwareEnabled ?? true) ? 1 : 0.5 }}>
                      <input
                        type="checkbox"
                        checked={alertForm.psuEnabled ?? true}
                        disabled={!canEdit || !(alertForm.hardwareEnabled ?? true)}
                        onChange={(e) => handleAlertRuleChange('psuEnabled', e.target.checked)}
                        style={{ accentColor: 'var(--primary)', width: 16, height: 16, marginTop: 2 }}
                      />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                          🔌 แจ้งเตือนภาคจ่ายไฟผิดปกติ (Power Supply / PSU Fault)
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          แจ้งเตือนเมื่อพบ Power Supply หลักหรือสำรอง (Redundant PSU) ขัดข้องหรือไม่ได้จ่ายไฟ
                        </div>
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 'var(--radius)', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', cursor: canEdit && (alertForm.hardwareEnabled ?? true) ? 'pointer' : 'not-allowed', opacity: (alertForm.hardwareEnabled ?? true) ? 1 : 0.5 }}>
                      <input
                        type="checkbox"
                        checked={alertForm.fanEnabled ?? true}
                        disabled={!canEdit || !(alertForm.hardwareEnabled ?? true)}
                        onChange={(e) => handleAlertRuleChange('fanEnabled', e.target.checked)}
                        style={{ accentColor: 'var(--primary)', width: 16, height: 16, marginTop: 2 }}
                      />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                          🌀 แจ้งเตือนพัดลมระบายความร้อนผิดปกติ (Cooling Fan Fault)
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          แจ้งเตือนเมื่อพัดลมระบายความร้อนในเครื่องหยุดหมุนหรือทำงานผิดปกติ
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── SUB-CATEGORY 4: BROWSER & AUDIO NOTIFICATION CHANNELS ── */}
          {(alertSubCategory === 'all' || alertSubCategory === 'notification') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: 'var(--green)', paddingTop: 6 }}>
                <Volume2 size={16} />
                <span>หมวดหมู่ย่อยที่ 4: ช่องทางการแจ้งเตือนและเสียงสัญญาณเตือน (Browser &amp; Audio Notifications)</span>
              </div>

              <div style={{ padding: 16, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      การแจ้งเตือนป๊อปอัพบนเบราว์เซอร์และเสียงเตือน (Browser Desktop &amp; Audio Alert)
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      แสดงป๊อปอัพแจ้งเตือนมุมจอและส่งเสียงสัญญาณเตือนเมื่อตรวจพบเหตุการณ์ผิดปกติใหม่แบบเรียลไทม์ (SSE)
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleBrowserNotif}
                    disabled={!canEdit}
                    className={`btn ${notificationsEnabled ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      fontSize: 12,
                      padding: '7px 14px',
                      opacity: !canEdit ? 0.5 : 1,
                      cursor: !canEdit ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {notificationsEnabled ? <Bell size={14} /> : <BellOff size={14} />}
                    <span>{notificationsEnabled ? 'สถานะแจ้งเตือนเบราว์เซอร์: เปิดใช้งาน (ON)' : 'สถานะแจ้งเตือนเบราว์เซอร์: ปิด (OFF)'}</span>
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, borderRadius: 'var(--radius)', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: canEdit ? 'pointer' : 'not-allowed' }}>
                      <input
                        type="checkbox"
                        checked={alertForm.soundCriticalEnabled ?? true}
                        disabled={!canEdit}
                        onChange={(e) => handleAlertRuleChange('soundCriticalEnabled', e.target.checked)}
                        style={{ accentColor: 'var(--red)', width: 16, height: 16 }}
                      />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>🔴 เสียงเตือนระดับวิกฤต (Critical Beep)</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ส่งเสียงเตือน 2 จังหวะเมื่อเกิดเหตุการณ์ Critical</div>
                      </div>
                    </label>
                    <button
                      type="button"
                      onClick={() => playAlertBeep('critical')}
                      className="btn btn-secondary"
                      style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }}
                    >
                      🔊 ทดสอบเสียง
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, borderRadius: 'var(--radius)', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: canEdit ? 'pointer' : 'not-allowed' }}>
                      <input
                        type="checkbox"
                        checked={alertForm.soundWarningEnabled ?? true}
                        disabled={!canEdit}
                        onChange={(e) => handleAlertRuleChange('soundWarningEnabled', e.target.checked)}
                        style={{ accentColor: 'var(--yellow)', width: 16, height: 16 }}
                      />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>🟡 เสียงเตือนระดับเฝ้าระวัง (Warning Beep)</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ส่งเสียงเตือน 1 จังหวะเมื่อเกิดเหตุการณ์ Warning</div>
                      </div>
                    </label>
                    <button
                      type="button"
                      onClick={() => playAlertBeep('warning')}
                      className="btn btn-secondary"
                      style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }}
                    >
                      🔊 ทดสอบเสียง
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              onClick={handleResetAlertSettings}
              disabled={!canEdit}
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '8px 16px', opacity: !canEdit ? 0.5 : 1, cursor: !canEdit ? 'not-allowed' : 'pointer' }}
            >
              <RotateCcw size={14} />
              <span>คืนค่าเริ่มต้น Alert ทั้งหมด</span>
            </button>

            <button
              type="submit"
              disabled={!canEdit}
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '8px 22px', opacity: !canEdit ? 0.5 : 1, cursor: !canEdit ? 'not-allowed' : 'pointer' }}
            >
              {alertSaved ? <Check size={14} /> : <Save size={14} />}
              <span>
                {!canEdit
                  ? 'อ่านอย่างเดียว (เฉพาะ Admin & Editor เท่านั้น)'
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
