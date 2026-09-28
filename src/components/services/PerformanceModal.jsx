import React, { useEffect, useState, useMemo } from 'react';
import { Modal } from '../common/Modal';
import { Line } from 'react-chartjs-2';
import { Loader2, Activity, Database, AlertCircle, Network, Cpu } from 'lucide-react';
import { PrometheusClient } from '../../services/prometheusService';
import { InterfacesPanel } from './InterfacesPanel';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const promClient = new PrometheusClient(); // Assumes default url

export function PerformanceModal({ isOpen, onClose, device, defaultTab = 'system' }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(defaultTab); // 'system' or 'interfaces'
  const [timeRange, setTimeRange] = useState('1h'); // 1h, 12h, 24h
  const [cpuData, setCpuData] = useState([]);
  const [memData, setMemData] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(defaultTab);
  }, [isOpen, defaultTab]);

  useEffect(() => {
    if (!isOpen || !device) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        const cleanIp = (device.ip || '').trim().replace(/:\d+$/, '');
        const end = Math.floor(Date.now() / 1000);
        
        let start = end - 3600; // 1h
        let step = '1m';
        if (timeRange === '12h') {
          start = end - (12 * 3600);
          step = '5m';
        } else if (timeRange === '24h') {
          start = end - (24 * 3600);
          step = '15m';
        }

        // Fetch Backend SNMP Telemetry History (Real Memory & CPU Time-Series)
        let backendHistory = [];
        try {
          const histRes = await fetch(`/api/devices/${cleanIp}/history?range=${timeRange}`);
          if (histRes.ok) {
            const histData = await histRes.json();
            if (histData.ok && Array.isArray(histData.history) && histData.history.length > 0) {
              backendHistory = histData.history;
            }
          }
        } catch (e) {}

        if (backendHistory.length === 0) {
          try {
            const altRes = await fetch(`/api/storage/device_history/${cleanIp}?range=${timeRange}`);
            if (altRes.ok) {
              const altData = await altRes.json();
              if (altData.ok && Array.isArray(altData.history) && altData.history.length > 0) {
                backendHistory = altData.history;
              }
            }
          } catch (e) {}
        }

        // If history is empty, check device telemetry or fetch live performance
        if (backendHistory.length === 0) {
          let curCpu = device.cpu != null ? parseFloat(device.cpu) : null;
          let curMem = device.memory != null ? parseFloat(device.memory) : null;

          if (curCpu === null || curMem === null) {
            try {
              const perfRes = await fetch(`/api/devices/${cleanIp}/performance`);
              if (perfRes.ok) {
                const perfData = await perfRes.json();
                if (perfData.ok && perfData.data) {
                  if (curCpu === null && perfData.data.cpu != null) curCpu = parseFloat(perfData.data.cpu);
                  if (curMem === null && perfData.data.memory != null) curMem = parseFloat(perfData.data.memory);
                }
              }
            } catch (e) {}
          }

          if (curCpu !== null || curMem !== null) {
            const nowMs = Date.now();
            for (let i = 5; i >= 0; i--) {
              backendHistory.push({
                t: nowMs - (i * 60000),
                cpu: curCpu,
                mem: curMem
              });
            }
          }
        }

        // Query CPU from Prometheus
        const cpuQuery = `hwEntityCpuUsage{instance=~".*${cleanIp}.*"} or cpmCPUTotal5minRev{instance=~".*${cleanIp}.*"} or rlCpuUtilDuringLast5Minutes{instance=~".*${cleanIp}.*"} or hpSwitchCpuStat{instance=~".*${cleanIp}.*"} or avg by(instance)(hrProcessorLoad{instance=~".*${cleanIp}.*"})`;
        let resCpu = [];
        try {
          resCpu = await promClient.rangeQuery(cpuQuery, start, end, step);
        } catch (e) {}

        // Query Memory (Used) from Prometheus
        const memUsedQuery = `hwEntityMemUsage{instance=~".*${cleanIp}.*"} or cpmCPUMemoryUsed{instance=~".*${cleanIp}.*"} or ciscoMemoryPoolUsed{instance=~".*${cleanIp}.*"} or hpSwitchMemoryAllocated{instance=~".*${cleanIp}.*"} or sum by(instance)(hrStorageUsed{instance=~".*${cleanIp}.*"})`;
        let resMemUsed = [];
        try {
          resMemUsed = await promClient.rangeQuery(memUsedQuery, start, end, step);
        } catch (e) {}
        
        // Query Memory (Free/Total) from Prometheus
        const memFreeQuery = `cpmCPUMemoryFree{instance=~".*${cleanIp}.*"} or ciscoMemoryPoolFree{instance=~".*${cleanIp}.*"} or hpSwitchMemoryTotal{instance=~".*${cleanIp}.*"} or sum by(instance)(hrStorageSize{instance=~".*${cleanIp}.*"})`;
        let resMemFree = [];
        try {
          resMemFree = await promClient.rangeQuery(memFreeQuery, start, end, step);
        } catch (e) {}

        if (!isMounted) return;

        // Process CPU (Prioritize real direct SNMP telemetry, fallback to Prometheus)
        let finalCpu = [];
        const cpuPoints = backendHistory
          .filter(h => h.cpu !== null && !isNaN(h.cpu))
          .map(h => ({ x: h.t, y: h.cpu }));

        if (cpuPoints.length > 0) {
          finalCpu = cpuPoints;
        } else if (resCpu.length > 0 && resCpu[0].values) {
          finalCpu = resCpu[0].values.map(v => ({ x: v[0] * 1000, y: parseFloat(v[1]) }));
        }

        // Process Memory (User requirement: Store and display real memory history)
        let finalMem = [];
        const memPoints = backendHistory
          .filter(h => h.mem !== null && !isNaN(h.mem))
          .map(h => ({ x: h.t, y: h.mem }));

        if (memPoints.length > 0) {
          finalMem = memPoints;
        } else if (resMemUsed.length > 0 && resMemUsed[0].values) {
          const usedVals = resMemUsed[0].values;
          const metricName = resMemUsed[0].metric?.__name__ || '';
          
          if (metricName === 'hwEntityMemUsage') {
            finalMem = usedVals.map(v => ({ x: v[0] * 1000, y: parseFloat(v[1]) }));
          } else if (resMemFree.length > 0 && resMemFree[0].values) {
            const freeVals = resMemFree[0].values;
            const freeMetricName = resMemFree[0].metric?.__name__ || '';
            
            const freeMap = new Map();
            freeVals.forEach(v => freeMap.set(v[0], parseFloat(v[1])));

            finalMem = usedVals.map(v => {
              const ts = v[0];
              const used = parseFloat(v[1]);
              const freeOrSize = freeMap.get(ts) || 0;
              
              let total = 0;
              if (freeMetricName === 'hrStorageSize' || freeMetricName === 'hpSwitchMemoryTotal' || (!freeMetricName && !metricName.includes('cisco') && !metricName.includes('cpm'))) {
                total = freeOrSize; 
              } else {
                total = used + freeOrSize;
              }

              let pct = 0;
              if (total > 0) pct = (used / total) * 100;
              return { x: ts * 1000, y: pct };
            });
          }
        }

        setCpuData(finalCpu);
        setMemData(finalMem);
        setLoading(false);

      } catch (err) {
        console.error(err);
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => { isMounted = false; };
  }, [isOpen, device, timeRange]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(6, 9, 19, 0.9)',
        titleColor: 'rgba(255,255,255,0.8)',
        bodyColor: '#fff',
        borderColor: 'rgba(0, 212, 255, 0.3)',
        borderWidth: 1,
        callbacks: {
          title: (items) => {
             if (!items.length) return '';
             return new Date(items[0].raw.x).toLocaleString('th-TH');
          },
          label: (item) => {
             return ` ${item.dataset.label}: ${item.raw.y.toFixed(1)}%`;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'category',
        ticks: {
          color: 'rgba(255,255,255,0.5)',
          maxRotation: 0,
          maxTicksLimit: 8,
          callback: function(val, index) {
            const raw = this.getLabelForValue(val);
            if (!raw) return '';
            return new Date(raw).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
          }
        },
        grid: { color: 'rgba(255,255,255,0.05)' }
      },
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          color: 'rgba(255,255,255,0.5)',
          callback: (val) => val + '%'
        },
        grid: { color: 'rgba(255,255,255,0.05)' }
      }
    }
  }), []);

  const cpuChart = {
    labels: cpuData.map(d => d.x),
    datasets: [{
      label: 'CPU Usage',
      data: cpuData,
      borderColor: '#00d4ff',
      backgroundColor: 'rgba(0, 212, 255, 0.15)',
      fill: true,
      tension: 0.3,
      borderWidth: 2,
      pointRadius: cpuData.length <= 5 ? 3 : 0,
      pointHoverRadius: 5,
    }]
  };

  const memChart = {
    labels: memData.map(d => d.x),
    datasets: [{
      label: 'Memory Usage',
      data: memData,
      borderColor: '#a855f7',
      backgroundColor: 'rgba(168, 85, 247, 0.15)',
      fill: true,
      tension: 0.3,
      borderWidth: 2,
      pointRadius: memData.length <= 5 ? 3 : 0,
      pointHoverRadius: 5,
    }]
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={18} color="var(--primary)" />
          <span>Historical Performance: {device?.name || device?.ip}</span>
        </div>
      }
      maxWidth={800}
    >
      <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => setActiveTab('system')}
              style={{
                background: activeTab === 'system' ? 'rgba(0, 212, 255, 0.15)' : 'transparent',
                color: activeTab === 'system' ? 'var(--primary)' : 'var(--text-secondary)',
                border: '1px solid',
                borderColor: activeTab === 'system' ? 'rgba(0, 212, 255, 0.4)' : 'transparent',
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Cpu size={14} /> System Health
            </button>
            <button
              onClick={() => setActiveTab('interfaces')}
              style={{
                background: activeTab === 'interfaces' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                color: activeTab === 'interfaces' ? 'var(--green)' : 'var(--text-secondary)',
                border: '1px solid',
                borderColor: activeTab === 'interfaces' ? 'rgba(16, 185, 129, 0.4)' : 'transparent',
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Network size={14} /> Interfaces (Traffic)
            </button>
          </div>
          
          <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', padding: 4, borderRadius: 'var(--radius)' }}>
            {['1h', '12h', '24h'].map(t => (
              <button
                key={t}
                onClick={() => setTimeRange(t)}
                style={{
                  background: timeRange === t ? (activeTab === 'interfaces' ? 'var(--green)' : 'var(--primary)') : 'transparent',
                  color: timeRange === t ? '#000' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '4px 12px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'interfaces' ? (
           <InterfacesPanel device={device} timeRange={timeRange} />
        ) : loading ? (
          <div style={{ height: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
            <Loader2 size={32} className="spin" style={{ marginBottom: 16 }} />
            <div>กำลังดึงข้อมูลสถิติย้อนหลัง...</div>
          </div>
        ) : error ? (
          <div style={{ height: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}>
            <AlertCircle size={32} style={{ marginBottom: 16 }} />
            <div>เกิดข้อผิดพลาด: {error}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>อาจไม่มีข้อมูลใน Prometheus หรือเชื่อมต่อไม่ได้</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ background: 'rgba(6,9,19,0.5)', padding: 16, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontWeight: 600 }}>
                <Activity size={14} color="#00d4ff" />
                <span>CPU Usage (%)</span>
                {cpuData.length === 0 && <span style={{ fontSize: 11, color: 'var(--amber)', marginLeft: 8 }}>(No Data)</span>}
              </div>
              <div style={{ height: 180 }}>
                {cpuData.length > 0 ? <Line data={cpuChart} options={chartOptions} /> : <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)'}}>ไม่มีข้อมูลในช่วงเวลานี้</div>}
              </div>
            </div>

            <div style={{ background: 'rgba(6,9,19,0.5)', padding: 16, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontWeight: 600 }}>
                <Database size={14} color="#a855f7" />
                <span>Memory Usage (%)</span>
                {memData.length === 0 && <span style={{ fontSize: 11, color: 'var(--amber)', marginLeft: 8 }}>(No Data)</span>}
              </div>
              <div style={{ height: 180 }}>
                {memData.length > 0 ? <Line data={memChart} options={chartOptions} /> : <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)'}}>ไม่มีข้อมูลในช่วงเวลานี้</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
