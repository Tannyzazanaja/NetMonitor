import React, { useState, useEffect } from 'react';
import { Copy, Download, FileCode, Check, RefreshCw, Layers } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useToast } from '../../context/ToastContext';
import { StorageService } from '../../services/storageService';
import { copyToClipboard } from '../../utils/clipboard';

export function ExportYamlModal({ isOpen, onClose }) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('snmp'); // 'snmp' | 'blackbox'
  const [isLoading, setIsLoading] = useState(false);
  const [targetsData, setTargetsData] = useState({
    snmp: '',
    blackbox: '',
    targetCount: 0,
  });

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);

    StorageService.getPrometheusTargetsPreview()
      .then((res) => {
        if (isMounted && res && res.ok) {
          setTargetsData({
            snmp: res.snmp || '',
            blackbox: res.blackbox || '',
            targetCount: res.targetCount || 0,
          });
        }
      })
      .catch((err) => {
        if (isMounted) {
          showToast('error', 'ไม่สามารถดึงข้อมูลเป้าหมายได้', err.message);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, showToast]);

  const activeContent = activeTab === 'snmp' ? targetsData.snmp : targetsData.blackbox;
  const fileName = activeTab === 'snmp' ? 'snmp_netmonitor.yml' : 'blackbox_netmonitor.yml';
  const tabTitle = activeTab === 'snmp' ? 'SNMP Targets' : 'Blackbox ICMP Targets';

  const handleCopy = async () => {
    if (!activeContent) return;
    const ok = await copyToClipboard(activeContent);
    if (ok) {
      showToast('success', 'คัดลอก YAML สำเร็จ', `คัดลอกคอนฟิก ${tabTitle} เรียบร้อยแล้ว`);
    } else {
      showToast('error', 'คัดลอกไม่สำเร็จ', 'เบราว์เซอร์ไม่อนุญาตให้เข้าถึง Clipboard');
    }
  };

  const handleDownload = () => {
    if (!activeContent) return;
    const blob = new Blob([activeContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'ดาวน์โหลดไฟล์แล้ว', `บันทึกไฟล์ ${fileName} เรียบร้อย`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📄 Prometheus Targets Config Preview"
      maxWidth={680}
    >
      <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Top Info Banner */}
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            background: 'rgba(0, 212, 255, 0.05)',
            border: '1px solid rgba(0, 212, 255, 0.2)',
            borderRadius: 'var(--radius)',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>
            ระบบเซิร์ฟเวอร์จะสร้างและซิงค์คอนฟิกเป้าหมายไปยัง Prometheus โดยอัตโนมัติ (จำนวนอุปกรณ์ที่พร้อมทำงาน:{' '}
            <strong style={{ color: 'var(--cyan)' }}>{targetsData.targetCount}</strong> โหนด)
          </span>
          {isLoading && <RefreshCw size={14} className="animate-spin" color="var(--cyan)" />}
        </div>

        {/* Tab Selection */}
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
          <button
            type="button"
            onClick={() => setActiveTab('snmp')}
            className={`btn ${activeTab === 'snmp' ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: activeTab === 'snmp' ? 700 : 500,
            }}
          >
            <Layers size={13} />
            <span>SNMP Targets</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('blackbox')}
            className={`btn ${activeTab === 'blackbox' ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: activeTab === 'blackbox' ? 700 : 500,
            }}
          >
            <FileCode size={13} />
            <span>Blackbox ICMP Targets</span>
          </button>
        </div>

        {/* YAML Content Viewer */}
        <pre
          style={{
            background: '#040711',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 16,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--cyan)',
            maxHeight: 300,
            overflowY: 'auto',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {isLoading ? 'กำลังโหลดคอนฟิกเป้าหมายจากเซิร์ฟเวอร์...' : (activeContent || 'ไม่มีข้อมูลเป้าหมาย')}
        </pre>
      </div>

      <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button
          onClick={handleDownload}
          disabled={isLoading || !activeContent}
          className="btn btn-secondary"
          style={{ padding: '7px 14px' }}
        >
          <Download size={14} />
          <span>ดาวน์โหลด ({fileName})</span>
        </button>
        <button
          onClick={handleCopy}
          disabled={isLoading || !activeContent}
          className="btn btn-primary"
          style={{ padding: '7px 18px' }}
        >
          <Copy size={14} />
          <span>คัดลอก (Copy YAML)</span>
        </button>
      </div>
    </Modal>
  );
}
