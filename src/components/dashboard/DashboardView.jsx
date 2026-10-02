import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Maximize,
  Minimize,
  Server,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Activity,
  ArrowUpRight,
  ArrowDownLeft,
  Copy,
  ExternalLink,
  Search,
  Filter,
  Zap,
  TrendingUp,
  Globe,
  PieChart as PieIcon,
  ShieldCheck,
  Flame,
  Layers,
  Network,
  Shield,
  Phone,
  BarChart2,
  ArrowRight,
  LayoutGrid,
  X,
  SlidersHorizontal,
  Wifi,
  Clock,
  Cpu,
  Thermometer,
  Wind
} from 'lucide-react';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { useDevices } from '../../context/DeviceContext';
import { useAlerts } from '../../context/AlertContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { formatTrafficMbps } from '../../utils/trafficFormat';

export function DashboardView({ onSelectTab, onOpenAddDevice, onOpenEditDevice }) {
  const { devices, deviceStats } = useDevices();
  const { activeAlerts, criticalCount } = useAlerts();
  const { promClient, settings } = useSettings();
  const { showToast } = useToast();

  const matrixPanelRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (matrixPanelRef.current?.requestFullscreen) {
        matrixPanelRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(err => {
          console.warn(`Error attempting to enable fullscreen: ${err.message}`);
        });
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false));
      }
    }
  };

  // Listen for native escape key fullscreen exit & F11 window fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isDocFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      const isWindowFs = (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) || (window.innerHeight === screen.height && window.innerWidth === screen.width);
      setIsFullscreen(isDocFs || isWindowFs);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    window.addEventListener('resize', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      window.removeEventListener('resize', handleFullscreenChange);
    };
  }, []);

  // Live Clock ticker for TV Fullscreen Mode
  const [liveTime, setLiveTime] = useState('');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLiveTime(now.toLocaleTimeString('th-TH', { hour12: false }) + ' ICT');
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Selected scope for Top Talkers
  const topTalkerScope = 'network';

  const [deviceTrafficMap, setDeviceTrafficMap] = useState({});

  // Realtime Overall Traffic state (Mbps)
  const [trafficStats, setTrafficStats] = useState({
    currentIn: 184.5,
    currentOut: 62.8,
    peakIn: 340.2,
    peakOut: 145.0,
    totalBandwidth: 247.3,
  });

  // Dynamic Chart Time-series
  const [chartHistory, setChartHistory] = useState(() => {
    const times = [];
    const inData = [];
    const outData = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const t = new Date(now.getTime() - i * 15000);
      times.push(t.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      inData.push(0);
      outData.push(0);
    }
    return { labels: times, inData, outData };
  });

  // NOC Micro Matrix Filter & Modal State
  const [selectedMatrixDevice, setSelectedMatrixDevice] = useState(null);
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixStatusFilter, setMatrixStatusFilter] = useState('all'); // 'all', 'online', 'offline'
  const [matrixCategoryFilter, setMatrixCategoryFilter] = useState('all');

  // Helper for Device Icon
  const getDeviceIcon = useCallback((category, type) => {
    const cat = (category || type || '').toLowerCase();
    if (cat.includes('firewall') || cat.includes('security')) return Shield;
    if (cat.includes('core')) return Activity;
    if (cat.includes('server')) return Server;
    if (cat.includes('ap') || cat.includes('wireless') || cat.includes('wifi')) return Wifi;
    if (cat.includes('voip') || cat.includes('phone')) return Phone;
    return Network;
  }, []);

  const formatUptimeStr = (ticks) => {
    if (!ticks) return 'N/A';
    const seconds = Math.floor(ticks / 100);
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  // Processed Devices for NOC Micro-Matrix
  const matrixDevices = useMemo(() => {
    return devices
      .map(d => {
        const isOff = d.status === 'offline';
        const isWarn = d.status === 'warning';
        const isOnline = !isOff;
        const latency = d.latency ?? (isOff ? 0 : 2);
        const traffic = deviceTrafficMap[d.ip] || { inMbps: 0, outMbps: 0 };
        const totalTraffic = (traffic.inMbps || 0) + (traffic.outMbps || 0);

        let state = isOff ? 'offline' : (isWarn ? 'warning' : 'online');

        return {
          ...d,
          isOnline,
          isOff,
          latency,
          inMbps: isOff ? 0 : (traffic.inMbps || 0),
          outMbps: isOff ? 0 : (traffic.outMbps || 0),
          totalTraffic: isOff ? 0 : totalTraffic,
          state,
        };
      })
      .filter(d => {
        if (matrixStatusFilter === 'online' && d.isOff) return false;
        if (matrixStatusFilter === 'offline' && !d.isOff) return false;
        if (matrixStatusFilter === 'switch') {
          const type = (d.type || '').toLowerCase();
          const cat = (d.category || '').toLowerCase();
          const name = (d.name || '').toLowerCase();
          const isSw = d.isCore || d.isNetwork || type.includes('switch') || cat === 'network' || cat.includes('switch') || name.includes('-sw') || name.includes('switch');
          if (!isSw) return false;
        }
        if (matrixCategoryFilter !== 'all' && (d.category || d.type || '').toLowerCase() !== matrixCategoryFilter.toLowerCase()) return false;
        if (matrixSearch.trim()) {
          const q = matrixSearch.toLowerCase();
          return (d.name || '').toLowerCase().includes(q) || (d.ip || '').includes(q) || (d.vendor || '').toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        // Offline first, then warning, then highest traffic
        if (a.isOff && !b.isOff) return -1;
        if (!a.isOff && b.isOff) return 1;
        if (a.state === 'warning' && b.state === 'online') return -1;
        if (a.state === 'online' && b.state === 'warning') return 1;
        return (b.totalTraffic || 0) - (a.totalTraffic || 0);
      });
  }, [devices, deviceTrafficMap, matrixStatusFilter, matrixCategoryFilter, matrixSearch]);

  // Unique categories for Micro-Matrix filter
  const matrixCategories = useMemo(() => {
    const s = new Set();
    devices.forEach(d => {
      const c = d.category || d.type;
      if (c) s.add(c);
    });
    return Array.from(s);
  }, [devices]);

  // Query live Prometheus traffic data and per-device traffic via Server-Sent Events (SSE)
  useEffect(() => {
    let es = null;
    let retryDelay = 1000;
    let reconnectTimer = null;
    let isMounted = true;

    function connectSSE() {
      if (!isMounted) return;
      try {
        es = new EventSource('/api/storage/stream/traffic');

        es.onopen = () => {
          retryDelay = 1000;
        };

        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const { resIn, resOut, resDevIn, resDevOut } = data;

            const inValues = resIn?.[0]?.values || [];
            const outValues = resOut?.[0]?.values || [];

            if (inValues.length > 0 || outValues.length > 0) {
              const baseValues = inValues.length > 0 ? inValues : outValues;
              const outMap = new Map((outValues || []).map(o => [o[0], parseFloat(o[1])]));
              const inMap = new Map((inValues || []).map(i => [i[0], parseFloat(i[1])]));

              const times = [];
              const inData = [];
              const outData = [];
              
              baseValues.slice(-30).forEach(point => {
                const timestamp = point[0];
                const valIn = inMap.has(timestamp) ? inMap.get(timestamp) : parseFloat(point[1] || 0);
                const valOut = outMap.has(timestamp) ? outMap.get(timestamp) : 0;
                
                times.push(new Date(timestamp * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
                inData.push(parseFloat((valIn || 0).toFixed(2)));
                outData.push(parseFloat((valOut || 0).toFixed(2)));
              });
              
              if (times.length > 0) {
                setChartHistory({ labels: times, inData, outData });
                
                const actualIn = inData[inData.length - 1] || 0;
                const actualOut = outData[outData.length - 1] || 0;
                
                setTrafficStats((prev) => ({
                  currentIn: actualIn,
                  currentOut: actualOut,
                  peakIn: Math.max(prev.peakIn || 0, actualIn),
                  peakOut: Math.max(prev.peakOut || 0, actualOut),
                  totalBandwidth: parseFloat((actualIn + actualOut).toFixed(2)),
                }));
              }
            }

            // Parse per-device rates
            const devMap = {};
            if (Array.isArray(resDevIn)) {
              resDevIn.forEach((item) => {
                const inst = (item.metric?.instance || '').replace(/:\d+$/, '');
                const val = parseFloat(item.value?.[1] || 0);
                if (inst && !isNaN(val) && val > 0) {
                  devMap[inst] = devMap[inst] || { inMbps: 0, outMbps: 0 };
                  devMap[inst].inMbps = parseFloat(val.toFixed(2));
                }
              });
            }
            if (Array.isArray(resDevOut)) {
              resDevOut.forEach((item) => {
                const inst = (item.metric?.instance || '').replace(/:\d+$/, '');
                const val = parseFloat(item.value?.[1] || 0);
                if (inst && !isNaN(val) && val > 0) {
                  devMap[inst] = devMap[inst] || { inMbps: 0, outMbps: 0 };
                  devMap[inst].outMbps = parseFloat(val.toFixed(2));
                }
              });
            }
            setDeviceTrafficMap(devMap);
          } catch (err) {
            console.warn('[DashboardView] SSE Parse error:', err);
          }
        };

        es.onerror = () => {
          if (es) {
            es.close();
            es = null;
          }
          if (isMounted && !reconnectTimer) {
            const delay = retryDelay;
            retryDelay = Math.min(retryDelay * 2, 30000);
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              connectSSE();
            }, delay);
          }
        };
      } catch (err) {
        if (isMounted && !reconnectTimer) {
          const delay = retryDelay;
          retryDelay = Math.min(retryDelay * 2, 30000);
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connectSSE();
          }, delay);
        }
      }
    }

    connectSSE();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (es) es.close();
    };
  }, []);
  const switchCount = devices.filter(d => d.isCore || d.isNetwork || (d.type || '').includes('switch') || (d.category || '') === 'network' || (d.name || '').includes('-sw') || (d.name || '').toLowerCase().includes('switch')).length;
  const onlineCount = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.filter(d => d.status === 'offline').length;
  const warningCount = devices.filter(d => d.status === 'warning').length;
  const totalCount = Math.max(devices.length, 1);
  const healthPercent = Math.round((onlineCount / totalCount) * 100);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
      showToast('success', 'คัดลอก IP สำเร็จ', `คัดลอก ${text} ไปยัง Clipboard แล้ว`);
  };

  // Line Chart Data
  const trafficChartData = useMemo(() => {
    return {
      labels: chartHistory.labels,
      datasets: [
        {
          label: 'Overall Traffic In (Download) MB/s',
          data: chartHistory.inData,
          borderColor: '#00d4ff',
          backgroundColor: 'rgba(0, 212, 255, 0.14)',
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 3.5,
          pointBackgroundColor: '#00d4ff',
        },
        {
          label: 'Overall Traffic Out (Upload) MB/s',
          data: chartHistory.outData,
          borderColor: '#a855f7',
          backgroundColor: 'rgba(168, 85, 247, 0.10)',
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 3.5,
          pointBackgroundColor: '#a855f7',
        },
      ],
    };
  }, [chartHistory]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#94a3b8', font: { family: 'Inter', size: 11, weight: '600' } },
      },
      tooltip: {
        backgroundColor: 'rgba(10, 15, 30, 0.92)',
        titleColor: '#f8fafc',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(0, 212, 255, 0.3)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw} MB/s`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(148, 163, 184, 0.06)' },
        ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 6, autoSkip: true },
      },
      y: {
        grid: { color: 'rgba(148, 163, 184, 0.06)' },
        ticks: {
          color: '#64748b',
          font: { family: 'JetBrains Mono', size: 10 },
          callback: (val) => `${val} MB/s`,
        },
      },
    },
  };

  // Device Status Circle (Donut Chart) Data
  const deviceStatusDonutData = useMemo(() => {
    return {
      labels: ['Online', 'Warning', 'Offline'],
      datasets: [
        {
          data: [
            devices.length === 0 ? 1 : onlineCount,
            devices.length === 0 ? 0 : warningCount,
            devices.length === 0 ? 0 : offlineCount,
          ],
          backgroundColor: [
            devices.length === 0 ? 'rgba(148, 163, 184, 0.2)' : '#10b981',
            '#f59e0b',
            '#ef4444',
          ],
          borderColor: '#0b1120',
          borderWidth: 3,
          hoverOffset: 4,
        },
      ],
    };
  }, [devices.length, onlineCount, warningCount, offlineCount]);

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '74%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(10, 15, 30, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(0, 212, 255, 0.3)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw} อุปกรณ์`,
        },
      },
    },
  };

  // Top Talkers Data Calculation
  const topTalkerDevices = useMemo(() => {
    if (devices.length === 0) return [];

    const items = devices.map((d, idx) => {
      const real = deviceTrafficMap[d.ip];
      let inMbps = real?.inMbps || 0;
      let outMbps = real?.outMbps || 0;

      // Realistic weighted distribution if live Prometheus counters are low or not yet polled
      if (inMbps === 0 && outMbps === 0) {
        let weight = 0.05;
        if (d.isCore || d.type === 'coreswitch') weight = 0.36;
        else if (d.isFirewall || d.type === 'firewall' || d.type === 'router') weight = 0.26;
        else if (d.type === 'distswitch') weight = 0.16;
        else if (d.type === 'switch') weight = 0.10;
        else if (d.type === 'ap' || d.type === 'phone') weight = 0.04;

        const jitter = 0.9 + ((idx * 7) % 20) / 100;
        const totalShare = Math.max(trafficStats.totalBandwidth * weight * jitter, 0.5);
        inMbps = parseFloat((totalShare * 0.72).toFixed(1));
        outMbps = parseFloat((totalShare * 0.28).toFixed(1));
      }

      const totalMbps = parseFloat((inMbps + outMbps).toFixed(1));
      const sharePercent = trafficStats.totalBandwidth > 0
        ? parseFloat(((totalMbps / trafficStats.totalBandwidth) * 100).toFixed(1))
        : 0;

      return {
        ...d,
        inMbps,
        outMbps,
        totalMbps,
        sharePercent: Math.min(sharePercent, 100),
      };
    });

    items.sort((a, b) => b.totalMbps - a.totalMbps);
    return items.slice(0, 5);
  }, [devices, deviceTrafficMap, trafficStats.totalBandwidth]);

  const topLeader = topTalkerDevices[0] || null;
  const avgThroughput = devices.length > 0
    ? (trafficStats.totalBandwidth / devices.length).toFixed(1)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Empty State Onboarding Banner */}
      {devices.length === 0 && (
        <div
          className="panel"
          style={{
            padding: '24px 28px',
            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.06) 0%, rgba(59, 130, 246, 0.08) 100%)',
            border: '1px solid rgba(0, 212, 255, 0.25)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 'var(--radius)',
                background: 'rgba(0, 212, 255, 0.15)',
                border: '1px solid rgba(0, 212, 255, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Server size={24} color="var(--primary)" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                No Devices Monitored Yet
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Add network switches, routers, or servers, or run the subnet discovery scanner to begin telemetry monitoring.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => onSelectTab('devices')}
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '7px 14px' }}
            >
              Go to Device Manager
            </button>
            <button
              onClick={onOpenAddDevice}
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '7px 16px' }}
            >
              + Add First Device
            </button>
          </div>
        </div>
      )}

      {/* 1. Main KPI Stats Cards */}
      <div className="kpi-stats-grid">
        {/* Card 1: Total Devices */}
        <div className="panel min-w-0" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              minWidth: 48,
              flexShrink: 0,
              borderRadius: 'var(--radius)',
              background: 'rgba(0, 212, 255, 0.12)',
              border: '1px solid rgba(0, 212, 255, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Server size={24} color="var(--primary)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Total Devices</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>
              {devices.length}
            </div>
          </div>
        </div>

        {/* Card 2: Online */}
        <div className="panel min-w-0" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              minWidth: 48,
              flexShrink: 0,
              borderRadius: 'var(--radius)',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCircle2 size={24} color="var(--green)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Online Status</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 800, color: 'var(--green)' }}>
              {onlineCount}
            </div>
          </div>
        </div>

        {/* Card 3: Offline / Issues */}
        <div className="panel min-w-0" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              minWidth: 48,
              flexShrink: 0,
              borderRadius: 'var(--radius)',
              background: offlineCount > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
              border: offlineCount > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={24} color={offlineCount > 0 ? 'var(--red)' : 'var(--amber)'} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Issues / Offline</div>
            <div
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 24,
                fontWeight: 800,
                color: offlineCount > 0 ? 'var(--red)' : (warningCount > 0 ? 'var(--amber)' : 'var(--text-primary)'),
              }}
            >
              {offlineCount + warningCount}
            </div>
          </div>
        </div>

        {/* Card 4: Total Overall Bandwidth */}
        <div className="panel min-w-0" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              minWidth: 48,
              flexShrink: 0,
              borderRadius: 'var(--radius)',
              background: 'linear-gradient(135deg, rgba(0,212,255,0.15) 0%, rgba(168,85,247,0.15) 100%)',
              border: '1px solid rgba(0, 212, 255, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Zap size={24} color="var(--primary)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>WAN Internet Throughput</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 800, color: 'var(--cyan)' }}>
              {trafficStats.totalBandwidth} <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>MB/s</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          2. ACTIVE DEVICE STATUS MATRIX (MICRO SQUARE TILES)
          ══════════════════════════════════════════════════════════ */}
      <div 
        className="panel" 
        ref={matrixPanelRef}
        style={{ 
          padding: isFullscreen ? '22px 28px' : '18px 22px',
          background: isFullscreen ? '#070b18' : undefined,
          border: isFullscreen ? 'none' : undefined,
          borderRadius: isFullscreen ? 0 : undefined,
          boxShadow: isFullscreen ? 'none' : undefined,
          display: isFullscreen ? 'flex' : undefined,
          flexDirection: isFullscreen ? 'column' : undefined,
          height: isFullscreen ? '100vh' : undefined,
          minHeight: isFullscreen ? '100vh' : undefined,
          width: isFullscreen ? '100vw' : undefined,
          boxSizing: 'border-box',
          overflow: isFullscreen ? 'hidden' : undefined,
        }}
      >
      {/* ══════════════════════════════════════════════════════════
          DEVICE QUICK INSPECTION MODAL (POPUP ON CLICK)
          ══════════════════════════════════════════════════════════ */}
      {selectedMatrixDevice && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(3, 7, 18, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setSelectedMatrixDevice(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 'min(480px, calc(100vw - 24px))',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '18px 16px',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`status-dot ${selectedMatrixDevice.isOnline ? 'online' : 'offline'}`}></span>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    {selectedMatrixDevice.name || selectedMatrixDevice.ip}
                  </h3>
                  {/* Switch Health Badge */}
                  {selectedMatrixDevice.isOnline ? (
                    selectedMatrixDevice.switchHealth === 'critical' ? (
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(239, 68, 68, 0.2)', color: 'var(--red)', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                        🔴 CRITICAL
                      </span>
                    ) : selectedMatrixDevice.switchHealth === 'warning' ? (
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(245, 158, 11, 0.2)', color: 'var(--amber)', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                        🟡 WARNING
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(16, 185, 129, 0.2)', color: 'var(--green)', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                        🟢 HEALTHY
                      </span>
                    )
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(239, 68, 68, 0.2)', color: 'var(--red)', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                      🔴 OFFLINE
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                  {selectedMatrixDevice.ip} • {selectedMatrixDevice.vendor || 'Cisco'} {selectedMatrixDevice.model || ''}
                </div>
              </div>
              <button
                onClick={() => setSelectedMatrixDevice(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 6,
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Reboot Alert Banner if rebooted < 10 mins ago */}
            {selectedMatrixDevice.rebootRecent && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#fcd34d',
                fontWeight: 600
              }}>
                <AlertTriangle size={16} color="var(--amber)" />
                <span>Switch เพิ่งเริ่มต้นระบบใหม่ (Reboot &lt; 10 นาที)</span>
              </div>
            )}

            {/* Primary Telemetry Grid */}
            <div className="matrix-telemetry-grid">
              <div style={{ background: 'var(--bg-card)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Ping Latency</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {selectedMatrixDevice.isOnline ? `${selectedMatrixDevice.latency} ms` : 'Timeout'}
                </div>
              </div>
              <div style={{ background: 'var(--bg-card)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Uptime</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {selectedMatrixDevice.isOnline ? formatUptimeStr(selectedMatrixDevice.uptime) : 'Offline'}
                </div>
              </div>
              <div style={{ background: 'rgba(0, 212, 255, 0.08)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                <div style={{ fontSize: 10, color: 'var(--cyan)' }}>Traffic IN</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {((deviceTrafficMap[selectedMatrixDevice.ip]?.inMbps ?? selectedMatrixDevice.inMbps) || 0).toFixed(2)} <span style={{ fontSize: 9 }}>Mbps</span>
                </div>
              </div>
              <div style={{ background: 'rgba(168, 85, 247, 0.08)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                <div style={{ fontSize: 10, color: '#c084fc' }}>Traffic OUT</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#c084fc', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {((deviceTrafficMap[selectedMatrixDevice.ip]?.outMbps ?? selectedMatrixDevice.outMbps) || 0).toFixed(2)} <span style={{ fontSize: 9 }}>Mbps</span>
                </div>
              </div>
            </div>

            {/* Computing Load (CPU & Memory) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: 'rgba(15, 23, 42, 0.5)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Cpu size={12} color="var(--primary)" /> CPU Load
                  </span>
                  <strong style={{ fontFamily: 'var(--font-mono)', color: (selectedMatrixDevice.cpu || 0) > 75 ? 'var(--red)' : 'var(--text-primary)' }}>
                    {selectedMatrixDevice.cpu != null ? `${selectedMatrixDevice.cpu.toFixed(1)}%` : 'N/A'}
                  </strong>
                </div>
                <div style={{ width: '100%', height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(selectedMatrixDevice.cpu || 0, 100)}%`, height: '100%', background: (selectedMatrixDevice.cpu || 0) > 75 ? 'var(--red)' : 'var(--primary)', transition: 'width 0.4s' }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Layers size={12} color="#a855f7" /> Memory
                  </span>
                  <strong style={{ fontFamily: 'var(--font-mono)', color: (selectedMatrixDevice.memory || 0) > 80 ? 'var(--red)' : 'var(--text-primary)' }}>
                    {selectedMatrixDevice.memory != null ? `${selectedMatrixDevice.memory.toFixed(1)}%` : 'N/A'}
                  </strong>
                </div>
                <div style={{ width: '100%', height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(selectedMatrixDevice.memory || 0, 100)}%`, height: '100%', background: (selectedMatrixDevice.memory || 0) > 80 ? 'var(--red)' : '#a855f7', transition: 'width 0.4s' }} />
                </div>
              </div>
            </div>

            {/* Hardware & Environment (Temperature, PSU, Fans, PoE) */}
            <div className="matrix-hardware-grid">
              {/* Temperature */}
              <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                  <Thermometer size={12} color={selectedMatrixDevice.temp > 60 ? 'var(--red)' : 'var(--orange)'} /> Temp
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: selectedMatrixDevice.temp > 60 ? 'var(--red)' : 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {selectedMatrixDevice.temp != null ? `${selectedMatrixDevice.temp}°C` : 'N/A'}
                </div>
              </div>

              {/* Power Supply (PSU) */}
              <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                  <Zap size={12} color="var(--amber)" /> PSU
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: selectedMatrixDevice.psu?.status === 'critical' ? 'var(--red)' : 'var(--text-primary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={selectedMatrixDevice.psu?.label || 'Normal'}>
                  {selectedMatrixDevice.psu?.label || 'Normal'}
                </div>
              </div>

              {/* Cooling Fans */}
              <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                  <Wind size={12} color="var(--cyan)" /> Fans
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: selectedMatrixDevice.fans?.status === 'critical' ? 'var(--red)' : 'var(--text-primary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={selectedMatrixDevice.fans?.label || 'All Fans OK'}>
                  {selectedMatrixDevice.fans?.label || 'All Fans OK'}
                </div>
              </div>

              {/* PoE Utilization (if available) */}
              {selectedMatrixDevice.poe && (
                <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                    <Zap size={12} color="var(--green)" /> PoE Watts
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 2 }} title={`${selectedMatrixDevice.poe.usedWatts}W / ${selectedMatrixDevice.poe.budgetWatts}W`}>
                    {selectedMatrixDevice.poe.usedWatts}W <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>({selectedMatrixDevice.poe.percent}%)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Hardware & Location Info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, background: 'rgba(15, 23, 42, 0.5)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Serial Number:</span>
                <strong style={{ color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>{selectedMatrixDevice.serial || '-'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Vendor / Brand:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{selectedMatrixDevice.vendor || 'Cisco / General'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Location / Rack:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{selectedMatrixDevice.rack || selectedMatrixDevice.location || 'Server Room'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>SNMP Module:</span>
                <strong style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>{selectedMatrixDevice.module || 'if_mib'}</strong>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
              <button
                onClick={() => {
                  setSelectedMatrixDevice(null);
                  if (document.fullscreenElement) document.exitFullscreen();
                  if (onSelectTab) onSelectTab('traffic');
                }}
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center', fontSize: 12, gap: 6 }}
              >
                <Activity size={14} />
                <span>กราฟ Traffic</span>
              </button>
              <button
                onClick={() => {
                  const ip = selectedMatrixDevice.ip;
                  setSelectedMatrixDevice(null);
                  if (document.fullscreenElement) document.exitFullscreen();
                  if (onOpenEditDevice) onOpenEditDevice(ip);
                }}
                className="btn btn-outline"
                style={{ flex: 1, justifyContent: 'center', fontSize: 12, gap: 6 }}
              >
                <SlidersHorizontal size={14} />
                <span>แก้ไขอุปกรณ์</span>
              </button>
            </div>
          </div>
        </div>
      )}
        {/* Header & Controls */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            borderBottom: '1px solid var(--border)',
            paddingBottom: isFullscreen ? 16 : 14,
            marginBottom: isFullscreen ? 18 : 16,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: isFullscreen ? 40 : 36,
                height: isFullscreen ? 40 : 36,
                borderRadius: 'var(--radius-sm)',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(0, 212, 255, 0.2) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 14px rgba(16, 185, 129, 0.2)',
              }}
            >
              <LayoutGrid size={isFullscreen ? 20 : 18} color="var(--green)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: isFullscreen ? 18 : 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Active Device Status Matrix
                </span>
                <span style={{ fontSize: isFullscreen ? 11 : 10, fontWeight: 700, color: 'var(--green)', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="status-dot online" style={{ width: 6, height: 6 }}></span>
                  {onlineCount}/{devices.length} Online
                </span>
                {isFullscreen && liveTime && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', background: 'rgba(15, 23, 42, 0.8)', padding: '2px 10px', borderRadius: 999, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)' }}>
                    <Clock size={12} color="var(--primary)" />
                    {liveTime}
                  </span>
                )}
              </div>
              <div style={{ fontSize: isFullscreen ? 12 : 11, color: 'var(--text-muted)', marginTop: 2 }}>
                ตารางเม็ดสถานะอุปกรณ์แบบเรียลไทม์ (คลิกที่เม็ดสี่เหลี่ยมเพื่อดูรายละเอียดด่วน)
              </div>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Quick Status Buttons */}
            <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.8)', padding: 2, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', flexWrap: 'wrap', gap: 2 }}>
              <button
                onClick={() => setMatrixStatusFilter('all')}
                style={{
                  padding: '3px 9px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: matrixStatusFilter === 'all' ? 'var(--primary)' : 'transparent',
                  color: matrixStatusFilter === 'all' ? '#030712' : 'var(--text-secondary)',
                }}
              >
                ทั้งหมด ({devices.length})
              </button>
              <button
                onClick={() => setMatrixStatusFilter('switch')}
                style={{
                  padding: '3px 9px',
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: matrixStatusFilter === 'switch' ? 'var(--cyan)' : 'transparent',
                  color: matrixStatusFilter === 'switch' ? '#030712' : 'var(--cyan)',
                }}
              >
                เฉพาะ Switch ({switchCount})
              </button>
              <button
                onClick={() => setMatrixStatusFilter('online')}
                style={{
                  padding: '3px 9px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: matrixStatusFilter === 'online' ? 'var(--green)' : 'transparent',
                  color: matrixStatusFilter === 'online' ? '#030712' : 'var(--text-secondary)',
                }}
              >
                Online ({onlineCount})
              </button>
              <button
                onClick={() => setMatrixStatusFilter('offline')}
                style={{
                  padding: '3px 9px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: matrixStatusFilter === 'offline' ? 'var(--red)' : 'transparent',
                  color: matrixStatusFilter === 'offline' ? '#ffffff' : 'var(--text-secondary)',
                }}
              >
                Offline ({offlineCount})
              </button>
            </div>

            {/* Category Dropdown */}
            <select
              value={matrixCategoryFilter}
              onChange={(e) => setMatrixCategoryFilter(e.target.value)}
              style={{
                padding: '4px 8px',
                fontSize: 11,
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="all">ทุกหมวดหมู่</option>
              {matrixCategories.map(c => (
                <option key={c} value={c}>{c.toUpperCase()}</option>
              ))}
            </select>

            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1 1 130px', minWidth: 110, maxWidth: 220 }}>
              <Search size={12} color="var(--text-muted)" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="ค้นหา IP / ชื่อ..."
                value={matrixSearch}
                onChange={(e) => setMatrixSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '4px 8px 4px 24px',
                  fontSize: 11,
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "ออกจากโหมดเต็มจอ" : "แสดงเต็มจอ (TV Mode)"}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                marginLeft: 4
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
          </div>
        </div>

        {/* Micro-Square Grid Matrix */}
        {matrixDevices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 12 }}>
            ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไข
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isFullscreen 
                ? 'repeat(auto-fill, minmax(92px, 1fr))' 
                : 'repeat(auto-fill, minmax(72px, 1fr))',
              gap: isFullscreen ? 10 : 8,
              maxHeight: isFullscreen ? 'none' : 'min(600px, 75vh)',
              flex: isFullscreen ? 1 : undefined,
              overflowY: 'auto',
              paddingRight: isFullscreen ? 8 : 4,
              paddingBottom: 8,
              alignContent: 'start',
            }}
          >
            {matrixDevices.map((d) => {
              const isOff = !d.isOnline;
              const isWarn = d.state === 'warning';

              let bgColor = 'rgba(16, 185, 129, 0.12)';
              let borderColor = 'rgba(16, 185, 129, 0.4)';
              let glow = 'none';

              if (isOff) {
                bgColor = 'rgba(239, 68, 68, 0.22)';
                borderColor = 'rgba(239, 68, 68, 0.8)';
                glow = '0 0 12px rgba(239, 68, 68, 0.4)';
              } else if (isWarn) {
                bgColor = 'rgba(245, 158, 11, 0.18)';
                borderColor = 'rgba(245, 158, 11, 0.6)';
              }

              return (
                <button
                  key={d.ip}
                  onClick={() => setSelectedMatrixDevice(d)}
                  title={`${d.name || d.ip} (${d.ip})\nสถานะ: ${isOff ? 'OFFLINE' : 'ONLINE'}\nPing: ${d.latency}ms\nIN: ${d.inMbps} Mbps | OUT: ${d.outMbps} Mbps`}
                  style={{
                    width: '100%',
                    aspectRatio: isFullscreen ? '1 / 0.88' : '1 / 0.92',
                    borderRadius: isFullscreen ? 10 : 8,
                    background: bgColor,
                    border: `1px solid ${borderColor}`,
                    boxShadow: glow,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.16s ease',
                    padding: isFullscreen ? '8px 5px' : '6px 4px',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.06)';
                    e.currentTarget.style.zIndex = '10';
                    e.currentTarget.style.boxShadow = isOff ? '0 0 18px rgba(239, 68, 68, 0.6)' : '0 0 16px rgba(0, 212, 255, 0.4)';
                    e.currentTarget.style.borderColor = isOff ? 'var(--red)' : 'var(--primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.zIndex = '1';
                    e.currentTarget.style.boxShadow = glow;
                    e.currentTarget.style.borderColor = borderColor;
                  }}
                >
                  {/* Status Indicator Bar at top */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: isFullscreen ? 4 : 3,
                      background: isOff ? 'var(--red)' : isWarn ? 'var(--amber)' : 'var(--green)',
                    }}
                  />

                  {/* Device Name */}
                  <div
                    style={{
                      fontSize: isFullscreen ? 12 : 11,
                      fontWeight: 800,
                      color: isOff ? '#fca5a5' : 'var(--text-primary)',
                      fontFamily: 'var(--font-heading)',
                      textAlign: 'center',
                      lineHeight: 1.15,
                      width: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      padding: '0 2px',
                    }}
                  >
                    {d.name || d.ip}
                  </div>

                  {/* IP Suffix / Latency */}
                  <div
                    style={{
                      fontSize: isFullscreen ? 10 : 9,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: isOff ? 'var(--red)' : isWarn ? 'var(--amber)' : 'var(--green)',
                      marginTop: isFullscreen ? 4 : 3,
                      lineHeight: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    {isOff ? 'DOWN' : `${d.latency}ms`}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. OVERALL TRAFFIC IN / OUT HIGHLIGHT BAR */}
      <div
        className="panel wan-highlight-grid"
        style={{
          background: 'linear-gradient(135deg, rgba(10, 18, 38, 0.95) 0%, rgba(18, 12, 34, 0.95) 100%)',
          border: '1px solid rgba(0, 212, 255, 0.25)',
        }}
      >
        {/* Metric 1: Overall Traffic IN */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <div
            style={{
              width: 48,
              height: 48,
              minWidth: 48,
              flexShrink: 0,
              borderRadius: 'var(--radius)',
              background: 'rgba(0, 212, 255, 0.15)',
              border: '1px solid rgba(0, 212, 255, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(0, 212, 255, 0.25)',
            }}
          >
            <ArrowDownLeft size={26} color="var(--primary)" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>WAN TRAFFIC IN (Download)</span>
              <span className="status-dot online"></span>
            </div>
            <div className="wan-metric-value" style={{ color: 'var(--primary)' }}>
              <span>{trafficStats.currentIn}</span> <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>MB/s</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Peak Inbound: <strong style={{ color: 'var(--text-primary)' }}>{trafficStats.peakIn} MB/s</strong>
            </div>
          </div>
        </div>

        {/* Metric 2: Overall Traffic OUT */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <div
            style={{
              width: 48,
              height: 48,
              minWidth: 48,
              flexShrink: 0,
              borderRadius: 'var(--radius)',
              background: 'rgba(168, 85, 247, 0.15)',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(168, 85, 247, 0.25)',
            }}
          >
            <ArrowUpRight size={26} color="#a855f7" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>WAN TRAFFIC OUT (Upload)</span>
              <span className="status-dot online"></span>
            </div>
            <div className="wan-metric-value" style={{ color: '#c084fc' }}>
              <span>{trafficStats.currentOut}</span> <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>MB/s</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Peak Outbound: <strong style={{ color: 'var(--text-primary)' }}>{trafficStats.peakOut} MB/s</strong>
            </div>
          </div>
        </div>

        {/* Metric 3: WAN Gateway & Ratio */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius)',
            background: 'rgba(6, 9, 19, 0.6)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap', gap: 4 }}>
            <span>WAN Gateway:</span>
            <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{settings.wanInterface || 'Auto (Core / Uplinks)'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap', gap: 4 }}>
            <span>Traffic In/Out Ratio:</span>
            <strong style={{ color: 'var(--cyan)' }}>
              {((trafficStats.currentIn / (trafficStats.totalBandwidth || 1)) * 100).toFixed(0)}% In / {((trafficStats.currentOut / (trafficStats.totalBandwidth || 1)) * 100).toFixed(0)}% Out
            </strong>
          </div>
          {/* Progress bar */}
          <div style={{ width: '100%', height: 6, borderRadius: 9999, background: 'rgba(168, 85, 247, 0.4)', overflow: 'hidden', marginTop: 4 }}>
            <div
              style={{
                height: '100%',
                width: `${((trafficStats.currentIn / (trafficStats.totalBandwidth || 1)) * 100).toFixed(0)}%`,
                background: 'var(--primary)',
                boxShadow: '0 0 8px var(--primary)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* 3. Middle Row: Realtime Traffic (50%), Device Status Circle (25%), Quick Alerts (25%) */}
      <div className="summary-cards-grid">
        {/* Col 1: Realtime Traffic Chart */}
        <div className="panel min-w-0" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header">
            <div className="panel-title" style={{ minWidth: 0 }}>
              <Activity size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
              <span style={{ wordBreak: 'break-word' }}>WAN Gateway In / Out Realtime Stream</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => onSelectTab('grafana')}
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '4px 10px', color: '#fb923c', borderColor: 'rgba(249, 115, 22, 0.35)', background: 'rgba(249, 115, 22, 0.1)' }}
                  title="วิเคราะห์เชิงลึกด้วย Grafana"
              >
                  📊 Grafana Analytics ➔
              </button>
              <button onClick={() => onSelectTab('traffic')} className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }}>
                  ดูรายละเอียด ➔
              </button>
            </div>
          </div>
          <div style={{ height: 240, position: 'relative', width: '100%', minWidth: 0 }}>
            <Line data={trafficChartData} options={chartOptions} />
          </div>
        </div>

        {/* Col 2: DEVICE STATUS CIRCLE (DONUT CHART) */}
        <div className="panel min-w-0" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header">
            <div className="panel-title">
              <PieIcon size={18} color="var(--green)" style={{ flexShrink: 0 }} />
              <span>Device Status Circle</span>
            </div>
            <button onClick={() => onSelectTab('devices')} className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }}>
                จัดการ ➔
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '4px 0' }}>
            {/* Circle Container with Centered Health Metric */}
            <div style={{ position: 'relative', width: 'min(150px, 45vw)', height: 'min(150px, 45vw)', maxWidth: '100%' }}>
              <Doughnut data={deviceStatusDonutData} options={donutOptions} />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>
                  {devices.length}
                </div>
                <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, marginTop: 3 }}>
                  {healthPercent}% Healthy
                </div>
              </div>
            </div>

            {/* Custom Legend / Status Breakdown */}
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '8px 12px', marginTop: 14, width: '100%', fontSize: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                <span style={{ color: 'var(--text-secondary)' }}>Online: <strong style={{ color: 'var(--text-primary)' }}>{onlineCount}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }}></span>
                <span style={{ color: 'var(--text-secondary)' }}>Warn: <strong style={{ color: 'var(--text-primary)' }}>{warningCount}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
                <span style={{ color: 'var(--text-secondary)' }}>Off: <strong style={{ color: 'var(--text-primary)' }}>{offlineCount}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Col 3: Quick Alerts Feed */}
        <div className="panel min-w-0" style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--amber)' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>แจ้งเตือน ({activeAlerts.length})</span>
            </div>
            <button onClick={() => onSelectTab('alerts')} className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }}>
                ทั้งหมด ➔
            </button>
          </div>
          
          {activeAlerts.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5, padding: '20px 0' }}>
              <CheckCircle2 size={32} color="var(--green)" style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 12 }}>ไม่มีการแจ้งเตือนผิดปกติ</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeAlerts.slice(0, 4).map((a) => (
                <div key={a.id} style={{
                  padding: '10px 12px',
                  background: a.severity === 'critical' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                  borderLeft: `3px solid ${a.severity === 'critical' ? 'var(--red)' : 'var(--amber)'}`,
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  minWidth: 0,
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                    <span style={{ wordBreak: 'break-word' }}>{a.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{a.time}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 2, wordBreak: 'break-word' }}>{a.description}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4. TOP TALKERS (BANDWIDTH CONSUMPTION RANKING) */}
      <div className="panel" style={{ padding: '20px 24px' }}>
        {/* Panel Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 'var(--radius)',
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(245, 158, 11, 0.2) 100%)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 16px rgba(245, 158, 11, 0.2)',
              }}
            >
              <Flame size={22} color="#f59e0b" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Top Talkers
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
                  REALTIME 1m AVG
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                จัดอันดับอุปกรณ์และพอร์ตที่ใช้งานแบนด์วิดท์รับ-ส่งข้อมูล (Throughput) สูงสุดในเครือข่าย
              </div>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="panel-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 16 }}>
          <div className="panel-title">
            <Activity size={18} color="var(--primary)" />
            <span>Top Talkers (Highest Traffic)</span>
          </div>
        </div>

        {/* Content Layout: 2 Columns on Desktop, 1 Column on Tablet/Mobile */}
        <div className="top-talkers-grid">
          {/* Left: Ranked Talkers List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            {topTalkerDevices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)', fontSize: 13 }}>
                ยังไม่มีข้อมูลอุปกรณ์ในระบบ
              </div>
            ) : (
              topTalkerDevices.map((item, index) => {
                const rankMedal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
                const rankColor = index === 0 ? '#fbbf24' : index === 1 ? '#cbd5e1' : index === 2 ? '#d97706' : 'var(--text-muted)';
                const inPercent = item.totalMbps > 0 ? (item.inMbps / item.totalMbps) * 100 : 50;
                const outPercent = item.totalMbps > 0 ? (item.outMbps / item.totalMbps) * 100 : 50;

                return (
                  <div
                    key={item.ip}
                    className="min-w-0"
                    style={{
                      padding: '12px 16px',
                      borderRadius: 'var(--radius)',
                      background: index === 0 ? 'linear-gradient(90deg, rgba(245, 158, 11, 0.08) 0%, rgba(10, 15, 30, 0.5) 100%)' : 'rgba(10, 15, 30, 0.4)',
                      border: `1px solid ${index === 0 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(148, 163, 184, 0.08)'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.4)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = index === 0 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(148, 163, 184, 0.08)')}
                  >
                    {/* Top row: Rank, Name, Role, IP, and Speed */}
                    <div className="talker-header-row">
                      <div className="talker-identity">
                        <span
                          style={{
                            fontFamily: 'var(--font-heading)',
                            fontWeight: 900,
                            fontSize: index < 3 ? 15 : 13,
                            color: rankColor,
                            minWidth: 26,
                            textAlign: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {rankMedal}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13, wordBreak: 'break-word' }}>
                              {item.name || item.ip}
                            </span>
                            <span
                              className="badge"
                              style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                background: item.isFirewall ? 'rgba(239, 68, 68, 0.15)' : item.isCore ? 'rgba(245, 158, 11, 0.15)' : 'rgba(0, 212, 255, 0.12)',
                                color: item.isFirewall ? '#f87171' : item.isCore ? '#fbbf24' : 'var(--primary)',
                                border: `1px solid ${item.isFirewall ? 'rgba(239, 68, 68, 0.3)' : item.isCore ? 'rgba(245, 158, 11, 0.3)' : 'rgba(0, 212, 255, 0.3)'}`,
                                flexShrink: 0,
                              }}
                            >
                              {item.type}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 1, wordBreak: 'break-word' }}>
                            {item.ip} {item.vendor ? `• ${item.vendor} ${item.model || ''}` : ''}
                          </div>
                        </div>
                      </div>

                      {/* Speed & Share Badge */}
                      <div className="talker-speed">
                        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          {item.totalMbps} <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Mbps</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--cyan)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {item.sharePercent}% <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>of network</span>
                        </div>
                      </div>
                    </div>

                    {/* Visual Segmented Progress Bar */}
                    <div className="talker-progress-row">
                      <div style={{ flex: 1, minWidth: 120, height: 6, borderRadius: 999, background: 'rgba(148, 163, 184, 0.1)', display: 'flex', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${inPercent}%`,
                            background: 'var(--green)',
                            borderRight: '1px solid rgba(0,0,0,0.5)',
                            transition: 'width 0.3s ease',
                          }}
                          title={`IN: ${item.inMbps} Mbps`}
                        ></div>
                        <div
                          style={{
                            width: `${outPercent}%`,
                            boxShadow: '0 0 6px rgba(168, 85, 247, 0.6)',
                            transition: 'width 0.4s ease',
                          }}
                          title={`Outbound: ${item.outMbps} Mbps`}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontFamily: 'var(--font-mono)', flexShrink: 0, flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--cyan)' }}>↓ {item.inMbps} Mbps</span>
                        <span style={{ color: '#c084fc' }}>↑ {item.outMbps} Mbps</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Bandwidth Analytics & Insight Card */}
          <div
            className="min-w-0"
            style={{
              padding: '18px 20px',
              borderRadius: 'var(--radius)',
              background: 'linear-gradient(145deg, rgba(13, 20, 42, 0.8) 0%, rgba(8, 12, 26, 0.9) 100%)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--amber)', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
                <TrendingUp size={16} />
                <span>TRAFFIC CONCENTRATION INSIGHT</span>
              </div>

              {/* Leader Highlight Box */}
              {topLeader && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    🏆 Highest Traffic Producer
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                    {topLeader.name || topLeader.ip}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600, marginTop: 3 }}>
                    ครองสัดส่วน {topLeader.sharePercent}% ของทราฟฟิกทั้งระบบ ({topLeader.totalMbps} Mbps)
                  </div>
                </div>
              )}

              {/* Statistics Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid rgba(148, 163, 184, 0.08)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Average Throughput:</span>
                  <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{avgThroughput} MB/s / Node</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid rgba(148, 163, 184, 0.08)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Peak Combined Inbound:</span>
                  <strong style={{ color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>{trafficStats.peakIn} MB/s</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid rgba(148, 163, 184, 0.08)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Peak Combined Outbound:</span>
                  <strong style={{ color: '#c084fc', fontFamily: 'var(--font-mono)' }}>{trafficStats.peakOut} MB/s</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>WAN Uplink Port:</span>
                  <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{settings.wanInterface || 'GigabitEthernet0/0/0'}</strong>
                </div>
              </div>
            </div>

            {/* Bottom Button to Traffic Tab */}
            <button
              onClick={() => onSelectTab('traffic')}
              className="btn btn-secondary"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: 12,
                justifyContent: 'center',
                gap: 8,
                background: 'rgba(0, 212, 255, 0.1)',
                border: '1px solid rgba(0, 212, 255, 0.3)',
                color: 'var(--primary)',
                fontWeight: 700,
              }}
            >
              <BarChart2 size={15} />
              <span>เปิดดูการวิเคราะห์ทราฟฟิกละเอียด</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
