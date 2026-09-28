import React from 'react';
import {
  Shield,
  Radio,
  Server,
  Network,
  Copy,
  ExternalLink,
  Search,
  ArrowRightLeft,
} from 'lucide-react';
import { useTopology } from '../../context/TopologyContext';
import { useToast } from '../../context/ToastContext';
import { copyToClipboard } from '../../utils/clipboard';

export function TopologyGrid({ onOpenAddDevice }) {
  const { topoNodes, topoLinks, openNeighborModal } = useTopology();
  const { showToast } = useToast();

  const handleCopyIp = async (text) => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      showToast('success', 'คัดลอก IP สำเร็จ', `คัดลอก ${text} ไปยัง Clipboard แล้ว`);
    } else {
      showToast('error', 'คัดลอกไม่สำเร็จ', 'เบราว์เซอร์ไม่อนุญาตให้เข้าถึง Clipboard');
    }
  };

  if (topoNodes.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '60px 24px',
          background: 'rgba(13, 17, 32, 0.7)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          maxWidth: 640,
          margin: '40px auto',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 12 }}>🏢</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
          ยังไม่มีอุปกรณ์ในผังโครงสร้างเครือข่าย
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
          เริ่มต้นด้วยการกดปุ่ม <strong>[+ เพิ่มอุปกรณ์]</strong> (เช่น Core Switch หรือ Firewall)<br />
          จากนั้นเมื่อเพิ่มอุปกรณ์ตัวถัดไป ระบบจะค้นหาและเชื่อมโยงสาย (CDP/LLDP) เข้าหาอุปกรณ์ที่เพิ่มไว้ก่อนหน้าให้อัตโนมัติ
        </div>
        <button onClick={onOpenAddDevice} className="btn btn-primary" style={{ padding: '10px 24px', fontSize: 13 }}>
          ➕ เพิ่มอุปกรณ์ตัวแรก (Add Device)
        </button>
      </div>
    );
  }

  // Group nodes by tier
  const tier1_Firewall = topoNodes.filter(n => n.tier === 0);
  const tier2_Core     = topoNodes.filter(n => n.tier === 1);
  const tier3_Dist     = topoNodes.filter(n => n.tier === 2);
  const tier4_Access   = topoNodes.filter(n => n.tier === 3);
  const tier_Unlinked  = topoNodes.filter(n => n.tier === 4);

  const renderInfraCard = (node) => {
    // Find links for this node
    const connectedLinks = topoLinks.filter(l => l.source === node.ip || l.target === node.ip);

    const isFw = node.isFirewall;
    const isCore = node.isCore;
    const accentColor = isFw ? 'var(--red)' : isCore ? 'var(--amber)' : 'var(--primary)';

    return (
      <div
        key={node.ip}
        className="panel"
        style={{
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          borderLeft: `4px solid ${accentColor}`,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 'var(--radius-sm)',
                background: isFw ? 'rgba(239, 68, 68, 0.15)' : isCore ? 'rgba(245, 158, 11, 0.15)' : 'rgba(0, 212, 255, 0.15)',
                border: `1px solid ${accentColor}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isFw ? <Shield size={20} color="var(--red)" /> : isCore ? <Radio size={20} color="var(--amber)" /> : <Server size={20} color="var(--primary)" />}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>
                {node.label || node.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: 'var(--cyan)' }}>{node.ip}</span>
                <button
                  onClick={() => handleCopyIp(node.ip)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  title="คัดลอก IP"
                >
                  <Copy size={11} />
                </button>
              </div>
            </div>
          </div>

          <span className={`status-dot ${node.status}`}></span>
        </div>

        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11 }}>
          <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)' }}>
            {node.roleBadge || node.type}
          </span>
          <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)' }}>
            {node.vendor ? `${node.vendor}${node.model ? ` · ${node.model}` : ''}` : (node.model || node.os || 'Device')}
          </span>
          {node.location && (
            <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)' }}>
              📍 {node.location}
            </span>
          )}
        </div>

        {/* Connected Links Breakdown */}
        <div style={{ fontSize: 11, background: 'rgba(6, 9, 19, 0.5)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Network size={12} />
            <span>Connected Links ({connectedLinks.length})</span>
          </div>
          {connectedLinks.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>ยังไม่มีข้อมูลพอร์ตเชื่อมต่อ</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {connectedLinks.slice(0, 3).map((l, idx) => {
                const isSrc = l.source === node.ip;
                const otherIp = isSrc ? l.target : l.source;
                const otherNode = topoNodes.find(n => n.ip === otherIp) || { label: otherIp };
                const portLabel = isSrc ? `${l.srcPort || 'Port'} ➔ ${l.dstPort || 'Port'}` : `${l.dstPort || 'Port'} ➔ ${l.srcPort || 'Port'}`;

                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                    <span><strong>{otherNode.label}</strong> ({otherIp})</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)', fontSize: 10 }}>{portLabel}</span>
                  </div>
                );
              })}
              {connectedLinks.length > 3 && (
                <div style={{ color: 'var(--primary)', fontSize: 10, textAlign: 'right' }}>
                  + อีก {connectedLinks.length - 3} พอร์ต
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
          <button
            onClick={() => openNeighborModal(node)}
            className="btn btn-secondary"
            style={{ fontSize: 11, padding: '5px 10px', flex: 1, marginRight: 8 }}
          >
            <Search size={12} />
            <span>ตรวจสอบพอร์ตเชื่อมต่อ</span>
          </button>
          <a
            href={`http://${node.ip}`}
            target="_blank"
            rel="noreferrer"
            className="btn-icon"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            title="เปิด Web Management"
          >
            <ExternalLink size={13} />
          </a>
        </div>
      </div>
    );
  };

  const renderTierSection = (title, subtitle, icon, nodes, colorVar) => {
    if (nodes.length === 0) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 800, color: colorVar }}>
              {title} ({nodes.length})
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{subtitle}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {nodes.map(renderInfraCard)}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {renderTierSection('Tier 1: Perimeter Firewall & WAN Gateway', 'เกตเวย์ด่านหน้าและความปลอดภัยภายนอก', '🛡️', tier1_Firewall, 'var(--red)')}
      {renderTierSection('Tier 2: Core Switch Backbone', 'ศูนย์กลางสวิตช์หลักของระบบเครือข่าย', '👑', tier2_Core, 'var(--amber)')}
      {renderTierSection('Tier 3: Distribution / Aggregation Layer', 'สวิตช์กระจายสัญญาณประจำตึกหรือโซน', '🔀', tier3_Dist, 'var(--purple)')}
      {renderTierSection('Tier 4: Access Switch & Wireless AP', 'สวิตช์ต่ออุปกรณ์ปลายทางและจุดกระจายสัญญาณไวไฟ', '📡', tier4_Access, 'var(--primary)')}
      {renderTierSection('Standalone / Unlinked Devices', 'อุปกรณ์ที่ยังไม่พบสายเชื่อมโยง CDP/LLDP', '🔌', tier_Unlinked, 'var(--text-muted)')}
    </div>
  );
}
