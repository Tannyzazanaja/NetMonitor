import React, { useEffect, useState, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { Loader2, Activity, Network } from 'lucide-react';
import { PrometheusClient } from '../../services/prometheusService';

const promClient = new PrometheusClient();

export function InterfacesPanel({ device, timeRange }) {
  const [interfaces, setInterfaces] = useState([]);
  const [selectedIfIndex, setSelectedIfIndex] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [trafficIn, setTrafficIn] = useState([]);
  const [trafficOut, setTrafficOut] = useState([]);

  // Fetch interface list on mount
  useEffect(() => {
    if (!device) return;
    const fetchInterfaces = async () => {
      try {
        const cleanIp = (device.ip || '').trim().replace(/:\d+$/, '');
        // Fetch both Description and Status
        const [resDescr, resStatus, resAlias] = await Promise.allSettled([
          promClient.instantQuery(`ifDescr{instance=~".*${cleanIp}.*"}`),
          promClient.instantQuery(`ifOperStatus{instance=~".*${cleanIp}.*"}`),
          promClient.instantQuery(`ifAlias{instance=~".*${cleanIp}.*"}`)
        ]);

        const ifMap = new Map();

        if (resDescr.status === 'fulfilled' && resDescr.value) {
          resDescr.value.forEach(item => {
            const index = item.metric.ifIndex;
            if (index) {
              ifMap.set(index, { index, name: item.metric.ifDescr || `Port ${index}`, status: 0, alias: '' });
            }
          });
        }
        
        if (resStatus.status === 'fulfilled' && resStatus.value) {
          resStatus.value.forEach(item => {
            const index = item.metric.ifIndex;
            const status = parseInt(item.value[1], 10);
            if (ifMap.has(index)) {
              ifMap.get(index).status = status; // 1 = up, 2 = down
            } else {
               ifMap.set(index, { index, name: `Port ${index}`, status, alias: '' });
            }
          });
        }

        if (resAlias.status === 'fulfilled' && resAlias.value) {
          resAlias.value.forEach(item => {
            const index = item.metric.ifIndex;
            const alias = item.metric.ifAlias || '';
            if (alias && ifMap.has(index)) {
              ifMap.get(index).alias = alias;
            }
          });
        }

        const ifList = Array.from(ifMap.values()).sort((a, b) => {
          // Sort by Status (Up first) then alphabetically
          if (a.status === 1 && b.status !== 1) return -1;
          if (a.status !== 1 && b.status === 1) return 1;
          return a.name.localeCompare(b.name);
        });

        setInterfaces(ifList);
        if (ifList.length > 0) {
           setSelectedIfIndex(ifList[0].index);
        }
      } catch (err) {
        console.error("Error fetching interfaces:", err);
      }
    };
    fetchInterfaces();
  }, [device]);

  // Fetch traffic data when selected interface or timerange changes
  useEffect(() => {
    if (!device || !selectedIfIndex) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchTraffic = async () => {
      try {
        const cleanIp = (device.ip || '').trim().replace(/:\d+$/, '');
        const end = Math.floor(Date.now() / 1000);
        
        let start = end - 3600;
        let step = '1m';
        if (timeRange === '12h') {
          start = end - (12 * 3600);
          step = '5m';
        } else if (timeRange === '24h') {
          start = end - (24 * 3600);
          step = '15m';
        }

        // Query IN (HC first, fallback to standard)
        // Rate is octets/sec * 8 = bits/sec.
        const queryIn = `(rate(ifHCInOctets{instance=~".*${cleanIp}.*", ifIndex="${selectedIfIndex}"}[5m]) or rate(ifInOctets{instance=~".*${cleanIp}.*", ifIndex="${selectedIfIndex}"}[5m])) * 8`;
        const resIn = await promClient.rangeQuery(queryIn, start, end, step);

        // Query OUT
        const queryOut = `(rate(ifHCOutOctets{instance=~".*${cleanIp}.*", ifIndex="${selectedIfIndex}"}[5m]) or rate(ifOutOctets{instance=~".*${cleanIp}.*", ifIndex="${selectedIfIndex}"}[5m])) * 8`;
        const resOut = await promClient.rangeQuery(queryOut, start, end, step);

        if (!isMounted) return;

        let finalIn = [];
        if (resIn.length > 0 && resIn[0].values) {
          finalIn = resIn[0].values.map(v => ({ x: v[0] * 1000, y: parseFloat(v[1]) }));
        }

        let finalOut = [];
        if (resOut.length > 0 && resOut[0].values) {
          finalOut = resOut[0].values.map(v => ({ x: v[0] * 1000, y: parseFloat(v[1]) }));
        }

        setTrafficIn(finalIn);
        setTrafficOut(finalOut);
        setLoading(false);
      } catch (err) {
        if (isMounted) {
          console.error(err);
          setError(err.message);
          setLoading(false);
        }
      }
    };

    fetchTraffic();
    return () => { isMounted = false; };
  }, [device, selectedIfIndex, timeRange]);

  const formatBps = (bits) => {
    if (bits >= 1e9) return (bits / 1e9).toFixed(2) + ' GB/s';
    if (bits >= 1e6) return (bits / 1e6).toFixed(2) + ' MB/s';
    if (bits >= 1e3) return (bits / 1e3).toFixed(2) + ' KB/s';
    return bits.toFixed(0) + ' B/s';
  };

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        labels: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } }
      },
      tooltip: {
        backgroundColor: 'rgba(6, 9, 19, 0.9)',
        titleColor: 'rgba(255,255,255,0.8)',
        bodyColor: '#fff',
        borderColor: 'rgba(0, 212, 255, 0.3)',
        borderWidth: 1,
        callbacks: {
          title: (items) => items.length ? new Date(items[0].raw.x).toLocaleString('th-TH') : '',
          label: (item) => ` ${item.dataset.label}: ${formatBps(item.raw.y)}`
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
          callback: function(val) {
            const raw = this.getLabelForValue(val);
            return raw ? new Date(raw).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
          }
        },
        grid: { color: 'rgba(255,255,255,0.05)' }
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: 'rgba(255,255,255,0.5)',
          callback: (val) => formatBps(val)
        },
        grid: { color: 'rgba(255,255,255,0.05)' }
      }
    }
  }), []);

  const chartData = {
    labels: trafficIn.map(d => d.x),
    datasets: [
      {
        label: 'Traffic IN (Rx)',
        data: trafficIn,
        borderColor: '#10b981', // green
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
      },
      {
        label: 'Traffic OUT (Tx)',
        data: trafficOut,
        borderColor: '#3b82f6', // blue
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
      }
    ]
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      
      {/* Interface Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Network size={16} color="var(--primary)" />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Select Interface:</span>
        <select
          value={selectedIfIndex}
          onChange={e => setSelectedIfIndex(e.target.value)}
          style={{
            flex: 1,
            background: 'rgba(0,0,0,0.2)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 13,
            outline: 'none'
          }}
        >
          {interfaces.map(i => {
            const statusIndicator = i.status === 1 ? '🟢' : '🔴';
            const alias = i.alias ? ` (${i.alias})` : '';
            return (
              <option key={i.index} value={i.index}>
                {statusIndicator} {i.name}{alias}
              </option>
            );
          })}
        </select>
      </div>

      {/* Chart Area */}
      <div style={{ background: 'rgba(6,9,19,0.5)', padding: 16, borderRadius: 'var(--radius)', border: '1px solid var(--border)', height: 300 }}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
            <Loader2 size={32} className="spin" style={{ marginBottom: 16 }} />
            <div>กำลังดึงข้อมูลแบนด์วิดท์...</div>
          </div>
        ) : error ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}>
            <div>เกิดข้อผิดพลาด: {error}</div>
          </div>
        ) : (trafficIn.length > 0 || trafficOut.length > 0) ? (
          <Line data={chartData} options={chartOptions} />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            ไม่มีข้อมูลแบนด์วิดท์ในช่วงเวลานี้ หรือพอร์ตนี้อาจจะปิดอยู่
          </div>
        )}
      </div>

    </div>
  );
}
