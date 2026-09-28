import React, { useState, useEffect } from 'react';
import { Settings, Save, RotateCcw, CheckCircle2, AlertCircle, RefreshCw, KeyRound, Eye, EyeOff, ShieldCheck, Check } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { DEFAULT_SETTINGS } from '../../services/storageService';
import { AuthService } from '../../services/authService';

export function SettingsView() {
  const { settings, updateSettings, checkConnection, isConnected, isChecking, targetCount } = useSettings();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    ...settings,
    prometheusUrl: settings.prometheusUrl || settings.proxyUrl || DEFAULT_SETTINGS.prometheusUrl,
  });
  const [emergencyUser, setEmergencyUser] = useState(settings?.emergencyUsername || 'emergency');
  const [newEmergencyPass, setNewEmergencyPass] = useState('');
  const [confirmEmergencyPass, setConfirmEmergencyPass] = useState('');
  const [showEmergencyPass, setShowEmergencyPass] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passSuccessMessage, setPassSuccessMessage] = useState('');

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

  const handleChange = (field, val) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const handleChangeEmergencyPassword = async () => {
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

    if (newEmergencyPass) {
      setNewEmergencyPass('');
      setConfirmEmergencyPass('');
      showToast('success', 'บันทึกการตั้งค่าแล้ว', 'การตั้งค่าระบบและรหัสผ่านฉุกเฉินถูกปรับใช้ที่ Runtime เรียบร้อย');
    } else {
      showToast('success', 'บันทึกการตั้งค่าแล้ว', 'การตั้งค่าระบบและรอบการ Polling ถูกปรับใช้ที่ Runtime เรียบร้อย');
    }
  };

  const handleReset = () => {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 800, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div className="panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
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
            ตั้งค่าระบบ (System Settings)
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            ตั้งค่าการเชื่อมต่อ Prometheus Server (Direct Connection), SNMP exporter, และพารามิเตอร์ของระบบ
          </div>
        </div>
      </div>

      {/* Connection Test Banner */}
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

      {/* Form */}
      <form onSubmit={handleSave} className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="input-group">
          <label className="input-label">Prometheus Server Direct URL (Port 9090) *</label>
          <input
            type="text"
            value={formData.prometheusUrl || ''}
            onChange={(e) => handleChange('prometheusUrl', e.target.value)}
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
          <label className="input-label">Grafana Analytics Server URL (Port 3000) *</label>
          <input
            type="text"
            value={formData.grafanaUrl || ''}
            onChange={(e) => handleChange('grafanaUrl', e.target.value)}
            placeholder="http://localhost:3000"
            className="form-input"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            URL ของ Grafana Server ที่เปิดใช้งาน Iframe Embedding (เช่น <code>http://localhost:3000</code>)
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">ชื่อองค์กร (Organization Name)</label>
          <input
            type="text"
            value={formData.orgName}
            onChange={(e) => handleChange('orgName', e.target.value)}
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
            placeholder="192.168.1.0/24"
            className="form-input"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Subnet เริ่มต้นสำหรับระบบค้นหาอุปกรณ์อัตโนมัติ (Auto-Discovery Scanner)
          </div>
        </div>

        {/* Emergency Break-Glass Authentication Section */}
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
            ใช้สำหรับล็อกอินเข้าจัดการระบบเมื่อเซิร์ฟเวอร์ Grafana ไม่สามารถเข้าถึงได้ (Down / เปลี่ยน IP / Network ขาด)
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

        <div className="input-group">
          <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            LINE Channel Access Token (Messaging API)
          </label>
          <input
            type="password"
            value={formData.lineChannelToken || ''}
            onChange={(e) => handleChange('lineChannelToken', e.target.value)}
            className="form-input"
            placeholder="ใส่ Channel Access Token ที่ได้จาก LINE Developers..."
          />
        </div>

        <div className="input-group">
          <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            LINE Target ID (User ID / Group ID)
          </label>
          <input
            type="text"
            value={formData.lineTargetId || ''}
            onChange={(e) => handleChange('lineTargetId', e.target.value)}
            className="form-input"
            placeholder="ใส่ User ID หรือ Group ID ที่ต้องการให้บอทส่งข้อความไปหา..."
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={handleReset}
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '8px 16px' }}
          >
            <RotateCcw size={14} />
            <span>คืนค่าเริ่มต้น</span>
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '8px 22px' }}
          >
            <Save size={14} />
            <span>บันทึกการตั้งค่า (Save Settings)</span>
          </button>
        </div>
      </form>
    </div>
  );
}
