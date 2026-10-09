import React, { useState } from 'react';
import {
  Shield,
  Server,
  Activity,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Sparkles,
  Layers,
  Globe,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export function SetupWizard({ onComplete }) {
  const { showToast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);

  const defaultHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  const [formData, setFormData] = useState({
    orgName: 'Enterprise Network Monitoring Platform',
    prometheusUrl: `http://${defaultHost}:9090`,
    grafanaUrl: `http://${defaultHost}:3000`,
    defaultCommunity: 'public',
    defaultModule: 'if_mib',
    defaultDiscoveryCidr: '192.168.1.0/24',
    wanInterface: 'GigabitEthernet0/0/0',
    adminUsername: 'admin',
    adminPassword: '',
    confirmPassword: '',
  });

  const handleChange = (field, val) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const testPrometheusConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const url = formData.prometheusUrl.replace(/\/+$/, '') + '/api/v1/query?query=up';
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        setTestResult({ ok: true, message: 'Connected successfully to Prometheus API' });
      } else {
        setTestResult({ ok: false, message: `Prometheus responded with HTTP ${res.status}` });
      }
    } catch (err) {
      setTestResult({ ok: false, message: `Unable to reach Prometheus: ${err.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!formData.orgName.trim()) {
        showToast('error', 'Missing Information', 'Please provide an Organization Name');
        return;
      }
    }
    if (currentStep === 2) {
      if (!formData.prometheusUrl.trim()) {
        showToast('error', 'Missing Information', 'Please provide a valid Prometheus Server URL');
        return;
      }
    }
    if (currentStep === 4) {
      if (!formData.adminPassword) {
        showToast('error', 'Missing Password', 'Please specify an Administrator Break-Glass Password');
        return;
      }
      if (formData.adminPassword.length < 6) {
        showToast('error', 'Password Too Short', 'Administrator password must be at least 6 characters');
        return;
      }
      if (formData.adminPassword !== formData.confirmPassword) {
        showToast('error', 'Password Mismatch', 'Passwords do not match');
        return;
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, 5));
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgName: formData.orgName,
          prometheusUrl: formData.prometheusUrl,
          grafanaUrl: formData.grafanaUrl,
          defaultCommunity: formData.defaultCommunity,
          defaultDiscoveryCidr: formData.defaultDiscoveryCidr,
          wanInterface: formData.wanInterface,
          adminUsername: formData.adminUsername,
          adminPassword: formData.adminPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to complete setup');
      }

      showToast('success', 'Setup Complete', 'NetMonitor initialized successfully');
      if (onComplete) {
        onComplete(data.user, data.settings);
      }
    } catch (err) {
      showToast('error', 'Setup Error', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { num: 1, title: 'Organization' },
    { num: 2, title: 'Metrics Backend' },
    { num: 3, title: 'Discovery & SNMP' },
    { num: 4, title: 'Admin Account' },
    { num: 5, title: 'Review & Deploy' },
  ];

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
      {/* Decorative Grid */}
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

      <div
        style={{
          width: '100%',
          maxWidth: 680,
          background: 'rgba(10, 15, 30, 0.92)',
          backdropFilter: 'blur(20px)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid rgba(0, 212, 255, 0.3)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(0, 212, 255, 0.15)',
          padding: '36px 32px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.2) 0%, rgba(59, 130, 246, 0.25) 100%)',
              border: '1px solid rgba(0, 212, 255, 0.4)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
              marginBottom: 12,
            }}
          >
            <Shield size={28} color="var(--primary)" />
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
            NETMONITOR SETUP WIZARD
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            First-Run Onboarding &bull; Enterprise Network Monitoring Platform
          </p>
        </div>

        {/* Stepper Progress */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, position: 'relative' }}>
          {steps.map((s, idx) => (
            <div
              key={s.num}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                zIndex: 2,
                flex: 1,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: currentStep === s.num
                    ? 'var(--primary)'
                    : (currentStep > s.num ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.1)'),
                  color: currentStep === s.num
                    ? '#000'
                    : (currentStep > s.num ? 'var(--green)' : 'var(--text-muted)'),
                  border: currentStep === s.num
                    ? '2px solid #fff'
                    : (currentStep > s.num ? '1px solid var(--green)' : '1px solid rgba(148, 163, 184, 0.2)'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 13,
                  boxShadow: currentStep === s.num ? '0 0 15px rgba(0, 212, 255, 0.6)' : 'none',
                  transition: 'all 0.3s ease',
                }}
              >
                {currentStep > s.num ? '✓' : s.num}
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: currentStep === s.num ? 700 : 500,
                  color: currentStep === s.num ? 'var(--primary)' : 'var(--text-muted)',
                  textAlign: 'center',
                }}
              >
                {s.title}
              </span>
            </div>
          ))}
        </div>

        {/* Wizard Form Body */}
        <div style={{ minHeight: 280, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {/* Step 1: Organization Branding */}
          {currentStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Organization / Company Name *</label>
                <input
                  type="text"
                  value={formData.orgName}
                  onChange={(e) => handleChange('orgName', e.target.value)}
                  placeholder="e.g. Enterprise Global Network"
                  className="form-input"
                  required
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Displayed in the top navigation bar, browser tabs, and notification alerts.
                </span>
              </div>

              <div className="input-group">
                <label className="input-label">WAN / Gateway Interface</label>
                <input
                  type="text"
                  value={formData.wanInterface}
                  onChange={(e) => handleChange('wanInterface', e.target.value)}
                  placeholder="e.g. GigabitEthernet0/0/0 or TenGigabitEthernet1/0/1"
                  className="form-input"
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Interface name queried for real-time Internet throughput telemetry.
                </span>
              </div>
            </div>
          )}

          {/* Step 2: Metrics Backend */}
          {currentStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Prometheus Server API URL *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={formData.prometheusUrl}
                    onChange={(e) => handleChange('prometheusUrl', e.target.value)}
                    placeholder="http://localhost:9090"
                    className="form-input"
                    style={{ fontFamily: 'var(--font-mono)' }}
                    required
                  />
                  <button
                    type="button"
                    onClick={testPrometheusConnection}
                    disabled={isTesting}
                    className="btn btn-secondary"
                    style={{ whiteSpace: 'nowrap', fontSize: 12, padding: '0 14px' }}
                  >
                    <RefreshCw size={13} className={isTesting ? 'animate-spin' : ''} />
                    <span>{isTesting ? 'Testing...' : 'Test'}</span>
                  </button>
                </div>
                {testResult && (
                  <div
                    style={{
                      fontSize: 11,
                      marginTop: 4,
                      color: testResult.ok ? 'var(--green)' : 'var(--red)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {testResult.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>

              <div className="input-group">
                <label className="input-label">Grafana Auth & User Management URL (Port 3000)</label>
                <input
                  type="text"
                  value={formData.grafanaUrl}
                  onChange={(e) => handleChange('grafanaUrl', e.target.value)}
                  placeholder="http://localhost:3000"
                  className="form-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Used for User Management and Login SSO verification (defaults to http://localhost:3000).
                </span>
              </div>
            </div>
          )}

          {/* Step 3: Discovery & SNMP */}
          {currentStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="input-group">
                  <label className="input-label">Default SNMP Community</label>
                  <input
                    type="text"
                    value={formData.defaultCommunity}
                    onChange={(e) => handleChange('defaultCommunity', e.target.value)}
                    placeholder="public"
                    className="form-input"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Default SNMP Module</label>
                  <select
                    value={formData.defaultModule}
                    onChange={(e) => handleChange('defaultModule', e.target.value)}
                    className="form-select"
                  >
                    <option value="if_mib">if_mib (Universal Standard)</option>
                    <option value="cisco_switch">cisco_switch (Cisco IOS / Catalyst)</option>
                    <option value="aruba_switch">aruba_switch (Aruba / ProCurve)</option>
                    <option value="host_resources">host_resources (Servers / Linux)</option>
                  </select>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Default Auto-Discovery Subnet / CIDR</label>
                <input
                  type="text"
                  value={formData.defaultDiscoveryCidr}
                  onChange={(e) => handleChange('defaultDiscoveryCidr', e.target.value)}
                  placeholder="192.168.1.0/24"
                  className="form-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  The default IP subnet proposed when opening the network scanner.
                </span>
              </div>
            </div>
          )}

          {/* Step 4: Admin Account Credentials */}
          {currentStep === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Administrator Username</label>
                <input
                  type="text"
                  value={formData.adminUsername}
                  onChange={(e) => handleChange('adminUsername', e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label">Master Break-Glass Password * (Min 6 characters)</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.adminPassword}
                    onChange={(e) => handleChange('adminPassword', e.target.value)}
                    placeholder="Enter secure master password"
                    className="form-input"
                    style={{ paddingRight: 40 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Confirm Master Password *</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => handleChange('confirmPassword', e.target.value)}
                  placeholder="Confirm password"
                  className="form-input"
                  required
                />
              </div>
            </div>
          )}

          {/* Step 5: Review & Deploy */}
          {currentStep === 5 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(148, 163, 184, 0.15)',
                  borderRadius: 'var(--radius)',
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Organization:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{formData.orgName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Prometheus API:</span>
                  <code style={{ color: 'var(--cyan)' }}>{formData.prometheusUrl}</code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Grafana Auth Server:</span>
                  <code style={{ color: 'var(--text-secondary)' }}>{formData.grafanaUrl || 'http://localhost:3000'}</code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Default Discovery CIDR:</span>
                  <code style={{ color: 'var(--amber)' }}>{formData.defaultDiscoveryCidr}</code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Administrator:</span>
                  <strong style={{ color: 'var(--green)' }}>{formData.adminUsername} (Configured)</strong>
                </div>
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}
              >
                Ready to initialize! Your settings will be persisted to backend storage and your administrative session will start immediately.
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, borderTop: '1px solid rgba(148, 163, 184, 0.15)', paddingTop: 20 }}>
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={handlePrev}
              className="btn btn-secondary"
              style={{ fontSize: 13, padding: '8px 18px' }}
            >
              <ArrowLeft size={15} /> Back
            </button>
          ) : <div />}

          {currentStep < 5 ? (
            <button
              type="button"
              onClick={handleNext}
              className="btn btn-primary"
              style={{ fontSize: 13, padding: '8px 22px' }}
            >
              Continue <ArrowRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="btn btn-primary"
              style={{
                fontSize: 13,
                padding: '8px 24px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                borderColor: '#10b981',
              }}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={15} className="animate-spin" /> Initializing...
                </>
              ) : (
                <>
                  <Sparkles size={15} /> Initialize Platform
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
