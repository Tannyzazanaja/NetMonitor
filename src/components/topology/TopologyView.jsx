import React, { useState } from 'react';
import {
  Network,
  Grid,
  Palette,
  RefreshCw,
  PlusCircle,
  Sparkles,
  Download,
  Layers,
  Zap,
  Radio,
  Move,
} from 'lucide-react';
import { TopologyGrid } from './TopologyGrid';
import { TopologyCanvas } from './TopologyCanvas';
import { NeighborModal } from './NeighborModal';
import { TopologyDiscoveryModal } from './TopologyDiscoveryModal';
import { useTopology } from '../../context/TopologyContext';
import { useAuth } from '../../context/AuthContext';

export function TopologyView({ onOpenAddDevice, onOpenEditDevice }) {
  const { canEdit } = useAuth();
  const {
    topoNodes,
    topoLinks,
    layoutMode,
    setLayoutMode,
    refreshTopology,
    runDiscoveryPipeline,
    exportTopologyJson,
    isDiscovering,
    isLoading,
  } = useTopology();

  const [viewType, setViewType] = useState('canvas'); // Default to Interactive Canvas

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
        {/* Title & Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 'var(--radius)',
              background: 'rgba(0, 212, 255, 0.15)',
              border: '1px solid rgba(0, 212, 255, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Network size={22} color="var(--primary)" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
              ผังโครงสร้างเครือข่ายองค์กร (Enterprise Topology Discovery)
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
              <span>โหนดโครงข่าย: <strong style={{ color: 'var(--text-primary)' }}>{topoNodes.length}</strong></span>
              <span>·</span>
              <span>สายเชื่อมโยง: <strong style={{ color: 'var(--primary)' }}>{topoLinks.length} Links</strong></span>
              <span>·</span>
              <span>รองรับ: <strong style={{ color: 'var(--green)' }}>Cisco · Aruba · HPE · Ruckus</strong></span>
              <span>·</span>
              <span>สถานะ: <strong style={{ color: '#38bdf8' }}>Semi-Automatic Active</strong></span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Semi-Automatic Discovery Button */}
          <button
            onClick={() => runDiscoveryPipeline()}
            className="btn btn-primary"
            style={{
              fontSize: 12,
              padding: '7px 14px',
              background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
              border: '1px solid rgba(0, 212, 255, 0.5)',
              boxShadow: '0 0 15px rgba(14, 165, 233, 0.35)',
            }}
            disabled={isDiscovering}
          >
            <Sparkles size={14} className={isDiscovering ? 'animate-spin' : ''} />
            <span>{isDiscovering ? 'กำลังค้นหาโครงข่าย...' : 'ค้นหาโครงสร้างอัตโนมัติ'}</span>
          </button>

          {/* View Type Toggle (Grid vs Canvas) */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(15, 23, 42, 0.9)',
              padding: 3,
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          >
            <button
              onClick={() => setViewType('canvas')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                background: viewType === 'canvas' ? 'rgba(0, 212, 255, 0.2)' : 'transparent',
                border: 'none',
                color: viewType === 'canvas' ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: viewType === 'canvas' ? 700 : 500,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <Palette size={14} />
              <span>Interactive Canvas</span>
            </button>
            <button
              onClick={() => setViewType('grid')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                background: viewType === 'grid' ? 'rgba(0, 212, 255, 0.2)' : 'transparent',
                border: 'none',
                color: viewType === 'grid' ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: viewType === 'grid' ? 700 : 500,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <Grid size={14} />
              <span>4-Tier Grid</span>
            </button>
          </div>

          {/* If Canvas view, show layout mode selector */}
          {viewType === 'canvas' && (
            <div
              style={{
                display: 'flex',
                background: 'rgba(15, 23, 42, 0.9)',
                padding: 3,
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
              }}
            >
              <button
                onClick={() => setLayoutMode('hierarchical')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: (layoutMode === 'hierarchical' || layoutMode === 'tree') ? 'rgba(0, 212, 255, 0.2)' : 'transparent',
                  border: 'none',
                  color: (layoutMode === 'hierarchical' || layoutMode === 'tree') ? 'var(--primary)' : 'var(--text-secondary)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Hierarchical Sugiyama Layered Layout"
              >
                <Layers size={12} />
                <span>Hierarchical</span>
              </button>
              <button
                onClick={() => setLayoutMode('force')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: layoutMode === 'force' ? 'rgba(0, 212, 255, 0.2)' : 'transparent',
                  border: 'none',
                  color: layoutMode === 'force' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Force-Directed Physics Simulation"
              >
                <Zap size={12} />
                <span>Force-Directed</span>
              </button>
              <button
                onClick={() => setLayoutMode('radar')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: layoutMode === 'radar' ? 'rgba(0, 212, 255, 0.2)' : 'transparent',
                  border: 'none',
                  color: layoutMode === 'radar' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Radar Concentric Rings"
              >
                <Radio size={12} />
                <span>Radar</span>
              </button>
              <button
                onClick={() => setLayoutMode('free')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: layoutMode === 'free' ? 'rgba(0, 212, 255, 0.2)' : 'transparent',
                  border: 'none',
                  color: layoutMode === 'free' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Free Drag & Drop"
              >
                <Move size={12} />
                <span>Free Drag</span>
              </button>
            </div>
          )}

          {/* Export JSON Button */}
          <button
            onClick={exportTopologyJson}
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '7px 12px' }}
            title="ส่งออกโครงสร้างเป็น JSON"
          >
            <Download size={13} />
            <span>JSON</span>
          </button>

          {/* Action Buttons */}
          <button
            onClick={refreshTopology}
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '7px 12px' }}
            disabled={isLoading}
            title="รีเฟรชสถานะลิงก์ล่าสุด"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>{isLoading ? 'กำลังโหลด...' : 'รีเฟรช'}</span>
          </button>
          {canEdit && (
            <button
              onClick={() => onOpenAddDevice()}
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '7px 14px' }}
            >
              <PlusCircle size={14} />
              <span>เพิ่มอุปกรณ์</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty State Banner */}
      {topoNodes.length === 0 && (
        <div
          className="panel"
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.05) 0%, rgba(15, 23, 42, 0.6) 100%)',
            border: '1px solid rgba(0, 212, 255, 0.2)',
          }}
        >
          <Network size={40} color="var(--primary)" style={{ opacity: 0.8 }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            No Topology Graph Available
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 450 }}>
            No devices or neighbor links discovered. Add switches or launch semi-automatic topology discovery to map your network architecture.
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button onClick={() => onOpenAddDevice()} className="btn btn-primary" style={{ fontSize: 12, padding: '7px 16px' }}>
                + Add Device
              </button>
              <button onClick={runDiscoveryPipeline} className="btn btn-secondary" style={{ fontSize: 12, padding: '7px 16px' }} disabled={isDiscovering}>
                <Sparkles size={13} />
                <span>Run Topology Discovery</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. Main View Content */}
      {viewType === 'grid' ? (
        <TopologyGrid onOpenAddDevice={onOpenAddDevice} />
      ) : (
        <TopologyCanvas />
      )}

      {/* 3. Semi-Automatic Discovery Review Modal */}
      <TopologyDiscoveryModal />

      {/* 4. Neighbor Details Modal */}
      <NeighborModal onOpenAddDevice={onOpenAddDevice} onOpenEditDevice={onOpenEditDevice} />
    </div>
  );
}
