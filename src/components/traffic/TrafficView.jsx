import React, { useMemo, useState, useEffect } from 'react';
import { Activity, ArrowDownLeft, ArrowUpRight, Network, Loader2, ArrowUp, ArrowDown, Globe } from 'lucide-react';
import { Bar, Line } from 'react-chartjs-2';
import { useDevices } from '../../context/DeviceContext';
import { useSettings } from '../../context/SettingsContext';
import { PrometheusClient, buildWanPromQL } from '../../services/prometheusService';
import { PerformanceModal } from '../services/PerformanceModal';

const fallbackPromClient = new PrometheusClient();

export function formatTrafficSpeed(mbps) {
  if (mbps === null || mbps === undefined || isNaN(mbps)) {
    return { val: 'No Data', unit: '', isNoData: true };
  }
  const val = Number(mbps);
  if (val <= 0) return { val: '0.00', unit: 'Mbps', isNoData: false };
  if (val >= 1000) return { val: (val / 1000).toFixed(2), unit: 'Gbps', isNoData: false };
  if (val >= 0.1) return { val: val.toFixed(2), unit: 'Mbps', isNoData: false };
  if (val >= 0.0001) return { val: (val * 1000).toFixed(1), unit: 'Kbps', isNoData: false };
  return { val: (val * 1000000).toFixed(0), unit: 'bps', isNoData: false };
}

export function TrafficView() {
  const { devices } = useDevices();
  const { settings, promClient: contextPromClient } = useSettings();
  const promClient = contextPromClient || fallbackPromClient;
  const [timeRange, setTimeRange] = useState('1h');
  
  // States for Total Network Traffic (Line Chart)
  const [systemTrafficIn, setSystemTrafficIn] = useState([]);
  const [systemTrafficOut, setSystemTrafficOut] = useState([]);
  const [loadingSystemGraph, setLoadingSystemGraph] = useState(false);

  // States for Top Devices (Bar Chart)
  const [topDevices, setTopDevices] = useState([]);
  const [loadingTop, setLoadingTop] = useState(false);

  // Real-time map of traffic for cards
  const [deviceTrafficMap, setDeviceTrafficMap] = useState({});

  // Selected device for Modal
  const [selectedDevice, setSelectedDevice] = useState(null);

  // Fetch Traffic Data (Real-time & Top Talkers)
  useEffect(() => {
    let isMounted = true;
    setLoadingTop(true);
    
    const fetchTraffic = async () => {
      try {
        let queryRange = '5m';
        if (timeRange === '12h') { queryRange = '12h'; }
        else if (timeRange === '24h') { queryRange = '24h'; }
        else if (timeRange === '1h') { queryRange = '1h'; }

        const [resRealtimeIn, resRealtimeOut, resHistIn, resHistOut] = await Promise.all([
          promClient.instantQuery(`sum by (instance, target) (rate(ifHCInOctets[5m]) or rate(ifInOctets[5m])) * 8 / 1000000`),
          promClient.instantQuery(`sum by (instance, target) (rate(ifHCOutOctets[5m]) or rate(ifOutOctets[5m])) * 8 / 1000000`),
          promClient.instantQuery(`sum by (instance, target) (rate(ifHCInOctets[${queryRange}]) or rate(ifInOctets[${queryRange}])) * 8 / 1000000`),
          promClient.instantQuery(`sum by (instance, target) (rate(ifHCOutOctets[${queryRange}]) or rate(ifOutOctets[${queryRange}])) * 8 / 1000000`)
        ]);
        
        if (!isMounted) return;

        // Process Realtime for Cards
        const realMap = {};
        const processReal = (res, type) => {
          if (res && res.length > 0) {
            res.forEach(item => {
              const inst = (item.metric?.target || item.metric?.instance || '').replace(/:\d+$/, '').trim();
              const val = parseFloat(item.value?.[1] || 0);
              if (inst && !isNaN(val)) {
                realMap[inst] = realMap[inst] || { inMbps: 0, outMbps: 0 };
                realMap[inst][type] = (realMap[inst][type] || 0) + val;
              }
            });
          }
        };
        processReal(resRealtimeIn, 'inMbps');
        processReal(resRealtimeOut, 'outMbps');
        setDeviceTrafficMap(realMap);

        // Process Historical for Top Talkers
        const histMap = {};
        const processHist = (res, type) => {
          if (res && res.length > 0) {
            res.forEach(item => {
              const inst = (item.metric?.target || item.metric?.instance || '').replace(/:\d+$/, '').trim();
              const val = parseFloat(item.value?.[1] || 0);
              if (inst && !isNaN(val)) {
                histMap[inst] = histMap[inst] || { inMbps: 0, outMbps: 0 };
                histMap[inst][type] = (histMap[inst][type] || 0) + val;
              }
            });
          }
        };
        processHist(resHistIn, 'inMbps');
        processHist(resHistOut, 'outMbps');

        const ranked = Object.keys(histMap).map(ip => {
          const cleanIp = ip.trim().replace(/:\d+$/, '');
          const device = devices.find(d => (d.ip || '').trim().replace(/:\d+$/, '') === cleanIp);
          const name = device?.name || cleanIp;
          const data = histMap[ip];
          return {
            ip: cleanIp,
            name,
            totalMbps: (data.inMbps || 0) + (data.outMbps || 0),
          };
        }).sort((a, b) => b.totalMbps - a.totalMbps).slice(0, 10);

        setTopDevices(ranked);
        setLoadingTop(false);
      } catch (e) {
        console.warn(e);
        if (isMounted) setLoadingTop(false);
      }
    };

    fetchTraffic();
    const interval = setInterval(fetchTraffic, 30000);
    return () => { isMounted = false; clearInterval(interval); };
  }, [devices, timeRange]);

  // Fetch System Overall Traffic (Range Query)
  useEffect(() => {
    let isMounted = true;
    setLoadingSystemGraph(true);

    const fetchSystemGraph = async () => {
      try {
        const end = Math.floor(Date.now() / 1000);
        let start = end - 3600;
        let step = '1m';
        if (timeRange === '12h') { start = end - (12 * 3600); step = '5m'; }
        if (timeRange === '24h') { start = end - (24 * 3600); step = '15m'; }

        // Robust Hierarchical WAN Gateway / Backbone Traffic PromQL
        const qIn = buildWanPromQL('in', settings?.wanInterface, settings?.wanIp);
        const qOut = buildWanPromQL('out', settings?.wanInterface, settings?.wanIp);

        const [resIn, resOut] = await Promise.all([
          promClient.rangeQuery(qIn, start, end, step),
          promClient.rangeQuery(qOut, start, end, step)
        ]);

        if (!isMounted) return;

        let finalIn = [];
        if (resIn && resIn.length > 0 && resIn[0].values) {
          finalIn = resIn[0].values.map(v => ({ x: v[0] * 1000, y: parseFloat(v[1]) }));
        }

        let finalOut = [];
        if (resOut && resOut.length > 0 && resOut[0].values) {
          finalOut = resOut[0].values.map(v => ({ x: v[0] * 1000, y: parseFloat(v[1]) }));
        }

        setSystemTrafficIn(finalIn);
        setSystemTrafficOut(finalOut);
        setLoadingSystemGraph(false);
      } catch (e) {
        console.warn(e);
        if (isMounted) setLoadingSystemGraph(false);
      }
    };

    fetchSystemGraph();
    // Refresh range query occasionally
    const interval = setInterval(fetchSystemGraph, 60000); 
    return () => { isMounted = false; clearInterval(interval); };
  }, [timeRange, settings?.wanInterface, settings?.wanIp, promClient]);

  const currentTotalIn = useMemo(() => {
    if (systemTrafficIn.length > 0) return systemTrafficIn[systemTrafficIn.length - 1].y;
    return 0;
  }, [systemTrafficIn]);

  const currentTotalOut = useMemo(() => {
    if (systemTrafficOut.length > 0) return systemTrafficOut[systemTrafficOut.length - 1].y;
    return 0;
  }, [systemTrafficOut]);

  const topDevicesData = useMemo(() => {
    return {
      labels: topDevices.map(d => d.name),
      datasets: [
        {
          label: `Avg Total Traffic (${timeRange}) MB/s`,
          data: topDevices.map(d => d.totalMbps),
          backgroundColor: 'rgba(0, 212, 255, 0.65)',
          borderRadius: 6,
        },
      ],
    };
  }, [topDevices, timeRange]);

  const systemLineChartData = useMemo(() => {
    return {
      labels: systemTrafficIn.map(d => d.x),
      datasets: [
        {
          label: 'WAN Gateway IN (Download) Mbps',
          data: systemTrafficIn,
          borderColor: '#00d4ff',
          backgroundColor: 'rgba(0, 212, 255, 0.12)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2
        },
        {
          label: 'WAN Gateway OUT (Upload) Mbps',
          data: systemTrafficOut,
          borderColor: '#a855f7',
          backgroundColor: 'rgba(168, 85, 247, 0.12)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2
        },
      ],
    };
  }, [systemTrafficIn, systemTrafficOut]);

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } },
      tooltip: {
        backgroundColor: 'rgba(6, 9, 19, 0.9)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgba(0, 212, 255, 0.3)',
        borderWidth: 1,
        callbacks: {
          label: (item) => {
            const fmt = formatTrafficSpeed(item.raw);
            return ` ${fmt.val} ${fmt.unit}`;
          }
        }
      }
    },
    scales: {
      x: { grid: { color: 'rgba(148, 163, 184, 0.08)' }, ticks: { color: '#64748b', font: { size: 10 } } },
      y: { grid: { color: 'rgba(148, 163, 184, 0.08)' }, ticks: { color: '#64748b', font: { size: 10 } } },
    },
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } },
      tooltip: {
        backgroundColor: 'rgba(6, 9, 19, 0.9)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgba(0, 212, 255, 0.3)',
        borderWidth: 1,
        callbacks: {
          title: (items) => items.length ? new Date(items[0].raw.x).toLocaleString('th-TH') : '',
          label: (item) => ` ${item.dataset.label}: ${item.raw.y.toFixed(2)} Mbps`
        }
      }
    },
    scales: {
      x: {
        type: 'category',
        grid: { color: 'rgba(148, 163, 184, 0.08)' },
        ticks: { 
          color: '#64748b', 
          maxTicksLimit: 8,
          callback: function(val) {
            const raw = this.getLabelForValue(val);
            return raw ? new Date(raw).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
          }
        },
      },
      y: { grid: { color: 'rgba(148, 163, 184, 0.08)' }, ticks: { color: '#64748b' } },
    },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div className="panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--radius)', background: 'rgba(0, 212, 255, 0.15)', border: '1px solid rgba(0, 212, 255, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Activity size={22} color="var(--primary)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
            ภาพรวมการใช้งานแบนด์วิดท์ (Traffic & Bandwidth)
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            ตรวจสอบปริมาณการรับ-ส่งข้อมูลรวมทุกพอร์ต (Aggregated IN/OUT) ของสวิตช์แต่ละตัวจาก Prometheus
          </div>
        </div>
        
        {/* Global Time Range Selector */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.3)', padding: 4, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          {['1h', '12h', '24h'].map(t => (
            <button
              key={t}
              onClick={() => setTimeRange(t)}
              style={{
                background: timeRange === t ? 'var(--primary)' : 'transparent',
                color: timeRange === t ? '#000' : 'var(--text-secondary)',
                border: 'none',
                padding: '6px 16px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1fr)', gap: 20 }}>
        {/* Graph 1: System Overall Traffic (Line Chart) */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div className="panel-title" style={{ gap: 8 }}>
              <Globe size={18} color="var(--primary)" />
              <span>WAN Internet Gateway Traffic (Model 1: RFC 2863)</span>
            </div>
            {/* Realtime Stats */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0, 212, 255, 0.1)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                <ArrowDown size={14} color="var(--cyan)" />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>IN:</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                  {formatTrafficSpeed(currentTotalIn).val} {formatTrafficSpeed(currentTotalIn).unit}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(168, 85, 247, 0.1)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                <ArrowUp size={14} color="#c084fc" />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>OUT:</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#c084fc', fontFamily: 'var(--font-mono)' }}>
                  {formatTrafficSpeed(currentTotalOut).val} {formatTrafficSpeed(currentTotalOut).unit}
                </span>
              </div>
            </div>
          </div>
          <div style={{ height: 320, padding: '0 16px 16px 16px' }}>
            {loadingSystemGraph ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                <Loader2 size={32} className="spin" style={{ marginBottom: 16 }} />
                <div>กำลังดึงข้อมูลแบนด์วิดท์รวมทั้งระบบ...</div>
              </div>
            ) : (systemTrafficIn.length > 0 || systemTrafficOut.length > 0) ? (
              <Line data={systemLineChartData} options={lineOptions} />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                ไม่มีข้อมูล Traffic สำหรับทั้งระบบ
              </div>
            )}
          </div>
        </div>

        {/* Graph 2: Top Devices (Bar Chart) */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header">
            <div className="panel-title">
              <ArrowUpRight size={18} color="var(--purple)" />
              <span>Top 10 Switches (Total Mbps)</span>
            </div>
          </div>
          <div style={{ height: 320, padding: '0 16px 16px 16px' }}>
            {loadingTop ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--purple)' }}>
                <Loader2 size={32} className="spin" style={{ marginBottom: 16 }} />
              </div>
            ) : topDevices.length > 0 ? (
              <Bar data={topDevicesData} options={barOptions} />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                ไม่มีข้อมูล
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Overall Traffic Cards Grid */}
      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Network size={18} color="var(--primary)" /> Individual Switch Traffic
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {devices.map((dev) => {
          const isOffline = dev.status !== 'online';
          const cleanIp = (dev.ip || '').trim().replace(/:\d+$/, '');
          const traffic = deviceTrafficMap[cleanIp] || deviceTrafficMap[dev.ip];
          const hasTraffic = traffic && (traffic.inMbps !== undefined || traffic.outMbps !== undefined);
          const inFmt = hasTraffic ? formatTrafficSpeed(traffic.inMbps) : { val: 'No Data', unit: '', isNoData: true };
          const outFmt = hasTraffic ? formatTrafficSpeed(traffic.outMbps) : { val: 'No Data', unit: '', isNoData: true };
          
          return (
            <div 
              key={dev.ip} 
              className="panel" 
              style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16, opacity: isOffline ? 0.6 : 1, cursor: 'pointer', transition: 'transform 0.15s ease' }}
              onClick={() => setSelectedDevice(dev)}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              {/* Header: Name and IP */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {dev.name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)' }}>{dev.ip}</div>
                </div>
                <span className={`status-dot ${dev.status}`}></span>
              </div>

              {/* Traffic IN/OUT Row */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.2)', padding: '12px 14px', borderRadius: 'var(--radius-sm)' }}>
                  <ArrowDown size={18} color="var(--cyan)" />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>IN (Download)</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: inFmt.isNoData ? 'var(--text-muted)' : 'var(--cyan)', fontSize: inFmt.isNoData ? 13 : 15 }}>
                      {inFmt.val} {inFmt.unit && <span style={{fontSize: 10}}>{inFmt.unit}</span>}
                    </strong>
                  </div>
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.2)', padding: '12px 14px', borderRadius: 'var(--radius-sm)' }}>
                  <ArrowUp size={18} color="#c084fc" />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>OUT (Upload)</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: outFmt.isNoData ? 'var(--text-muted)' : '#c084fc', fontSize: outFmt.isNoData ? 13 : 15 }}>
                      {outFmt.val} {outFmt.unit && <span style={{fontSize: 10}}>{outFmt.unit}</span>}
                    </strong>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginTop: -4 }}>
                <span>Module: {dev.module || 'if_mib'}</span>
                <span style={{ color: 'var(--primary)' }}>
                  คลิกเพื่อดูกราฟแยกพอร์ต ➔
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {selectedDevice && (
        <PerformanceModal
          isOpen={!!selectedDevice}
          onClose={() => setSelectedDevice(null)}
          device={selectedDevice}
          defaultTab="interfaces"
        />
      )}
    </div>
  );
}
