import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  X,
  Layers,
  GitBranch,
  Shield,
  Radio,
  Server,
  Cpu,
  ArrowRight,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { useTopology } from '../../context/TopologyContext';

export function TopologyDiscoveryModal() {
  const {
    isDiscoveryModalOpen,
    closeDiscoveryModal,
    discoveryPreview,
    applyDiscovery,
    runDiscoveryPipeline,
    isDiscovering,
  } = useTopology();

  const [selectedLayout, setSelectedLayout] = useState('hierarchical');
  const [isApplying, setIsApplying] = useState(false);

  if (!isDiscoveryModalOpen || !discoveryPreview) return null;

  const { stats, nodes = [], edges = [], durationMs = 0 } = discoveryPreview;

  const handleApply = async () => {
    setIsApplying(true);
    try {
      await applyDiscovery(selectedLayout);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 24, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="panel"
        style={{
          width: '100%',
          maxWidth: 780,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid rgba(0, 212, 255, 0.3)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(0, 212, 255, 0.15)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, rgba(0, 212, 255, 0.08) 0%, rgba(15, 23, 42, 0.95) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius)',
                background: 'rgba(0, 212, 255, 0.15)',
                border: '1px solid var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={18} color="var(--primary)" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                ผลการค้นหาโครงสร้างโครงข่ายกึ่งอัตโนมัติ (Semi-Automatic Discovery)
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                ระบบทำการรวบรวมข้อมูลผ่าน 7 ขั้นตอน (SNMP, LLDP, CDP, IF-MIB, Bridge-MIB) และกำจัดลิงก์ซ้ำซ้อนเรียบร้อยแล้ว
              </p>
            </div>
          </div>
          <button
            onClick={closeDiscoveryModal}
            className="btn-icon"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 7-Step Pipeline Badge Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: 'rgba(16, 185, 129, 0.08)',
              borderRadius: 'var(--radius)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              fontSize: 12,
              color: 'var(--text-secondary)',
            }}
          >
            <CheckCircle2 size={16} color="var(--green)" style={{ flexShrink: 0 }} />
            <span>
              <strong>กระบวนการ 7 ขั้นตอนสำเร็จ:</strong> ตรวจสอบ Inventory → LLDP → CDP → รวมข้อมูล (Data Fusion) → สร้าง Graph → Deduplicate → เตรียมบันทึก ({durationMs} ms)
            </span>
          </div>

          {/* Stats Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>โหนดที่พบ</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)', marginTop: 4 }}>
                {nodes.length}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>9 Node Types</div>
            </div>

            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>ลิงก์โครงข่าย</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', marginTop: 4 }}>
                {edges.length}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Physical Links</div>
            </div>

            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>เพื่อนบ้าน LLDP/CDP</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b', marginTop: 4 }}>
                {(stats?.cdpNeighbors || 0) + (stats?.lldpNeighbors || 0)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                CDP: {stats?.cdpNeighbors || 0} | LLDP: {stats?.lldpNeighbors || 0}
              </div>
            </div>

            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>ผู้ผลิตที่รองรับ</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#a855f7', marginTop: 4 }}>
                {Object.keys(stats?.vendorBreakdown || {}).length}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                Cisco, Aruba, HPE, Ruckus
              </div>
            </div>
          </div>

          {/* Node Types Distribution Breakdown */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              การจำแนกประเภทอุปกรณ์ (9 Standard Node Types):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(stats?.nodeTypeBreakdown || {}).map(([type, count]) => (
                <div
                  key={type}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border)',
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{type}:</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Layout Mode Selector */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              เลือกรูปแบบการจัดวาง (Auto Layout Algorithm):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div
                onClick={() => setSelectedLayout('hierarchical')}
                style={{
                  padding: 12,
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${selectedLayout === 'hierarchical' ? 'var(--primary)' : 'var(--border)'}`,
                  background: selectedLayout === 'hierarchical' ? 'rgba(0, 212, 255, 0.1)' : 'rgba(15, 23, 42, 0.6)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Layers size={16} color={selectedLayout === 'hierarchical' ? 'var(--primary)' : 'var(--text-muted)'} />
                  <strong style={{ fontSize: 12, color: selectedLayout === 'hierarchical' ? 'var(--primary)' : 'var(--text-primary)' }}>
                    Hierarchical (แนะนำ)
                  </strong>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  จัดตามลำดับชั้น 4-Tier: Perimeter → Core → Distribution → Access
                </div>
              </div>

              <div
                onClick={() => setSelectedLayout('force')}
                style={{
                  padding: 12,
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${selectedLayout === 'force' ? 'var(--primary)' : 'var(--border)'}`,
                  background: selectedLayout === 'force' ? 'rgba(0, 212, 255, 0.1)' : 'rgba(15, 23, 42, 0.6)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Zap size={16} color={selectedLayout === 'force' ? 'var(--primary)' : 'var(--text-muted)'} />
                  <strong style={{ fontSize: 12, color: selectedLayout === 'force' ? 'var(--primary)' : 'var(--text-primary)' }}>
                    Force-Directed
                  </strong>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  จำลองฟิสิกส์แรงดึงและแรงผลัก เหมาะกับโครงข่ายแบบ Mesh
                </div>
              </div>

              <div
                onClick={() => setSelectedLayout('radar')}
                style={{
                  padding: 12,
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${selectedLayout === 'radar' ? 'var(--primary)' : 'var(--border)'}`,
                  background: selectedLayout === 'radar' ? 'rgba(0, 212, 255, 0.1)' : 'rgba(15, 23, 42, 0.6)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Radio size={16} color={selectedLayout === 'radar' ? 'var(--primary)' : 'var(--text-muted)'} />
                  <strong style={{ fontSize: 12, color: selectedLayout === 'radar' ? 'var(--primary)' : 'var(--text-primary)' }}>
                    Radar Concentric
                  </strong>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  จัดเป็นวงแหวนกระจายออกจาก Core Switch กลาง
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(15, 23, 42, 0.95)',
          }}
        >
          <button
            onClick={() => runDiscoveryPipeline()}
            className="btn btn-secondary"
            disabled={isDiscovering}
            style={{ fontSize: 12, padding: '7px 12px' }}
          >
            <RefreshCw size={13} className={isDiscovering ? 'animate-spin' : ''} />
            <span>สแกนใหม่อีกครั้ง</span>
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={closeDiscoveryModal}
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '7px 16px' }}
              disabled={isApplying}
            >
              ยกเลิก
            </button>
            <button
              onClick={handleApply}
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '7px 18px', fontWeight: 700 }}
              disabled={isApplying}
            >
              {isApplying ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>กำลังบันทึก...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>นำไปใช้และบันทึกโครงสร้าง</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
