import React, { useState } from 'react';
import { Search, Loader2, Server, Globe, Settings2, CheckSquare, Plus, AlertCircle, Wifi } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useDevices } from '../../context/DeviceContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { API_BASE } from '../../services/alertStorage';

export function ScannerModal({ isOpen, onClose }) {
  const { devices, addDevicesBulk } = useDevices();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const { canEdit } = useAuth();

  const [ipRange, setIpRange] = useState('192.168.1.1-254');
  const [community, setCommunity] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedIps, setSelectedIps] = useState(new Set());
  const [hasScanned, setHasScanned] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // ... (handleScan, toggleSelect, toggleAll, handleAddSelected are identical)
  const handleScan = async (e) => {
    e.preventDefault();
    if (!canEdit) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ใช้ระดับ Editor หรือ Admin เท่านั้นที่สามารถสแกนค้นหาอุปกรณ์ได้');
      return;
    }
    if (!ipRange.trim()) {
      showToast('warning', 'กรุณาระบุ IP Range');
      return;
    }

    setIsScanning(true);
    setHasScanned(false);
    setResults([]);
    setSelectedIps(new Set());

    try {
      const res = await fetch(`${API_BASE}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ipRange, community })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Scan failed');
      }

      // Filter out devices that are already in the system
      const existingIps = new Set(devices.map(d => d.ip));
      
      const enrichedResults = data.data.map(r => ({
        ...r,
        isExisting: existingIps.has(r.ip)
      }));

      // Pre-select new devices that have SNMP success
      const toSelect = new Set();
      enrichedResults.forEach(r => {
        if (!r.isExisting && r.status === 'snmp_success') {
          toSelect.add(r.ip);
        }
      });
      setSelectedIps(toSelect);
      setResults(enrichedResults);
      setHasScanned(true);
      
      showToast('success', 'สแกนเสร็จสิ้น', `พบอุปกรณ์ที่ตอบสนอง ${enrichedResults.length} ตัว`);
    } catch (err) {
      showToast('error', 'การสแกนล้มเหลว', err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const toggleSelect = (ip) => {
    const next = new Set(selectedIps);
    if (next.has(ip)) {
      next.delete(ip);
    } else {
      next.add(ip);
    }
    setSelectedIps(next);
  };

  const toggleAll = () => {
    if (selectedIps.size === results.filter(r => !r.isExisting).length) {
      setSelectedIps(new Set());
    } else {
      const next = new Set();
      results.forEach(r => {
        if (!r.isExisting) next.add(r.ip);
      });
      setSelectedIps(next);
    }
  };

  const handleAddSelected = async () => {
    if (!canEdit) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ใช้ระดับ Editor หรือ Admin เท่านั้นที่สามารถเพิ่มอุปกรณ์ได้');
      return;
    }
    if (selectedIps.size === 0) return;
    
    setIsAdding(true);
    let addedCount = 0;
    
    try {
      const devicesToAdd = [];
      for (const ip of selectedIps) {
        const dev = results.find(r => r.ip === ip);
        if (dev) {
          devicesToAdd.push({
            ip: dev.ip,
            name: dev.name || dev.sysName || dev.ip,
            type: dev.type || 'switch',
            vendor: dev.vendor || 'Cisco',
            model: (dev.os || dev.sysDescr || '').substring(0, 50),
            community: dev.community,
            location: 'Discovered',
            module: dev.module || settings?.defaultModule || 'if_mib'
          });
        }
      }
      
      addedCount = await addDevicesBulk(devicesToAdd);
      
      showToast('success', 'เพิ่มอุปกรณ์สำเร็จ', `เพิ่มอุปกรณ์ใหม่จำนวน ${addedCount} ตัวลงในระบบแล้ว`);
      
      // Clear selection and mark as existing
      setSelectedIps(new Set());
      setResults(prev => prev.map(r => 
        selectedIps.has(r.ip) ? { ...r, isExisting: true } : r
      ));
      
    } catch (err) {
      showToast('error', 'เกิดข้อผิดพลาดในการเพิ่มอุปกรณ์', err.message);
    } finally {
      setIsAdding(false);
    }
  };

  if (!isOpen || !canEdit) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📡 Network Scanner (สแกนวงแลน)"
      maxWidth={1000}
    >
      <div className="modal-body" style={{ padding: '20px' }}>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        
        {/* Left Form */}
        <div className="card" style={{ flex: '0 0 350px' }}>
          <div className="card-header">
            <h3><Settings2 size={18} /> ตั้งค่าการสแกน</h3>
          </div>
          <form onSubmit={handleScan} className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="input-group">
              <label className="input-label">เป้าหมาย (IP Range / Subnet)</label>
              <input
                type="text"
                className="form-input"
                placeholder="เช่น 192.168.1.1-254 หรือ 192.168.1.0/24"
                value={ipRange}
                onChange={e => setIpRange(e.target.value)}
                required
                disabled={isScanning}
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                ตัวอย่าง: 10.0.0.1-50, 192.168.1.0/24
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">SNMP Community (ไม่บังคับ)</label>
              <input
                type="password"
                className="form-input"
                placeholder="(ใช้ค่าเริ่มต้นจาก Backend)"
                value={community}
                onChange={e => setCommunity(e.target.value)}
                disabled={isScanning}
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                เว้นว่างไว้เพื่อใช้ SNMP Community เริ่มต้นที่กำหนดไว้ใน Backend
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={isScanning || !ipRange.trim()}
              style={{ marginTop: 8, justifyContent: 'center' }}
            >
              {isScanning ? (
                <><Loader2 size={16} className="spin" /> กำลังสแกนเครือข่าย...</>
              ) : (
                <><Search size={16} /> เริ่มสแกน</>
              )}
            </button>
            
            {isScanning && (
              <div style={{ fontSize: 12, color: 'var(--primary)', textAlign: 'center' }}>
                ระบบกำลัง Ping และ Query SNMP โปรดรอสักครู่...
              </div>
            )}
          </form>
        </div>

        {/* Right Results */}
        <div className="card" style={{ flex: 1 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3><Server size={18} /> ผลการค้นหา</h3>
              {hasScanned && (
                <span style={{ fontSize: 12, padding: '2px 8px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--green)', borderRadius: 12 }}>
                  พบ {results.length} อุปกรณ์
                </span>
              )}
            </div>
            
            {selectedIps.size > 0 && (
              <button 
                className="btn btn-success" 
                onClick={handleAddSelected}
                disabled={isAdding}
              >
                {isAdding ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                เพิ่มอุปกรณ์ที่เลือก ({selectedIps.size})
              </button>
            )}
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {!hasScanned && !isScanning ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                <Globe size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
                <p>ระบุ IP Range ด้านซ้ายแล้วกด <strong>เริ่มสแกน</strong></p>
              </div>
            ) : isScanning ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--primary)' }}>
                <Loader2 size={48} className="spin" style={{ opacity: 0.5, margin: '0 auto 16px' }} />
                <p>กำลังค้นหาอุปกรณ์ในเครือข่าย...</p>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  ขั้นตอนนี้อาจใช้เวลา 5-15 วินาที ขึ้นอยู่กับขนาด Subnet
                </div>
              </div>
            ) : results.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                <AlertCircle size={48} style={{ opacity: 0.2, margin: '0 auto 16px', color: 'var(--amber)' }} />
                <p>ไม่พบอุปกรณ์ใดๆ ที่ตอบสนองใน Range นี้</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 40, textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedIps.size > 0 && selectedIps.size === results.filter(r => !r.isExisting).length}
                          onChange={toggleAll}
                          disabled={results.filter(r => !r.isExisting).length === 0}
                        />
                      </th>
                      <th>IP Address</th>
                      <th>Hostname</th>
                      <th>ประเภท</th>
                      <th>ยี่ห้อ</th>
                      <th>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(r => (
                      <tr key={r.ip} style={{ opacity: r.isExisting ? 0.6 : 1, background: r.isExisting ? 'rgba(0,0,0,0.1)' : 'transparent' }}>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedIps.has(r.ip)}
                            onChange={() => toggleSelect(r.ip)}
                            disabled={r.isExisting}
                          />
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{r.ip}</td>
                        <td style={{ fontWeight: 500 }}>{r.sysName || '-'}</td>
                        <td>
                          {r.type === 'switch' && '🔀 Switch'}
                          {r.type === 'router' && '🌐 Router'}
                          {r.type === 'ap' && '📡 AP'}
                          {r.type === 'firewall' && '🛡️ Firewall'}
                          {r.type === 'server' && '🖥️ Server'}
                          {r.type === 'computer' && '💻 PC/Device'}
                        </td>
                        <td>{r.vendor}</td>
                        <td>
                          {r.isExisting ? (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}><CheckSquare size={12} style={{ display: 'inline', verticalAlign: 'text-bottom' }}/> มีในระบบแล้ว</span>
                          ) : r.status === 'snmp_success' ? (
                            <span style={{ fontSize: 11, color: 'var(--green)' }}>✅ SNMP (OK)</span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--amber)' }} title={r.sysDescr}><Wifi size={12} style={{ display: 'inline', verticalAlign: 'text-bottom' }}/> Ping (No SNMP)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </Modal>
  );
}
