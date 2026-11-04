import React, { useEffect, useState, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { Loader2, Activity, Network, Cable, Filter, CheckCircle2, AlertCircle, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { PrometheusClient } from '../../services/prometheusService';

const promClient = new PrometheusClient();

// Helper to determine if an interface is a physical front-panel switch port (vs Virtual / SVI / Port-Channel)
function isPhysicalInterface(name = '', alias = '') {
  const str = `${name} ${alias}`.toLowerCase();
  
  // Virtual / Logical interface blacklist
  if (
    /\bvlan\b/i.test(str) ||
    /\bvl\d+/i.test(str) ||
    /\bsvi\b/i.test(str) ||
    /\bloopback\b/i.test(str) ||
    /\blo\d*\b/i.test(str) ||
    /\bnull\b/i.test(str) ||
    /\bnu\d*\b/i.test(str) ||
    /\bport-channel\b/i.test(str) ||
    /\bpo\d+\b/i.test(str) ||
    /\blag\b/i.test(str) ||
    /\bbundle\b/i.test(str) ||
    /\btrunk\b/i.test(str) ||
    /\bstack/i.test(str) ||
    /\bcpu\b/i.test(str) ||
    /\binternal\b/i.test(str) ||
    /\btunnel\b/i.test(str) ||
    /\btu\d+\b/i.test(str) ||
    /\bgre\b/i.test(str) ||
    /\beoip\b/i.test(str) ||
    /\btap\b/i.test(str) ||
    /\bcontrol plane\b/i.test(str) ||
    /\boob\b/i.test(str)
  ) {
    return false;
  }

  // If the fallback name is "Port X" where X >= 60, it's typically an internal SNMP virtual index
  const portMatch = name.match(/^Port\s+(\d+)$/i);
  if (portMatch) {
    const portNum = parseInt(portMatch[1], 10);
    if (portNum >= 60) return false;
  }

  return true;
}

export function InterfacesPanel({ device, timeRange }) {
  const [interfaces, setInterfaces] = useState([]);
  const [selectedIfIndex, setSelectedIfIndex] = useState('');
  // Filter mode: 'connected' (default: เฉพาะพอร์ตจริงที่เสียบสายแลนอยู่), 'physical' (พอร์ตจริงทั้งหมด), 'all' (ทุกอินเทอร์เฟซ)
  const [filterMode, setFilterMode] = useState('connected');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [trafficIn, setTrafficIn] = useState([]);
  const [trafficOut, setTrafficOut] = useState([]);

  // Fetch interface list on mount or device change
  useEffect(() => {
    if (!device) return;
    const fetchInterfaces = async () => {
      try {
        const cleanIp = (device.ip || '').trim().replace(/:\d+$/, '');
        // Fetch Description, Operational Status, Alias, and HighSpeed
        const [resDescr, resStatus, resAlias, resSpeed] = await Promise.allSettled([
          promClient.instantQuery(`ifDescr{instance=~".*${cleanIp}.*"}`),
          promClient.instantQuery(`ifOperStatus{instance=~".*${cleanIp}.*"}`),
          promClient.instantQuery(`ifAlias{instance=~".*${cleanIp}.*"}`),
          promClient.instantQuery(`ifHighSpeed{instance=~".*${cleanIp}.*"}`)
        ]);

        const ifMap = new Map();

        if (resDescr.status === 'fulfilled' && resDescr.value) {
          resDescr.value.forEach(item => {
            const index = item.metric.ifIndex;
            if (index) {
              const name = item.metric.ifName || item.metric.ifDescr || `Port ${index}`;
              const alias = item.metric.ifAlias || '';
              ifMap.set(index, { index, name, status: 0, alias, speed: '' });
            }
          });
        }
        
        if (resStatus.status === 'fulfilled' && resStatus.value) {
          resStatus.value.forEach(item => {
            const index = item.metric.ifIndex;
            const status = parseInt(item.value[1], 10);
            const name = item.metric.ifName || item.metric.ifDescr;
            const alias = item.metric.ifAlias || '';
            if (ifMap.has(index)) {
              const cur = ifMap.get(index);
              cur.status = status; // 1 = up (เสียบสายแลนอยู่), 2 = down
              if (name && (!cur.name || cur.name.startsWith('Port '))) {
                cur.name = name;
              }
              if (alias && !cur.alias) {
                cur.alias = alias;
              }
            } else {
              ifMap.set(index, { index, name: name || `Port ${index}`, status, alias, speed: '' });
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

        if (resSpeed.status === 'fulfilled' && resSpeed.value) {
          resSpeed.value.forEach(item => {
            const index = item.metric.ifIndex;
            const speedVal = parseFloat(item.value[1] || 0);
            if (speedVal > 0 && ifMap.has(index)) {
              const speedStr = speedVal >= 1000 ? `${(speedVal / 1000).toFixed(0)} Gbps` : `${speedVal} Mbps`;
              ifMap.get(index).speed = speedStr;
            }
          });
        }

        const ifList = Array.from(ifMap.values()).map(item => ({
          ...item,
          isPhysical: isPhysicalInterface(item.name, item.alias),
          isConnected: item.status === 1,
        })).sort((a, b) => {
          // Sort order: Physical first, then Connected (Up) first, then Natural Alphanumeric
          if (a.isPhysical && !b.isPhysical) return -1;
          if (!a.isPhysical && b.isPhysical) return 1;
          if (a.status === 1 && b.status !== 1) return -1;
          if (a.status !== 1 && b.status === 1) return 1;
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });

        setInterfaces(ifList);

        // Auto-select first active physical connected port (if any), else first physical, else first port
        const firstConnectedPhysical = ifList.find(i => i.isPhysical && i.status === 1);
        const firstPhysical = ifList.find(i => i.isPhysical);
        const initial = firstConnectedPhysical || firstPhysical || ifList[0];
        if (initial) {
          setSelectedIfIndex(initial.index);
        }
      } catch (err) {
        console.error("Error fetching interfaces:", err);
      }
    };
    fetchInterfaces();
  }, [device]);

  // Filtered interfaces according to current filterMode
  const displayedInterfaces = useMemo(() => {
    if (filterMode === 'connected') {
      // พอร์ตจริงที่มีสายแลนเสียบอยู่ (Link UP)
      const connectedPhysical = interfaces.filter(i => i.isPhysical && i.status === 1);
      // Fallback: If no physical port is connected, check if any port is up
      return connectedPhysical.length > 0 ? connectedPhysical : interfaces.filter(i => i.status === 1);
    }
    if (filterMode === 'physical') {
      // พอร์ตจริงหน้าเครื่องทั้งหมด (ทั้งเสียบและไม่ได้เสียบสาย)
      const physical = interfaces.filter(i => i.isPhysical);
      return physical.length > 0 ? physical : interfaces;
    }
    // 'all': ทุกอินเทอร์เฟซ รวม VLAN, Port-Channel ฯลฯ
    return interfaces;
  }, [interfaces, filterMode]);

  // Ensure selected interface is valid in current displayed list
  useEffect(() => {
    if (displayedInterfaces.length > 0) {
      const exists = displayedInterfaces.some(i => i.index === selectedIfIndex);
      if (!exists) {
        setSelectedIfIndex(displayedInterfaces[0].index);
      }
    }
  }, [displayedInterfaces, selectedIfIndex]);

  // Selected interface details
  const selectedIf = useMemo(() => {
    return interfaces.find(i => i.index === selectedIfIndex) || null;
  }, [interfaces, selectedIfIndex]);

  // Count summaries for badge indicators
  const connectedPhysicalCount = useMemo(() => interfaces.filter(i => i.isPhysical && i.status === 1).length, [interfaces]);
  const totalPhysicalCount = useMemo(() => interfaces.filter(i => i.isPhysical).length, [interfaces]);
  const totalAllCount = interfaces.length;

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
    return (bits || 0).toFixed(0) + ' B/s';
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
        label: 'Traffic IN (Rx - Download)',
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
        label: 'Traffic OUT (Tx - Upload)',
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

  const latestIn = trafficIn.length > 0 ? trafficIn[trafficIn.length - 1].y : 0;
  const latestOut = trafficOut.length > 0 ? trafficOut[trafficOut.length - 1].y : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      
      {/* Filter Mode Tabs & Selector Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        
        {/* Scope Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Filter size={13} color="var(--primary)" /> โหมดแสดงพอร์ต:
            </span>
            <button
              type="button"
              onClick={() => setFilterMode('connected')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                border: filterMode === 'connected' ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid var(--border)',
                background: filterMode === 'connected' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.03)',
                color: filterMode === 'connected' ? '#34d399' : 'var(--text-secondary)',
                transition: 'all 0.2s'
              }}
              title="แสดงเฉพาะพอร์ตจริงหน้าเครื่องที่มีสายแลนเสียบอยู่ (Link UP)"
            >
              <Cable size={12} />
              <span>พอร์ตที่เสียบสายแลนอยู่ ({connectedPhysicalCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterMode('physical')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                border: filterMode === 'physical' ? '1px solid rgba(0, 212, 255, 0.5)' : '1px solid var(--border)',
                background: filterMode === 'physical' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255,255,255,0.03)',
                color: filterMode === 'physical' ? 'var(--primary)' : 'var(--text-secondary)',
                transition: 'all 0.2s'
              }}
              title="แสดงพอร์ตจริงหน้าเครื่องทั้งหมด ทั้งเสียบและยังไม่ได้เสียบสาย"
            >
              <Network size={12} />
              <span>พอร์ตจริงทั้งหมด ({totalPhysicalCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterMode('all')}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
                border: filterMode === 'all' ? '1px solid rgba(147, 51, 234, 0.5)' : '1px solid var(--border)',
                background: filterMode === 'all' ? 'rgba(147, 51, 234, 0.2)' : 'rgba(255,255,255,0.03)',
                color: filterMode === 'all' ? '#c084fc' : 'var(--text-muted)',
                transition: 'all 0.2s'
              }}
              title="แสดงทุกอินเทอร์เฟซรวมทั้ง VLAN และ Port-Channel"
            >
              <span>ทุกอินเทอร์เฟซ ({totalAllCount})</span>
            </button>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            เสียบสายแลนใช้งาน: <strong style={{ color: '#34d399' }}>{connectedPhysicalCount}</strong> / {totalPhysicalCount} พอร์ตจริง
          </div>
        </div>

        {/* Interface Dropdown Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)', fontSize: 13, flexShrink: 0 }}>
            <Network size={16} color="var(--primary)" />
            <span>เลือกพอร์ต:</span>
          </div>

          <select
            value={selectedIfIndex}
            onChange={e => setSelectedIfIndex(e.target.value)}
            disabled={displayedInterfaces.length === 0}
            style={{
              flex: 1,
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              outline: 'none',
              cursor: displayedInterfaces.length > 0 ? 'pointer' : 'not-allowed'
            }}
          >
            {displayedInterfaces.length === 0 ? (
              <option value="">-- ไม่พบพอร์ตที่กำลังเชื่อมต่อสายแลนอยู่ --</option>
            ) : (
              displayedInterfaces.map(i => {
                const statusIndicator = i.status === 1 ? '🟢' : '🔴';
                const statusText = i.status === 1 ? 'UP' : 'DOWN';
                const alias = i.alias ? ` (${i.alias})` : '';
                const speed = i.speed ? ` · ${i.speed}` : '';
                const typeTag = !i.isPhysical ? ' [Virtual/VLAN]' : '';
                return (
                  <option key={i.index} value={i.index}>
                    {statusIndicator} {i.name}{alias} · [{statusText}{speed}]{typeTag}
                  </option>
                );
              })
            )}
          </select>
        </div>
      </div>

      {/* Selected Interface Status & Quick Stats Bar */}
      {selectedIf && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: selectedIf.status === 1 ? 'var(--green)' : 'var(--red)',
                boxShadow: selectedIf.status === 1 ? '0 0 8px var(--green)' : 'none'
              }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {selectedIf.name} {selectedIf.alias && <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>({selectedIf.alias})</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {selectedIf.status === 1 ? (
                  <span style={{ color: 'var(--green)', fontWeight: 600 }}>🟢 เสียบสายแลนใช้งานอยู่ (Link UP)</span>
                ) : (
                  <span style={{ color: 'var(--red)' }}>🔴 ไม่ได้เสียบสายแลน (Link DOWN)</span>
                )}
                {selectedIf.speed && <span> · ความเร็วพอร์ต: <strong>{selectedIf.speed}</strong></span>}
                {!selectedIf.isPhysical && <span style={{ color: '#c084fc' }}> · [VLAN/Virtual Interface]</span>}
              </div>
            </div>
          </div>

          {/* Realtime IN / OUT badges for this port */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10b981' }}>
              <ArrowDownLeft size={14} />
              <span style={{ color: 'var(--text-muted)' }}>Rx (IN):</span>
              <strong>{formatBps(latestIn)}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#3b82f6' }}>
              <ArrowUpRight size={14} />
              <span style={{ color: 'var(--text-muted)' }}>Tx (OUT):</span>
              <strong>{formatBps(latestOut)}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Chart Area */}
      <div style={{ background: 'rgba(6,9,19,0.5)', padding: 16, borderRadius: 'var(--radius)', border: '1px solid var(--border)', height: 320 }}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
            <Loader2 size={32} className="spin" style={{ marginBottom: 16 }} />
            <div>กำลังดึงข้อมูลทราฟฟิกของพอร์ต...</div>
          </div>
        ) : error ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}>
            <AlertCircle size={24} style={{ marginBottom: 8 }} />
            <div>เกิดข้อผิดพลาดในการดึงข้อมูล: {error}</div>
          </div>
        ) : (trafficIn.length > 0 || trafficOut.length > 0) ? (
          <Line data={chartData} options={chartOptions} />
        ) : displayedInterfaces.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 8 }}>
            <Cable size={28} style={{ opacity: 0.5 }} />
            <div>ไม่พบพอร์ตจริงที่กำลังเสียบสายแลนอยู่บนอุปกรณ์นี้</div>
            <button
              type="button"
              onClick={() => setFilterMode('physical')}
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '4px 10px', marginTop: 4 }}
            >
              ดูพอร์ตจริงทั้งหมด
            </button>
          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            ไม่มีข้อมูลแบนด์วิดท์บนพอร์ตนี้ในช่วงเวลานี้ (อาจยังไม่มีการรับส่งข้อมูลผ่านสาย)
          </div>
        )}
      </div>

    </div>
  );
}
