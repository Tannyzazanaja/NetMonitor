import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StorageService } from '../services/storageService';
import {
  discoverLinks,
  calculateHierarchy,
  calculateNodeHealth,
  executeTopologyDiscoveryPipeline,
  computeHierarchicalLayout,
  computeForceDirectedLayout,
  computeRadarLayout,
  cleanInstance,
  formatIpOrAddress,
  resolveRealDeviceIp,
  findMatchingPromInstance,
  isPhysicalPort,
  buildCanonicalEdgeKey,
  deduplicateLinks,
  NODE_TYPES,
  EDGE_TYPES,
  getNodeTypeMetadata,
} from '../services/topologyEngine';
import { isInfrastructureDevice } from '../services/deviceClassifier';
import { useSettings } from './SettingsContext';
import { useDevices } from './DeviceContext';

const TopologyContext = createContext(null);

export function TopologyProvider({ children }) {
  const { devices } = useDevices();
  const { promClient } = useSettings();

  const devicesRef = useRef(devices);
  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  // Signature based strictly on device inventory IDs, preventing polling telemetry from triggering link rediscovery
  const deviceKeys = useMemo(() => devices.map(d => d.ip).sort().join(','), [devices]);

  // Structural signature: only changes when inventory or status changes, completely ignoring CPU/Memory fluctuations
  const structuralDevicesSignature = devices.map(d => `${d.ip}:${d.status}:${d.name}:${d.type}:${d.isCore}:${d.isFirewall}`).join('|');

  const structuralDevices = useMemo(() => {
    return devices.map(d => ({
      ip: d.ip,
      name: d.name,
      type: d.type,
      vendor: d.vendor,
      model: d.model,
      category: d.category,
      status: d.status,
      isOnline: d.isOnline,
      isCore: d.isCore,
      isFirewall: d.isFirewall,
      isNetwork: d.isNetwork,
      cpu: d.cpu,
      memory: d.memory,
      latency: d.latency,
      switchHealth: d.switchHealth,
    }));
  }, [structuralDevicesSignature]);

  const [layoutMode, setLayoutMode] = useState('hierarchical'); // 'hierarchical' | 'force' | 'radar' | 'free' | 'grid'
  const [persistedPositions, setPersistedPositions] = useState(() => StorageService.getTopologyPositions());
  const [persistedTopology, setPersistedTopology] = useState(() => StorageService.getTopology());
  const [selectedNode, setSelectedNode] = useState(null);
  const [neighborModalNode, setNeighborModalNode] = useState(null);
  const [rawLinks, setRawLinks] = useState([]);
  const [sysNameMap, setSysNameMap] = useState({});
  const [targetCatalog, setTargetCatalog] = useState([]);
  const [macMap, setMacMap] = useState(() => new Map());
  const [ifNameMap, setIfNameMap] = useState({});
  const [rawDiscoveryData, setRawDiscoveryData] = useState({
    cdpDeviceId: [],
    cdpCacheAddr: [],
    cdpCachePrimaryAddr: [],
    cdpCachePlatform: [],
    cdpCacheDevicePort: [],
    lldpRemSysName: [],
    lldpRemManAddr: [],
    lldpRemPortDesc: [],
    ifOperStatus: [],
  });
  const [isLoading, setIsLoading] = useState(false);

  // Semi-Automatic Discovery Pipeline State
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryPreview, setDiscoveryPreview] = useState(null);
  const [isDiscoveryModalOpen, setIsDiscoveryModalOpen] = useState(false);

  // Query CDP, LLDP, ARP, and MAC data from Prometheus
  const refreshTopology = useCallback(async () => {
    const currentDevices = devicesRef.current;
    if (!promClient || currentDevices.length === 0) {
      setRawLinks([]);
      return;
    }

    setIsLoading(true);
    try {
      const [
        rSysName,
        rLldpName,
        rLldpAddr,
        rLldpPort,
        rCdpDev,
        rCdpAddr,
        rCdpPrimaryAddr,
        rCdpPlat,
        rCdpPort,
        rIfPhys,
        rArpNet,
        rArpPhys,
        rIfOper,
        rTargets,
      ] = await Promise.allSettled([
        promClient.instantQuery('sysName'),
        promClient.instantQuery('lldpRemSysName'),
        promClient.instantQuery('lldpRemManAddr'),
        promClient.instantQuery('lldpRemPortDesc'),
        promClient.instantQuery('cdpCacheDeviceId'),
        promClient.instantQuery('cdpCacheAddress'),
        promClient.instantQuery('cdpCachePrimaryMgmtAddr'),
        promClient.instantQuery('cdpCachePlatform'),
        promClient.instantQuery('cdpCacheDevicePort'),
        promClient.instantQuery('ifPhysAddress'),
        promClient.instantQuery('ipNetToMediaNetAddress'),
        promClient.instantQuery('ipNetToMediaPhysAddress'),
        promClient.instantQuery('ifOperStatus'),
        promClient.getTargets(),
      ]);

      // 1. Build sysName map
      const sMap = {};
      if (rSysName.status === 'fulfilled' && Array.isArray(rSysName.value)) {
        rSysName.value.forEach(item => {
          const t = cleanInstance(item.metric?.instance);
          const n = item.metric?.sysName || item.value?.[1];
          if (t && n) sMap[t] = n;
        });
      }
      setSysNameMap(sMap);

      // 2. Build MAC Address Map & Interface Name Map (from ifPhysAddress)
      const newMacMap = new Map();
      const newIfNameMap = {};
      if (rIfPhys.status === 'fulfilled' && Array.isArray(rIfPhys.value)) {
        rIfPhys.value.forEach(item => {
          const ip = cleanInstance(item.metric?.instance);
          const idx = item.metric?.ifIndex;
          const name = item.metric?.ifName || item.metric?.ifDescr;
          if (ip && idx && name) {
            newIfNameMap[`${ip}_${idx}`] = name;
          }

          const mac = (item.metric?.ifPhysAddress || '').toLowerCase().replace(/[-_:\s]/g, '');
          if (ip && mac && mac.length >= 12) {
            newMacMap.set(mac, ip);
          }
        });
      }
      setIfNameMap(newIfNameMap);

      // Merge ARP Table metrics (ipNetToMediaPhysAddress) if available
      if (rArpPhys.status === 'fulfilled' && Array.isArray(rArpPhys.value)) {
        rArpPhys.value.forEach(item => {
          const arpIp = item.metric?.ipNetToMediaNetAddress;
          const arpMac = (item.metric?.ipNetToMediaPhysAddress || item.value?.[1] || '').toLowerCase().replace(/[-_:\s]/g, '');
          if (arpIp && arpMac && arpMac.length >= 12) {
            newMacMap.set(arpMac, arpIp);
          }
        });
      }
      setMacMap(newMacMap);

      // 3. Build Target Catalog
      const newCatalog = [];
      const seenIps = new Set();
      if (rTargets.status === 'fulfilled' && Array.isArray(rTargets.value)) {
        rTargets.value.forEach(t => {
          const labels = t.labels || {};
          const ip = cleanInstance(labels.instance || t.discoveredLabels?.__address__);
          if (ip && !seenIps.has(ip)) {
            seenIps.add(ip);
            newCatalog.push({
              ip,
              name: labels.name || '',
              model: labels.model || '',
              vendor: labels.vendor || '',
              serial: labels.serial || '',
              site: labels.site || '',
              role: labels.role || '',
            });
          }
        });
      }
      setTargetCatalog(newCatalog);

      const discoveryPayload = {
        cdpDeviceId: rCdpDev.status === 'fulfilled' && Array.isArray(rCdpDev.value) ? rCdpDev.value : [],
        cdpCacheAddr: rCdpAddr.status === 'fulfilled' && Array.isArray(rCdpAddr.value) ? rCdpAddr.value : [],
        cdpCachePrimaryAddr: rCdpPrimaryAddr.status === 'fulfilled' && Array.isArray(rCdpPrimaryAddr.value) ? rCdpPrimaryAddr.value : [],
        cdpCachePlatform: rCdpPlat.status === 'fulfilled' && Array.isArray(rCdpPlat.value) ? rCdpPlat.value : [],
        cdpCacheDevicePort: rCdpPort.status === 'fulfilled' && Array.isArray(rCdpPort.value) ? rCdpPort.value : [],
        lldpRemSysName: rLldpName.status === 'fulfilled' && Array.isArray(rLldpName.value) ? rLldpName.value : [],
        lldpRemManAddr: rLldpAddr.status === 'fulfilled' && Array.isArray(rLldpAddr.value) ? rLldpAddr.value : [],
        lldpRemPortDesc: rLldpPort.status === 'fulfilled' && Array.isArray(rLldpPort.value) ? rLldpPort.value : [],
        ifOperStatus: rIfOper.status === 'fulfilled' && Array.isArray(rIfOper.value) ? rIfOper.value : [],
      };

      setRawDiscoveryData(discoveryPayload);

      // Map device list with any typo correction for topology links
      const allPromInstances = [
        ...discoveryPayload.cdpDeviceId.map(r => cleanInstance(r.metric?.instance)),
        ...discoveryPayload.lldpRemSysName.map(r => cleanInstance(r.metric?.instance)),
      ];

      const mappedDevices = currentDevices.map(d => {
        const matched = findMatchingPromInstance(d.ip, allPromInstances);
        return matched && matched !== d.ip ? { ...d, originalIp: d.ip, ip: matched } : d;
      });

      const links = discoverLinks({
        devices: mappedDevices,
        sysNameMap: sMap,
        macMap: newMacMap,
        targetCatalog: newCatalog,
        ifNameMap: newIfNameMap,
        ...discoveryPayload,
      });

      setRawLinks(links);
    } catch (e) {
      console.warn('[TopologyContext] Link refresh error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [promClient]);

  // Only refresh topology on initial mount, promClient change, or device inventory change
  useEffect(() => {
    refreshTopology();
  }, [refreshTopology, deviceKeys]);

  // Compute 4-Tier Hierarchy Nodes using structuralDevices with 9 Node Types and Node Health
  const topoNodes = useMemo(() => {
    return calculateHierarchy(structuralDevices, rawLinks);
  }, [structuralDevices, rawLinks]);

  // Compute node coordinates based on layoutMode with manual drag position overlay
  const nodePositions = useMemo(() => {
    let base;
    if (layoutMode === 'radar') {
      base = computeRadarLayout(topoNodes);
    } else if (layoutMode === 'force') {
      base = computeForceDirectedLayout(topoNodes, rawLinks);
    } else {
      base = computeHierarchicalLayout(topoNodes, rawLinks);
    }

    const merged = { ...base };
    if (persistedPositions && typeof persistedPositions === 'object') {
      Object.entries(persistedPositions).forEach(([id, pos]) => {
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          merged[id] = pos;
        }
      });
    }
    return merged;
  }, [topoNodes, rawLinks, layoutMode, persistedPositions]);

  // Handle explicit layout mode changes and recalculate baseline coordinates
  const handleSetLayoutMode = useCallback((newMode) => {
    setLayoutMode(newMode);
    if (newMode === 'hierarchical' || newMode === 'tree') {
      const treePos = computeHierarchicalLayout(topoNodes, rawLinks);
      setPersistedPositions(treePos);
      StorageService.saveTopologyPositions(treePos);
    } else if (newMode === 'force') {
      const forcePos = computeForceDirectedLayout(topoNodes, rawLinks);
      setPersistedPositions(forcePos);
      StorageService.saveTopologyPositions(forcePos);
    } else if (newMode === 'radar') {
      const radarPos = computeRadarLayout(topoNodes);
      setPersistedPositions(radarPos);
      StorageService.saveTopologyPositions(radarPos);
    }
  }, [topoNodes, rawLinks]);

  // Sync positions from server state on mount
  useEffect(() => {
    const syncPositionsFromServer = async () => {
      try {
        const data = await StorageService.loadServerState();
        if (data) {
          if (data.topologyPositions && typeof data.topologyPositions === 'object' && Object.keys(data.topologyPositions).length > 0) {
            setPersistedPositions(prev => ({
              ...(data.topologyPositions || {}),
              ...(prev || {}),
            }));
          }
          if (data.topology) {
            setPersistedTopology(data.topology);
          }
        }
      } catch (e) {
        console.warn('[TopologyContext] Positions sync error:', e);
      }
    };
    syncPositionsFromServer();
  }, []);

  const saveTimeoutRef = useRef(null);

  // Update node position during Drag & Drop with debounced server write
  const updateNodePosition = useCallback((nodeId, x, y) => {
    setPersistedPositions(prev => {
      const updated = {
        ...(prev || {}),
        [nodeId]: { x: Math.round(x), y: Math.round(y) },
      };

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        StorageService.saveTopologyPositions(updated);
      }, 400);

      return updated;
    });
  }, []);

  // Semi-Automatic Discovery Execution
  const runDiscoveryPipeline = useCallback(async () => {
    setIsDiscovering(true);
    try {
      const currentDevices = devicesRef.current;
      const allPromInstances = [
        ...(rawDiscoveryData.cdpDeviceId || []).map(r => cleanInstance(r.metric?.instance)),
        ...(rawDiscoveryData.lldpRemSysName || []).map(r => cleanInstance(r.metric?.instance)),
      ];

      const mappedDevices = currentDevices.map(d => {
        const matched = findMatchingPromInstance(d.ip, allPromInstances);
        return matched && matched !== d.ip ? { ...d, originalIp: d.ip, ip: matched } : d;
      });

      const pipelineResult = await executeTopologyDiscoveryPipeline({
        devices: mappedDevices,
        promClient,
        targetCatalog,
        sysNameMap,
        macMap,
        ifNameMap,
        rawDiscoveryData,
        existingEdges: rawLinks,
      });

      setDiscoveryPreview(pipelineResult);
      setIsDiscoveryModalOpen(true);
      return pipelineResult;
    } catch (err) {
      console.error('[TopologyContext] Discovery pipeline failed:', err);
      return null;
    } finally {
      setIsDiscovering(false);
    }
  }, [rawDiscoveryData, promClient, targetCatalog, sysNameMap, macMap, ifNameMap, rawLinks]);

  // Apply Discovered Topology & Persist to Server
  const applyDiscovery = useCallback(async (selectedLayout = 'hierarchical') => {
    if (!discoveryPreview) return;

    const { nodes, edges } = discoveryPreview;
    setRawLinks(edges);

    let newPositions = {};
    if (selectedLayout === 'force') {
      newPositions = computeForceDirectedLayout(nodes, edges);
    } else if (selectedLayout === 'radar') {
      newPositions = computeRadarLayout(nodes);
    } else {
      newPositions = computeHierarchicalLayout(nodes, edges);
    }

    setLayoutMode(selectedLayout);
    setPersistedPositions(newPositions);

    const payload = {
      nodes,
      edges,
      positions: newPositions,
      metadata: {
        lastDiscovered: new Date().toISOString(),
        algorithm: 'semi-automatic',
        layoutType: selectedLayout,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        stats: discoveryPreview.stats,
      },
    };

    setPersistedTopology(payload);
    await StorageService.saveTopology(payload);
    setIsDiscoveryModalOpen(false);
  }, [discoveryPreview]);

  // Add Manual Link
  const addManualLink = useCallback((sourceIp, srcPort, targetIp, dstPort) => {
    if (!sourceIp || !targetIp || sourceIp === targetIp) return;
    const newEdge = {
      id: buildCanonicalEdgeKey(sourceIp, srcPort, targetIp, dstPort),
      source: sourceIp,
      target: targetIp,
      srcPort: srcPort || '',
      dstPort: dstPort || '',
      protocol: 'Manual',
      type: EDGE_TYPES.MANUAL,
      confidence: 100,
      isUp: true,
      lastSeen: new Date().toISOString(),
    };
    const updated = deduplicateLinks([...rawLinks, newEdge]);
    setRawLinks(updated);
    StorageService.saveTopology({
      nodes: topoNodes,
      edges: updated,
      positions: nodePositions,
      metadata: { lastUpdated: new Date().toISOString() },
    });
  }, [rawLinks, topoNodes, nodePositions]);

  // Remove Link
  const removeLink = useCallback((edgeId) => {
    const updated = rawLinks.filter(l => l.id !== edgeId);
    setRawLinks(updated);
    StorageService.saveTopology({
      nodes: topoNodes,
      edges: updated,
      positions: nodePositions,
      metadata: { lastUpdated: new Date().toISOString() },
    });
  }, [rawLinks, topoNodes, nodePositions]);

  // Export Topology as JSON
  const exportTopologyJson = useCallback(() => {
    const data = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      metadata: {
        nodeCount: topoNodes.length,
        edgeCount: rawLinks.length,
        layoutMode,
        discoveryPlatform: 'SEAVL NetMonitor Semi-Automatic Discovery',
      },
      nodes: topoNodes.map(n => ({
        id: n.id,
        ip: n.ip,
        name: n.name || n.label,
        nodeType: n.nodeType || NODE_TYPES.UNKNOWN,
        vendor: n.vendor,
        model: n.model,
        tier: n.tier,
        health: n.health,
        status: n.status,
      })),
      edges: rawLinks,
      positions: nodePositions,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `enterprise_topology_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [topoNodes, rawLinks, layoutMode, nodePositions]);

  // Open neighbor details modal with Real IP resolution
  const openNeighborModal = useCallback((node) => {
    const rawNodeIp = node.ip;
    const neighborMap = new Map();

    const allPromInstances = [
      ...(rawDiscoveryData.cdpDeviceId || []).map(r => cleanInstance(r.metric?.instance)),
      ...(rawDiscoveryData.lldpRemSysName || []).map(r => cleanInstance(r.metric?.instance)),
    ];

    const effectiveNodeIp = findMatchingPromInstance(rawNodeIp, allPromInstances) || rawNodeIp;

    const resolveNeighbor = (rawAddr, rawName, localPort, remotePort, protocol, platform, isUp = true) => {
      const res = resolveRealDeviceIp({
        rawTarget: rawAddr,
        rawName: rawName,
        macMap,
        targetCatalog,
        devices,
        sysNameMap,
      });

      const effectiveIp = res.isRealIp ? res.ip : '';
      const effectiveName = res.resolvedName || rawName || effectiveIp;
      const neighborKey = `${rawName}_${localPort}_${effectiveIp}`;

      neighborMap.set(neighborKey, {
        rawName: rawName || '',
        rawAddr: rawAddr || '',
        name: effectiveName,
        ip: effectiveIp,
        isRealIp: res.isRealIp,
        displayLabel: res.displayLabel || (res.isRealIp ? effectiveIp : 'Unassigned IP'),
        localPort: localPort || '—',
        remotePort: remotePort || '—',
        protocol: protocol || 'CDP',
        platform: platform || '',
        resolutionMethod: res.method || '',
        isAp: res.isAp,
        isVoip: res.isVoip,
        suggestedType: res.suggestedType,
        suggestedVendor: res.suggestedVendor,
        suggestedModel: res.suggestedModel || platform || '',
        suggestedName: res.suggestedName || effectiveName,
        isUp: isUp,
      });
    };

    const operStatusMap = {};
    (rawDiscoveryData.ifOperStatus || []).forEach(r => {
      const inst = cleanInstance(r.metric?.instance);
      if (inst === rawNodeIp || inst === effectiveNodeIp) {
        const ifIdx = r.metric?.ifIndex;
        if (ifIdx) operStatusMap[ifIdx] = r.value?.[1] === '1';
      }
    });

    // 1. Process CDP for this node
    const cdpAddrIdx = {};
    (rawDiscoveryData.cdpCacheAddr || []).forEach(r => {
      const inst = cleanInstance(r.metric?.instance);
      if (inst === rawNodeIp || inst === effectiveNodeIp) {
        const key = `${r.metric?.cdpCacheIfIndex}_${r.metric?.cdpCacheDeviceIndex}`;
        cdpAddrIdx[key] = formatIpOrAddress(r.metric?.cdpCacheAddress || r.value?.[1]);
      }
    });

    (rawDiscoveryData.cdpCachePrimaryAddr || []).forEach(r => {
      const inst = cleanInstance(r.metric?.instance);
      if (inst === rawNodeIp || inst === effectiveNodeIp) {
        const key = `${r.metric?.cdpCacheIfIndex}_${r.metric?.cdpCacheDeviceIndex}`;
        const pAddr = formatIpOrAddress(r.metric?.cdpCachePrimaryMgmtAddr || r.value?.[1]);
        if (pAddr && !cdpAddrIdx[key]) {
          cdpAddrIdx[key] = pAddr;
        }
      }
    });

    const cdpPlatformIdx = {};
    (rawDiscoveryData.cdpCachePlatform || []).forEach(r => {
      const inst = cleanInstance(r.metric?.instance);
      if (inst === rawNodeIp || inst === effectiveNodeIp) {
        const key = `${r.metric?.cdpCacheIfIndex}_${r.metric?.cdpCacheDeviceIndex}`;
        cdpPlatformIdx[key] = String(r.metric?.cdpCachePlatform || r.value?.[1] || '').trim();
      }
    });

    const cdpPortIdx = {};
    (rawDiscoveryData.cdpCacheDevicePort || []).forEach(r => {
      const inst = cleanInstance(r.metric?.instance);
      if (inst === rawNodeIp || inst === effectiveNodeIp) {
        const key = `${r.metric?.cdpCacheIfIndex}_${r.metric?.cdpCacheDeviceIndex}`;
        cdpPortIdx[key] = String(r.metric?.cdpCacheDevicePort || r.value?.[1] || '').trim();
      }
    });

    (rawDiscoveryData.cdpDeviceId || []).forEach(r => {
      const inst = cleanInstance(r.metric?.instance);
      if (inst === rawNodeIp || inst === effectiveNodeIp) {
        const ifIdx = r.metric?.cdpCacheIfIndex;
        const devIdx = r.metric?.cdpCacheDeviceIndex;
        const key = `${ifIdx}_${devIdx}`;
        const remName = String(r.metric?.cdpCacheDeviceId || r.value?.[1] || '').trim();
        const remAddr = cdpAddrIdx[key] || '';
        const remPlat = cdpPlatformIdx[key] || '';
        const remPort = cdpPortIdx[key] || '';
        const localPort = ifIdx ? (ifNameMap[`${inst}_${ifIdx}`] || ifNameMap[`${effectiveNodeIp}_${ifIdx}`] || `Port ${ifIdx}`) : '';
        const isUp = operStatusMap[ifIdx] !== false;

        if (isPhysicalPort(localPort)) {
          resolveNeighbor(remAddr, remName, localPort, remPort, 'CDP', remPlat, isUp);
        }
      }
    });

    // 2. Process LLDP for this node
    const lldpAddrIdx = {};
    (rawDiscoveryData.lldpRemManAddr || []).forEach(r => {
      const inst = cleanInstance(r.metric?.instance);
      if (inst === rawNodeIp || inst === effectiveNodeIp) {
        const idx = r.metric?.lldpRemIndex || r.metric?.lldpRemTimeMark || '0';
        lldpAddrIdx[idx] = formatIpOrAddress(r.metric?.lldpRemManAddrAddr || r.metric?.lldpRemManAddr || r.value?.[1]);
      }
    });

    const lldpPortIdx = {};
    (rawDiscoveryData.lldpRemPortDesc || []).forEach(r => {
      const inst = cleanInstance(r.metric?.instance);
      if (inst === rawNodeIp || inst === effectiveNodeIp) {
        const idx = r.metric?.lldpRemIndex || r.metric?.lldpRemTimeMark || '0';
        lldpPortIdx[idx] = String(r.metric?.lldpRemPortDesc || r.value?.[1] || '').trim();
      }
    });

    (rawDiscoveryData.lldpRemSysName || []).forEach(r => {
      const inst = cleanInstance(r.metric?.instance);
      if (inst === rawNodeIp || inst === effectiveNodeIp) {
        const idx = r.metric?.lldpRemIndex || r.metric?.lldpRemTimeMark || '0';
        const portNum = r.metric?.lldpRemLocalPortNum || idx;
        const remName = String(r.metric?.lldpRemSysName || r.value?.[1] || '').trim();
        const remAddr = lldpAddrIdx[idx] || '';
        const remPort = lldpPortIdx[idx] || '';
        const localPort = portNum ? (ifNameMap[`${inst}_${portNum}`] || ifNameMap[`${effectiveNodeIp}_${portNum}`] || `Port ${portNum}`) : '';
        const isUp = portNum ? (operStatusMap[portNum] !== false) : true;

        if (isPhysicalPort(localPort)) {
          resolveNeighbor(remAddr, remName, localPort, remPort, 'LLDP', '', isUp);
        }
      }
    });

    // 3. Merge with connected links
    const connectedLinks = rawLinks.filter(l => l.source === rawNodeIp || l.target === rawNodeIp || l.source === effectiveNodeIp || l.target === effectiveNodeIp);
    connectedLinks.forEach(l => {
      const isSrc = l.source === rawNodeIp || l.source === effectiveNodeIp;
      const otherIp = isSrc ? l.target : l.source;
      const otherDev = devicesRef.current.find(d => d.ip === otherIp) || targetCatalog.find(t => t.ip === otherIp) || { name: otherIp, ip: otherIp };
      const localPort = isSrc ? l.srcPort : l.dstPort;
      const remotePort = isSrc ? l.dstPort : l.srcPort;

      if (isPhysicalPort(localPort)) {
        const neighborKey = `${otherDev.name}_${localPort}_${otherIp}`;
        if (!neighborMap.has(neighborKey)) {
          neighborMap.set(neighborKey, {
            rawName: otherDev.name || otherIp,
            rawAddr: otherIp,
            name: otherDev.name || otherIp,
            ip: otherIp,
            isRealIp: true,
            displayLabel: otherIp,
            localPort: localPort || '—',
            remotePort: remotePort || '—',
            protocol: l.protocol || 'Discovered',
            platform: l.platform || otherDev.vendor || '',
            resolutionMethod: 'Established Topology Link',
            isAp: false,
            isVoip: false,
            suggestedType: otherDev.type || 'accessswitch',
            suggestedVendor: otherDev.vendor || 'Network Device',
            suggestedName: otherDev.name || otherIp,
          });
        }
      }
    });

    const enrichedNeighbors = Array.from(neighborMap.values());

    setNeighborModalNode({
      ...node,
      effectiveIp: effectiveNodeIp,
      hasIpMismatch: effectiveNodeIp !== rawNodeIp,
      connectedNeighbors: enrichedNeighbors,
    });
  }, [rawDiscoveryData, rawLinks, macMap, targetCatalog, sysNameMap, ifNameMap, devices]);

  const closeNeighborModal = useCallback(() => {
    setNeighborModalNode(null);
  }, []);

  return (
    <TopologyContext.Provider
      value={{
        topoNodes,
        topoLinks: rawLinks,
        nodePositions,
        layoutMode,
        setLayoutMode: handleSetLayoutMode,
        updateNodePosition,
        selectedNode,
        setSelectedNode,
        neighborModalNode,
        openNeighborModal,
        closeNeighborModal,
        refreshTopology,
        targetCatalog,
        isLoading,
        // Semi-Automatic Discovery Pipeline
        runDiscoveryPipeline,
        isDiscovering,
        discoveryPreview,
        isDiscoveryModalOpen,
        openDiscoveryModal: () => setIsDiscoveryModalOpen(true),
        closeDiscoveryModal: () => setIsDiscoveryModalOpen(false),
        applyDiscovery,
        addManualLink,
        removeLink,
        exportTopologyJson,
        persistedTopology,
      }}
    >
      {children}
    </TopologyContext.Provider>
  );
}

export function useTopology() {
  const ctx = useContext(TopologyContext);
  if (!ctx) throw new Error('useTopology must be used within TopologyProvider');
  return ctx;
}
