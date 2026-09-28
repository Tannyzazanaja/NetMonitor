import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Zap, Server, Shield, Radio, CheckCircle2, AlertCircle, Info, Sparkles, Phone } from 'lucide-react';
import { Modal } from '../common/Modal';
import { detectOSAndType } from '../../services/deviceClassifier';
import { useDevices } from '../../context/DeviceContext';
import { useSettings } from '../../context/SettingsContext';
import { useTopology } from '../../context/TopologyContext';
import { useToast } from '../../context/ToastContext';

export function DeviceFormModal({ isOpen, onClose, initialIp = null, initialData = null }) {
  const { devices, addOrUpdateDevice, autoDetect } = useDevices();
  const { settings } = useSettings();
  const { refreshTopology } = useTopology();
  const { showToast } = useToast();

  const [ip, setIp] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('l2switch');
  const [vendor, setVendor] = useState('Cisco');
  const [model, setModel] = useState('');
  const [location, setLocation] = useState('');
  const [community, setCommunity] = useState('');
  const [module, setModule] = useState(settings?.defaultModule || 'if_mib');

  const [isDetecting, setIsDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState(null);

  // Keep track of whether modal was previously closed to initialize only on open transition
  const prevOpenRef = useRef(false);

  // Check if current IP already exists in the system
  const duplicateDevice = useMemo(() => {
    const cleanIp = ip.trim();
    if (!cleanIp) return null;
    if (initialIp) {
      // In edit mode: conflict only if changed to another existing device's IP
      return devices.find((d) => d.ip === cleanIp && d.ip !== initialIp) || null;
    }
    // In add mode: conflict if matches any existing device
    return devices.find((d) => d.ip === cleanIp) || null;
  }, [ip, initialIp, devices]);

  const isDuplicateIp = !!duplicateDevice;

  // Check if current Name already exists on another device (case-insensitive)
  const duplicateNameDevice = useMemo(() => {
    const cleanName = (name || '').trim().toLowerCase();
    if (!cleanName) return null;
    if (initialIp) {
      // In edit mode: conflict if another device (different IP) has the same name
      return devices.find((d) => (d.name || '').trim().toLowerCase() === cleanName && d.ip !== initialIp) || null;
    }
    // In add mode: conflict if any existing device has the same name
    return devices.find((d) => (d.name || '').trim().toLowerCase() === cleanName) || null;
  }, [name, initialIp, devices]);

  const isDuplicateName = !!duplicateNameDevice;
  const isFormBlocked = isDuplicateIp || isDuplicateName;

  useEffect(() => {
    // Only populate / initialize form when the modal opens (transitions from closed -> open)
    // or when the targeted initialIp / initialData changes.
    // NEVER re-run or wipe form data when background Prometheus metrics update the devices list!
    if (isOpen && (!prevOpenRef.current || initialIp !== undefined || initialData !== undefined)) {
      if (initialIp) {
        const existing = devices.find((d) => d.ip === initialIp);
        if (existing) {
          setIp(existing.ip || '');
          setName(existing.name || existing.ip || '');
          setType(existing.type || 'switch');
          setVendor(existing.vendor || 'Cisco');
          setModel(existing.model || existing.os || '');
          setLocation(existing.location || '');
          setCommunity(existing.community || '');
          setModule(existing.module || settings?.defaultModule || 'if_mib');
        }
      } else if (initialData) {
        // Pre-fill from Connected Link / Neighbor Discovery
        setIp(initialData.ip || '');
        setName(initialData.name && initialData.name !== initialData.ip ? initialData.name : '');
        setType(initialData.type || 'switch');
        setVendor(initialData.vendor || (initialData.type === 'phone' ? 'Fanvil' : 'Cisco'));
        setModel(initialData.model || initialData.os || '');
        setLocation(initialData.location || '');
        setCommunity(initialData.community || '');
        setModule(initialData.module || settings?.defaultModule || 'if_mib');
      } else if (!prevOpenRef.current) {
        // Reset only if newly opened as clean "Add Device"
        setIp('');
        setName('');
        setType('switch');
        setVendor('Cisco');
        setModel('');
        setLocation('');
        setCommunity('');
        setModule(settings?.defaultModule || 'if_mib');
      }
      setDetectResult(null);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, initialIp, initialData, settings?.defaultModule]);

  const handleAutoDetect = async () => {
    if (!ip.trim()) {
      showToast('warning', 'กรุณากรอก IP', 'ต้องระบุ IP Address ก่อนทำ Auto-Detect');
      return;
    }

    setIsDetecting(true);
    setDetectResult(null);

    try {
      const info = await autoDetect(ip.trim());
      if (info) {
        // Auto-fill values if available
        if (info.sysName && !name) {
          setName(info.sysName);
        }

        const detectedProfile = detectOSAndType({
          name: info.sysName || name || ip,
          sysDescr: info.sysDescr || '',
          model: info.sysDescr || '',
          raw: `${info.sysName} ${info.sysDescr}`,
        });

        setType(detectedProfile.type);
        setVendor(detectedProfile.vendor);
        setModel(detectedProfile.model || '');

        setDetectResult({
          success: true,
          sysName: info.sysName,
          sysDescr: info.sysDescr,
          neighbors: info.neighbors || [],
        });

        showToast(
          'success',
          'Auto-Detect สำเร็จ!',
          `พบอุปกรณ์ ${info.sysName || ip} (${detectedProfile.label})`
        );
      } else {
        setDetectResult({
          success: false,
          message: 'ไม่สามารถติดต่ออุปกรณ์ผ่าน SNMP ได้ (อาจเป็นเพราะ Community String ไม่ตรง หรืออุปกรณ์ออฟไลน์)',
        });
        showToast('warning', 'ไม่พบข้อมูล SNMP', 'กรุณาตรวจสอบว่าอุปกรณ์เปิด SNMP v2c และ Prometheus สแกนถึง');
      }
    } catch (err) {
      setDetectResult({
        success: false,
        message: err.message,
      });
      showToast('error', 'Auto-Detect ผิดพลาด', err.message);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!ip.trim()) {
      showToast('warning', 'ข้อมูลไม่ครบ', 'กรุณากรอก IP Address');
      return;
    }

    if (isDuplicateIp) {
      showToast(
        'error',
        'IP Address ซ้ำในระบบ',
        `IP ${ip.trim()} มีอยู่ในระบบแล้ว (${duplicateDevice?.name || duplicateDevice?.ip}) ไม่สามารถเพิ่มซ้ำได้ ต้องลบอุปกรณ์เดิมออกก่อน หรือแก้ไขข้อมูลเดิมแทน`
      );
      return;
    }

    if (isDuplicateName) {
      showToast(
        'error',
        'ชื่ออุปกรณ์ซ้ำในระบบ',
        `ชื่อ "${name.trim()}" มีอยู่ในระบบแล้ว (${duplicateNameDevice?.name || duplicateNameDevice?.ip} - IP: ${duplicateNameDevice?.ip}) ระบบไม่อนุญาตให้ใช้ชื่อซ้ำกัน กรุณาเปลี่ยนชื่ออุปกรณ์ใหม่`
      );
      return;
    }

    try {
      const devicePayload = {
        ip: ip.trim(),
        name: name.trim() || ip.trim(),
        type,
        vendor,
        model,
        location,
        module,
      };
      if (community && community.trim() && community.trim() !== '***') {
        devicePayload.community = community.trim();
      }

      addOrUpdateDevice(
        devicePayload,
        !!initialIp,
        initialIp
      );

      // Recalculate topology links
      setTimeout(() => {
        refreshTopology();
      }, 500);

      showToast(
        'success',
        initialIp ? 'แก้ไขอุปกรณ์สำเร็จ' : 'เพิ่มอุปกรณ์สำเร็จ!',
        `อุปกรณ์ ${name || ip} ถูกบันทึกและระบบกำลังเชื่อมโยงสายเข้าผัง Topology อัตโนมัติ`
      );

      onClose();
    } catch (err) {
      showToast('error', 'บันทึกไม่สำเร็จ', err.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialIp ? '⚙️ แก้ไขข้อมูลอุปกรณ์' : '➕ เพิ่มอุปกรณ์เข้าสู่ระบบมอนิเตอร์'}
      maxWidth={620}
    >
      <form onSubmit={handleSubmit} className="modal-body" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* IP Address & Auto Detect */}
          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>IP Address <span style={{ color: 'var(--red)' }}>*</span></span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>IPv4 ที่ต้องการมอนิเตอร์</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="เช่น 192.168.1.10 หรือ 10.0.0.1"
                className="form-input"
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-mono)',
                  borderColor: isDuplicateIp ? 'var(--red)' : undefined,
                  background: isDuplicateIp ? 'rgba(239, 68, 68, 0.05)' : undefined,
                }}
                autoFocus={!ip}
                required
              />
              <button
                type="button"
                onClick={handleAutoDetect}
                disabled={isDetecting || !ip.trim()}
                className="btn btn-secondary"
                style={{ whiteSpace: 'nowrap', gap: 6, minWidth: 120 }}
                title="ดึงข้อมูลชื่อและรุ่นผ่าน SNMP อัตโนมัติ"
              >
                <Zap size={14} color={isDetecting ? 'var(--text-muted)' : 'var(--amber)'} />
                <span>{isDetecting ? 'กำลังค้นหา...' : 'Auto-Detect'}</span>
              </button>
            </div>

            {/* Duplicate IP Alert Banner */}
            {isDuplicateIp && (
              <div
                style={{
                  marginTop: 8,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
                <AlertCircle size={18} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#f87171' }}>
                    ❌ IP Address นี้มีอยู่ในระบบแล้ว ({duplicateDevice.name || duplicateDevice.ip})
                  </div>
                  <div style={{ color: '#fca5a5', marginTop: 2, lineHeight: 1.4 }}>
                    ระบบไม่อนุญาตให้เพิ่ม IP ซ้ำ กรุณาไป<strong>ลบอุปกรณ์เดิมออกก่อน</strong> หรือเลือก<strong>แก้ไข (Edit)</strong> แทน
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Auto-detect result banner */}
          {detectResult && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius)',
                background: detectResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                border: `1px solid ${detectResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: detectResult.success ? 'var(--green)' : 'var(--amber)' }}>
                {detectResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{detectResult.success ? 'ตรวจพบข้อมูลจาก SNMP' : 'ผลการตรวจสอบ'}</span>
              </div>
              {detectResult.success && (
                <div style={{ marginTop: 6, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div>Hostname: <strong style={{ color: 'var(--text-primary)' }}>{detectResult.sysName || 'N/A'}</strong></div>
                  <div>SysDescr: <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{detectResult.sysDescr?.slice(0, 70)}...</span></div>
                  {detectResult.neighbors?.length > 0 && (
                    <div>Neighbors: <strong style={{ color: 'var(--primary)' }}>{detectResult.neighbors.join(', ')}</strong></div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Device Name */}
          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>ชื่ออุปกรณ์ (Device Name / Hostname)</span>
              <span style={{ fontSize: 11, color: isDuplicateName ? 'var(--red)' : 'var(--text-muted)' }}>
                {isDuplicateName ? '❌ ชื่อนี้ถูกใช้งานแล้ว' : 'ชื่อต้องไม่ซ้ำกับอุปกรณ์อื่นในระบบ'}
              </span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น Core-SW-01, Firewall-Edge, SW-HR, Server-App"
              className="form-input"
              style={{
                borderColor: isDuplicateName ? 'var(--red)' : undefined,
                background: isDuplicateName ? 'rgba(239, 68, 68, 0.05)' : undefined,
              }}
            />

            {/* Duplicate Name Alert Banner */}
            {isDuplicateName && (
              <div
                style={{
                  marginTop: 8,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
                <AlertCircle size={18} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#f87171' }}>
                    ❌ ชื่ออุปกรณ์นี้ซ้ำกับอุปกรณ์อื่นในระบบ ({duplicateNameDevice.name} - IP: {duplicateNameDevice.ip})
                  </div>
                  <div style={{ color: '#fca5a5', marginTop: 2, lineHeight: 1.4 }}>
                    ระบบไม่อนุญาตให้ใช้ชื่ออุปกรณ์ซ้ำกัน กรุณาตั้งชื่ออื่นที่ไม่ซ้ำกับอุปกรณ์ที่มีอยู่
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Role & Vendor */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="input-group">
              <label className="input-label">ประเภทอุปกรณ์ (Device Role)</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="form-select"
              >
                {/* Ordered strictly from Tier 1 down */}
                <option value="router">🌐 Router</option>
                <option value="firewall">🛡️ Firewall</option>
                <option value="l3switch">👑 L3 Switch</option>
                <option value="l2switch">🔀 L2 Switch</option>
                <option value="other">📦 Other</option>
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">ผู้ผลิต (Vendor / Brand)</label>
              <select
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="form-select"
              >
                <option value="Cisco">Cisco Systems</option>
                <option value="Fortinet">Fortinet (FortiGate)</option>
                <option value="Ruijie">Ruijie Networks / Reyee</option>
                <option value="MikroTik">MikroTik RouterOS</option>
                <option value="Huawei">Huawei</option>
                <option value="Aruba">Aruba / HPE</option>
                <option value="Dell">Dell Networking</option>
                <option value="Ruckus">Ruckus Networks</option>
                <option value="Ubiquiti">Ubiquiti Networks</option>
                <option value="Linux">Linux / Generic SNMP</option>
                <option value="Windows">Windows Server</option>
                <option value="Other">Other / Custom</option>
              </select>
            </div>
          </div>

          {/* Model & Location */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="input-group">
              <label className="input-label">รุ่นอุปกรณ์ (Model / Series)</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="เช่น Catalyst 9200, FortiGate 100F, V61G, RG-RAP2260"
                className="form-input"
              />
            </div>

            <div className="input-group">
              <label className="input-label">สถานที่ติดตั้ง (Location / Site)</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="เช่น MDF Server Room, Office Floor 2"
                className="form-input"
              />
            </div>
          </div>

          {/* SNMP Settings */}
          <div
            style={{
              padding: '14px 16px',
              background: 'rgba(15, 23, 42, 0.6)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Info size={14} color="var(--primary)" />
              <span>การตั้งค่า SNMP Connection</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label" style={{ fontSize: 11 }}>SNMP Community Override</label>
                <input
                  type="password"
                  value={community}
                  onChange={(e) => setCommunity(e.target.value)}
                  placeholder="(ใช้ค่าเริ่มต้นจาก Backend)"
                  className="form-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </div>

              <div className="input-group">
                <label className="input-label" style={{ fontSize: 11 }}>SNMP Exporter Module</label>
                <select
                  value={module}
                  onChange={(e) => setModule(e.target.value)}
                  className="form-select"
                  style={{ fontSize: 12 }}
                >
                  <option value="if_mib">if_mib (Standard Interfaces)</option>
                  <option value="cisco_switch">cisco_switch (Cisco Switches & Routers)</option>
                  <option value="aruba_switch">aruba_switch (HP / Aruba Switches)</option>
                  <option value="host_resources">host_resources (Linux / Windows Servers)</option>
                  <option value="synology">synology (Storage / NAS)</option>
                  <option value="apcups">apcups (APC Smart-UPS)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ marginTop: 20, padding: 0 }}>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={isFormBlocked}
            className="btn btn-primary"
            style={{
              minWidth: 130,
              opacity: isFormBlocked ? 0.5 : 1,
              cursor: isFormBlocked ? 'not-allowed' : 'pointer',
            }}
            title={
              isDuplicateIp
                ? 'ไม่สามารถบันทึกได้เนื่องจาก IP ซ้ำกับอุปกรณ์ที่มีอยู่'
                : isDuplicateName
                ? 'ไม่สามารถบันทึกได้เนื่องจากชื่ออุปกรณ์ซ้ำกับอุปกรณ์ที่มีอยู่'
                : ''
            }
          >
            {initialIp ? 'บันทึกการแก้ไข' : 'เพิ่มอุปกรณ์'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
