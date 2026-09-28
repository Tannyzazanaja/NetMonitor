import React, { useState } from 'react';
import {
  Server,
  PlusCircle,
  FileCode,
  Search,
  Copy,
  ExternalLink,
  Edit2,
  Trash2,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { useDevices } from '../../context/DeviceContext';
import { useToast } from '../../context/ToastContext';
import { copyToClipboard } from '../../utils/clipboard';
import { ScannerModal } from '../discovery/ScannerModal';

export function DeviceManagerView({ onOpenAddDevice, onOpenEditDevice, onOpenExportYaml }) {
  const {
    filteredDevices,
    devices,
    deleteDevice,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    typeFilter,
    setTypeFilter,
    uploadToServer,
    refreshFromServer,
  } = useDevices();

  const { showToast } = useToast();
  const [deletingIp, setDeletingIp] = useState(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const handleCopyIp = async (text) => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      showToast('success', 'คัดลอก IP สำเร็จ', `คัดลอก ${text} ไปยัง Clipboard แล้ว`);
    } else {
      showToast('error', 'คัดลอกไม่สำเร็จ', 'เบราว์เซอร์ไม่อนุญาตให้เข้าถึง Clipboard');
    }
  };

  const handleDeleteConfirm = (ip, name) => {
    if (window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบอุปกรณ์ "${name || ip}" (${ip}) ออกจากระบบ?`)) {
      deleteDevice(ip);
    }
  };

  const categories = [
    { id: 'all', label: `ทั้งหมด (${devices.length})` },
    { id: 'network', label: `Network Infra (${devices.filter(d => d.isNetwork).length})` },
    { id: 'server', label: `Servers (${devices.filter(d => d.category === 'server').length})` },
    { id: 'endpoint', label: `Endpoints (${devices.filter(d => d.category === 'endpoint').length})` },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 1. Header Toolbar */}
      <div
        className="panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          padding: '16px 20px',
        }}
      >
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
            <Server size={22} color="var(--primary)" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
              จัดการรายการอุปกรณ์ (Device Manager)
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              จัดการอุปกรณ์ที่เฝ้าระวัง, ตั้งค่า SNMP, และอัพเดตผังเชื่อมโยงอัตโนมัติ
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setIsScannerOpen(true)}
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '7px 14px', borderColor: 'var(--green)', color: 'var(--green)' }}
            title="ค้นหาอุปกรณ์อัตโนมัติในวงแลน"
          >
            <Search size={14} />
            <span>Network Scanner</span>
          </button>
          <button
            onClick={onOpenAddDevice}
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '7px 16px' }}
          >
            <PlusCircle size={14} />
            <span>➕ เพิ่มอุปกรณ์ (Add Device)</span>
          </button>
        </div>
      </div>

      {/* 2. Filter Tabs & Search Bar */}
      <div className="panel" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryFilter(c.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius)',
                  background: categoryFilter === c.id ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid',
                  borderColor: categoryFilter === c.id ? 'var(--primary)' : 'var(--border)',
                  color: categoryFilter === c.id ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: categoryFilter === c.id ? 700 : 500,
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Search & Type Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="ค้นหาชื่อ, IP, สถานที่..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ paddingLeft: 30, fontSize: 12, width: 200 }}
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="form-select"
              style={{ fontSize: 12, width: 170 }}
            >
              <option value="all">ชนิดอุปกรณ์ทั้งหมด</option>
              <option value="firewall">🛡️ Firewall</option>
              <option value="router">🌐 Router</option>
              <option value="l3switch">👑 L3 Switch</option>
              <option value="l2switch">🔀 L2 Switch</option>
              <option value="other">📦 Other</option>
            </select>
          </div>
        </div>

        {/* 3. Devices Table */}
        <div style={{ overflowX: 'auto', marginTop: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '10px 14px' }}>สถานะ</th>
                <th style={{ padding: '10px 14px' }}>ชื่ออุปกรณ์ (Name)</th>
                <th style={{ padding: '10px 14px' }}>IP Address</th>
                <th style={{ padding: '10px 14px' }}>บทบาท (Role)</th>
                <th style={{ padding: '10px 14px' }}>ผู้ผลิต / รุ่น (Vendor & Model)</th>
                <th style={{ padding: '10px 14px' }}>สถานที่</th>
                <th style={{ padding: '10px 14px' }}>Latency</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    ไม่พบอุปกรณ์ในระบบ กดปุ่ม <strong>[+ เพิ่มอุปกรณ์]</strong> เพื่อเพิ่มอุปกรณ์เข้าสู่ระบบ
                  </td>
                </tr>
              ) : (
                filteredDevices.map((dev) => (
                  <tr
                    key={dev.ip}
                    style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.06)', transition: 'background 0.15s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <span className={`status-dot ${dev.status}`}></span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{dev.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>SNMP: {dev.community || 'seavl77'}</div>
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--cyan)' }}>{dev.ip}</span>
                        <button
                          onClick={() => handleCopyIp(dev.ip)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                          title="คัดลอก IP"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        className="badge"
                        style={{
                          background: dev.isFirewall ? 'rgba(239, 68, 68, 0.15)' : dev.isCore ? 'rgba(245, 158, 11, 0.15)' : 'rgba(0, 212, 255, 0.12)',
                          color: dev.isFirewall ? '#f87171' : dev.isCore ? '#fbbf24' : 'var(--primary)',
                          border: `1px solid ${dev.isFirewall ? 'rgba(239, 68, 68, 0.3)' : dev.isCore ? 'rgba(245, 158, 11, 0.3)' : 'rgba(0, 212, 255, 0.3)'}`,
                        }}
                      >
                        {dev.type}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{dev.vendor || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dev.model || dev.os || '—'}</div>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                      {dev.location || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      <span style={{ color: dev.latency > 100 ? 'var(--amber)' : 'var(--green)' }}>
                        {dev.latency} ms
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        <a
                          href={`http://${dev.ip}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-icon"
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          title="เปิด Web Management Console"
                        >
                          <ExternalLink size={12} />
                        </a>
                        <button
                          onClick={() => onOpenEditDevice(dev.ip)}
                          className="btn-icon"
                          title="แก้ไขข้อมูลอุปกรณ์"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteConfirm(dev.ip, dev.name)}
                          className="btn-icon"
                          style={{ color: '#f87171' }}
                          title="ลบอุปกรณ์"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} />
    </div>
  );
}
