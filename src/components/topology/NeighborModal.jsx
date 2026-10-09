import React from 'react';
import {
  Copy,
  ExternalLink,
  Shield,
  Radio,
  Server,
  ArrowRightLeft,
  PlusCircle,
  CheckCircle2,
  Sparkles,
  Wifi,
  Phone,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { useTopology } from '../../context/TopologyContext';
import { useDevices } from '../../context/DeviceContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { copyToClipboard } from '../../utils/clipboard';

export function NeighborModal({ onOpenAddDevice, onOpenEditDevice }) {
  const { neighborModalNode, closeNeighborModal, refreshTopology } = useTopology();
  const { devices, updateDeviceIp } = useDevices();
  const { showToast } = useToast();
  const { canEdit } = useAuth();

  if (!neighborModalNode) return null;

  const node = neighborModalNode;
  const neighbors = node.connectedNeighbors || [];

  const handleCopyIp = async (text) => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      showToast('success', 'คัดลอก IP สำเร็จ', `คัดลอก ${text} ไปยัง Clipboard แล้ว`);
    } else {
      showToast('error', 'คัดลอกไม่สำเร็จ', 'เบราว์เซอร์ไม่อนุญาตให้เข้าถึง Clipboard');
    }
  };

  const handleAddNeighbor = (nbr) => {
    if (!canEdit) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ใช้ระดับ Editor หรือ Admin เท่านั้นที่สามารถเพิ่มอุปกรณ์ได้');
      return;
    }
    closeNeighborModal();
    if (onOpenAddDevice) {
      onOpenAddDevice({
        ip: nbr.isRealIp ? nbr.ip : '',
        name: nbr.suggestedName || nbr.name || '',
        type: nbr.suggestedType || (nbr.isAp ? 'ap' : 'switch'),
        vendor: nbr.suggestedVendor || '',
        model: nbr.suggestedModel || nbr.platform || '',
      });
    }
  };

  const handleEditNeighbor = (nbrIp) => {
    if (!canEdit) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ใช้ระดับ Editor หรือ Admin เท่านั้นที่สามารถแก้ไขอุปกรณ์ได้');
      return;
    }
    closeNeighborModal();
    if (onOpenEditDevice) {
      onOpenEditDevice(nbrIp);
    }
  };

  const handleFixIpMismatch = (oldIp, targetIp) => {
    if (!canEdit) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ใช้ระดับ Editor หรือ Admin เท่านั้นที่สามารถเปลี่ยน IP ได้');
      return;
    }
    if (updateDeviceIp) {
      updateDeviceIp(oldIp, targetIp);
      closeNeighborModal();
      setTimeout(() => {
        refreshTopology();
      }, 300);
    }
  };

  return (
    <Modal
      isOpen={!!neighborModalNode}
      onClose={closeNeighborModal}
      title="📡 รายละเอียดการเชื่อมต่อพอร์ตและ Real IP ของอุปกรณ์ปลายทาง"
      maxWidth={860}
    >
      <div className="modal-body" style={{ padding: '20px 24px' }}>
        {/* Device Profile Card */}
        <div
          style={{
            padding: '16px 20px',
            borderRadius: 'var(--radius)',
            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%)',
            border: '1px solid rgba(0, 212, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: node.hasIpMismatch ? 14 : 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-sm)',
                background: node.isFirewall ? 'rgba(239, 68, 68, 0.2)' : node.isCore ? 'rgba(245, 158, 11, 0.2)' : 'rgba(0, 212, 255, 0.2)',
                border: `1px solid ${node.isFirewall ? 'var(--red)' : node.isCore ? 'var(--amber)' : 'var(--primary)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {node.isFirewall ? <Shield size={22} color="var(--red)" /> : node.isCore ? <Radio size={22} color="var(--amber)" /> : <Server size={22} color="var(--primary)" />}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                {node.label || node.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>{node.ip}</span>
                <span>·</span>
                <span>{node.vendor ? `${node.vendor}${node.model ? ` · ${node.model}` : ''}` : (node.model || node.os || 'Network Device')}</span>
                <span>·</span>
                <span style={{ color: node.status === 'online' ? 'var(--green)' : 'var(--red)' }}>
                  ● {node.status}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleCopyIp(node.ip)}
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: '6px 10px' }}
              title="คัดลอก IP"
            >
              <Copy size={13} />
              <span>Copy IP</span>
            </button>
            <a
              href={`http://${node.ip}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
              style={{ fontSize: 11, padding: '6px 12px' }}
            >
              <ExternalLink size={13} />
              <span>Web Console</span>
            </a>
          </div>
        </div>

        {/* IP Typo Auto-Correction Banner */}
        {node.hasIpMismatch && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius)',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 18,
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--amber)' }}>
              <AlertTriangle size={18} />
              <span>
                ตรวจพบข้อมูล SNMP บน Prometheus อยู่ที่ IP <strong style={{ color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>{node.effectiveIp}</strong> (แทน {node.ip})
              </span>
            </div>
            {canEdit && (
              <button
                onClick={() => handleFixIpMismatch(node.ip, node.effectiveIp)}
                className="btn btn-primary"
                style={{
                  fontSize: 11,
                  padding: '5px 12px',
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#000',
                  border: 'none',
                  boxShadow: '0 0 10px rgba(245, 158, 11, 0.4)',
                }}
              >
                🔧 อัพเดต IP เป็น {node.effectiveIp} ทันที
              </button>
            )}
          </div>
        )}

        {/* Neighbors Table Header */}
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={15} color="var(--primary)" />
            <span>พอร์ตที่เชื่อมต่อกับอุปกรณ์อื่น ({neighbors.length} Links)</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            💡 ค้นหาและแปลง Real IP อัตโนมัติจาก MAC Table, Catalog และจำแนก VoIP / AP
          </div>
        </div>

        {neighbors.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '36px',
              borderRadius: 'var(--radius)',
              background: 'rgba(15, 23, 42, 0.5)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              fontSize: 12,
            }}
          >
            ไม่พบข้อมูลการเชื่อมต่อพอร์ตโดยตรงกับอุปกรณ์อื่นในระบบ
          </div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 12px' }}>Local Port</th>
                  <th style={{ padding: '10px 6px', textAlign: 'center' }}>⇄</th>
                  <th style={{ padding: '10px 12px' }}>Remote Port</th>
                  <th style={{ padding: '10px 12px' }}>Connected Device</th>
                  <th style={{ padding: '10px 12px' }}>Remote IP (Real)</th>
                  <th style={{ padding: '10px 12px' }}>Protocol</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {neighbors.map((nbr, idx) => {
                  const isExisting = nbr.isRealIp && devices.some((d) => d.ip === nbr.ip);

                  return (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
                        background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent')}
                    >
                      {/* Local Port */}
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--primary)' }}>
                        {nbr.localPort || '—'}
                      </td>

                      {/* Arrow */}
                      <td style={{ padding: '10px 6px', color: 'var(--text-muted)', textAlign: 'center' }}>
                        <ArrowRightLeft size={12} />
                      </td>

                      {/* Remote Port */}
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--purple)' }}>
                        {nbr.remotePort || '—'}
                      </td>

                      {/* Connected Device Name */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {nbr.name || nbr.rawName}
                        </div>
                        {nbr.rawName && nbr.name !== nbr.rawName && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            ID: {nbr.rawName}
                          </div>
                        )}
                      </td>

                      {/* Real Remote IP / Device Category Badge */}
                      <td style={{ padding: '10px 12px' }}>
                        {nbr.isRealIp ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                color: 'var(--cyan)',
                                fontSize: 12,
                              }}
                            >
                              {nbr.ip}
                            </span>
                            {nbr.resolutionMethod && (
                              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                                ✓ {nbr.resolutionMethod}
                              </span>
                            )}
                          </div>
                        ) : nbr.isVoip ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: 4,
                              background: 'rgba(56, 189, 248, 0.15)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.35)',
                            }}
                            title="อุปกรณ์เป็นโทรศัพท์ไอพี (VoIP Phone) เสียบสาย WAN ผ่านพอร์ตสวิตช์"
                          >
                            <Phone size={12} />
                            <span>DHCP (VoIP Phone)</span>
                          </span>
                        ) : nbr.isAp ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: 4,
                              background: 'rgba(245, 158, 11, 0.15)',
                              color: '#fbbf24',
                              border: '1px solid rgba(245, 158, 11, 0.35)',
                            }}
                            title="อุปกรณ์เป็น Access Point ปลายทางที่รับ DHCP หรือผ่าน Controller"
                          >
                            <Wifi size={12} />
                            <span>DHCP (Access Point)</span>
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 10,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: 'rgba(148, 163, 184, 0.1)',
                              color: 'var(--text-muted)',
                              border: '1px solid rgba(148, 163, 184, 0.2)',
                            }}
                          >
                            <HelpCircle size={11} />
                            <span>ไม่ระบุ IP (Manual)</span>
                          </span>
                        )}
                      </td>

                      {/* Protocol */}
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: nbr.protocol === 'CDP' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: nbr.protocol === 'CDP' ? '#60a5fa' : '#34d399',
                            border: `1px solid ${nbr.protocol === 'CDP' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                          }}
                        >
                          {nbr.protocol}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          {canEdit && (
                            isExisting ? (
                              <button
                                onClick={() => handleEditNeighbor(nbr.ip)}
                                className="btn btn-secondary"
                                style={{
                                  fontSize: 11,
                                  padding: '3px 8px',
                                  gap: 4,
                                  color: 'var(--green)',
                                  borderColor: 'rgba(16, 185, 129, 0.3)',
                                  background: 'rgba(16, 185, 129, 0.08)',
                                }}
                                title="อุปกรณ์นี้อยู่ในระบบแล้ว คลิกเพื่อแก้ไขข้อมูล"
                              >
                                <CheckCircle2 size={12} color="var(--green)" />
                                <span>ในระบบแล้ว</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleAddNeighbor(nbr)}
                                className="btn btn-primary"
                                style={{
                                  fontSize: 11,
                                  padding: '4px 10px',
                                  gap: 4,
                                  fontWeight: 700,
                                  background: 'linear-gradient(135deg, #00d4ff 0%, #0284c7 100%)',
                                  boxShadow: '0 0 10px rgba(0, 212, 255, 0.3)',
                                }}
                                title="คลิกเพื่อเพิ่มอุปกรณ์นี้ลงในระบบมอนิเตอร์และผังเครือข่าย"
                              >
                                <PlusCircle size={13} />
                                <span>+ เพิ่มลงระบบ</span>
                              </button>
                            )
                          )}

                          {nbr.isRealIp && (
                            <>
                              <button
                                onClick={() => handleCopyIp(nbr.ip)}
                                className="btn-icon"
                                style={{ width: 26, height: 26 }}
                                title="คัดลอก IP"
                              >
                                <Copy size={11} />
                              </button>
                              <a
                                href={`http://${nbr.ip}`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-icon"
                                style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                title="เปิด Web Console"
                              >
                                <ExternalLink size={11} />
                              </a>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button onClick={closeNeighborModal} className="btn btn-secondary" style={{ padding: '7px 18px' }}>
          ปิดหน้าต่าง
        </button>
      </div>
    </Modal>
  );
}
