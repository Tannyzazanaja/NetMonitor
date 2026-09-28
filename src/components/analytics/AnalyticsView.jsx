import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  Activity,
  Cpu,
  Database,
  ArrowDownLeft,
  ArrowUpRight,
  Shield,
  Clock,
  Calendar,
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  RotateCw,
  Search,
  Server,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Radio,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
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

import { useDevices } from '../../context/DeviceContext';
import { useSettings } from '../../context/SettingsContext';
import {
  ANALYTICS_MODULES,
  TIME_RANGE_PRESETS,
  calculateTimeRange,
  formatTimestamp,
  calculateStatistics,
  fetchAnalyticsData,
  formatDataToCsv,
  downloadCsvFile,
  downloadChartPng
} from '../../services/analyticsService';

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

export function AnalyticsView() {
  const { devices = [] } = useDevices();
  const { promClient } = useSettings();

  // State Management
  const [activeModule, setActiveModule] = useState('cpu');
  const [bandwidthDir, setBandwidthDir] = useState('combined'); // 'in', 'out', 'combined'
  const [timeRange, setTimeRange] = useState('1h');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(Date.now() - 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [customEnd, setCustomEnd] = useState(() => {
    return new Date().toISOString().slice(0, 16);
  });
  const [isCustomApplied, setIsCustomApplied] = useState(false);

  // Device Filter State (Supports 100+ devices seamlessly)
  const [selectedDeviceIp, setSelectedDeviceIp] = useState('all');
  const [deviceSearchTerm, setDeviceSearchTerm] = useState('');
  const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);

  // Telemetry Data & Status States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [isCached, setIsCached] = useState(false);
  const [cacheAgeSeconds, setCacheAgeSeconds] = useState(0);

  const chartRef = useRef(null);
  const dropdownRef = useRef(null);

  // Close device dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDeviceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Fetch telemetry function
  const loadData = useCallback(async (bypassCache = false) => {
    if (bypassCache) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    setIsUnavailable(false);

    try {
      const result = await fetchAnalyticsData({
        moduleKey: activeModule,
        subType: bandwidthDir,
        timeRange,
        customStart: timeRange === 'custom' ? customStart : null,
        customEnd: timeRange === 'custom' ? customEnd : null,
        promClient,
        bypassCache
      });

      if (!result.ok) {
        setIsUnavailable(true);
        setError(result.error || 'Analytics unavailable');
        setAnalyticsData(null);
      } else {
        setAnalyticsData(result);
        setIsCached(!!result.cached);
        setCacheAgeSeconds(result.cacheAgeMs ? Math.round(result.cacheAgeMs / 1000) : 0);
      }
    } catch (err) {
      setIsUnavailable(true);
      setError('Analytics unavailable - ' + err.message);
      setAnalyticsData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeModule, bandwidthDir, timeRange, customStart, customEnd, promClient]);

  // Load telemetry when parameters change
  useEffect(() => {
    if (timeRange === 'custom' && !isCustomApplied) return;
    loadData(false);
  }, [activeModule, bandwidthDir, timeRange, isCustomApplied, loadData]);

  // Filter devices list for dropdown
  const filteredDevices = useMemo(() => {
    const term = deviceSearchTerm.trim().toLowerCase();
    if (!term) return devices;
    return devices.filter(
      (d) =>
        (d.name && d.name.toLowerCase().includes(term)) ||
        (d.ip && d.ip.includes(term)) ||
        (d.vendor && d.vendor.toLowerCase().includes(term)) ||
        (d.location && d.location.toLowerCase().includes(term))
    );
  }, [devices, deviceSearchTerm]);

  // Selected device object
  const currentDevice = useMemo(() => {
    if (selectedDeviceIp === 'all') return null;
    return devices.find((d) => d.ip === selectedDeviceIp) || null;
  }, [devices, selectedDeviceIp]);

  // Current active module config
  const moduleDef = ANALYTICS_MODULES[activeModule] || ANALYTICS_MODULES.cpu;

  // Selected series points and stats (Aggregated or single device)
  const { seriesPoints, stats, seriesLabel } = useMemo(() => {
    if (!analyticsData || !analyticsData.timestamps) {
      return {
        seriesPoints: [],
        stats: { current: 0, avg: 0, max: 0, min: 0 },
        seriesLabel: 'No Data'
      };
    }

    if (selectedDeviceIp === 'all') {
      const pts = analyticsData.aggregatedValues.map(([ts, avg]) => [ts, avg]);
      return {
        seriesPoints: pts,
        stats: analyticsData.overallStats,
        seriesLabel: 'Network Average (All Devices)'
      };
    }

    // Specific device selected
    const devData = analyticsData.deviceSeriesMap?.[selectedDeviceIp];
    if (!devData || !devData.values || devData.values.length === 0) {
      return {
        seriesPoints: [],
        stats: { current: 0, avg: 0, max: 0, min: 0 },
        seriesLabel: `${currentDevice?.name || selectedDeviceIp} (No data)`
      };
    }

    return {
      seriesPoints: devData.values,
      stats: devData.stats,
      seriesLabel: `${currentDevice?.name || selectedDeviceIp} (${selectedDeviceIp})`
    };
  }, [analyticsData, selectedDeviceIp, currentDevice]);

  // Chart.js Data Configuration
  const chartConfig = useMemo(() => {
    if (!seriesPoints || seriesPoints.length === 0) {
      return null;
    }

    const durationSec = analyticsData?.timeParams?.durationSec || 3600;
    const labels = seriesPoints.map(([ts]) => formatTimestamp(ts, durationSec));
    const dataValues = seriesPoints.map(([, val]) => (typeof val === 'number' ? val : parseFloat(val || 0)));

    return {
      labels,
      datasets: [
        {
          label: `${moduleDef.label} (${moduleDef.unit})`,
          data: dataValues,
          borderColor: moduleDef.color,
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return moduleDef.gradientFrom;
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, moduleDef.gradientFrom);
            gradient.addColorStop(1, moduleDef.gradientTo);
            return gradient;
          },
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: seriesPoints.length > 150 ? 0 : 2,
          pointHoverRadius: 5,
          pointBackgroundColor: moduleDef.color,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: moduleDef.color,
          pointHoverBorderWidth: 2
        }
      ]
    };
  }, [seriesPoints, analyticsData, moduleDef]);

  // Chart.js Options Configuration
  const chartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            color: 'var(--text-secondary)',
            font: { size: 11, family: 'Inter, sans-serif' }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(7, 11, 24, 0.95)',
          titleColor: 'var(--text-primary)',
          bodyColor: 'var(--text-primary)',
          borderColor: 'var(--border)',
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed.y;
              return ` ${moduleDef.label}: ${val.toFixed(2)} ${moduleDef.unit}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            drawBorder: false
          },
          ticks: {
            color: 'var(--text-muted)',
            font: { size: 10, family: 'JetBrains Mono, monospace' },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8
          }
        },
        y: {
          min: moduleDef.yMin !== undefined ? moduleDef.yMin : 0,
          max: moduleDef.yMax !== undefined ? moduleDef.yMax : undefined,
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            drawBorder: false
          },
          ticks: {
            color: 'var(--text-muted)',
            font: { size: 10, family: 'JetBrains Mono, monospace' },
            callback: (val) => `${val} ${moduleDef.unit}`
          }
        }
      }
    };
  }, [moduleDef]);

  // Export CSV Handler
  const handleExportCsv = () => {
    if (!seriesPoints || seriesPoints.length === 0) return;
    const durationSec = analyticsData?.timeParams?.durationSec || 3600;
    const csvContent = formatDataToCsv(seriesPoints, durationSec, selectedDeviceIp);
    const filename = `analytics_${activeModule}_${selectedDeviceIp}_${timeRange}.csv`;
    downloadCsvFile(csvContent, filename);
  };

  // Export PNG Handler
  const handleExportPng = () => {
    const filename = `analytics_${activeModule}_${selectedDeviceIp}_${timeRange}.png`;
    downloadChartPng(chartRef, filename);
  };

  // Capacity breakdown rows for the table
  const deviceBreakdown = useMemo(() => {
    if (!analyticsData || !analyticsData.deviceSeriesMap) return [];
    return Object.entries(analyticsData.deviceSeriesMap)
      .map(([ip, data]) => {
        const dev = devices.find((d) => d.ip === ip);
        return {
          ip,
          name: dev?.name || ip,
          vendor: dev?.vendor || 'Generic',
          location: dev?.location || '-',
          stats: data.stats
        };
      })
      .sort((a, b) => (b.stats.max || 0) - (a.stats.max || 0));
  }, [analyticsData, devices]);

  return (
    <div className="analytics-view-container" style={{ padding: '24px 28px', maxWidth: 1600, margin: '0 auto' }}>
      {/* 1. Header Section */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 16
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)',
                border: '1px solid rgba(0, 212, 255, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 20px rgba(0, 212, 255, 0.15)'
              }}
            >
              <TrendingUp size={22} color="var(--cyan)" />
            </div>
            <div>
              <h1
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 22,
                  fontWeight: 800,
                  margin: 0,
                  color: 'var(--text-primary)',
                  letterSpacing: '0.3px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}
              >
                Historical Analytics Platform
                {isCached && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: 'var(--emerald)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Zap size={11} /> 5m Cache ({cacheAgeSeconds}s ago)
                  </span>
                )}
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                วิเคราะห์แนวโน้มสมรรถนะย้อนหลังผ่าน Prometheus Range Query (Capacity Planning &amp; Troubleshooting)
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)'
            }}
            title="รีเฟรชข้อมูลโดยดึงตรงจาก Prometheus (Bypass Cache)"
          >
            <RotateCw size={14} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'กำลังดึงข้อมูล...' : 'รีเฟรช'}
          </button>

          <button
            onClick={handleExportCsv}
            disabled={!seriesPoints || seriesPoints.length === 0}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)'
            }}
            title="ดาวน์โหลดข้อมูลย้อนหลังรูปแบบ CSV (Timestamp, Value)"
          >
            <FileSpreadsheet size={14} color="var(--emerald)" />
            Export CSV
          </button>

          <button
            onClick={handleExportPng}
            disabled={!seriesPoints || seriesPoints.length === 0}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)'
            }}
            title="ดาวน์โหลดรูปภาพกราฟความละเอียดสูง (PNG)"
          >
            <ImageIcon size={14} color="var(--cyan)" />
            Export PNG
          </button>
        </div>
      </div>

      {/* 2. Module Selector Tabs (7 Supported Analytics Modules) */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 18,
          overflowX: 'auto',
          paddingBottom: 6,
          borderBottom: '1px solid var(--border)'
        }}
      >
        {Object.values(ANALYTICS_MODULES).map((mod) => {
          const isActive = activeModule === mod.id;
          return (
            <button
              key={mod.id}
              onClick={() => setActiveModule(mod.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 'var(--radius-sm)',
                border: isActive ? `1px solid ${mod.color}` : '1px solid var(--border)',
                background: isActive ? `rgba(${mod.id === 'cpu' ? '0, 212, 255' : mod.id === 'memory' ? '168, 85, 247' : mod.id === 'bandwidth' ? '16, 185, 129' : '59, 130, 246'}, 0.12)` : 'var(--bg-card)',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
                boxShadow: isActive ? `0 0 16px ${mod.gradientFrom}` : 'none'
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: mod.color,
                  boxShadow: isActive ? `0 0 8px ${mod.color}` : 'none'
                }}
              />
              {mod.label}
            </button>
          );
        })}
      </div>

      {/* 3. Toolbar: Device Filter & Time Range Selector */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          background: 'var(--bg-card)',
          padding: '14px 18px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          marginBottom: 20,
          flexWrap: 'wrap'
        }}
      >
        {/* Device Selector Dropdown (Supports 100+ Devices seamlessly) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }} ref={dropdownRef}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            อุปกรณ์ (Target):
          </span>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIsDeviceDropdownOpen(!isDeviceDropdownOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                minWidth: 240,
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                <Server size={14} color="var(--cyan)" />
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {selectedDeviceIp === 'all'
                    ? `🌐 All Devices (${analyticsData?.deviceCount || devices.length} Units)`
                    : `${currentDevice?.name || selectedDeviceIp} (${selectedDeviceIp})`}
                </span>
              </div>
              <ChevronDown size={14} color="var(--text-muted)" />
            </button>

            {/* Dropdown Menu */}
            {isDeviceDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 6,
                  width: 320,
                  maxHeight: 380,
                  background: 'rgba(10, 15, 30, 0.98)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
                  zIndex: 200,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}
              >
                {/* Search Box */}
                <div style={{ padding: 10, borderBottom: '1px solid var(--border)', position: 'relative' }}>
                  <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 18, top: 18 }} />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อ, IP, ยี่ห้อ..."
                    value={deviceSearchTerm}
                    onChange={(e) => setDeviceSearchTerm(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px 7px 32px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: 12,
                      outline: 'none'
                    }}
                    autoFocus
                  />
                </div>

                {/* Device List */}
                <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                  <div
                    onClick={() => {
                      setSelectedDeviceIp('all');
                      setIsDeviceDropdownOpen(false);
                    }}
                    style={{
                      padding: '8px 14px',
                      fontSize: 13,
                      cursor: 'pointer',
                      background: selectedDeviceIp === 'all' ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                      color: selectedDeviceIp === 'all' ? 'var(--cyan)' : 'var(--text-primary)',
                      fontWeight: selectedDeviceIp === 'all' ? 700 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      borderBottom: '1px dashed var(--border)'
                    }}
                  >
                    <span>🌐</span> All Devices (Network Aggregated)
                  </div>

                  {filteredDevices.map((d) => (
                    <div
                      key={d.ip}
                      onClick={() => {
                        setSelectedDeviceIp(d.ip);
                        setIsDeviceDropdownOpen(false);
                      }}
                      style={{
                        padding: '8px 14px',
                        fontSize: 12,
                        cursor: 'pointer',
                        background: selectedDeviceIp === d.ip ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                        color: selectedDeviceIp === d.ip ? 'var(--cyan)' : 'var(--text-primary)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600 }}>{d.name || d.ip}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{d.ip}</div>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {d.vendor || 'Switch'}
                      </span>
                    </div>
                  ))}
                  {filteredDevices.length === 0 && (
                    <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                      ไม่พบอุปกรณ์ที่ตรงกัน
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sub-selector for Bandwidth (In / Out / Combined) */}
          {activeModule === 'bandwidth' && (
            <div
              style={{
                display: 'flex',
                background: 'rgba(255, 255, 255, 0.04)',
                borderRadius: 'var(--radius-sm)',
                padding: 2,
                border: '1px solid var(--border)'
              }}
            >
              {[
                { id: 'in', label: 'Inbound' },
                { id: 'out', label: 'Outbound' },
                { id: 'combined', label: 'Combined' }
              ].map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setBandwidthDir(sub.id)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    background: bandwidthDir === sub.id ? 'var(--emerald)' : 'transparent',
                    color: bandwidthDir === sub.id ? '#030712' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Time Range Pills (Required: 1h, 6h, 24h, 7d, 30d, custom) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            ช่วงเวลา:
          </span>

          <div
            style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.04)',
              borderRadius: 'var(--radius-sm)',
              padding: 2,
              border: '1px solid var(--border)'
            }}
          >
            {TIME_RANGE_PRESETS.map((preset) => {
              const isSelected = timeRange === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => {
                    setTimeRange(preset.id);
                    if (preset.id !== 'custom') setIsCustomApplied(false);
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: isSelected ? 700 : 500,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--primary)' : 'transparent',
                    color: isSelected ? '#030712' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Custom Range Date Pickers (Shown only when 'custom' is active) */}
      {timeRange === 'custom' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(0, 212, 255, 0.05)',
            border: '1px solid rgba(0, 212, 255, 0.2)',
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            marginBottom: 20,
            flexWrap: 'wrap'
          }}
        >
          <Calendar size={16} color="var(--cyan)" />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cyan)' }}>กำหนดช่วงเวลา Custom Range:</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>จาก:</span>
            <input
              type="datetime-local"
              value={customStart}
              onChange={(e) => {
                setCustomStart(e.target.value);
                setIsCustomApplied(false);
              }}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ถึง:</span>
            <input
              type="datetime-local"
              value={customEnd}
              onChange={(e) => {
                setCustomEnd(e.target.value);
                setIsCustomApplied(false);
              }}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12
              }}
            />
          </div>

          <button
            onClick={() => {
              setIsCustomApplied(true);
              loadData(false);
            }}
            className="btn btn-primary"
            style={{ padding: '5px 14px', fontSize: 12, borderRadius: 'var(--radius-sm)' }}
          >
            ค้นหา (Apply)
          </button>
        </div>
      )}

      {/* 4. Statistics Summary KPI Cards (Average, Maximum, Minimum, Current Value) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 20
        }}
      >
        {/* Card 1: Current Value */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            boxShadow: 'var(--shadow-card)',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Current Value (ค่าล่าสุด)
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 26,
                fontWeight: 800,
                color: moduleDef.color
              }}
            >
              {loading ? '...' : stats.current}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{moduleDef.unit}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {selectedDeviceIp === 'all' ? 'ค่าเฉลี่ยทุกโฮสต์ขณะนี้' : `ณ จุดเวลาล่าสุด (${selectedDeviceIp})`}
          </div>
        </div>

        {/* Card 2: Average */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            boxShadow: 'var(--shadow-card)'
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Average (ค่าเฉลี่ยตลอดช่วงเวลา)
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 26,
                fontWeight: 800,
                color: 'var(--text-primary)'
              }}
            >
              {loading ? '...' : stats.avg}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{moduleDef.unit}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            คำนวณจาก {stats.count || 0} จุดข้อมูล (Interval: {analyticsData?.timeParams?.step || '30s'})
          </div>
        </div>

        {/* Card 3: Maximum Peak */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            boxShadow: 'var(--shadow-card)'
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Maximum (ค่าสูงสุด / Peak Spike)
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 26,
                fontWeight: 800,
                color: stats.max > 80 && activeModule === 'cpu' ? 'var(--red)' : 'var(--amber)'
              }}
            >
              {loading ? '...' : stats.max}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{moduleDef.unit}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            จุดพีคสูงสุดสำหรับ Capacity Planning
          </div>
        </div>

        {/* Card 4: Minimum */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            boxShadow: 'var(--shadow-card)'
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Minimum (ค่าต่ำสุด)
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 26,
                fontWeight: 800,
                color: 'var(--emerald)'
              }}
            >
              {loading ? '...' : stats.min}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{moduleDef.unit}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            ฐานต่ำสุดของทราฟฟิก / โหลดในระบบ
          </div>
        </div>
      </div>

      {/* 5. Main Chart Section */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '20px 24px',
          boxShadow: 'var(--shadow-card)',
          marginBottom: 24,
          position: 'relative',
          minHeight: 440
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {moduleDef.titleTh} · <span style={{ color: moduleDef.color }}>{seriesLabel}</span>
            </h2>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              PromQL Range Query: <code style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{analyticsData?.moduleDef?.query?.slice(0, 90)}...</code>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 4,
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)'
              }}
            >
              Step: {analyticsData?.timeParams?.step || 'auto'}
            </span>
          </div>
        </div>

        {/* Error / Prometheus Down State (Mandatory Graceful Handling: "Analytics unavailable") */}
        {isUnavailable && (
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              background: 'rgba(239, 68, 68, 0.06)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              margin: '30px 0'
            }}
          >
            <AlertTriangle size={42} color="var(--red)" style={{ marginBottom: 12 }} />
            <h3 style={{ fontSize: 18, color: 'var(--red)', margin: '0 0 8px', fontWeight: 800 }}>
              Analytics unavailable
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 520, margin: '0 auto 16px' }}>
              ไม่สามารถดึงข้อมูลประวัติย้อนหลังได้ เนื่องจากไม่สามารถเชื่อมต่อกับ Prometheus Server (Port 9090) ได้ในขณะนี้
            </p>
            <button
              onClick={() => loadData(true)}
              className="btn btn-secondary"
              style={{ padding: '8px 18px', fontSize: 12, borderRadius: 'var(--radius-sm)' }}
            >
              <RotateCw size={14} style={{ marginRight: 6 }} /> ลองใหม่อีกครั้ง (Retry Connection)
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && !isUnavailable && (
          <div
            style={{
              height: 340,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12
            }}
          >
            <div className="spin" style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: 'var(--cyan)', borderRadius: '50%' }} />
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
              กำลังประมวลผล Prometheus Range Query...
            </div>
          </div>
        )}

        {/* Interactive Chart Canvas */}
        {!loading && !isUnavailable && chartConfig && (
          <div style={{ height: 360, width: '100%' }}>
            <Line ref={chartRef} data={chartConfig} options={chartOptions} />
          </div>
        )}

        {!loading && !isUnavailable && (!chartConfig || seriesPoints.length === 0) && (
          <div
            style={{
              height: 340,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'var(--text-muted)'
            }}
          >
            <Activity size={32} />
            <div style={{ fontSize: 13 }}>ไม่มีข้อมูล Time-series ในช่วงเวลาที่เลือก</div>
          </div>
        )}
      </div>

      {/* 6. Capacity Planning & Breakdown Table across all devices */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '20px 24px',
          boxShadow: 'var(--shadow-card)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Device Capacity &amp; Telemetry Breakdown ({deviceBreakdown.length} อุปกรณ์)
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              เรียงลำดับตามค่าสูงสุด (Peak Spike) เพื่อช่วยประเมิน Capacity Planning และระบุจุดคอขวดในเครือข่าย
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '10px 14px' }}>อุปกรณ์ / Host</th>
                <th style={{ padding: '10px 14px' }}>IP Address</th>
                <th style={{ padding: '10px 14px' }}>ยี่ห้อ (Vendor)</th>
                <th style={{ padding: '10px 14px' }}>Current</th>
                <th style={{ padding: '10px 14px' }}>Average</th>
                <th style={{ padding: '10px 14px' }}>Peak (Max)</th>
                <th style={{ padding: '10px 14px' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {deviceBreakdown.slice(0, 20).map((row) => {
                const isSelected = selectedDeviceIp === row.ip;
                const isHigh = row.stats.max > 80 && (activeModule === 'cpu' || activeModule === 'memory');
                const isWarning = row.stats.max > 60 && !isHigh;

                return (
                  <tr
                    key={row.ip}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      background: isSelected ? 'rgba(0, 212, 255, 0.08)' : 'transparent',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {row.name}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>
                      {row.ip}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                      {row.vendor}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      {row.stats.current} {moduleDef.unit}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {row.stats.avg} {moduleDef.unit}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: isHigh ? 'var(--red)' : isWarning ? 'var(--amber)' : 'var(--text-primary)' }}>
                      {row.stats.max} {moduleDef.unit}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: isHigh ? 'rgba(239, 68, 68, 0.15)' : isWarning ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: isHigh ? 'var(--red)' : isWarning ? 'var(--amber)' : 'var(--emerald)',
                          border: `1px solid ${isHigh ? 'rgba(239, 68, 68, 0.3)' : isWarning ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
                        }}
                      >
                        {isHigh ? 'CRITICAL PEAK' : isWarning ? 'WARNING' : 'NORMAL'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <button
                        onClick={() => {
                          setSelectedDeviceIp(row.ip);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        style={{
                          background: isSelected ? 'var(--cyan)' : 'rgba(255, 255, 255, 0.06)',
                          color: isSelected ? '#030712' : 'var(--text-primary)',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {isSelected ? 'กำลังดู' : 'ดูกราฟ'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {deviceBreakdown.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                    ไม่มีข้อมูล Telemetry สำหรับตารางสรุป
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
