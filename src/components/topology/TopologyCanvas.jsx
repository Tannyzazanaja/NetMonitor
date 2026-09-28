import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Camera,
  HelpCircle,
} from 'lucide-react';
import { useTopology } from '../../context/TopologyContext';
import { SpatialHashGrid, NODE_TYPES, EDGE_TYPES, getNodeTypeMetadata, calculateNodeHealth } from '../../services/topologyEngine';

const STORAGE_CANVAS_TRANSFORM = 'netmonitor_canvas_transform_v1';

export function TopologyCanvas() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const {
    topoNodes,
    topoLinks,
    nodePositions,
    layoutMode,
    updateNodePosition,
    selectedNode,
    setSelectedNode,
    openNeighborModal,
  } = useTopology();

  // 1. Persistent Camera Viewport (Zoom & Pan) with sessionStorage restoration
  const [transform, setTransform] = useState(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_CANVAS_TRANSFORM);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.scale === 'number' && !isNaN(parsed.scale) && parsed.scale > 0) {
          return parsed;
        }
      }
    } catch {}
    return { x: 0, y: 0, scale: 0.85 };
  });

  const transformRef = useRef(transform);
  transformRef.current = transform;

  const hasUserInteractedRef = useRef(() => {
    try {
      return !!sessionStorage.getItem(STORAGE_CANVAS_TRANSFORM);
    } catch {
      return false;
    }
  });

  const updateTransform = useCallback((newTransformOrFn) => {
    hasUserInteractedRef.current = true;
    setTransform(prev => {
      const next = typeof newTransformOrFn === 'function' ? newTransformOrFn(prev) : newTransformOrFn;
      try {
        sessionStorage.setItem(STORAGE_CANVAS_TRANSFORM, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // 2. Dragging state & Local zero-latency position cache
  const [draggedNode, setDraggedNode] = useState(null);
  const [dragPos, setDragPos] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [isPanning, setIsPanning] = useState(false);

  const [localPositions, setLocalPositions] = useState({});
  const localPositionsRef = useRef({});

  const draggedNodeRef = useRef(null);
  const dragPosRef = useRef(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  const nodePositionsRef = useRef(nodePositions);
  nodePositionsRef.current = nodePositions;

  // Sync incoming nodePositions without wiping local immediate drag coordinates
  useEffect(() => {
    nodePositionsRef.current = nodePositions;
  }, [nodePositions]);

  // Unified position resolver with priority: live drag -> local cache -> context position
  const getNodePos = useCallback((nodeId) => {
    if (draggedNode && dragPos && nodeId === draggedNode.id) {
      return dragPos;
    }
    if (dragPosRef.current && draggedNodeRef.current && nodeId === draggedNodeRef.current.id) {
      return dragPosRef.current;
    }
    if (localPositionsRef.current[nodeId]) {
      return localPositionsRef.current[nodeId];
    }
    if (localPositions[nodeId]) {
      return localPositions[nodeId];
    }
    return nodePositions[nodeId];
  }, [draggedNode, dragPos, localPositions, nodePositions]);

  // Spatial Hash Grid for high-performance O(1) hit testing with 300+ nodes
  const spatialGrid = useMemo(() => {
    const grid = new SpatialHashGrid(90);
    topoNodes.forEach((node) => {
      const pos = getNodePos(node.id);
      if (pos) {
        const radius = node.nodeType === NODE_TYPES.L3_SWITCH || node.nodeType === NODE_TYPES.CORE_SWITCH || node.isFirewall ? 36 : 30;
        grid.insert(node, pos.x, pos.y, radius);
      }
    });
    return grid;
  }, [topoNodes, getNodePos]);

  // Fit view calculation (only called on explicit user action or initial cold start)
  const resetView = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const currentPositions = { ...nodePositionsRef.current, ...localPositionsRef.current };
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let hasNodes = false;

      Object.values(currentPositions).forEach(pos => {
        if (pos) {
          hasNodes = true;
          if (pos.x < minX) minX = pos.x;
          if (pos.x > maxX) maxX = pos.x;
          if (pos.y < minY) minY = pos.y;
          if (pos.y > maxY) maxY = pos.y;
        }
      });

      let nextTransform;
      if (hasNodes && maxX > minX && maxY > minY) {
        const graphW = maxX - minX + 180;
        const graphH = maxY - minY + 180;
        const scaleX = rect.width / graphW;
        const scaleY = rect.height / graphH;
        const scale = Math.max(0.4, Math.min(1.2, Math.min(scaleX, scaleY)));

        nextTransform = {
          x: rect.width / 2 - ((minX + maxX) / 2) * scale,
          y: rect.height / 2 - ((minY + maxY) / 2) * scale,
          scale,
        };
      } else {
        nextTransform = {
          x: rect.width / 2 - 500,
          y: 60,
          scale: 0.85,
        };
      }

      setTransform(nextTransform);
      try {
        sessionStorage.setItem(STORAGE_CANVAS_TRANSFORM, JSON.stringify(nextTransform));
      } catch {}
    }
  }, []);

  const initialFitDoneRef = useRef(false);

  // Auto-fit ONLY on cold initial mount when nodes first arrive AND user has never zoomed or panned
  // NEVER auto-fit or reset view when dragging nodes or when background telemetry polls!
  useEffect(() => {
    const hasNodes = Object.keys(nodePositions).length > 0;
    if (!initialFitDoneRef.current && hasNodes) {
      initialFitDoneRef.current = true;
      const hasSaved = (() => {
        try { return !!sessionStorage.getItem(STORAGE_CANVAS_TRANSFORM); } catch { return false; }
      })();
      if (!hasUserInteractedRef.current && !hasSaved) {
        resetView();
      }
    }
  }, [nodePositions, resetView]);

  // High Performance Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Apply zoom & pan transform
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    // Compute visible viewport bounds in graph coordinate space (Viewport Culling)
    const viewLeft = -transform.x / transform.scale - 100;
    const viewTop = -transform.y / transform.scale - 100;
    const viewRight = viewLeft + rect.width / transform.scale + 200;
    const viewBottom = viewTop + rect.height / transform.scale + 200;

    // Draw background grid dots
    const gridSpacing = 40;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.05)';
    const startX = Math.floor(viewLeft / gridSpacing) * gridSpacing;
    const startY = Math.floor(viewTop / gridSpacing) * gridSpacing;

    for (let x = startX; x < viewRight; x += gridSpacing) {
      for (let y = startY; y < viewBottom; y += gridSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 1. Draw Links (Batched & Color Coded by 4 Edge Types: LLDP, CDP, Discovered, Manual)
    topoLinks.forEach((link) => {
      const srcPos = getNodePos(link.source);
      const dstPos = getNodePos(link.target);
      if (!srcPos || !dstPos) return;

      const isConnectedToSelected =
        selectedNode && (selectedNode.id === link.source || selectedNode.id === link.target);

      ctx.beginPath();
      ctx.moveTo(srcPos.x, srcPos.y);
      ctx.lineTo(dstPos.x, dstPos.y);

      if (link.isUp === false) {
        ctx.strokeStyle = '#ef4444'; // Red for down link
        ctx.lineWidth = isConnectedToSelected ? 3.5 : 2;
        ctx.setLineDash([5, 5]);
      } else if (isConnectedToSelected) {
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 3.5;
        ctx.shadowColor = 'rgba(0, 212, 255, 0.8)';
        ctx.shadowBlur = 12;
        ctx.setLineDash([]);
      } else {
        // Color based on Edge Type
        if (link.type === EDGE_TYPES.DISCOVERED || link.protocol?.includes('+')) {
          ctx.strokeStyle = 'rgba(0, 212, 255, 0.65)'; // Cyan for fused discovered link
          ctx.lineWidth = 2.2;
        } else if (link.type === EDGE_TYPES.CDP || link.protocol === 'CDP') {
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.55)'; // Blue for Cisco CDP
          ctx.lineWidth = 1.8;
        } else if (link.type === EDGE_TYPES.LLDP || link.protocol === 'LLDP') {
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.55)'; // Emerald for Aruba / HPE / Ruckus LLDP
          ctx.lineWidth = 1.8;
        } else if (link.type === EDGE_TYPES.MANUAL) {
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)'; // Purple dashed for Manual link
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
        } else {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
          ctx.lineWidth = 1.5;
        }
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // Draw Port labels at midpoints when zoomed in
      if (transform.scale >= 0.7 && (link.srcPort || link.dstPort)) {
        const midX = (srcPos.x + dstPos.x) / 2;
        const midY = (srcPos.y + dstPos.y) / 2;
        const text = `${link.srcPort || ''} ⇄ ${link.dstPort || ''}`.trim();

        if (text && text !== '⇄') {
          ctx.font = '10px "JetBrains Mono", monospace';
          const textWidth = ctx.measureText(text).width;

          ctx.fillStyle = 'rgba(10, 15, 30, 0.88)';
          ctx.fillRect(midX - textWidth / 2 - 4, midY - 7, textWidth + 8, 14);

          ctx.fillStyle = isConnectedToSelected ? '#00d4ff' : '#94a3b8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, midX, midY);
        }
      }
    });

    // 2. Draw Nodes (9 Standard Node Types, Node Health: Green, Yellow, Red, Gray)
    topoNodes.forEach((node) => {
      const pos = getNodePos(node.id);
      if (!pos) return;

      // Viewport culling for offscreen nodes
      if (pos.x < viewLeft || pos.x > viewRight || pos.y < viewTop || pos.y > viewBottom) {
        return;
      }

      const isSelected = selectedNode && selectedNode.id === node.id;
      const isHovered = hoveredNode && hoveredNode.id === node.id;

      const nodeType = node.nodeType || NODE_TYPES.UNKNOWN;
      const meta = getNodeTypeMetadata(nodeType);
      const health = calculateNodeHealth(node);

      const isLargeNode =
        nodeType === NODE_TYPES.L3_SWITCH ||
        nodeType === NODE_TYPES.CORE_SWITCH ||
        nodeType === NODE_TYPES.FIREWALL ||
        node.isCore ||
        node.isFirewall;

      const nodeRadius = isLargeNode ? 30 : 24;

      // Outer Health Glow
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, nodeRadius + 9, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? 'rgba(0, 212, 255, 0.35)' : health.bgGlow;
        ctx.fill();
      }

      // Main Node Circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2);
      ctx.fillStyle = meta.bg || '#0c1527';
      ctx.fill();

      // Node Border (Color-coded by Node Type, with Health dot overlay)
      ctx.strokeStyle = isSelected ? '#00d4ff' : meta.color || '#00d4ff';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      // Node Icon
      ctx.font = `${isLargeNode ? 16 : 13}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(meta.icon || '🔌', pos.x, pos.y);

      // Node Health / Status Dot (Green / Yellow / Red / Gray)
      ctx.beginPath();
      ctx.arc(pos.x + nodeRadius - 4, pos.y - nodeRadius + 4, 5, 0, Math.PI * 2);
      ctx.fillStyle = health.color;
      ctx.fill();
      ctx.strokeStyle = '#060913';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Node Label (Name)
      ctx.font = 'bold 12px "Outfit", "Inter", sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(node.label || node.name, pos.x, pos.y + nodeRadius + 6);

      // Sub-label (IP + Node Type Badge)
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = isSelected ? '#00d4ff' : '#94a3b8';
      ctx.fillText(node.ip, pos.x, pos.y + nodeRadius + 22);
    });

    ctx.restore();
  }, [transform, topoNodes, topoLinks, selectedNode, hoveredNode, getNodePos]);

  // Coordinate Conversion Helper (Screen Pixels -> Graph Coordinates)
  const getCanvasCoords = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const currentT = transformRef.current;

    return {
      x: (mouseX - currentT.x) / currentT.scale,
      y: (mouseY - currentT.y) / currentT.scale,
    };
  }, []);

  // Find node under mouse cursor using O(1) Spatial Hash Grid
  const findNodeAt = useCallback((coords) => {
    return spatialGrid.query(coords.x, coords.y);
  }, [spatialGrid]);

  // Mouse Down Event Handler
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    const coords = getCanvasCoords(e);
    const hitNode = findNodeAt(coords);

    if (hitNode) {
      const pos = getNodePos(hitNode.id) || { x: coords.x, y: coords.y };
      const offset = { x: coords.x - pos.x, y: coords.y - pos.y };

      draggedNodeRef.current = hitNode;
      dragPosRef.current = { x: pos.x, y: pos.y };
      dragOffsetRef.current = offset;

      setDraggedNode(hitNode);
      setDragPos({ x: pos.x, y: pos.y });
      setSelectedNode(hitNode);
    } else {
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX - transformRef.current.x,
        y: e.clientY - transformRef.current.y,
      };
      setIsPanning(true);
    }
  };

  // Global Window Listeners for Dragging & Panning (prevents node drops when cursor exits canvas boundary)
  useEffect(() => {
    if (!draggedNode && !isPanning) return;

    const handleWindowMouseMove = (e) => {
      if (draggedNodeRef.current) {
        const coords = getCanvasCoords(e);
        const newX = Math.round(coords.x - dragOffsetRef.current.x);
        const newY = Math.round(coords.y - dragOffsetRef.current.y);
        dragPosRef.current = { x: newX, y: newY };
        setDragPos({ x: newX, y: newY });
      } else if (isPanningRef.current) {
        hasUserInteractedRef.current = true;
        updateTransform(prev => ({
          ...prev,
          x: e.clientX - panStartRef.current.x,
          y: e.clientY - panStartRef.current.y,
        }));
      }
    };

    const handleWindowMouseUp = () => {
      if (draggedNodeRef.current && dragPosRef.current) {
        const finalPos = { ...dragPosRef.current };
        const nodeId = draggedNodeRef.current.id;

        // 1. Immediately cache in local ref & state to eliminate any 1-frame snap-back
        localPositionsRef.current[nodeId] = finalPos;
        setLocalPositions(prev => ({ ...prev, [nodeId]: finalPos }));

        // 2. Persist to context and server storage
        updateNodePosition(nodeId, finalPos.x, finalPos.y);
      }

      isPanningRef.current = false;
      setIsPanning(false);
      draggedNodeRef.current = null;
      setDraggedNode(null);
      dragPosRef.current = null;
      setDragPos(null);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [draggedNode, isPanning, getCanvasCoords, updateTransform, updateNodePosition]);

  // Hover detection when not dragging
  const handleMouseMove = (e) => {
    if (!draggedNode && !isPanning) {
      const coords = getCanvasCoords(e);
      const hit = findNodeAt(coords);
      setHoveredNode(hit);
    }
  };

  // Double Click opens Port/Neighbor Details Modal
  const handleDoubleClick = (e) => {
    const coords = getCanvasCoords(e);
    const hitNode = findNodeAt(coords);
    if (hitNode) {
      openNeighborModal(hitNode);
    }
  };

  // Native non-passive Wheel listener (allows e.preventDefault() cleanly without browser warnings)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheelNative = (e) => {
      e.preventDefault();
      hasUserInteractedRef.current = true;
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
      const currentScale = transformRef.current.scale;
      const newScale = Math.min(Math.max(currentScale * zoomFactor, 0.25), 2.8);

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      updateTransform((prev) => ({
        scale: newScale,
        x: mouseX - (mouseX - prev.x) * (newScale / prev.scale),
        y: mouseY - (mouseY - prev.y) * (newScale / prev.scale),
      }));
    };

    canvas.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheelNative);
    };
  }, [updateTransform]);

  // Export Topology as PNG Image
  const handleExportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create high-res offscreen canvas
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 2400;
    exportCanvas.height = 1500;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // Dark high-contrast background
    ctx.fillStyle = '#060a17';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Header Card
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, exportCanvas.width, 90);
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 90);
    ctx.lineTo(exportCanvas.width, 90);
    ctx.stroke();

    ctx.font = 'bold 24px "Outfit", "Inter", sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('ENTERPRISE NETWORK TOPOLOGY', 40, 42);

    ctx.font = '14px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(
      `Generated: ${new Date().toLocaleString('th-TH')} | Nodes: ${topoNodes.length} | Links: ${topoLinks.length} | Layout: ${layoutMode.toUpperCase()}`,
      40,
      72
    );

    // Compute bounding box of all nodes
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    topoNodes.forEach(n => {
      const pos = getNodePos(n.id);
      if (pos) {
        if (pos.x < minX) minX = pos.x;
        if (pos.x > maxX) maxX = pos.x;
        if (pos.y < minY) minY = pos.y;
        if (pos.y > maxY) maxY = pos.y;
      }
    });

    const graphW = Math.max(maxX - minX + 200, 800);
    const graphH = Math.max(maxY - minY + 200, 600);
    const scale = Math.min((exportCanvas.width - 100) / graphW, (exportCanvas.height - 180) / graphH);
    const offsetX = (exportCanvas.width - graphW * scale) / 2 - minX * scale + 100 * scale;
    const offsetY = 120 + (exportCanvas.height - 180 - graphH * scale) / 2 - minY * scale + 100 * scale;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Draw Links
    topoLinks.forEach(link => {
      const srcPos = getNodePos(link.source);
      const dstPos = getNodePos(link.target);
      if (!srcPos || !dstPos) return;

      ctx.beginPath();
      ctx.moveTo(srcPos.x, srcPos.y);
      ctx.lineTo(dstPos.x, dstPos.y);
      ctx.strokeStyle = link.isUp === false ? '#ef4444' : 'rgba(0, 212, 255, 0.7)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      if (link.srcPort || link.dstPort) {
        const midX = (srcPos.x + dstPos.x) / 2;
        const midY = (srcPos.y + dstPos.y) / 2;
        const text = `${link.srcPort || ''} ⇄ ${link.dstPort || ''}`.trim();
        ctx.font = '11px "JetBrains Mono", monospace';
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = '#0b1120';
        ctx.fillRect(midX - tw / 2 - 4, midY - 8, tw + 8, 16);
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, midX, midY);
      }
    });

    // Draw Nodes
    topoNodes.forEach(node => {
      const pos = getNodePos(node.id);
      if (!pos) return;

      const meta = getNodeTypeMetadata(node.nodeType);
      const health = calculateNodeHealth(node);
      const radius = 26;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = meta.bg || '#0c1527';
      ctx.fill();

      ctx.strokeStyle = meta.color || '#00d4ff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(meta.icon || '🔌', pos.x, pos.y);

      // Health dot
      ctx.beginPath();
      ctx.arc(pos.x + radius - 4, pos.y - radius + 4, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = health.color;
      ctx.fill();

      // Labels
      ctx.font = 'bold 12px "Outfit", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(node.label || node.name, pos.x, pos.y + radius + 6);

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(node.ip, pos.x, pos.y + radius + 22);
    });

    ctx.restore();

    // Trigger download
    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `enterprise_topology_${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '720px',
        background: '#070b18',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow)',
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onDoubleClick={handleDoubleClick}
        style={{
          width: '100%',
          height: '100%',
          cursor: draggedNode ? 'grabbing' : isPanning ? 'move' : hoveredNode ? 'pointer' : 'default',
        }}
      />

      {/* Floating Toolbar Controls */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          gap: 6,
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(8px)',
          padding: 6,
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          boxShadow: '0 8px 16px rgba(0, 0, 0, 0.4)',
        }}
      >
        <button
          onClick={() => updateTransform((p) => ({ ...p, scale: Math.min(p.scale * 1.15, 2.8) }))}
          className="btn-icon"
          title="Zoom In"
        >
          <ZoomIn size={15} />
        </button>
        <button
          onClick={() => updateTransform((p) => ({ ...p, scale: Math.max(p.scale * 0.85, 0.25) }))}
          className="btn-icon"
          title="Zoom Out"
        >
          <ZoomOut size={15} />
        </button>
        <button
          onClick={() => {
            hasUserInteractedRef.current = false;
            try { sessionStorage.removeItem(STORAGE_CANVAS_TRANSFORM); } catch {}
            resetView();
          }}
          className="btn-icon"
          title="Fit to Screen"
        >
          <Maximize2 size={15} />
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: 'auto 2px' }} />
        <button
          onClick={handleExportPng}
          className="btn-icon"
          title="Export Topology as High-Res PNG"
          style={{ color: 'var(--primary)' }}
        >
          <Camera size={15} />
        </button>
      </div>

      {/* Canvas Instruction Tip & Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(8px)',
          padding: '8px 16px',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <HelpCircle size={14} color="var(--primary)" />
          <span>
            💡 <strong>ลากโหนด (Drag)</strong> จัดตำแหน่ง | <strong>ดับเบิ้ลคลิก</strong> ดูพอร์ตเพื่อนบ้าน
          </span>
        </div>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} /> Online
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /> Warning
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} /> Critical
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94a3b8' }} /> Offline
          </span>
        </div>
      </div>
    </div>
  );
}
