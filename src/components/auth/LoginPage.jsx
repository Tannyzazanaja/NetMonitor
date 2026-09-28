import React, { useState } from 'react';
import {
  Shield,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  Server,
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  BarChart3,
  AlertTriangle,
  KeyRound
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';

export function LoginPage() {
  const { login, isLoading } = useAuth();
  const { settings } = useSettings();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);
  const [suggestEmergency, setSuggestEmergency] = useState(false);

  const grafanaServerUrl = settings.grafanaUrl || 'http://192.168.109.147:3000';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuggestEmergency(false);

    if (!username.trim()) {
      setErrorMessage('กรุณาระบุชื่อผู้ใช้ (Username)');
      return;
    }
    if (!password) {
      setErrorMessage('กรุณาระบุรหัสผ่าน (Password)');
      return;
    }

    const res = await login(username.trim(), password, isEmergencyMode);
    if (!res.success) {
      setErrorMessage(res.error || 'เข้าสู่ระบบไม่สำเร็จ');
      if (res.canUseEmergency || res.error?.includes('Grafana') || res.error?.includes('เซิร์ฟเวอร์')) {
        setSuggestEmergency(true);
      }
    }
  };

  const handleFillDemo = (u, p) => {
    setUsername(u);
    setPassword(p);
    setErrorMessage('');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        background: 'radial-gradient(ellipse at 50% 20%, #0c142b 0%, #050811 75%, #020408 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background Decorative Rings & Grid */}
      <div
        style={{
          position: 'absolute',
          width: 800,
          height: 800,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0, 212, 255, 0.08) 0%, rgba(168, 85, 247, 0.03) 50%, transparent 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: 'radial-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
          pointerEvents: 'none',
        }}
      />

      {/* Main Login Card */}
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: 'rgba(10, 15, 30, 0.85)',
          backdropFilter: 'blur(20px)',
          borderRadius: 'var(--radius-lg)',
          border: isEmergencyMode ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(0, 212, 255, 0.25)',
          boxShadow: isEmergencyMode
            ? '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 35px rgba(245, 158, 11, 0.25)'
            : '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(0, 212, 255, 0.12)',
          padding: '36px 32px',
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          transition: 'all 0.3s ease',
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: isEmergencyMode
                ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(239, 68, 68, 0.3) 100%)'
                : 'linear-gradient(135deg, rgba(0, 212, 255, 0.2) 0%, rgba(249, 115, 22, 0.25) 100%)',
              border: isEmergencyMode ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(0, 212, 255, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isEmergencyMode ? '0 0 20px rgba(245, 158, 11, 0.4)' : '0 0 20px rgba(0, 212, 255, 0.3)',
            }}
          >
            {isEmergencyMode ? (
              <AlertTriangle size={30} color="#f59e0b" />
            ) : (
              <Shield size={30} color="var(--primary)" />
            )}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '0.8px' }}>
              {isEmergencyMode ? 'EMERGENCY BREAK-GLASS' : 'NETMONITOR NOC PORTAL'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {isEmergencyMode ? 'ระบบเข้าสู่ระบบฉุกเฉินเมื่อ Grafana ไม่พร้อมใช้งาน' : 'Enterprise Telemetry & Topology Management System'}
            </div>
          </div>

          {/* Mode Indicator Badge */}
          {isEmergencyMode ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 9999,
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                fontSize: 11,
                fontWeight: 700,
                color: '#fbbf24',
                marginTop: 4,
              }}
            >
              <KeyRound size={13} />
              <span>🚨 LOCAL BREAK-GLASS AUTH</span>
            </div>
          ) : (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 9999,
                background: 'rgba(249, 115, 22, 0.12)',
                border: '1px solid rgba(249, 115, 22, 0.35)',
                fontSize: 11,
                fontWeight: 700,
                color: '#fb923c',
                marginTop: 4,
              }}
            >
              <BarChart3 size={13} />
              <span>SINGLE SIGN-ON (SSO)</span>
            </div>
          )}
        </div>

        {/* Emergency Explanatory Banner */}
        {isEmergencyMode && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fef3c7',
              fontSize: 12,
              lineHeight: 1.5,
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>โหมดฉุกเฉิน (Break-Glass Login):</strong> ใช้เมื่อเซิร์ฟเวอร์ Grafana ดับหรือเกิดปัญหา โดยจะตรวจสอบสิทธิ์กับเซิร์ฟเวอร์ NetMonitor โดยตรง และมอบสิทธิ์ Admin เต็มรูปแบบเพื่อกู้คืนระบบ
            </div>
          </div>
        )}

        {/* Error Alert Banner */}
        {errorMessage && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              fontSize: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <div>{errorMessage}</div>
            </div>
            {suggestEmergency && !isEmergencyMode && (
              <button
                type="button"
                onClick={() => {
                  setIsEmergencyMode(true);
                  setErrorMessage('');
                  if (!username) setUsername(settings.emergencyUsername || 'emergency');
                }}
                className="btn"
                style={{
                  alignSelf: 'flex-start',
                  fontSize: 11,
                  padding: '6px 12px',
                  background: 'rgba(245, 158, 11, 0.25)',
                  border: '1px solid #f59e0b',
                  color: '#fef3c7',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  borderRadius: 6,
                }}
              >
                <KeyRound size={12} />
                <span>🚨 สลับเป็นโหมดเข้าสู่ระบบฉุกเฉิน (Emergency Login) ทันที</span>
              </button>
            )}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Username */}
          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <User size={13} color={isEmergencyMode ? '#f59e0b' : 'var(--primary)'} />
              <span>{isEmergencyMode ? 'ชื่อผู้ใช้ฉุกเฉิน (Emergency Username)' : 'ชื่อผู้ใช้ (Username / Email)'}</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={isEmergencyMode ? 'เช่น emergency หรือ admin' : 'ระบุชื่อบัญชีผู้ใช้'}
              className="form-input"
              style={{ fontSize: 13, padding: '10px 14px' }}
              autoFocus
              required
            />
          </div>

          {/* Password */}
          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lock size={13} color={isEmergencyMode ? '#f59e0b' : 'var(--primary)'} />
              <span>{isEmergencyMode ? 'รหัสผ่านฉุกเฉิน (Emergency Password)' : 'รหัสผ่าน (Password)'}</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEmergencyMode ? 'ระบุรหัสผ่านฉุกเฉินของเซิร์ฟเวอร์' : 'ระบุรหัสผ่านของคุณ'}
                className="form-input"
                style={{ fontSize: 13, padding: '10px 40px 10px 14px' }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary"
            style={{
              marginTop: 6,
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: isEmergencyMode ? '0 0 20px rgba(245, 158, 11, 0.4)' : '0 0 20px rgba(0, 212, 255, 0.35)',
              background: isEmergencyMode
                ? 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)'
                : 'linear-gradient(135deg, #00d4ff 0%, #0284c7 100%)',
            }}
          >
            {isLoading ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>{isEmergencyMode ? 'กำลังตรวจสอบสิทธิ์ฉุกเฉิน...' : 'กำลังตรวจสอบสิทธิ์กับ Grafana...'}</span>
              </>
            ) : (
              <>
                <span>{isEmergencyMode ? 'เข้าสู่ระบบฉุกเฉิน (Break-Glass Sign In)' : 'เข้าสู่ระบบ (Sign In)'}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Server Connection Status & Emergency Mode Toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
              <Server size={13} color={isEmergencyMode ? '#f59e0b' : 'var(--primary)'} />
              <span>{isEmergencyMode ? 'Local Auth Engine:' : 'Auth Server:'}</span>
              <code style={{ color: isEmergencyMode ? '#fbbf24' : 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                {isEmergencyMode ? 'NetMonitor Internal Engine' : grafanaServerUrl}
              </code>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: isEmergencyMode ? '#fbbf24' : 'var(--green)', fontWeight: 700 }}>
              <span className={`status-dot ${isEmergencyMode ? 'warning' : 'online'}`}></span>
              <span>{isEmergencyMode ? 'Local Ready' : 'Online'}</span>
            </div>
          </div>

          {/* Switch Mode Button */}
          <div style={{ textAlign: 'center' }}>
            {isEmergencyMode ? (
              <button
                type="button"
                onClick={() => {
                  setIsEmergencyMode(false);
                  setErrorMessage('');
                  setUsername('');
                  setPassword('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--cyan)',
                  fontSize: 12,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: '4px 8px',
                }}
              >
                ← กลับไปใช้ Grafana Single Sign-On (SSO) ปกติ
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsEmergencyMode(true);
                  setErrorMessage('');
                  if (!username) setUsername(settings.emergencyUsername || 'emergency');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fb923c',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  textDecoration: 'underline',
                  padding: '4px 8px',
                }}
              >
                <AlertTriangle size={13} />
                <span>ไม่สามารถเข้าผ่าน Grafana ได้? เข้าสู่ระบบฉุกเฉิน (Emergency Break-Glass)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
