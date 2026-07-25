import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, RotateCcw, Settings, Trash2, 
  Layers, Check, Activity, 
  Terminal, ShieldAlert, Cpu, Network, Sliders,
  Sparkles, Shield, Repeat, Zap, Target, GitBranch
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import './App.css';

// Central Registry for Node Types
const NODE_TYPES = {
  endpoint: {
    type: 'endpoint',
    label: 'Endpoint Node (Alice / Bob)',
    shortName: 'ENDPOINT',
    color: '#06b6d4',
    bgGradient: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
    glowColor: 'rgba(6, 182, 212, 0.7)',
    shape: 'shield',
    description: 'QKD terminal with polarization measurement detectors & sifting engine.',
    svgIconHtml: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="10" r="2.5"/><path d="M12 12.5v4"/></svg>`
  },
  source: {
    type: 'source',
    label: 'SPDC Photon Source',
    shortName: 'SPDC SOURCE',
    color: '#f59e0b',
    bgGradient: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
    glowColor: 'rgba(245, 158, 11, 0.8)',
    shape: 'sunburst',
    description: 'Entangled photon pair generator (Pump laser + non-linear BBO crystal).',
    svgIconHtml: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="3" fill="#ffffff" fill-opacity="0.4"/></svg>`
  },
  transceiver: {
    type: 'transceiver',
    label: 'Quantum Repeater / Relay',
    shortName: 'REPEATER',
    color: '#a855f7',
    bgGradient: 'linear-gradient(135deg, #7e22ce 0%, #a855f7 100%)',
    glowColor: 'rgba(168, 85, 247, 0.8)',
    shape: 'repeater',
    description: 'Quantum repeater with BSM unit for entanglement swapping between links.',
    svgIconHtml: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`
  },
  bsm: {
    type: 'bsm',
    label: 'Bell State Measurement (BSM)',
    shortName: 'BSM NODE',
    color: '#ec4899',
    bgGradient: 'linear-gradient(135deg, #be185d 0%, #ec4899 100%)',
    glowColor: 'rgba(236, 72, 153, 0.8)',
    shape: 'crosshair',
    description: 'Bell State Measurement station for entanglement swapping & teleportation.',
    svgIconHtml: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`
  }
};

// Leaflet Marker Icon Factory
const createCustomNodeIcon = (node, isSelected = false, pathRole = null) => {
  const meta = NODE_TYPES[node.type] || NODE_TYPES.endpoint;
  const selectedClass = isSelected ? 'marker-selected' : '';
  const roleClass = pathRole ? `marker-role-${pathRole}` : '';
  
  const html = `
    <div class="custom-leaflet-marker ${selectedClass} ${roleClass} shape-${meta.shape}" style="--node-color: ${meta.color}; --node-gradient: ${meta.bgGradient}; --node-glow: ${meta.glowColor}">
      <div class="marker-glow-ring"></div>
      <div class="marker-badge-icon">${meta.svgIconHtml}</div>
      <div class="marker-label-tag">
        <span class="tag-title-text">${node.id.toUpperCase()}</span>
        <span class="tag-type-badge" style="color: ${meta.color}; background: ${meta.color}22;">${meta.shortName}</span>
        ${pathRole === 'alice' ? '<span class="tag-pair-badge alice">A</span>' : ''}
        ${pathRole === 'bob' ? '<span class="tag-pair-badge bob">B</span>' : ''}
      </div>
    </div>
  `;
  return L.divIcon({ html, className: 'custom-leaflet-div-wrapper', iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -26] });
};

// ─── PRESETS ─────────────────────────────────────────────────────────────────

const INITIAL_NODES_BASIC = [
  { id: 'source', name: 'SPDC Source (Central)', type: 'source', x: 400, y: 120, lat: 23.18, lng: 76.6,
    components: [{ id: 'spdc_1', name: 'TaggedSPDCSource', type: 'SPDCSource', mean_photon_num: 10.0, frequency: 100 }] },
  { id: 'alice', name: 'Alice Node', type: 'endpoint', x: 150, y: 260, lat: 22.7196, lng: 75.8577,
    components: [
      { id: 'alice_tap', name: 'PhotonTap', type: 'PhotonTap' },
      { id: 'alice_det', name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
      { id: 'alice_sift', name: 'SiftingProtocol', type: 'SiftingProtocol' }
    ]},
  { id: 'bob', name: 'Bob Node', type: 'endpoint', x: 650, y: 260, lat: 23.2599, lng: 77.4126,
    components: [
      { id: 'bob_tap', name: 'PhotonTap', type: 'PhotonTap' },
      { id: 'bob_det', name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
      { id: 'bob_sift', name: 'SiftingProtocol', type: 'SiftingProtocol' }
    ]}
];
const INITIAL_CHANNELS_BASIC = [
  { id: 'qch_a', name: 'qch_source_alice', type: 'quantum', src: 'source', dst: 'alice', distance: 1000, attenuation: 0.0002, fidelity: 0.93 },
  { id: 'qch_b', name: 'qch_source_bob', type: 'quantum', src: 'source', dst: 'bob', distance: 1000, attenuation: 0.0002, fidelity: 0.93 },
  { id: 'cc_ab', name: 'cc_alice_bob', type: 'classical', src: 'alice', dst: 'bob', delay: 5e-6 }
];

const INITIAL_NODES_SCALED = [
  { id: 'source_1', name: 'SPDC Source 1', type: 'source', x: 280, y: 120, lat: 22.9, lng: 76.2,
    components: [{ id: 'spdc_s1', name: 'TaggedSPDCSource A', type: 'SPDCSource', mean_photon_num: 10.0, frequency: 100 }] },
  { id: 'source_2', name: 'SPDC Source 2', type: 'source', x: 520, y: 120, lat: 23.2, lng: 77.0,
    components: [{ id: 'spdc_s2', name: 'TaggedSPDCSource B', type: 'SPDCSource', mean_photon_num: 10.0, frequency: 100 }] },
  { id: 'alice', name: 'Alice Node', type: 'endpoint', x: 120, y: 260, lat: 22.7196, lng: 75.8577,
    components: [
      { id: 'alice_tap', name: 'PhotonTap', type: 'PhotonTap' },
      { id: 'alice_det', name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
      { id: 'alice_sift', name: 'SiftingProtocol', type: 'SiftingProtocol' }
    ]},
  { id: 'transceiver', name: 'Quantum Repeater', type: 'transceiver', x: 400, y: 260, lat: 23.05, lng: 76.6,
    components: [
      { id: 'tr_tap_a', name: 'PhotonTap Left', type: 'PhotonTap' },
      { id: 'tr_det_a', name: 'QSDetectorPolarization Left', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
      { id: 'tr_tap_b', name: 'PhotonTap Right', type: 'PhotonTap' },
      { id: 'tr_det_b', name: 'QSDetectorPolarization Right', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
      { id: 'tr_relay', name: 'KeyRelayProtocol', type: 'SiftingProtocol' },
      { id: 'tr_mem', name: 'MemoryArray', type: 'MemoryArray', num_memories: 10, fidelity: 0.98 }
    ]},
  { id: 'bob', name: 'Bob Node', type: 'endpoint', x: 680, y: 260, lat: 23.2599, lng: 77.4126,
    components: [
      { id: 'bob_tap', name: 'PhotonTap', type: 'PhotonTap' },
      { id: 'bob_det', name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
      { id: 'bob_sift', name: 'SiftingProtocol', type: 'SiftingProtocol' }
    ]}
];
const INITIAL_CHANNELS_SCALED = [
  { id: 'qch_a1', name: 'qch_src1_alice', type: 'quantum', src: 'source_1', dst: 'alice', distance: 500, attenuation: 0.0002, fidelity: 0.95 },
  { id: 'qch_a2', name: 'qch_src1_tr', type: 'quantum', src: 'source_1', dst: 'transceiver', distance: 500, attenuation: 0.0002, fidelity: 0.95 },
  { id: 'qch_b1', name: 'qch_src2_tr', type: 'quantum', src: 'source_2', dst: 'transceiver', distance: 500, attenuation: 0.0002, fidelity: 0.95 },
  { id: 'qch_b2', name: 'qch_src2_bob', type: 'quantum', src: 'source_2', dst: 'bob', distance: 500, attenuation: 0.0002, fidelity: 0.95 },
  { id: 'cc_at', name: 'cc_alice_tr', type: 'classical', src: 'alice', dst: 'transceiver', delay: 2.5e-6 },
  { id: 'cc_tb', name: 'cc_tr_bob', type: 'classical', src: 'transceiver', dst: 'bob', delay: 2.5e-6 }
];

// NEW: Repeater Network — Indore area topology
// E (Indore) → A1 (Simrol) → A2 (Maheshwar)
// E (Indore) → B1 (Sanawad) → B2 (Omkareshwar)
const INITIAL_NODES_REPEATER = [
  {
    id: 'e', name: 'SPDC Source (Indore)', type: 'source',
    x: 400, y: 80, lat: 22.7196, lng: 75.8577,
    components: [{ id: 'spdc_e', name: 'TaggedSPDCSource', type: 'SPDCSource', mean_photon_num: 10.0, frequency: 100 }]
  },
  {
    id: 'a1', name: 'Repeater A1 (Simrol)', type: 'transceiver',
    x: 205, y: 215, lat: 22.625, lng: 75.937,
    components: [
      { id: 'a1_tap', name: 'PhotonTap', type: 'PhotonTap' },
      { id: 'a1_det', name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.94, dark_count: 1e-6 },
      { id: 'a1_mem', name: 'MemoryArray', type: 'MemoryArray', num_memories: 10, fidelity: 0.98 }
    ]
  },
  {
    id: 'a2', name: 'Endpoint A2 (Maheshwar)', type: 'endpoint',
    x: 95, y: 375, lat: 22.178, lng: 75.590,
    components: [
      { id: 'a2_tap', name: 'PhotonTap', type: 'PhotonTap' },
      { id: 'a2_det', name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
      { id: 'a2_sift', name: 'SiftingProtocol', type: 'SiftingProtocol' }
    ]
  },
  {
    id: 'b1', name: 'Repeater B1 (Sanawad)', type: 'transceiver',
    x: 595, y: 215, lat: 22.182, lng: 76.065,
    components: [
      { id: 'b1_tap', name: 'PhotonTap', type: 'PhotonTap' },
      { id: 'b1_det', name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.94, dark_count: 1e-6 },
      { id: 'b1_mem', name: 'MemoryArray', type: 'MemoryArray', num_memories: 10, fidelity: 0.98 }
    ]
  },
  {
    id: 'b2', name: 'Endpoint B2 (Omkareshwar)', type: 'endpoint',
    x: 705, y: 375, lat: 22.241, lng: 76.148,
    components: [
      { id: 'b2_tap', name: 'PhotonTap', type: 'PhotonTap' },
      { id: 'b2_det', name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
      { id: 'b2_sift', name: 'SiftingProtocol', type: 'SiftingProtocol' }
    ]
  }
];
const INITIAL_CHANNELS_REPEATER = [
  { id: 'qch_e_a1', name: 'qch_Indore_Simrol', type: 'quantum', src: 'e', dst: 'a1', distance: 600, attenuation: 0.0002, fidelity: 0.97 },
  { id: 'qch_e_b1', name: 'qch_Indore_Sanawad', type: 'quantum', src: 'e', dst: 'b1', distance: 800, attenuation: 0.0002, fidelity: 0.95 },
  { id: 'qch_a1_a2', name: 'qch_Simrol_Maheshwar', type: 'quantum', src: 'a1', dst: 'a2', distance: 550, attenuation: 0.0002, fidelity: 0.96 },
  { id: 'qch_b1_b2', name: 'qch_Sanawad_Omkareshwar', type: 'quantum', src: 'b1', dst: 'b2', distance: 400, attenuation: 0.0002, fidelity: 0.97 },
  { id: 'cc_a2_b2', name: 'cc_Maheshwar_Omkareshwar', type: 'classical', src: 'a2', dst: 'b2', delay: 3e-4 }
];

function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

// ─── HAVERSINE ────────────────────────────────────────────────────────────────
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

// ─── APP ──────────────────────────────────────────────────────────────────────
function App() {
  const [networkMode, setNetworkMode] = useState('repeater'); // 'basic' | 'scaled' | 'repeater'
  const [viewMode, setViewMode] = useState('abstract');
  const [legendOpen, setLegendOpen] = useState(true);

  const [nodes, setNodes] = useState(() => JSON.parse(JSON.stringify(INITIAL_NODES_REPEATER)));
  const [channels, setChannels] = useState(() => JSON.parse(JSON.stringify(INITIAL_CHANNELS_REPEATER)));
  const [selectedNodeId, setSelectedNodeId] = useState('e');

  // Key Exchange Pair
  const [selectedPair, setSelectedPair] = useState({ alice: 'a2', bob: 'b2' });
  const [selectingFor, setSelectingFor] = useState(null); // 'alice' | 'bob' | null
  const [routePaths, setRoutePaths] = useState(null);   // { sourceId, alicePath[], bobPath[] }

  // Canvas draw mode for adding channels
  const [drawMode, setDrawMode] = useState(null);
  const [drawSrcId, setDrawSrcId] = useState(null);

  // Dragging
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);

  // ── Ref mirrors (always-fresh values for stable event handlers) ──────────────
  const drawModeRef = useRef(drawMode);
  const drawSrcIdRef = useRef(drawSrcId);
  const selectingForRef = useRef(selectingFor);
  const nodesRef = useRef(nodes);
  useEffect(() => { drawModeRef.current = drawMode; });
  useEffect(() => { drawSrcIdRef.current = drawSrcId; });
  useEffect(() => { selectingForRef.current = selectingFor; });
  useEffect(() => { nodesRef.current = nodes; });

  // Simulation
  const [numTrials, setNumTrials] = useState(60);
  const [simSpeed, setSimSpeed] = useState(3);
  const [simRunning, setSimRunning] = useState(false);
  const [simStep, setSimStep] = useState(0);
  const [backendTrials, setBackendTrials] = useState(null);
  const [isBackendMode, setIsBackendMode] = useState(false);

  // Results
  const [trialsList, setTrialsList] = useState([]);
  const [logs, setLogs] = useState([]);
  const [siftedAliceKey, setSiftedAliceKey] = useState('');
  const [siftedBobKey, setSiftedBobKey] = useState('');
  const [qber, setQber] = useState(0);
  const [animatingPhotons, setAnimatingPhotons] = useState([]);

  // UI
  const [newCompType, setNewCompType] = useState('QSDetectorPolarization');
  const [toast, setToast] = useState(null);

  // ── Logging ──────────────────────────────────────────────────────────────────
  const addLog = useCallback((msg, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [...prev, { timestamp, text: msg, type }].slice(-60));
  }, []);

  const showToast = useCallback((message) => setToast(message), []);

  // ── BFS Path Finder ──────────────────────────────────────────────────────────
  const bfsPath = useCallback((startId, endId, adj) => {
    const visited = new Set([startId]);
    const queue = [[startId, [startId]]];
    while (queue.length) {
      const [curr, path] = queue.shift();
      if (curr === endId) return path;
      for (const next of (adj[curr] || [])) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push([next, [...path, next]]);
        }
      }
    }
    return null;
  }, []);

  const discoverRoutePaths = useCallback((aliceId, bobId, nodeList, channelList) => {
    // Build undirected quantum adjacency
    const adj = {};
    nodeList.forEach(n => { adj[n.id] = []; });
    channelList.filter(c => c.type === 'quantum').forEach(c => {
      if (adj[c.src] !== undefined) adj[c.src].push(c.dst);
      if (adj[c.dst] !== undefined) adj[c.dst].push(c.src);
    });

    // Try each source as common root
    const sources = nodeList.filter(n => n.type === 'source');
    for (const src of sources) {
      const pathA = bfsPath(src.id, aliceId, adj);
      const pathB = bfsPath(src.id, bobId, adj);
      if (pathA && pathB) return { sourceId: src.id, alicePath: pathA, bobPath: pathB };
    }
    return null;
  }, [bfsPath]);

  // ── Path role helpers ─────────────────────────────────────────────────────────
  const getNodePathRole = useCallback((nodeId) => {
    if (nodeId === selectedPair.alice) return 'alice';
    if (nodeId === selectedPair.bob) return 'bob';
    if (!routePaths) return null;
    const { alicePath, bobPath } = routePaths;
    if (alicePath.includes(nodeId) || bobPath.includes(nodeId)) return 'repeater';
    return null;
  }, [selectedPair, routePaths]);

  const isOnActivePath = useCallback((srcId, dstId) => {
    if (!routePaths) return false;
    const check = (path) => {
      for (let i = 0; i < path.length - 1; i++) {
        if ((path[i] === srcId && path[i+1] === dstId) ||
            (path[i] === dstId && path[i+1] === srcId)) return true;
      }
      return false;
    };
    return check(routePaths.alicePath) || check(routePaths.bobPath);
  }, [routePaths]);

  // ── useEffects ────────────────────────────────────────────────────────────────

  // Path discovery whenever pair or topology changes
  useEffect(() => {
    if (selectedPair.alice && selectedPair.bob && selectedPair.alice !== selectedPair.bob) {
      const paths = discoverRoutePaths(selectedPair.alice, selectedPair.bob, nodes, channels);
      setRoutePaths(paths);
      if (paths) {
        addLog(`✓ Route: ${paths.alicePath.join(' → ')}  |  ${paths.bobPath.join(' → ')}`, 'success');
      } else {
        addLog(`✗ No quantum path found from any source to both "${selectedPair.alice}" and "${selectedPair.bob}".`, 'error');
      }
    } else {
      setRoutePaths(null);
    }
  }, [selectedPair, nodes, channels]);

  // Quick Start preset loader
  useEffect(() => {
    resetSimulation();
    setSelectedPair({ alice: null, bob: null });
    setRoutePaths(null);
    if (networkMode === 'basic') {
      setNodes(JSON.parse(JSON.stringify(INITIAL_NODES_BASIC)));
      setChannels(JSON.parse(JSON.stringify(INITIAL_CHANNELS_BASIC)));
      setSelectedNodeId('source');
      setTimeout(() => setSelectedPair({ alice: 'alice', bob: 'bob' }), 50);
    } else if (networkMode === 'scaled') {
      setNodes(JSON.parse(JSON.stringify(INITIAL_NODES_SCALED)));
      setChannels(JSON.parse(JSON.stringify(INITIAL_CHANNELS_SCALED)));
      setSelectedNodeId('transceiver');
      setTimeout(() => setSelectedPair({ alice: 'alice', bob: 'bob' }), 50);
    } else if (networkMode === 'repeater') {
      setNodes(JSON.parse(JSON.stringify(INITIAL_NODES_REPEATER)));
      setChannels(JSON.parse(JSON.stringify(INITIAL_CHANNELS_REPEATER)));
      setSelectedNodeId('e');
      setTimeout(() => setSelectedPair({ alice: 'a2', bob: 'b2' }), 50);
    }
  }, [networkMode]);

  // Toast auto-clear
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Auto-recalculate distances on map drag
  useEffect(() => {
    if (viewMode !== 'map') return;
    setChannels(prev => prev.map(ch => {
      const s = nodes.find(n => n.id === ch.src);
      const d = nodes.find(n => n.id === ch.dst);
      if (s?.lat && d?.lat) {
        const dist = haversine(s.lat, s.lng, d.lat, d.lng);
        return { ...ch, distance: Math.round(dist), delay: dist / 2e8 };
      }
      return ch;
    }));
  }, [nodes, viewMode]);

  // ── Simulation Reset ──────────────────────────────────────────────────────────
  const resetSimulation = useCallback(() => {
    setSimRunning(false);
    setSimStep(0);
    setTrialsList([]);
    setSiftedAliceKey('');
    setSiftedBobKey('');
    setQber(0);
    setAnimatingPhotons([]);
    setLogs([]);
    setBackendTrials(null);
    setIsBackendMode(false);
  }, []);

  // ── Node Mouse Handlers ───────────────────────────────────────────────────────
  // Uses refs so this callback is always stable ([] deps) yet always reads fresh state.
  // This is the correct React pattern to avoid stale-closure bugs in event handlers.
  const handleNodeMouseDown = useCallback((e, nodeId) => {
    e.stopPropagation();

    // Read fresh state from refs
    const selectingFor = selectingForRef.current;
    const drawMode = drawModeRef.current;
    const drawSrcId = drawSrcIdRef.current;
    const nodes = nodesRef.current;

    // 1. Pair selection mode
    if (selectingFor) {
      setSelectedPair(prev => ({ ...prev, [selectingFor]: nodeId }));
      addLog(`Assigned "${nodeId}" as ${selectingFor === 'alice' ? 'Alice (A)' : 'Bob (B)'} endpoint.`, 'success');
      setSelectingFor(null);
      return;
    }

    // 2. Channel draw mode
    if (drawMode) {
      if (!drawSrcId) {
        setDrawSrcId(nodeId);
        addLog(`Step 2/2 — now click the destination node to complete the ${drawMode} link.`, 'info');
      } else if (drawSrcId !== nodeId) {
        const newCh = {
          id: `${drawMode.charAt(0)}ch_${drawSrcId}_${nodeId}_${Date.now()}`,
          name: `${drawMode === 'quantum' ? 'Quantum' : 'Classical'} Link`,
          type: drawMode,
          src: drawSrcId,
          dst: nodeId,
          ...(drawMode === 'quantum' ? { attenuation: 0.0002, fidelity: 0.95 } : { delay: 1e-6 }),
        };
        const sn = nodes.find(n => n.id === drawSrcId);
        const dn = nodes.find(n => n.id === nodeId);
        if (sn?.lat && dn?.lat) {
          const dist = haversine(sn.lat, sn.lng, dn.lat, dn.lng);
          newCh.distance = Math.round(dist);
          if (drawMode === 'classical') newCh.delay = dist / 2e8;
        } else {
          newCh.distance = 1000;
        }
        setChannels(prev => [...prev, newCh]);
        setDrawMode(null);
        setDrawSrcId(null);
        addLog(`✓ ${drawMode} channel created: ${drawSrcId} → ${nodeId}`, 'success');
      } else {
        // Clicked same node — just give a helpful hint
        addLog(`Same node selected. Click a DIFFERENT node as the destination.`, 'warning');
      }
      return;
    }

    // 3. Drag start + select
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setDraggingNodeId(nodeId);
      setDragOffset({ x: e.clientX - rect.left - node.x, y: e.clientY - rect.top - node.y });
    }
    setSelectedNodeId(nodeId);
  }, []); // stable — reads fresh state via refs

  const handleMouseMove = useCallback((e) => {
    if (!draggingNodeId) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(60, Math.min(rect.width - 60, e.clientX - rect.left - dragOffset.x));
    const y = Math.max(50, Math.min(rect.height - 50, e.clientY - rect.top - dragOffset.y));
    setNodes(prev => prev.map(n => n.id === draggingNodeId ? { ...n, x: Math.round(x), y: Math.round(y) } : n));
  }, [draggingNodeId, dragOffset]);

  const handleMouseUp = useCallback(() => setDraggingNodeId(null), []);

  const handleMarkerDragEnd = useCallback((id, event) => {
    const pos = event.target.getLatLng();
    setNodes(prev => prev.map(n => n.id === id ? { ...n, lat: pos.lat, lng: pos.lng } : n));
  }, []);

  // ── Component Management ──────────────────────────────────────────────────────
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const handleUpdateComponentParam = useCallback((compId, paramName, value) => {
    setNodes(prev => prev.map(node => {
      if (node.id !== selectedNodeId) return node;
      return { ...node, components: node.components.map(c => c.id !== compId ? c : { ...c, [paramName]: parseFloat(value) || value }) };
    }));
  }, [selectedNodeId]);

  const handleAddComponent = useCallback(() => {
    if (!selectedNode) return;
    const count = selectedNode.components.filter(c => c.type === newCompType).length + 1;
    let nc = { id: `${selectedNode.id}_${newCompType.toLowerCase()}_${count}`, name: `${newCompType} #${count}`, type: newCompType };
    if (newCompType === 'QSDetectorPolarization') { nc.efficiency = 0.95; nc.dark_count = 1e-6; }
    else if (newCompType === 'SPDCSource') { nc.mean_photon_num = 10.0; nc.frequency = 100; }
    else if (newCompType === 'MemoryArray') { nc.num_memories = 5; nc.fidelity = 0.98; }
    setNodes(prev => prev.map(n => n.id !== selectedNodeId ? n : { ...n, components: [...n.components, nc] }));
    showToast(`Added ${newCompType}`);
  }, [selectedNode, selectedNodeId, newCompType, showToast]);

  const handleDeleteComponent = useCallback((compId) => {
    setNodes(prev => prev.map(n => n.id !== selectedNodeId ? n : { ...n, components: n.components.filter(c => c.id !== compId) }));
  }, [selectedNodeId]);

  const handleUpdateChannelParam = useCallback((chId, paramName, value) => {
    setChannels(prev => prev.map(ch => ch.id !== chId ? ch : { ...ch, [paramName]: parseFloat(value) || value }));
  }, []);

  const handleDeleteChannel = useCallback((chId) => {
    setChannels(prev => prev.filter(ch => ch.id !== chId));
    addLog(`Deleted channel ${chId}`, 'error');
  }, [addLog]);

  const handleNodeTypeChange = useCallback((nodeId, newType) => {
    setNodes(prev => prev.map(n => n.id !== nodeId ? n : { ...n, type: newType }));
  }, []);

  // ── Add Dynamic Nodes ─────────────────────────────────────────────────────────
  const handleAddDynamicNode = useCallback((type) => {
    const idx = Date.now();
    const baseX = 350 + (Math.random() * 140 - 70);
    const baseY = 200 + (Math.random() * 80 - 40);
    const baseLat = 22.7 + (Math.random() * 0.6 - 0.3);
    const baseLng = 76.0 + (Math.random() * 0.6 - 0.3);

    const componentSets = {
      endpoint: [
        { id: `ep_tap_${idx}`, name: 'PhotonTap', type: 'PhotonTap' },
        { id: `ep_det_${idx}`, name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
        { id: `ep_sift_${idx}`, name: 'SiftingProtocol', type: 'SiftingProtocol' }
      ],
      source: [{ id: `spdc_${idx}`, name: 'TaggedSPDCSource', type: 'SPDCSource', mean_photon_num: 10.0, frequency: 100 }],
      transceiver: [
        { id: `tr_tap_${idx}`, name: 'PhotonTap', type: 'PhotonTap' },
        { id: `tr_det_${idx}`, name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.94, dark_count: 1e-6 },
        { id: `tr_mem_${idx}`, name: 'MemoryArray', type: 'MemoryArray', num_memories: 10, fidelity: 0.98 }
      ],
      bsm: [{ id: `bsm_${idx}`, name: 'BSM Detector', type: 'BSM', efficiency: 0.95, dark_count: 1e-6 }]
    };

    const nameMap = { endpoint: 'Endpoint', source: 'SPDC Source', transceiver: 'Repeater Node', bsm: 'BSM Node' };
    const newNode = {
      id: `${type}_${idx}`,
      name: `${nameMap[type]} ${nodes.length + 1}`,
      type,
      x: baseX, y: baseY, lat: baseLat, lng: baseLng,
      components: componentSets[type] || []
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    addLog(`Added ${nameMap[type]}. Connect it with quantum channels.`, 'success');
  }, [nodes.length, addLog]);

  // ── Sim: Photon Animations ────────────────────────────────────────────────────
  const addPhotonAnim = useCallback((id, sx, sy, dx, dy, color) => {
    setAnimatingPhotons(prev => [...prev, { id, sx, sy, dx, dy, color }]);
    setTimeout(() => setAnimatingPhotons(prev => prev.filter(p => p.id !== id)), 900);
  }, []);

  const triggerPathAnimations = useCallback((alicePath, bobPath) => {
    const ts = Date.now();
    (alicePath || []).forEach((nid, i) => {
      if (i >= alicePath.length - 1) return;
      const from = nodes.find(n => n.id === nid);
      const to = nodes.find(n => n.id === alicePath[i + 1]);
      if (!from || !to) return;
      setTimeout(() => addPhotonAnim(`${ts}_a${i}`, from.x, from.y, to.x - from.x, to.y - from.y, '#38bdf8'), i * 230);
    });
    (bobPath || []).forEach((nid, i) => {
      if (i >= bobPath.length - 1) return;
      const from = nodes.find(n => n.id === nid);
      const to = nodes.find(n => n.id === bobPath[i + 1]);
      if (!from || !to) return;
      setTimeout(() => addPhotonAnim(`${ts}_b${i}`, from.x, from.y, to.x - from.x, to.y - from.y, '#c084fc'), i * 230);
    });
  }, [nodes, addPhotonAnim]);

  // Legacy single-link animation (for backend playback)
  const triggerPhotonAnimation = useCallback((src1, dest1, src2, dest2) => {
    const s1 = nodes.find(n => n.id === src1);
    const d1 = nodes.find(n => n.id === dest1);
    const s2 = nodes.find(n => n.id === src2);
    const d2 = nodes.find(n => n.id === dest2);
    if (!s1 || !d1 || !s2 || !d2) return;
    const ts = Date.now();
    addPhotonAnim(`${ts}_1`, s1.x, s1.y, d1.x - s1.x, d1.y - s1.y, '#38bdf8');
    addPhotonAnim(`${ts}_2`, s2.x, s2.y, d2.x - s2.x, d2.y - s2.y, '#c084fc');
  }, [nodes, addPhotonAnim]);

  // ── Sim: Key Calculation ──────────────────────────────────────────────────────
  const calculateKeysFromTrials = useCallback((trials) => {
    let keyA = '', keyB = '', errors = 0, total = 0;
    trials.forEach(t => {
      if (t.alice_result !== null && t.bob_result !== null && t.alice_basis === t.bob_basis) {
        keyA += t.alice_result.toString();
        keyB += t.bob_result.toString();
        total++;
        if (t.alice_result !== t.bob_result) errors++;
      }
    });
    setSiftedAliceKey(keyA);
    setSiftedBobKey(keyB);
    setQber(total > 0 ? (errors / total) * 100 : 0);
  }, []);

  // ── Sim: Multi-Hop Network Trial ──────────────────────────────────────────────
  const runNetworkTrial = useCallback((step) => {
    if (!routePaths) {
      addLog(`Trial ${step}: No route paths. Assign Alice & Bob endpoints first.`, 'error');
      return;
    }
    const { alicePath, bobPath } = routePaths;

    const simulatePath = (path) => {
      let survived = true;
      let fidelity = 1.0;
      for (let i = 0; i < path.length - 1; i++) {
        const fromId = path[i], toId = path[i + 1];
        const ch = channels.find(c => c.type === 'quantum' &&
          ((c.src === fromId && c.dst === toId) || (c.src === toId && c.dst === fromId)));
        if (!ch) { survived = false; break; }

        // Fiber attenuation loss (Beer-Lambert)
        const attDb = (ch.attenuation || 0.0002) * (ch.distance || 1000);
        const transmissivity = Math.pow(10, -attDb / 10);
        if (Math.random() > transmissivity) { survived = false; break; }

        // Detector efficiency at receiver
        const recvNode = nodes.find(n => n.id === toId);
        const det = recvNode?.components?.find(c => c.type === 'QSDetectorPolarization');
        const eff = det?.efficiency ?? 0.95;
        if (Math.random() > eff) { survived = false; break; }

        fidelity *= (ch.fidelity || 0.95);

        // BSM entanglement swapping at intermediate (repeater) nodes
        // Intermediate = not the source node (i=0) and not the final endpoint (i = path.length-2)
        const isIntermediateHop = i > 0 && i < path.length - 2;
        if (isIntermediateHop) {
          const bsmEff = 0.84;
          if (Math.random() > bsmEff) { survived = false; break; }
          fidelity *= 0.98; // swapping fidelity penalty
        }
      }
      return { survived, fidelity };
    };

    const resA = simulatePath(alicePath);
    const resB = simulatePath(bobPath);

    const basisA = Math.random() > 0.5 ? 0 : 1;
    const basisB = Math.random() > 0.5 ? 0 : 1;
    const baseVal = Math.random() > 0.5 ? 1 : 0;

    let resultA = resA.survived ? baseVal : null;
    let resultB = resB.survived ? baseVal : null;

    if (resultA !== null && Math.random() > resA.fidelity) resultA = 1 - resultA;
    if (resultB !== null && Math.random() > resB.fidelity) resultB = 1 - resultB;
    if (resA.survived && resB.survived && basisA !== basisB) resultB = Math.random() > 0.5 ? 1 : 0;

    // Trigger hop-by-hop photon animations
    triggerPathAnimations(alicePath, bobPath);

    const newTrial = {
      trial: step,
      alice_basis: basisA, bob_basis: basisB,
      alice_result: resultA, bob_result: resultB,
      lossA: !resA.survived, lossB: !resB.survived,
      hops: (alicePath.length - 1) + (bobPath.length - 1)
    };

    setTrialsList(prev => {
      const updated = [...prev, newTrial];
      calculateKeysFromTrials(updated);
      return updated;
    });

    const hopsStr = `${alicePath.length - 1}+${bobPath.length - 1} hops`;
    const aLabel = selectedPair.alice?.toUpperCase() || 'A';
    const bLabel = selectedPair.bob?.toUpperCase() || 'B';

    if (!resA.survived && !resB.survived) {
      addLog(`Trial ${step}: Both paths lost [${hopsStr}].`, 'error');
    } else if (!resA.survived) {
      addLog(`Trial ${step}: ${aLabel}-path lost. ${bLabel} OK. [${hopsStr}]`, 'info');
    } else if (!resB.survived) {
      addLog(`Trial ${step}: ${bLabel}-path lost. ${aLabel} OK. [${hopsStr}]`, 'info');
    } else {
      const basis = basisA === basisB ? '✓ Match' : '✗ Mismatch';
      addLog(`Trial ${step}: Both OK [${hopsStr}]. Bases: ${basisA===0?'Z':'X'}/${basisB===0?'Z':'X'} ${basis}`,
        basisA === basisB ? 'success' : 'info');
    }
  }, [routePaths, channels, nodes, triggerPathAnimations, calculateKeysFromTrials, addLog, selectedPair]);

  // ── Sim: Start / Backend ──────────────────────────────────────────────────────
  const handleStartSimulation = useCallback(async () => {
    if (simStep >= numTrials) resetSimulation();

    if (!routePaths) {
      addLog('Cannot start: No valid route. Assign Alice & Bob endpoints with a quantum path between them.', 'error');
      showToast('Assign Alice & Bob with a valid quantum path first.');
      return;
    }

    addLog('Requesting ChaQra backend simulation...', 'info');
    try {
      const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numTrials,
          nodes,
          channels,
          selectedPair: { alice: selectedPair.alice, bob: selectedPair.bob }
        })
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      setBackendTrials(data.trials);
      setIsBackendMode(true);
      if (data.logs) data.logs.forEach(l => addLog(l, 'success'));
      addLog('Backend connected. Playing back simulation.', 'success');
      showToast('Backend Simulation Connected');
      setSimRunning(true);
    } catch {
      addLog('Backend offline — running client-side simulation.', 'warning');
      showToast('Running client-side simulation');
      setIsBackendMode(false);
      setBackendTrials(null);
      setSimRunning(true);
    }
  }, [simStep, numTrials, nodes, channels, selectedPair, routePaths, addLog, showToast, resetSimulation]);

  // ── Simulation Interval ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!simRunning) return;
    const msInterval = Math.max(80, 1000 - simSpeed * 180);

    const timer = setInterval(() => {
      if (simStep >= numTrials) {
        setSimRunning(false);
        addLog(`Simulation complete. ${trialsList.length} trials processed.`, 'success');
        return;
      }

      const step = simStep;
      if (isBackendMode && backendTrials?.[step]) {
        const trial = backendTrials[step];
        // Animate based on discovered paths
        if (routePaths) {
          triggerPathAnimations(routePaths.alicePath, routePaths.bobPath);
        } else {
          triggerPhotonAnimation('source', 'alice', 'source', 'bob');
        }
        setTrialsList(prev => {
          const updated = [...prev, trial];
          calculateKeysFromTrials(updated);
          return updated;
        });
        const sA = !trial.lossA, sB = !trial.lossB;
        if (!sA && !sB) addLog(`[BE] Trial ${step}: Both lost.`, 'error');
        else addLog(`[BE] Trial ${step}: A=${sA?trial.alice_result:'∅'} B=${sB?trial.bob_result:'∅'} Bases: ${trial.alice_basis===0?'Z':'X'}/${trial.bob_basis===0?'Z':'X'}`,
          trial.alice_basis === trial.bob_basis ? 'success' : 'info');
      } else {
        runNetworkTrial(step);
      }
      setSimStep(prev => prev + 1);
    }, msInterval);

    return () => clearInterval(timer);
  }, [simRunning, simStep, simSpeed, numTrials, isBackendMode, backendTrials, routePaths]);

  // ─── JSX ──────────────────────────────────────────────────────────────────────
  const aliceNodeName = nodes.find(n => n.id === selectedPair.alice)?.name || null;
  const bobNodeName = nodes.find(n => n.id === selectedPair.bob)?.name || null;

  return (
    <div className="app-container">
      {/* ── Header ── */}
      <header className="app-header glass-panel">
        <div>
          <h1>
            <Network className="title-cyan" size={30} />
            ChaQra - Quantum Network Simulator
            <span className="protocol-tag">Entanglement Swapping QKD</span>
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>
            Build arbitrary quantum networks · Select any two nodes for key exchange · Simulate entanglement swapping through repeaters
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.5px' }}>QUICK START TOPOLOGY</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`btn-secondary ${networkMode === 'basic' ? 'active' : ''}`}
              onClick={() => setNetworkMode('basic')}
              style={networkMode === 'basic' ? { borderColor: 'var(--color-quantum)', color: 'var(--color-quantum)' } : {}}
            >
              <Shield size={14}/> Basic 3-Node
            </button>
            <button
              className={`btn-secondary ${networkMode === 'scaled' ? 'active' : ''}`}
              onClick={() => setNetworkMode('scaled')}
              style={networkMode === 'scaled' ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : {}}
            >
              <Repeat size={14}/> Scaled 5-Node
            </button>
            <button
              className={`btn-secondary ${networkMode === 'repeater' ? 'active' : ''}`}
              onClick={() => setNetworkMode('repeater')}
              style={networkMode === 'repeater' ? { borderColor: '#f59e0b', color: '#f59e0b' } : {}}
            >
              <GitBranch size={14}/> Repeater Network
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Grid ── */}
      <div className="main-grid">
        {/* ── Sidebar ── */}
        <aside className="sidebar">

          {/* Key Exchange Pair Selector */}
          <div className="glass-panel">
            <h2 className="inspector-title">
              <Target size={18} className="title-cyan" />
              Key Exchange Pair
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 14px 0', lineHeight: '1.4' }}>
              {selectingFor
                ? `🎯 Click any node on canvas to assign as ${selectingFor === 'alice' ? 'Alice (A)' : 'Bob (B)'}…`
                : 'Select two endpoint nodes for QKD. Intermediate nodes act as quantum repeaters automatically.'}
            </p>

            {/* Alice Row */}
            <div className="pair-endpoint-row">
              <div className="pair-badge-a">A</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>Alice Node</div>
                <div style={{ fontSize: '13px', color: '#38bdf8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {aliceNodeName || <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontStyle: 'italic' }}>Not selected</span>}
                </div>
              </div>
              <button
                className={`pair-pick-btn ${selectingFor === 'alice' ? 'picking' : ''}`}
                onClick={() => setSelectingFor(selectingFor === 'alice' ? null : 'alice')}
              >
                {selectingFor === 'alice' ? 'Cancel' : 'Pick'}
              </button>
              {selectedPair.alice && (
                <button className="pair-clear-btn" onClick={() => setSelectedPair(p => ({ ...p, alice: null }))} title="Clear">×</button>
              )}
            </div>

            {/* Bob Row */}
            <div className="pair-endpoint-row" style={{ marginTop: '10px' }}>
              <div className="pair-badge-b">B</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>Bob Node</div>
                <div style={{ fontSize: '13px', color: '#c084fc', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {bobNodeName || <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontStyle: 'italic' }}>Not selected</span>}
                </div>
              </div>
              <button
                className={`pair-pick-btn ${selectingFor === 'bob' ? 'picking' : ''}`}
                onClick={() => setSelectingFor(selectingFor === 'bob' ? null : 'bob')}
              >
                {selectingFor === 'bob' ? 'Cancel' : 'Pick'}
              </button>
              {selectedPair.bob && (
                <button className="pair-clear-btn" onClick={() => setSelectedPair(p => ({ ...p, bob: null }))} title="Clear">×</button>
              )}
            </div>

            {/* Route Status */}
            {routePaths ? (
              <div className="path-status-ok">
                <span>✓ Route found via {routePaths.sourceId.toUpperCase()}</span>
                <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.8 }}>
                  A: {routePaths.alicePath.join(' → ')}<br/>
                  B: {routePaths.bobPath.join(' → ')}
                </div>
              </div>
            ) : selectedPair.alice && selectedPair.bob ? (
              <div className="path-status-err">
                ✗ No quantum path from any source to both nodes. Add quantum channels to connect them.
              </div>
            ) : (
              <div className="path-status-neutral">
                ↑ Select Alice and Bob nodes above to discover the entanglement path.
              </div>
            )}
          </div>

          {/* Simulation Config */}
          <div className="glass-panel">
            <h2 className="inspector-title">
              <Sliders size={18} className="title-purple" />
              Simulation Config
            </h2>
            <div style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label>Number of Trials</label>
                <input type="number" className="form-input" value={numTrials}
                  onChange={e => setNumTrials(parseInt(e.target.value) || 10)}
                  min="10" max="1000" disabled={simRunning} />
              </div>
              <div className="form-group">
                <label>Playback Speed</label>
                <input type="range" min="1" max="5" className="form-input" value={simSpeed}
                  onChange={e => setSimSpeed(parseInt(e.target.value))} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  <span>Slow</span><span>Fast</span>
                </div>
              </div>
              <div className="form-row" style={{ marginTop: '18px' }}>
                {simRunning ? (
                  <button className="btn-primary" onClick={() => setSimRunning(false)} style={{ background: 'var(--color-error)' }}>
                    <Pause size={16} /> Pause
                  </button>
                ) : (
                  <button className="btn-primary" onClick={handleStartSimulation}
                    disabled={!routePaths || simStep >= numTrials}
                    title={!routePaths ? 'Assign Alice & Bob with a connected quantum path first' : ''}>
                    <Play size={16} /> Run QKD
                  </button>
                )}
                <button className="btn-secondary" onClick={resetSimulation}>
                  <RotateCcw size={16} /> Reset
                </button>
              </div>
              {!routePaths && (
                <p style={{ fontSize: '10px', color: 'var(--color-error)', marginTop: '8px', textAlign: 'center' }}>
                  Assign Alice & Bob nodes to enable simulation
                </p>
              )}
            </div>
          </div>

          {/* Node Toolbox */}
          <div className="glass-panel">
            <h2 className="inspector-title">
              <Layers size={18} className="title-cyan" />
              Node Toolbox
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 14px 0' }}>
              Add nodes, connect with channels, then pick any two as Alice/Bob.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => handleAddDynamicNode('endpoint')} style={{ justifyContent: 'flex-start' }}>
                <Shield size={15} style={{ color: '#06b6d4' }} /> Add Endpoint Node
              </button>
              <button className="btn-secondary" onClick={() => handleAddDynamicNode('source')} style={{ justifyContent: 'flex-start' }}>
                <Sparkles size={15} style={{ color: '#f59e0b' }} /> Add SPDC Source
              </button>
              <button className="btn-secondary" onClick={() => handleAddDynamicNode('transceiver')} style={{ justifyContent: 'flex-start' }}>
                <Repeat size={15} style={{ color: '#a855f7' }} /> Add Repeater Node
              </button>
              <button className="btn-secondary" onClick={() => handleAddDynamicNode('bsm')} style={{ justifyContent: 'flex-start' }}>
                <Zap size={15} style={{ color: '#ec4899' }} /> Add BSM Station
              </button>
            </div>

            <h2 className="inspector-title" style={{ marginTop: '20px' }}>
              <Network size={18} className="title-cyan" />
              Channel Routing
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 12px 0' }}>
              {drawMode ? `Click source then destination to create ${drawMode} link…` : 'Click below then click two nodes.'}
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className={`btn-${drawMode === 'quantum' ? 'primary' : 'secondary'}`}
                onClick={() => { setDrawMode(d => d === 'quantum' ? null : 'quantum'); setDrawSrcId(null); }}>
                Quantum Link
              </button>
              <button className={`btn-${drawMode === 'classical' ? 'primary' : 'secondary'}`}
                onClick={() => { setDrawMode(d => d === 'classical' ? null : 'classical'); setDrawSrcId(null); }}>
                Classical Link
              </button>
            </div>
          </div>
        </aside>

        {/* ── Center Column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>

            {/* ── Topology Canvas ── */}
            <div className="glass-panel canvas-panel">
              <div className="canvas-header">
                <h2 className="canvas-title">Network Topology</h2>
                <div style={{ display: 'flex', gap: '8px', fontSize: '11px', alignItems: 'center' }}>
                  <button className={`btn-${viewMode === 'abstract' ? 'primary' : 'secondary'}`} onClick={() => setViewMode('abstract')} style={{ padding: '2px 10px', fontSize: '11px' }}>Abstract</button>
                  <button className={`btn-${viewMode === 'map' ? 'primary' : 'secondary'}`} onClick={() => setViewMode('map')} style={{ padding: '2px 10px', fontSize: '11px' }}>Map</button>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-quantum)', marginLeft: '8px' }}></span> Quantum
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-classical)' }}></span> Classical
                  {selectingFor && (
                    <span style={{ padding: '2px 10px', borderRadius: '20px', background: selectingFor === 'alice' ? 'rgba(56,189,248,0.2)' : 'rgba(192,132,252,0.2)', border: `1px solid ${selectingFor === 'alice' ? '#38bdf8' : '#c084fc'}`, color: selectingFor === 'alice' ? '#38bdf8' : '#c084fc', fontSize: '11px', fontWeight: 600 }}>
                      Selecting {selectingFor === 'alice' ? 'Alice (A)' : 'Bob (B)'}…
                    </span>
                  )}
                </div>
              </div>

              {/* ── Draw Mode Banner ── */}
              {drawMode && (
                <div className="draw-mode-banner" style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 14px', borderRadius: '8px', marginBottom: '4px',
                  background: drawSrcId ? 'rgba(168,85,247,0.12)' : 'rgba(6,182,212,0.12)',
                  border: `1px solid ${drawSrcId ? 'rgba(168,85,247,0.5)' : 'rgba(6,182,212,0.5)'}`,
                  fontSize: '12px', fontWeight: 600,
                  color: drawSrcId ? '#c084fc' : '#38bdf8',
                  animation: 'draw-banner-pulse 1.4s ease-in-out infinite',
                }}>
                  <span style={{ fontSize: '16px' }}>{drawSrcId ? '✦' : '⊕'}</span>
                  <span>
                    {drawSrcId
                      ? <>Step 2/2 &mdash; Click the <strong>destination</strong> node to complete the {drawMode} link
                          <span style={{ marginLeft: '12px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(168,85,247,0.2)', fontSize: '10px' }}>
                            Source: <strong>{drawSrcId.toUpperCase()}</strong>
                          </span>
                        </>
                      : <>Step 1/2 &mdash; Click the <strong>source</strong> node on the canvas below</>
                    }
                  </span>
                  <button onClick={() => { setDrawMode(null); setDrawSrcId(null); }}
                    style={{ marginLeft: 'auto', padding: '2px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', fontSize: '11px', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              )}

              {viewMode === 'abstract' ? (
                <div className={`canvas-viewport ${selectingFor ? 'canvas-selecting' : drawMode ? 'canvas-drawing' : ''}`}
                  ref={canvasRef}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}>
                  <svg className="svg-canvas">
                    {/* Path glow background */}
                    {channels.map(ch => {
                      const src = nodes.find(n => n.id === ch.src);
                      const dst = nodes.find(n => n.id === ch.dst);
                      if (!src || !dst || !isOnActivePath(ch.src, ch.dst)) return null;
                      return (
                        <line key={`glow_${ch.id}`}
                          x1={src.x} y1={src.y} x2={dst.x} y2={dst.y}
                          stroke={ch.src === routePaths?.alicePath[0] || routePaths?.alicePath.includes(ch.src) ? 'rgba(56,189,248,0.25)' : 'rgba(192,132,252,0.25)'}
                          strokeWidth="14" strokeLinecap="round" />
                      );
                    })}

                    {/* Channels */}
                    {channels.map(ch => {
                      const src = nodes.find(n => n.id === ch.src);
                      const dst = nodes.find(n => n.id === ch.dst);
                      if (!src || !dst) return null;
                      const isQ = ch.type === 'quantum';
                      const onPath = isOnActivePath(ch.src, ch.dst);
                      const aliceOnPath = routePaths?.alicePath.some((id, i) =>
                        (id === ch.src && routePaths.alicePath[i+1] === ch.dst) ||
                        (id === ch.dst && routePaths.alicePath[i+1] === ch.src));
                      return (
                        <g key={ch.id}>
                          <line x1={src.x} y1={src.y} x2={dst.x} y2={dst.y}
                            className={`${isQ ? 'quantum-channel-line' : 'classical-channel-line'} ${simRunning ? 'channel-line-active' : ''} ${onPath ? 'path-active-line' : ''}`}
                            stroke={onPath ? (aliceOnPath ? '#38bdf8' : '#c084fc') : undefined}
                            strokeWidth={onPath ? 2.5 : undefined}
                          />
                          <title>{`${ch.name} · ${isQ ? `Dist: ${ch.distance}m  Att: ${ch.attenuation} dB/m  Fid: ${ch.fidelity}` : `Delay: ${ch.delay}s`}`}</title>
                        </g>
                      );
                    })}

                    {/* Photon Animations */}
                    {animatingPhotons.map(p => (
                      <circle key={p.id} cx={p.sx} cy={p.sy} r="6"
                        fill={p.color || '#38bdf8'}
                        style={{ animation: 'photon-travel 0.9s cubic-bezier(0.25,0.46,0.45,0.94) forwards', '--dx': `${p.dx}px`, '--dy': `${p.dy}px` }}
                      />
                    ))}

                    {/* Nodes */}
                    {nodes.map(node => {
                      const isSelected = selectedNodeId === node.id;
                      const isSrc = drawSrcId === node.id;
                      const pathRole = getNodePathRole(node.id);
                      const isAlice = node.id === selectedPair.alice;
                      const isBob = node.id === selectedPair.bob;
                      const meta = NODE_TYPES[node.type] || NODE_TYPES.endpoint;
                      const nodeColor = isAlice ? '#38bdf8' : isBob ? '#c084fc' : isSelected ? meta.color : 'var(--border-color)';
                      const nodeGlow = isAlice ? 'drop-shadow(0 0 14px #38bdf8)' : isBob ? 'drop-shadow(0 0 14px #c084fc)' : isSelected ? `drop-shadow(0 0 10px ${meta.color})` : 'none';

                      return (
                        <g key={node.id}
                          className={`node-group ${isSelected ? 'selected' : ''} ${selectingFor ? 'node-selectable' : ''}`}
                          transform={`translate(${node.x - 62}, ${node.y - 42})`}
                          onMouseDown={e => handleNodeMouseDown(e, node.id)}
                        >
                          {/* Alice/Bob selection ring */}
                          {(isAlice || isBob) && (
                            <rect x="-5" y="-5" width="134" height="94" rx="14"
                              fill="none"
                              stroke={isAlice ? '#38bdf8' : '#c084fc'}
                              strokeWidth="2" strokeDasharray="6 3"
                              opacity="0.8"
                            />
                          )}

                          {/* Node card */}
                          <rect width="124" height="84" rx="10" className="node-rect"
                            style={{ stroke: nodeColor, filter: nodeGlow }} />
                          <rect width="124" height="30" rx="10" fill={meta.color} opacity="0.15" />
                          <line x1="0" y1="30" x2="124" y2="30" stroke={meta.color} opacity="0.3" strokeWidth="1" />

                          {/* Type icon */}
                          <g transform="translate(10, 7)">
                            <rect width="16" height="16" rx="4" fill={meta.color} />
                          </g>

                          {/* Node ID */}
                          <text x="34" y="21" fill="#fff" fontSize="11" fontWeight="bold">{node.id.toUpperCase()}</text>

                          {/* Type badge */}
                          <text x="62" y="51" fill={meta.color} fontSize="10" fontWeight="bold" textAnchor="middle">{meta.shortName}</text>
                          <text x="62" y="67" fill="var(--text-muted)" fontSize="9" textAnchor="middle">
                            {node.name.length > 22 ? node.name.substring(0, 20) + '…' : node.name}
                          </text>

                          {/* Alice badge */}
                          {isAlice && (
                            <g transform="translate(96, 5)">
                              <rect width="22" height="18" rx="4" fill="#38bdf8" />
                              <text x="11" y="13" fill="#000" fontSize="10" fontWeight="900" textAnchor="middle">A</text>
                            </g>
                          )}
                          {/* Bob badge */}
                          {isBob && (
                            <g transform="translate(96, 5)">
                              <rect width="22" height="18" rx="4" fill="#c084fc" />
                              <text x="11" y="13" fill="#000" fontSize="10" fontWeight="900" textAnchor="middle">B</text>
                            </g>
                          )}
                          {/* Repeater badge */}
                          {pathRole === 'repeater' && !isAlice && !isBob && (
                            <g transform="translate(96, 5)">
                              <rect width="22" height="18" rx="4" fill="rgba(251,191,36,0.2)" stroke="#fbbf24" strokeWidth="1" />
                              <text x="11" y="13" fill="#fbbf24" fontSize="7" fontWeight="bold" textAnchor="middle">REP</text>
                            </g>
                          )}
                          {/* Draw source indicator */}
                          {isSrc && (
                            <circle cx="62" cy="42" r="34" fill="none" stroke="var(--color-quantum)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              ) : (
                <div className="canvas-viewport" style={{ padding: 0, position: 'relative' }}>
                  <MapContainer center={[22.55, 76.0]} zoom={8} style={{ height: '100%', width: '100%', minHeight: '380px', borderRadius: '0 0 12px 12px' }}>
                    <MapResizeHandler />
                    <TileLayer
                      url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    />
                    {channels.map(ch => {
                      const sn = nodes.find(n => n.id === ch.src);
                      const dn = nodes.find(n => n.id === ch.dst);
                      if (!sn?.lat || !dn?.lat) return null;
                      const onPath = isOnActivePath(ch.src, ch.dst);
                      const aliceOnPath = routePaths?.alicePath.some((id, i) =>
                        (id === ch.src && routePaths.alicePath[i+1] === ch.dst) ||
                        (id === ch.dst && routePaths.alicePath[i+1] === ch.src));
                      return (
                        <Polyline key={ch.id}
                          positions={[[sn.lat, sn.lng], [dn.lat, dn.lng]]}
                          color={onPath ? (aliceOnPath ? '#38bdf8' : '#c084fc') : ch.type === 'quantum' ? '#06b6d4' : '#f59e0b'}
                          weight={onPath ? 4 : ch.type === 'quantum' ? 2.5 : 2}
                          dashArray={ch.type === 'classical' ? '5 5' : null}
                          opacity={onPath ? 1 : 0.7}
                        >
                          <Popup>
                            <strong>{ch.name}</strong><br/>
                            {ch.type === 'quantum' ? `Quantum · ${Math.round(ch.distance)}m · Fid: ${ch.fidelity}` : `Classical · Delay: ${ch.delay?.toExponential(2)}s`}
                          </Popup>
                        </Polyline>
                      );
                    })}
                    {nodes.filter(n => n.lat && n.lng).map(node => {
                      const pathRole = getNodePathRole(node.id);
                      return (
                        <Marker key={node.id}
                          position={[node.lat, node.lng]}
                          icon={createCustomNodeIcon(node, selectedNodeId === node.id, pathRole)}
                          draggable
                          eventHandlers={{
                            dragend: e => handleMarkerDragEnd(node.id, e),
                            click: () => handleNodeMouseDown({ stopPropagation: () => {} }, node.id)
                          }}
                        >
                          <Popup>
                            <div style={{ textAlign: 'center' }}>
                              <strong style={{ color: NODE_TYPES[node.type]?.color }}>{node.name}</strong><br/>
                              <span style={{ fontSize: '10px', padding: '2px 6px', background: `${NODE_TYPES[node.type]?.color}22`, color: NODE_TYPES[node.type]?.color, borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                                {NODE_TYPES[node.type]?.label}
                              </span>
                              {pathRole && <div style={{ marginTop: '6px', fontSize: '11px', color: pathRole === 'alice' ? '#38bdf8' : pathRole === 'bob' ? '#c084fc' : '#fbbf24' }}>
                                {pathRole === 'alice' ? '◉ Alice Node' : pathRole === 'bob' ? '◉ Bob Node' : '⟳ Quantum Repeater'}
                              </div>}
                            </div>
                          </Popup>
                        </Marker>
                      );
                    })}
                  </MapContainer>
                  {/* Legend */}
                  <div className="map-legend-panel">
                    <div className="legend-title-row" onClick={() => setLegendOpen(!legendOpen)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Layers size={14} className="title-cyan" />
                        <strong style={{ fontSize: '12px' }}>Map Legend</strong>
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{legendOpen ? '▼' : '▲'}</span>
                    </div>
                    {legendOpen && (
                      <div className="legend-content">
                        {Object.values(NODE_TYPES).map(meta => (
                          <div key={meta.type} className="legend-row">
                            <div className={`legend-icon-swatch shape-${meta.shape}`} style={{ background: meta.bgGradient, boxShadow: `0 0 8px ${meta.glowColor}` }}>
                              <span dangerouslySetInnerHTML={{ __html: meta.svgIconHtml }} />
                            </div>
                            <div className="legend-info">
                              <span className="legend-name" style={{ color: meta.color }}>{meta.label}</span>
                              <span className="legend-desc">{meta.description}</span>
                            </div>
                          </div>
                        ))}
                        <div className="legend-divider" />
                        <div className="legend-row">
                          <div style={{ width: '26px', height: '4px', background: '#38bdf8', borderRadius: '2px', marginTop: '5px', flexShrink: 0, boxShadow: '0 0 6px #38bdf8' }}></div>
                          <div className="legend-info"><span className="legend-name" style={{ color: '#38bdf8' }}>Alice Path</span></div>
                        </div>
                        <div className="legend-row">
                          <div style={{ width: '26px', height: '4px', background: '#c084fc', borderRadius: '2px', marginTop: '5px', flexShrink: 0, boxShadow: '0 0 6px #c084fc' }}></div>
                          <div className="legend-info"><span className="legend-name" style={{ color: '#c084fc' }}>Bob Path</span></div>
                        </div>
                        <div className="legend-row">
                          <div className="legend-line-swatch quantum"></div>
                          <div className="legend-info"><span className="legend-name" style={{ color: 'var(--color-quantum)' }}>Quantum Fiber</span></div>
                        </div>
                        <div className="legend-row">
                          <div className="legend-line-swatch classical"></div>
                          <div className="legend-info"><span className="legend-name" style={{ color: 'var(--color-classical)' }}>Classical Link</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Node Inspector ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="glass-panel inspector-panel">
                <div className="inspector-header">
                  <h2 className="inspector-title">
                    <Cpu size={18} className="title-purple" />
                    Node Inspector
                  </h2>
                  {selectedNode && (
                    <span className="component-type" style={{ background: `${NODE_TYPES[selectedNode.type]?.color}22`, color: NODE_TYPES[selectedNode.type]?.color }}>
                      {NODE_TYPES[selectedNode.type]?.shortName}
                    </span>
                  )}
                </div>
                {selectedNode ? (
                  <div className="inspector-body">
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: NODE_TYPES[selectedNode.type]?.color, display: 'inline-block' }}></span>
                        {selectedNode.name}
                      </h3>
                    </div>

                    {/* Type Selector */}
                    <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: 0 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                        <Settings size={12} className="title-cyan" /> Node Type
                      </label>
                      <select className="form-input" value={selectedNode.type}
                        onChange={e => handleNodeTypeChange(selectedNode.id, e.target.value)}
                        style={{ borderColor: NODE_TYPES[selectedNode.type]?.color, color: NODE_TYPES[selectedNode.type]?.color, fontWeight: 'bold' }}>
                        {Object.values(NODE_TYPES).map(m => (
                          <option key={m.type} value={m.type} style={{ background: 'var(--bg-secondary)', color: '#fff' }}>{m.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Quick pair assign */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn-secondary" style={{ flex: 1, padding: '6px', fontSize: '11px' }}
                        onClick={() => setSelectedPair(p => ({ ...p, alice: selectedNode.id }))}>
                        <span style={{ color: '#38bdf8', fontWeight: 700 }}>A</span> Set as Alice
                      </button>
                      <button className="btn-secondary" style={{ flex: 1, padding: '6px', fontSize: '11px' }}
                        onClick={() => setSelectedPair(p => ({ ...p, bob: selectedNode.id }))}>
                        <span style={{ color: '#c084fc', fontWeight: 700 }}>B</span> Set as Bob
                      </button>
                    </div>

                    {/* Internal diagram */}
                    <div className="node-internal-svg-container">
                      <svg width="100%" height="100%" viewBox="0 0 300 180">
                        {selectedNode.type === 'source' ? (<>
                          <rect x="20" y="80" width="45" height="20" fill="#1e293b" stroke="#64748b" rx="3" />
                          <text x="42" y="93" fill="#f59e0b" fontSize="8" textAnchor="middle" fontWeight="bold">LASER</text>
                          <line x1="65" y1="90" x2="140" y2="90" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="3 2" />
                          <polygon points="140,70 170,80 170,100 140,110" fill="#f59e0b" opacity="0.4" stroke="#fbbf24" strokeWidth="1.5" />
                          <text x="155" y="93" fill="#fff" fontSize="9" textAnchor="middle" fontWeight="bold">BBO</text>
                          <line x1="170" y1="85" x2="280" y2="50" className="internal-beam" stroke="#38bdf8" />
                          <line x1="170" y1="95" x2="280" y2="130" className="internal-beam" stroke="#c084fc" />
                          <text x="250" y="42" fill="#38bdf8" fontSize="8" fontWeight="bold">Photon A</text>
                          <text x="250" y="145" fill="#c084fc" fontSize="8" fontWeight="bold">Photon B</text>
                        </>) : selectedNode.type === 'transceiver' ? (<>
                          <line x1="15" y1="90" x2="75" y2="90" stroke="#38bdf8" strokeWidth="2" />
                          <text x="35" y="80" fill="#38bdf8" fontSize="8">Qubit In</text>
                          <rect x="75" y="70" width="35" height="40" fill="#1e293b" stroke="#a855f7" rx="3" />
                          <text x="92" y="93" fill="#a855f7" fontSize="8" textAnchor="middle" fontWeight="bold">DET</text>
                          <rect x="128" y="60" width="50" height="60" fill="#1e293b" stroke="#a855f7" strokeWidth="2" rx="4" />
                          <text x="153" y="85" fill="#fff" fontSize="8" textAnchor="middle" fontWeight="bold">BSM</text>
                          <text x="153" y="98" fill="#a855f7" fontSize="7" textAnchor="middle">SWAP</text>
                          <text x="153" y="110" fill="#64748b" fontSize="6" textAnchor="middle">MEM</text>
                          <rect x="195" y="70" width="35" height="40" fill="#1e293b" stroke="#a855f7" rx="3" />
                          <text x="212" y="93" fill="#a855f7" fontSize="8" textAnchor="middle" fontWeight="bold">DET</text>
                          <line x1="230" y1="90" x2="285" y2="90" stroke="#c084fc" strokeWidth="2" />
                          <text x="255" y="80" fill="#c084fc" fontSize="8">Qubit Out</text>
                        </>) : selectedNode.type === 'bsm' ? (<>
                          <line x1="20" y1="50" x2="130" y2="90" stroke="#38bdf8" strokeWidth="2" />
                          <line x1="20" y1="130" x2="130" y2="90" stroke="#c084fc" strokeWidth="2" />
                          <polygon points="120,75 150,90 120,105" fill="#ec4899" opacity="0.6" stroke="#f43f5e" />
                          <text x="133" y="93" fill="#fff" fontSize="7" textAnchor="middle" fontWeight="bold">BS</text>
                          <rect x="210" y="25" width="40" height="20" fill="#1e293b" stroke="#ec4899" rx="2" />
                          <text x="230" y="38" fill="#ec4899" fontSize="8" textAnchor="middle">SPAD 1</text>
                          <rect x="210" y="60" width="40" height="20" fill="#1e293b" stroke="#ec4899" rx="2" />
                          <text x="230" y="73" fill="#ec4899" fontSize="8" textAnchor="middle">SPAD 2</text>
                          <rect x="210" y="95" width="40" height="20" fill="#1e293b" stroke="#ec4899" rx="2" />
                          <text x="230" y="108" fill="#ec4899" fontSize="8" textAnchor="middle">SPAD 3</text>
                          <rect x="210" y="130" width="40" height="20" fill="#1e293b" stroke="#ec4899" rx="2" />
                          <text x="230" y="143" fill="#ec4899" fontSize="8" textAnchor="middle">SPAD 4</text>
                        </>) : (<>
                          <line x1="20" y1="90" x2="110" y2="90" stroke="var(--color-quantum)" strokeWidth="2" />
                          <text x="40" y="80" fill="var(--color-quantum)" fontSize="8">Qubit In</text>
                          <circle cx="70" cy="90" r="10" fill="#334155" stroke="#94a3b8" />
                          <text x="70" y="93" fill="#fff" fontSize="8" textAnchor="middle">TAP</text>
                          <polygon points="110,75 140,90 110,105" fill="#06b6d4" opacity="0.6" stroke="#38bdf8" />
                          <text x="122" y="93" fill="#000" fontSize="7" textAnchor="middle" fontWeight="bold">PBS</text>
                          <line x1="125" y1="90" x2="220" y2="40" className="internal-beam internal-beam-h" />
                          <line x1="125" y1="90" x2="220" y2="140" className="internal-beam internal-beam-v" />
                          <rect x="220" y="25" width="35" height="25" fill="#1e293b" stroke="#22c55e" rx="3" />
                          <text x="237" y="40" fill="#22c55e" fontSize="8" textAnchor="middle">DET H</text>
                          <rect x="220" y="125" width="35" height="25" fill="#1e293b" stroke="#3b82f6" rx="3" />
                          <text x="237" y="140" fill="#3b82f6" fontSize="8" textAnchor="middle">DET V</text>
                        </>)}
                      </svg>
                    </div>

                    {/* Components */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '170px', overflowY: 'auto' }}>
                      {selectedNode.components.map(comp => (
                        <div key={comp.id} className="component-card">
                          <div className="component-card-header">
                            <span className="component-name">{comp.name}</span>
                            <button className="btn-secondary" style={{ padding: '2px', borderRadius: '4px', border: 'none' }}
                              onClick={() => handleDeleteComponent(comp.id)}>
                              <Trash2 size={12} style={{ color: 'var(--color-error)' }} />
                            </button>
                          </div>
                          <span className="component-type" style={{ alignSelf: 'flex-start' }}>{comp.type}</span>
                          <div className="component-params">
                            {comp.type === 'MemoryArray' ? (
                              <>
                                <div className="component-param-row">
                                  <span>Num Memories:</span>
                                  <input type="number" className="component-param-value"
                                    style={{ width: '50px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }}
                                    value={comp.num_memories ?? 10} step="1" min="1" max="100"
                                    onChange={e => handleUpdateComponentParam(comp.id, 'num_memories', e.target.value)} />
                                </div>
                                <div className="component-param-row">
                                  <span>Fidelity:</span>
                                  <input type="number" className="component-param-value"
                                    style={{ width: '60px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }}
                                    value={comp.fidelity ?? 0.98} step="0.01" min="0" max="1"
                                    onChange={e => handleUpdateComponentParam(comp.id, 'fidelity', e.target.value)} />
                                </div>
                                <div className="component-param-row">
                                  <span>Coherence (s):</span>
                                  <input type="number" className="component-param-value"
                                    style={{ width: '60px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }}
                                    value={comp.coherence_time ?? -1} step="0.1"
                                    onChange={e => handleUpdateComponentParam(comp.id, 'coherence_time', e.target.value)} />
                                </div>
                                <div className="component-param-row">
                                  <span>Efficiency:</span>
                                  <input type="number" className="component-param-value"
                                    style={{ width: '60px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }}
                                    value={comp.efficiency ?? 1.0} step="0.01" min="0" max="1"
                                    onChange={e => handleUpdateComponentParam(comp.id, 'efficiency', e.target.value)} />
                                </div>
                                <div className="component-param-row">
                                  <span>Frequency (Hz):</span>
                                  <input type="number" className="component-param-value"
                                    style={{ width: '70px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }}
                                    value={comp.frequency ?? 80000000} step="1000"
                                    onChange={e => handleUpdateComponentParam(comp.id, 'frequency', e.target.value)} />
                                </div>
                                <div className="component-param-row">
                                  <span>Wavelength (nm):</span>
                                  <input type="number" className="component-param-value"
                                    style={{ width: '50px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }}
                                    value={comp.wavelength ?? 500} step="1"
                                    onChange={e => handleUpdateComponentParam(comp.id, 'wavelength', e.target.value)} />
                                </div>
                              </>
                            ) : (
                              <>
                                {comp.efficiency !== undefined && (
                                  <div className="component-param-row">
                                    <span>Efficiency:</span>
                                    <input type="number" className="component-param-value"
                                      style={{ width: '60px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }}
                                      value={comp.efficiency} step="0.01" min="0" max="1"
                                      onChange={e => handleUpdateComponentParam(comp.id, 'efficiency', e.target.value)} />
                                  </div>
                                )}
                                {comp.dark_count !== undefined && (
                                  <div className="component-param-row">
                                    <span>Dark Count Rate:</span>
                                    <input type="number" className="component-param-value"
                                      style={{ width: '70px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }}
                                      value={comp.dark_count} step="1e-7"
                                      onChange={e => handleUpdateComponentParam(comp.id, 'dark_count', e.target.value)} />
                                  </div>
                                )}
                                {comp.mean_photon_num !== undefined && (
                                  <div className="component-param-row">
                                    <span>Mean Photon Pair:</span>
                                    <input type="number" className="component-param-value"
                                      style={{ width: '50px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }}
                                      value={comp.mean_photon_num} step="0.5"
                                      onChange={e => handleUpdateComponentParam(comp.id, 'mean_photon_num', e.target.value)} />
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add Component */}
                    <div className="add-comp-select-container">
                      <select className="form-input" style={{ padding: '6px' }} value={newCompType} onChange={e => setNewCompType(e.target.value)}>
                        <option value="QSDetectorPolarization">QS Detector (Polarization)</option>
                        <option value="SPDCSource">SPDC Source</option>
                        <option value="MemoryArray">Memory Array</option>
                      </select>
                      <button className="btn-primary" style={{ padding: '6px 14px', width: 'auto' }} onClick={handleAddComponent}>Add</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '20px 0' }}>Click a node to inspect.</div>
                )}
              </div>

              {/* Channel Inspector */}
              <div className="glass-panel inspector-panel">
                <div className="inspector-header">
                  <h2 className="inspector-title"><Sliders size={18} className="title-cyan" /> Channels</h2>
                </div>
                <div className="inspector-body" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                  {channels.map(ch => (
                    <div key={ch.id} className="component-card">
                      <div className="component-card-header">
                        <span className="component-name" style={{ fontSize: '11px' }}>{ch.name}</span>
                        <button className="btn-secondary" style={{ padding: '2px', borderRadius: '4px', border: 'none' }}
                          onClick={() => handleDeleteChannel(ch.id)}>
                          <Trash2 size={12} style={{ color: 'var(--color-error)' }} />
                        </button>
                      </div>
                      <span className="component-type" style={{ alignSelf: 'flex-start', background: ch.type === 'quantum' ? 'rgba(6,182,212,0.15)' : 'rgba(245,158,11,0.15)', color: ch.type === 'quantum' ? 'var(--color-quantum)' : 'var(--color-classical)' }}>
                        {ch.type.toUpperCase()} · {ch.src}→{ch.dst}
                      </span>
                      <div className="component-params">
                        {ch.distance !== undefined && (
                          <div className="component-param-row">
                            <span>Distance (m):</span>
                            <input type="number" className="component-param-value"
                              style={{ width: '65px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }}
                              value={ch.distance} step="100"
                              onChange={e => handleUpdateChannelParam(ch.id, 'distance', e.target.value)} />
                          </div>
                        )}
                        {ch.attenuation !== undefined && (
                          <div className="component-param-row">
                            <span>Attenuation:</span>
                            <input type="number" className="component-param-value"
                              style={{ width: '70px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }}
                              value={ch.attenuation} step="0.0001"
                              onChange={e => handleUpdateChannelParam(ch.id, 'attenuation', e.target.value)} />
                          </div>
                        )}
                        {ch.fidelity !== undefined && (
                          <div className="component-param-row">
                            <span>Fidelity:</span>
                            <input type="number" className="component-param-value"
                              style={{ width: '55px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }}
                              value={ch.fidelity} step="0.01" min="0" max="1"
                              onChange={e => handleUpdateChannelParam(ch.id, 'fidelity', e.target.value)} />
                          </div>
                        )}
                        {ch.delay !== undefined && (
                          <div className="component-param-row">
                            <span>Delay (s):</span>
                            <input type="number" className="component-param-value"
                              style={{ width: '70px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }}
                              value={ch.delay} step="1e-7"
                              onChange={e => handleUpdateChannelParam(ch.id, 'delay', e.target.value)} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {channels.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '12px 0' }}>No channels. Use Channel Routing to connect nodes.</div>}
                </div>
              </div>
            </div>
          </div>

          {/* ── Results & Console ── */}
          <div className="glass-panel">
            <h2 className="inspector-title" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <Activity size={18} className="title-cyan" />
              Sifting Operations & Metrics
              {routePaths && (
                <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                  {selectedPair.alice?.toUpperCase()} ↔ {selectedPair.bob?.toUpperCase()} via {routePaths.sourceId.toUpperCase()}
                  <span style={{ marginLeft: '8px', color: '#fbbf24' }}>
                    ({routePaths.alicePath.length + routePaths.bobPath.length - 2} total hops)
                  </span>
                </span>
              )}
            </h2>

            {/* Stats */}
            <div className="dashboard-grid">
              <div className="stat-card glass-panel">
                <span className="stat-label">Trials</span>
                <span className="stat-value">{simStep} / {numTrials}</span>
              </div>
              <div className="stat-card glass-panel">
                <span className="stat-label">Sifted Key Length</span>
                <span className="stat-value quantum">{siftedAliceKey.length} bits</span>
              </div>
              <div className="stat-card glass-panel">
                <span className="stat-label">QBER</span>
                <span className={`stat-value ${qber > 11 ? 'error' : 'success'}`}>{qber.toFixed(2)}%</span>
              </div>
              <div className="stat-card glass-panel">
                <span className="stat-label">Security</span>
                <span className="stat-value" style={{ color: qber > 11 ? 'var(--color-error)' : 'var(--color-success)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {qber > 11 ? <ShieldAlert size={14} /> : <Check size={14} />}
                  {qber > 11 ? 'UNSAFE' : 'SECURE'}
                </span>
              </div>
            </div>

            {/* Key display */}
            <div className="key-comparison-container" style={{ marginTop: '16px' }}>
              <div className="key-line-wrapper">
                <span className="key-label" style={{ color: '#38bdf8', width: '80px' }}>
                  {selectedPair.alice ? `${selectedPair.alice.toUpperCase()} (A)` : 'Alice'}
                </span>
                <span className="key-string" style={{ color: '#38bdf8' }}>{siftedAliceKey || '— (awaiting trials)'}</span>
              </div>
              <div className="key-line-wrapper">
                <span className="key-label" style={{ color: '#c084fc', width: '80px' }}>
                  {selectedPair.bob ? `${selectedPair.bob.toUpperCase()} (B)` : 'Bob'}
                </span>
                <span className="key-string" style={{ color: '#c084fc' }}>{siftedBobKey || '— (awaiting trials)'}</span>
              </div>
            </div>

            {/* Table + Console */}
            <div className="sifting-container" style={{ marginTop: '16px' }}>
              <div className="sifting-list">
                <table className="sifting-table">
                  <thead>
                    <tr>
                      <th>Trial</th>
                      <th>A Basis</th>
                      <th>B Basis</th>
                      <th>A Result</th>
                      <th>B Result</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trialsList.slice(-10).reverse().map(t => {
                      const match = t.alice_basis === t.bob_basis;
                      const ok = match && t.alice_result !== null && t.bob_result !== null;
                      const err = ok && t.alice_result !== t.bob_result;
                      return (
                        <tr key={t.trial} className={match ? 'match-row' : 'mismatch-row'}>
                          <td>#{t.trial}</td>
                          <td><span className={`basis-pill ${t.alice_basis === 0 ? 'basis-z' : 'basis-x'}`}>{t.alice_basis === 0 ? 'Z' : 'X'}</span></td>
                          <td><span className={`basis-pill ${t.bob_basis === 0 ? 'basis-z' : 'basis-x'}`}>{t.bob_basis === 0 ? 'Z' : 'X'}</span></td>
                          <td className="key-bit alice">{t.alice_result !== null ? t.alice_result : '∅'}</td>
                          <td className="key-bit bob">{t.bob_result !== null ? t.bob_result : '∅'}</td>
                          <td style={{ color: ok ? (err ? 'var(--color-error)' : 'var(--color-success)') : 'var(--text-muted)' }}>
                            {ok ? (err ? '❌ Err' : '✅ Sifted') : match ? '∅ Lost' : '⟂ Mismatch'}
                          </td>
                        </tr>
                      );
                    })}
                    {trialsList.length === 0 && (
                      <tr><td colSpan="6" style={{ padding: '24px 0', color: 'var(--text-muted)' }}>Run simulation to see sifting decisions.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="console-panel">
                <div className="console-header">
                  <span>Simulation Console</span>
                  <Terminal size={12} />
                </div>
                <div className="console-body">
                  {logs.map((log, i) => (
                    <div key={i} className="console-line">
                      <span className="console-time">[{log.timestamp}]</span>
                      <span className={`console-${log.type}`}>{log.text}</span>
                    </div>
                  ))}
                  {logs.length === 0 && <div style={{ color: '#4b5563' }}>Console ready…</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && <div className="toast-msg">{toast}</div>}
    </div>
  );
}

export default App;
