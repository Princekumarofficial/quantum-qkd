import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, RotateCcw, Settings, Plus, Trash2, 
  Layers, Info, Check, AlertTriangle, Activity, 
  Terminal, ShieldAlert, Cpu, Network, Sliders, Map as MapIcon, Image as ImageIcon,
  Sparkles, Shield, Repeat, Zap, Compass, Radio, Target
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import './App.css';

// Central Registry for Node Types, Meaningful Colors, Symbols & Descriptions
const NODE_TYPES = {
  endpoint: {
    type: 'endpoint',
    label: 'Endpoint Node (Alice / Bob)',
    shortName: 'ENDPOINT',
    color: '#06b6d4', // Cyan
    bgGradient: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
    glowColor: 'rgba(6, 182, 212, 0.7)',
    shape: 'shield',
    description: 'QKD terminal equipped with polarization state measurement detectors & sifting engine.',
    svgIconHtml: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="10" r="2.5"/><path d="M12 12.5v4"/></svg>`
  },
  source: {
    type: 'source',
    label: 'SPDC Photon Source',
    shortName: 'SPDC SOURCE',
    color: '#f59e0b', // Amber / Gold
    bgGradient: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
    glowColor: 'rgba(245, 158, 11, 0.8)',
    shape: 'sunburst',
    description: 'Entangled photon pair generator (Pump laser + non-linear BBO crystal).',
    svgIconHtml: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="3" fill="#ffffff" fill-opacity="0.4"/></svg>`
  },
  transceiver: {
    type: 'transceiver',
    label: 'Quantum Transceiver / Relay',
    shortName: 'TRANSCEIVER',
    color: '#a855f7', // Violet Purple
    bgGradient: 'linear-gradient(135deg, #7e22ce 0%, #a855f7 100%)',
    glowColor: 'rgba(168, 85, 247, 0.8)',
    shape: 'repeater',
    description: 'Trusted relay node with dual optical detectors & key sifting re-encryption buffer.',
    svgIconHtml: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`
  },
  bsm: {
    type: 'bsm',
    label: 'Bell State Measurement (BSM)',
    shortName: 'BSM NODE',
    color: '#ec4899', // Pink Magenta
    bgGradient: 'linear-gradient(135deg, #be185d 0%, #ec4899 100%)',
    glowColor: 'rgba(236, 72, 153, 0.8)',
    shape: 'crosshair',
    description: 'Bell State Measurement station for entanglement swapping & teleportation.',
    svgIconHtml: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`
  }
};

// Dynamic Leaflet Marker Icon Factory
const createCustomNodeIcon = (node, isSelected = false) => {
  const meta = NODE_TYPES[node.type] || NODE_TYPES.endpoint;
  const selectedClass = isSelected ? 'marker-selected' : '';
  
  const html = `
    <div class="custom-leaflet-marker ${selectedClass} shape-${meta.shape}" style="--node-color: ${meta.color}; --node-gradient: ${meta.bgGradient}; --node-glow: ${meta.glowColor}">
      <div class="marker-glow-ring"></div>
      <div class="marker-badge-icon">
        ${meta.svgIconHtml}
      </div>
      <div class="marker-label-tag">
        <span class="tag-title-text">${node.id.toUpperCase()}</span>
        <span class="tag-type-badge" style="color: ${meta.color}; background: ${meta.color}22;">${meta.shortName}</span>
      </div>
    </div>
  `;

  return L.divIcon({
    html: html,
    className: 'custom-leaflet-div-wrapper',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -26]
  });
};

// Default base configurations
const INITIAL_NODES_BASIC = [
  { 
    id: 'source', 
    name: 'SPDC Source (Middle)', 
    type: 'source', 
    x: 400, 
    y: 120,
    lat: 23.18, 
    lng: 76.6,
    components: [
      { id: 'spdc_source_1', name: 'TaggedSPDCSource', type: 'SPDCSource', mean_photon_num: 10.0, frequency: 100 }
    ]
  },
  { 
    id: 'alice', 
    name: 'Alice Node', 
    type: 'endpoint', 
    x: 150, 
    y: 240,
    lat: 22.7196, 
    lng: 75.8577, // Indore
    components: [
      { id: 'alice_tap', name: 'PhotonTap', type: 'PhotonTap' },
      { id: 'alice_det', name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
      { id: 'alice_sift', name: 'SiftingProtocol', type: 'SiftingProtocol' }
    ]
  },
  { 
    id: 'bob', 
    name: 'Bob Node', 
    type: 'endpoint', 
    x: 650, 
    y: 240,
    lat: 23.2599, 
    lng: 77.4126, // Bhopal
    components: [
      { id: 'bob_tap', name: 'PhotonTap', type: 'PhotonTap' },
      { id: 'bob_det', name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
      { id: 'bob_sift', name: 'SiftingProtocol', type: 'SiftingProtocol' }
    ]
  }
];

const INITIAL_CHANNELS_BASIC = [
  { id: 'qch_a', name: 'qch_source_alice', type: 'quantum', src: 'source', dst: 'alice', distance: 1000, attenuation: 0.0002, fidelity: 0.93 },
  { id: 'qch_b', name: 'qch_source_bob', type: 'quantum', src: 'source', dst: 'bob', distance: 1000, attenuation: 0.0002, fidelity: 0.93 },
  { id: 'cc_ab', name: 'cc_alice_bob', type: 'classical', src: 'alice', dst: 'bob', delay: 5e-6 }
];

// Scaled configuration (Alice -> Source1 -> Transceiver/Repeater -> Source2 -> Bob)
const INITIAL_NODES_SCALED = [
  { 
    id: 'source_1', 
    name: 'SPDC Source 1', 
    type: 'source', 
    x: 280, 
    y: 120,
    lat: 22.9,
    lng: 76.2,
    components: [
      { id: 'spdc_source_1', name: 'TaggedSPDCSource A', type: 'SPDCSource', mean_photon_num: 10.0, frequency: 100 }
    ]
  },
  { 
    id: 'source_2', 
    name: 'SPDC Source 2', 
    type: 'source', 
    x: 520, 
    y: 120,
    lat: 23.2,
    lng: 77.0,
    components: [
      { id: 'spdc_source_2', name: 'TaggedSPDCSource B', type: 'SPDCSource', mean_photon_num: 10.0, frequency: 100 }
    ]
  },
  { 
    id: 'alice', 
    name: 'Alice Node', 
    type: 'endpoint', 
    x: 120, 
    y: 240,
    lat: 22.7196, 
    lng: 75.8577, // Indore
    components: [
      { id: 'alice_tap', name: 'PhotonTap', type: 'PhotonTap' },
      { id: 'alice_det', name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
      { id: 'alice_sift', name: 'SiftingProtocol', type: 'SiftingProtocol' }
    ]
  },
  { 
    id: 'transceiver', 
    name: 'Quantum Transceiver Relay', 
    type: 'transceiver', 
    x: 400, 
    y: 240,
    lat: 23.05, 
    lng: 76.6,
    components: [
      { id: 'tr_tap_a', name: 'PhotonTap Left', type: 'PhotonTap' },
      { id: 'tr_det_a', name: 'QSDetectorPolarization Left', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
      { id: 'tr_tap_b', name: 'PhotonTap Right', type: 'PhotonTap' },
      { id: 'tr_det_b', name: 'QSDetectorPolarization Right', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
      { id: 'tr_relay', name: 'KeyRelayProtocol', type: 'SiftingProtocol' },
      { id: 'tr_mem', name: 'MemoryArray', type: 'MemoryArray', num_memories: 10, fidelity: 0.98 }
    ]
  },
  { 
    id: 'bob', 
    name: 'Bob Node', 
    type: 'endpoint', 
    x: 680, 
    y: 240,
    lat: 23.2599, 
    lng: 77.4126, // Bhopal
    components: [
      { id: 'bob_tap', name: 'PhotonTap', type: 'PhotonTap' },
      { id: 'bob_det', name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
      { id: 'bob_sift', name: 'SiftingProtocol', type: 'SiftingProtocol' }
    ]
  }
];

const INITIAL_CHANNELS_SCALED = [
  { id: 'qch_a1', name: 'qch_src1_alice', type: 'quantum', src: 'source_1', dst: 'alice', distance: 500, attenuation: 0.0002, fidelity: 0.95 },
  { id: 'qch_a2', name: 'qch_src1_tr', type: 'quantum', src: 'source_1', dst: 'transceiver', distance: 500, attenuation: 0.0002, fidelity: 0.95 },
  { id: 'qch_b1', name: 'qch_src2_tr', type: 'quantum', src: 'source_2', dst: 'transceiver', distance: 500, attenuation: 0.0002, fidelity: 0.95 },
  { id: 'qch_b2', name: 'qch_src2_bob', type: 'quantum', src: 'source_2', dst: 'bob', distance: 500, attenuation: 0.0002, fidelity: 0.95 },
  { id: 'cc_at', name: 'cc_alice_tr', type: 'classical', src: 'alice', dst: 'transceiver', delay: 2.5e-6 },
  { id: 'cc_tb', name: 'cc_tr_bob', type: 'classical', src: 'transceiver', dst: 'bob', delay: 2.5e-6 }

];

// Helper to trigger map.invalidateSize() when switching view modes
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

function App() {
  const [topologyType, setTopologyType] = useState('basic'); // 'basic' | 'scaled'
  const [viewMode, setViewMode] = useState('abstract'); // 'abstract' | 'map'
  const [legendOpen, setLegendOpen] = useState(true);
  const [nodes, setNodes] = useState(INITIAL_NODES_BASIC);
  const [channels, setChannels] = useState(INITIAL_CHANNELS_BASIC);
  const [selectedNodeId, setSelectedNodeId] = useState('alice');
  
  // Dynamic Network States
  const [drawMode, setDrawMode] = useState(null); // 'quantum' | 'classical' | null
  const [drawSrcId, setDrawSrcId] = useState(null);

  // Dragging nodes states
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);

  // Simulation parameters
  const [numTrials, setNumTrials] = useState(60);
  const [simSpeed, setSimSpeed] = useState(3); // 1 to 5 (slower to faster)
  const [simRunning, setSimRunning] = useState(false);
  const [simStep, setSimStep] = useState(0); // Current trial index

  // Haversine distance in meters
  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const handleMarkerDragEnd = (id, event) => {
    const marker = event.target;
    if (marker) {
      const position = marker.getLatLng();
      setNodes(prev => prev.map(n => {
        if (n.id === id) {
          return { ...n, lat: position.lat, lng: position.lng };
        }
        return n;
      }));
    }
  };

  const handleNodeClick = (nodeId) => {
    if (drawMode) {
      if (!drawSrcId) {
        setDrawSrcId(nodeId);
        addLog(`Select destination node to complete ${drawMode} link.`, 'info');
      } else if (drawSrcId !== nodeId) {
        // Complete the link
        const newChannel = {
          id: `${drawMode.charAt(0)}ch_${drawSrcId}_${nodeId}_${Date.now()}`,
          name: `${drawMode.toUpperCase()} Link`,
          type: drawMode,
          src: drawSrcId,
          dst: nodeId,
        };
        // Provide defaults based on type
        if (drawMode === 'quantum') {
          newChannel.attenuation = 0.0002;
          newChannel.fidelity = 0.95;
        } else {
          newChannel.delay = 1e-6;
        }
        
        // Auto-calculate distance
        const srcNode = nodes.find(n => n.id === drawSrcId);
        const dstNode = nodes.find(n => n.id === nodeId);
        if (srcNode.lat && dstNode.lat) {
           const dist = getDistance(srcNode.lat, srcNode.lng, dstNode.lat, dstNode.lng);
           newChannel.distance = Math.round(dist);
           if (drawMode === 'classical') newChannel.delay = dist / 2e8;
        } else {
           newChannel.distance = 1000;
        }

        setChannels(prev => [...prev, newChannel]);
        setDrawMode(null);
        setDrawSrcId(null);
        addLog(`${drawMode} channel created!`, 'success');
      }
    } else {
      setSelectedNodeId(nodeId);
    }
  };

  // Auto-update channel distances based on geographic coordinates
  useEffect(() => {
    if (viewMode === 'map') {
      setChannels(prevChannels => prevChannels.map(ch => {
        const srcNode = nodes.find(n => n.id === ch.src);
        const dstNode = nodes.find(n => n.id === ch.dst);
        if (srcNode && dstNode && srcNode.lat && dstNode.lat) {
          const dist = getDistance(srcNode.lat, srcNode.lng, dstNode.lat, dstNode.lng);
          // Speed of light in fiber is approx 2e8 m/s
          const delay = dist / 2e8;
          return { ...ch, distance: Math.round(dist), delay: delay };
        }
        return ch;
      }));
    }
  }, [nodes, viewMode]);
  const [backendTrials, setBackendTrials] = useState(null);
  const [isBackendMode, setIsBackendMode] = useState(false);
  
  // Simulation results
  const [trialsList, setTrialsList] = useState([]);
  const [logs, setLogs] = useState([]);
  const [siftedAliceKey, setSiftedAliceKey] = useState('');
  const [siftedBobKey, setSiftedBobKey] = useState('');
  const [qber, setQber] = useState(0);
  
  // Animation state (photons travelling)
  const [animatingPhotons, setAnimatingPhotons] = useState([]);

  // Component editor local inputs
  const [newCompType, setNewCompType] = useState('QSDetectorPolarization');
  const [toast, setToast] = useState(null);

  // Handle switching topology
  useEffect(() => {
    resetSimulation();
    if (topologyType === 'basic') {
      setNodes(JSON.parse(JSON.stringify(INITIAL_NODES_BASIC)));
      setChannels(JSON.parse(JSON.stringify(INITIAL_CHANNELS_BASIC)));
      setSelectedNodeId('alice');
    } else {
      setNodes(JSON.parse(JSON.stringify(INITIAL_NODES_SCALED)));
      setChannels(JSON.parse(JSON.stringify(INITIAL_CHANNELS_SCALED)));
      setSelectedNodeId('transceiver');
    }
  }, [topologyType]);

  // Toast auto-clear
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const addLog = (msg, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [...prev, { timestamp, text: msg, type }].slice(-50));
  };

  const showToast = (message) => {
    setToast(message);
  };

  const resetSimulation = () => {
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
    addLog("Simulation reset. Ready.", "info");
  };

  // Node Drag Handlers
  const handleMouseDown = (e, nodeId) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    setDraggingNodeId(nodeId);
    setDragOffset({
      x: clientX - node.x,
      y: clientY - node.y
    });
    setSelectedNodeId(nodeId);
  };

  const handleMouseMove = (e) => {
    if (!draggingNodeId) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - dragOffset.x;
    const y = e.clientY - rect.top - dragOffset.y;
    
    // Boundary conditions
    const boundX = Math.max(40, Math.min(rect.width - 40, x));
    const boundY = Math.max(40, Math.min(rect.height - 40, y));

    setNodes(prev => prev.map(node => 
      node.id === draggingNodeId ? { ...node, x: Math.round(boundX), y: Math.round(boundY) } : node
    ));
  };

  const handleMouseUp = () => {
    setDraggingNodeId(null);
  };

  // Node Component Management
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const handleUpdateComponentParam = (compId, paramName, value) => {
    setNodes(prevNodes => prevNodes.map(node => {
      if (node.id !== selectedNodeId) return node;
      return {
        ...node,
        components: node.components.map(comp => {
          if (comp.id !== compId) return comp;
          return { ...comp, [paramName]: parseFloat(value) || value };
        })
      };
    }));
    addLog(`Updated component ${compId} parameter: ${paramName} = ${value}`, 'warning');
  };

  const handleAddComponent = () => {
    if (!selectedNode) return;
    const count = selectedNode.components.filter(c => c.type === newCompType).length + 1;
    let newComp = {
      id: `${selectedNode.id}_${newCompType.toLowerCase()}_${count}`,
      name: `${newCompType} #${count}`,
      type: newCompType
    };

    if (newCompType === 'QSDetectorPolarization') {
      newComp.efficiency = 0.95;
      newComp.dark_count = 1e-6;
    } else if (newCompType === 'SPDCSource') {
      newComp.mean_photon_num = 10.0;
      newComp.frequency = 100;
    } else if (newCompType === 'MemoryArray') {
      newComp.num_memories = 5;
      newComp.fidelity = 0.98;
    }

    setNodes(prevNodes => prevNodes.map(node => {
      if (node.id !== selectedNodeId) return node;
      return {
        ...node,
        components: [...node.components, newComp]
      };
    }));

    addLog(`Added component ${newComp.name} to ${selectedNode.name}`, 'success');
    showToast(`Added component ${newCompType}`);
  };

  const handleDeleteComponent = (compId) => {
    setNodes(prevNodes => prevNodes.map(node => {
      if (node.id !== selectedNodeId) return node;
      return {
        ...node,
        components: node.components.filter(c => c.id !== compId)
      };
    }));
    addLog(`Removed component ${compId} from ${selectedNode.name}`, 'error');
    showToast(`Deleted component`);
  };

  // Channel parameter updater
  const handleUpdateChannelParam = (chId, paramName, value) => {
    setChannels(prev => prev.map(ch => 
      ch.id === chId ? { ...ch, [paramName]: parseFloat(value) || value } : ch
    ));
    addLog(`Updated channel ${chId} ${paramName} to ${value}`, 'warning');
  };

  const handleDeleteChannel = (chId) => {
    setChannels(prev => prev.filter(ch => ch.id !== chId));
    addLog(`Deleted channel ${chId}`, 'error');
  };

  // Add Dynamic Nodes
  const handleAddDynamicNode = (type) => {
    const index = nodes.length;
    let newNode = {
      id: `${type}_${index}`,
      x: 400 + (Math.random() * 100 - 50),
      y: 200 + (Math.random() * 100 - 50),
      lat: 23.0 + (Math.random() * 1 - 0.5),
      lng: 76.5 + (Math.random() * 1 - 0.5),
      components: []
    };

    if (type === 'bsm') {
      newNode.name = `BSM Node ${index}`;
      newNode.type = 'bsm';
      newNode.components = [
        { id: `bsm_comp_${index}`, name: 'BSM Detector', type: 'BSM', efficiency: 0.95, dark_count: 1e-6 }
      ];
    } else if (type === 'source') {
      newNode.name = `SPDC Source ${index}`;
      newNode.type = 'source';
      newNode.components = [
        { id: `spdc_${index}`, name: 'TaggedSPDCSource', type: 'SPDCSource', mean_photon_num: 10.0, frequency: 100 }
      ];
    } else if (type === 'endpoint') {
      newNode.name = `Endpoint ${index}`;
      newNode.type = 'endpoint';
      newNode.components = [
        { id: `ep_tap_${index}`, name: 'PhotonTap', type: 'PhotonTap' },
        { id: `ep_det_${index}`, name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
        { id: `ep_sift_${index}`, name: 'SiftingProtocol', type: 'SiftingProtocol' }
      ];
    } else if (type === 'transceiver') {
      newNode.name = `Quantum Transceiver ${index}`;
      newNode.type = 'transceiver';
      newNode.components = [
        { id: `tr_tap_${index}`, name: 'PhotonTap', type: 'PhotonTap' },
        { id: `tr_det_${index}`, name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 },
        { id: `tr_mem_${index}`, name: 'MemoryArray', type: 'MemoryArray', num_memories: 10, fidelity: 0.98 }
      ];
    }

    setNodes(prev => [...prev, newNode]);
    addLog(`Added ${type.toUpperCase()} node`, 'success');
  };

  const handleNodeTypeChange = (nodeId, newType) => {
    setNodes(prevNodes => prevNodes.map(node => {
      if (node.id === nodeId) {
        return { ...node, type: newType };
      }
      return node;
    }));
    addLog(`Updated node ${nodeId} type to ${newType.toUpperCase()}`, 'warning');
  };

  // Add a new node (e.g. transceiver) dynamically from the UI
  const handleAddNewTransceiver = () => {
    const id = `transceiver_${nodes.length}`;
    const name = `Transceiver Relay ${nodes.length - 2}`;
    
    // Position it in the canvas center
    const x = 400;
    const y = 180 + (nodes.length % 2) * 50;

    const newTrNode = {
      id,
      name,
      type: 'transceiver',
      x,
      y,
      components: [
        { id: `${id}_tap`, name: 'PhotonTap', type: 'PhotonTap' },
        { id: `${id}_det`, name: 'QSDetectorPolarization', type: 'QSDetectorPolarization', efficiency: 0.95, dark_count: 1e-6 }
      ]
    };

    setNodes(prev => [...prev, newTrNode]);
    setSelectedNodeId(id);

    // Automatically create a quantum channel link from the first SPDC source
    const sourceNode = nodes.find(n => n.type === 'source');
    if (sourceNode) {
      const chId = `qch_src_${id}`;
      const newCh = {
        id: chId,
        name: `qch_${sourceNode.id}_to_${id}`,
        type: 'quantum',
        src: sourceNode.id,
        dst: id,
        distance: 800,
        attenuation: 0.0002,
        fidelity: 0.95
      };
      setChannels(prev => [...prev, newCh]);
    }

    addLog(`Dynamically scaled network by adding ${name}`, 'success');
    showToast(`Scaled Network: Added Transceiver Node`);
  };

  const handleStartSimulation = async () => {
    if (simStep >= numTrials) {
      resetSimulation();
    }
    
    addLog("Requesting SeQUeNCe simulation run...", "info");
    try {
      const response = await fetch("http://localhost:8000/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numTrials,
          nodes,
          channels
        })
      });

      if (!response.ok) {
        throw new Error("HTTP error " + response.status);
      }

      const data = await response.json();
      setBackendTrials(data.trials);
      setIsBackendMode(true);
      addLog("SeQUeNCe backend running simulation successfully.", "success");
      showToast("Backend Simulation Connected");
      
      if (data.logs) {
        data.logs.forEach(l => addLog(l, 'success'));
      }
      
      setSimRunning(true);
    } catch (err) {
      addLog(`FastAPI backend offline. Running client-side simulation engine.`, "warning");
      showToast("Running Client-side simulation");
      setIsBackendMode(false);
      setBackendTrials(null);
      setSimRunning(true);
    }
  };

  // SIFTING SIMULATOR LOOP (Playback / Live Execution)
  useEffect(() => {
    if (!simRunning) return;

    // Determine simulation tick speed in ms (faster speed state = shorter intervals)
    const msInterval = Math.max(100, 1000 - simSpeed * 180);

    const timer = setInterval(() => {
      if (simStep >= numTrials) {
        setSimRunning(false);
        addLog("Simulation completed.", "success");
        return;
      }

      const currentStep = simStep;
      
      if (isBackendMode && backendTrials && backendTrials[currentStep]) {
        const trial = backendTrials[currentStep];
        
        // Trigger animations based on topology
        if (topologyType === 'basic') {
          triggerPhotonAnimation('source', 'alice', 'source', 'bob');
        } else {
          // Find active source IDs
          const s1 = nodes.find(n => n.id.includes('source_1') || n.id.includes('source'))?.id || 'source_1';
          const s2 = nodes.find(n => n.id.includes('source_2'))?.id || 'source_2';
          triggerPhotonAnimation(s1, 'alice', s1, 'transceiver');
          setTimeout(() => {
            triggerPhotonAnimation(s2, 'transceiver', s2, 'bob');
          }, 150);
        }

        // Add pre-computed trial to front-end lists
        setTrialsList(prev => {
          const updated = [...prev, trial];
          calculateKeysFromTrials(updated);
          return updated;
        });
        
        // Log sifting outcome
        const survivedA = !trial.lossA;
        const survivedB = !trial.lossB;
        if (!survivedA && !survivedB) {
          addLog(`[Backend] Trial ${currentStep}: Photons lost on both channels.`, 'error');
        } else if (!survivedA) {
          addLog(`[Backend] Trial ${currentStep}: Alice photon lost. Bob basis = ${trial.bob_basis === 0 ? 'Z':'X'} result = ${trial.bob_result}`, 'info');
        } else if (!survivedB) {
          addLog(`[Backend] Trial ${currentStep}: Bob photon lost. Alice basis = ${trial.alice_basis === 0 ? 'Z':'X'} result = ${trial.alice_result}`, 'info');
        } else {
          addLog(`[Backend] Trial ${currentStep}: Bases A=${trial.alice_basis===0?'Z':'X'} B=${trial.bob_basis===0?'Z':'X'}. Results A=${trial.alice_result} B=${trial.bob_result}`,
            trial.alice_basis === trial.bob_basis ? 'success' : 'info');
        }

      } else {
        // Fallback: Run browser-side QKD simulation logic
        if (topologyType === 'basic') {
          runBasicTrial(currentStep);
        } else {
          runScaledTrial(currentStep);
        }
      }

      setSimStep(prev => prev + 1);
    }, msInterval);

    return () => clearInterval(timer);
  }, [simRunning, simStep, simSpeed, numTrials, nodes, channels, topologyType, isBackendMode, backendTrials]);

  // Run a single BBM92 step: Source -> Alice & Bob
  const runBasicTrial = (step) => {
    // 1. Entangled photon source generates a pair of photons.
    // In BBM92, source emits entangled pairs, say Phi+ = (|00> + |11>) / sqrt(2)
    // We represent measurement bases: 0 = Z (rectilinear), 1 = X (diagonal)
    const aliceDetector = nodes.find(n => n.id === 'alice')?.components.find(c => c.type === 'QSDetectorPolarization');
    const bobDetector = nodes.find(n => n.id === 'bob')?.components.find(c => c.type === 'QSDetectorPolarization');
    
    const effA = aliceDetector ? aliceDetector.efficiency : 0.95;
    const effB = bobDetector ? bobDetector.efficiency : 0.95;

    // Quantum channel parameters
    const qchA = channels.find(c => c.id === 'qch_a');
    const qchB = channels.find(c => c.id === 'qch_b');
    
    const distA = qchA ? qchA.distance : 1000;
    const distB = qchB ? qchB.distance : 1000;
    const attA = qchA ? qchA.attenuation : 0.0002;
    const attB = qchB ? qchB.attenuation : 0.0002;
    const fidA = qchA ? qchA.fidelity : 0.93;
    const fidB = qchB ? qchB.fidelity : 0.93;

    // Loss probability (Beer-Lambert law): P_loss = 1 - 10^(-(attenuation * distance)/10)
    const lossProbA = 1 - Math.pow(10, -(attA * distA) / 10);
    const lossProbB = 1 - Math.pow(10, -(attB * distB) / 10);

    const survivedA = Math.random() > lossProbA && Math.random() < effA;
    const survivedB = Math.random() > lossProbB && Math.random() < effB;

    // State generation: In BBM92, source generates state and sends to Alice & Bob.
    // Basis choices
    const basisA = Math.random() > 0.5 ? 0 : 1; // 0 = Rectilinear (Z), 1 = Diagonal (X)
    const basisB = Math.random() > 0.5 ? 0 : 1;

    // Ideal entanglement: if same basis, they should get the same measurement result (Phi+ state correlation)
    // In sequence, SPDC produces state correlations.
    const baseValue = Math.random() > 0.5 ? 1 : 0;
    let resultA = survivedA ? baseValue : null;
    let resultB = survivedB ? baseValue : null;

    // Apply polarization noise (fidelity error rate)
    if (survivedA && Math.random() > fidA) {
      resultA = resultA === 1 ? 0 : 1; // bit flip error
    }
    if (survivedB && Math.random() > fidB) {
      resultB = resultB === 1 ? 0 : 1;
    }

    // If measured in different bases, outcomes are uncorrelated
    if (survivedA && survivedB && basisA !== basisB) {
      resultB = Math.random() > 0.5 ? 1 : 0;
    }

    // Trigger laser pulse animation
    triggerPhotonAnimation('source', 'alice', 'source', 'bob');

    const newTrial = {
      trial: step,
      alice_basis: basisA,
      bob_basis: basisB,
      alice_result: resultA,
      bob_result: resultB,
      lossA: !survivedA,
      lossB: !survivedB
    };

    setTrialsList(prev => [...prev, newTrial]);

    // Logging the step
    if (!survivedA && !survivedB) {
      addLog(`Trial ${step}: Photons lost on both channels.`, 'error');
    } else if (!survivedA) {
      addLog(`Trial ${step}: Alice's photon lost. Bob measured in ${basisB === 0 ? 'Z' : 'X'} basis = ${resultB}`, 'info');
    } else if (!survivedB) {
      addLog(`Trial ${step}: Bob's photon lost. Alice measured in ${basisA === 0 ? 'Z' : 'X'} basis = ${resultA}`, 'info');
    } else {
      addLog(`Trial ${step}: Measured bases: A=${basisA === 0 ? 'Z':'X'}, B=${basisB === 0 ? 'Z':'X'}. Results: A=${resultA}, B=${resultB}`, 
        basisA === basisB ? 'success' : 'info');
    }

    // Perform live sifting calculation
    calculateKeysFromTrials([...trialsList, newTrial]);
  };

  // Run trial for a scaled repeater/transceiver system
  const runScaledTrial = (step) => {
    // 2-link setup: Alice <-> Source1 <-> Transceiver <-> Source2 <-> Bob
    // SPDC Source 1 sends pairs to Alice and Transceiver
    // SPDC Source 2 sends pairs to Transceiver and Bob
    const survivedA = Math.random() > 0.15;
    const survivedT1 = Math.random() > 0.15;
    const survivedT2 = Math.random() > 0.15;
    const survivedB = Math.random() > 0.15;

    const basisA = Math.random() > 0.5 ? 0 : 1;
    const basisT1 = Math.random() > 0.5 ? 0 : 1;
    const basisT2 = Math.random() > 0.5 ? 0 : 1;
    const basisB = Math.random() > 0.5 ? 0 : 1;

    // SPDC 1 output correlation
    const baseVal1 = Math.random() > 0.5 ? 1 : 0;
    let resultA = survivedA ? baseVal1 : null;
    let resultT1 = survivedT1 ? baseVal1 : null;

    // SPDC 2 output correlation
    const baseVal2 = Math.random() > 0.5 ? 1 : 0;
    let resultT2 = survivedT2 ? baseVal2 : null;
    let resultB = survivedB ? baseVal2 : null;

    // bases mismatches
    if (survivedA && survivedT1 && basisA !== basisT1) {
      resultT1 = Math.random() > 0.5 ? 1 : 0;
    }
    if (survivedT2 && survivedB && basisT2 !== basisB) {
      resultB = Math.random() > 0.5 ? 1 : 0;
    }

    // Transceiver logic: Sifts keys from Link 1 (Alice-TR) and Link 2 (TR-Bob)
    // Then performs a classical key sifting and XOR relaying (re-encrypting)
    // Sifted Link 1: Alice basis == Transceiver basis 1
    // Sifted Link 2: Bob basis == Transceiver basis 2
    let keyLink1Sifted = null;
    let keyLink2Sifted = null;

    if (survivedA && survivedT1 && basisA === basisT1) {
      keyLink1Sifted = resultA;
    }
    if (survivedT2 && survivedB && basisT2 === basisB) {
      keyLink2Sifted = resultB;
    }

    // If both links successfully sift, transceiver can route/relay
    // For simplicity of sifting representation, we track direct virtual link sifting
    const virtualSift = keyLink1Sifted !== null && keyLink2Sifted !== null;
    
    // Trigger two animations
    triggerPhotonAnimation('source_1', 'alice', 'source_1', 'transceiver');
    setTimeout(() => {
      triggerPhotonAnimation('source_2', 'transceiver', 'source_2', 'bob');
    }, 150);

    const newTrial = {
      trial: step,
      alice_basis: basisA,
      bob_basis: basisB,
      // For the visual table, we project sifting status
      alice_result: keyLink1Sifted !== null ? resultA : null,
      bob_result: keyLink2Sifted !== null ? resultB : null,
      lossA: !survivedA || !survivedT1,
      lossB: !survivedB || !survivedT2,
      virtualSift
    };

    setTrialsList(prev => [...prev, newTrial]);
    
    if (virtualSift) {
      addLog(`Trial ${step}: Transceiver relayed keys successfully. Link1 & Link2 sifted.`, 'success');
    } else {
      addLog(`Trial ${step}: Photon loss or sifting mismatch in relay chain.`, 'info');
    }

    calculateKeysFromTrials([...trialsList, newTrial]);
  };

  // Sift bases and calculate keys & QBER
  const calculateKeysFromTrials = (trials) => {
    let keyA = '';
    let keyB = '';
    let errors = 0;
    let totalSifted = 0;

    trials.forEach(t => {
      if (topologyType === 'basic') {
        if (t.alice_result !== null && t.bob_result !== null && t.alice_basis === t.bob_basis) {
          keyA += t.alice_result.toString();
          keyB += t.bob_result.toString();
          totalSifted++;
          if (t.alice_result !== t.bob_result) {
            errors++;
          }
        }
      } else {
        // Scaled sifting logic
        if (t.virtualSift) {
          keyA += t.alice_result.toString();
          keyB += t.bob_result.toString();
          totalSifted++;
          if (t.alice_result !== t.bob_result) {
            errors++;
          }
        }
      }
    });

    setSiftedAliceKey(keyA);
    setSiftedBobKey(keyB);
    setQber(totalSifted > 0 ? (errors / totalSifted) * 100 : 0);
  };

  // Dynamic animation trigger
  const triggerPhotonAnimation = (src1, dest1, src2, dest2) => {
    const s1Node = nodes.find(n => n.id === src1);
    const d1Node = nodes.find(n => n.id === dest1);
    const s2Node = nodes.find(n => n.id === src2);
    const d2Node = nodes.find(n => n.id === dest2);

    if (!s1Node || !d1Node || !s2Node || !d2Node) return;

    const animId = Date.now();
    const newPhotons = [
      { id: `${animId}_1`, sx: s1Node.x, sy: s1Node.y, dx: d1Node.x - s1Node.x, dy: d1Node.y - s1Node.y },
      { id: `${animId}_2`, sx: s2Node.x, sy: s2Node.y, dx: d2Node.x - s2Node.x, dy: d2Node.y - s2Node.y }
    ];

    setAnimatingPhotons(prev => [...prev, ...newPhotons]);

    // Clear after animation runs (1000ms duration)
    setTimeout(() => {
      setAnimatingPhotons(prev => prev.filter(p => p.id !== `${animId}_1` && p.id !== `${animId}_2`));
    }, 1000);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header glass-panel">
        <div>
          <h1>
            <Network className="title-cyan" size={32} />
            SeQUeNCe BBM92 Quantum Sim Control
            <span className="protocol-tag">BBM92 Entangled QKD</span>
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>
            Design topologies, inspect internal node components, and run discrete-event QKD simulations.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className={`btn-secondary ${topologyType === 'basic' ? 'active' : ''}`}
            onClick={() => setTopologyType('basic')}
            style={topologyType === 'basic' ? { borderColor: 'var(--color-quantum)', color: 'var(--color-quantum)' } : {}}
          >
            Basic (3-Node)
          </button>
          <button 
            className={`btn-secondary ${topologyType === 'scaled' ? 'active' : ''}`}
            onClick={() => setTopologyType('scaled')}
            style={topologyType === 'scaled' ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : {}}
          >
            Scaled Relay (5-Node)
          </button>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className="main-grid">
        {/* Sidebar parameters */}
        <aside className="sidebar">
          {/* Controls Panel */}
          <div className="glass-panel">
            <h2 className="inspector-title">
              <Sliders size={18} className="title-purple" />
              Simulation Config
            </h2>
            <div style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label>Number of Trials</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={numTrials} 
                  onChange={(e) => setNumTrials(parseInt(e.target.value) || 10)} 
                  min="10" 
                  max="1000"
                  disabled={simRunning}
                />
              </div>

              <div className="form-group">
                <label>Playback Speed</label>
                <input 
                  type="range" 
                  min="1" 
                  max="5" 
                  className="form-input" 
                  value={simSpeed}
                  onChange={(e) => setSimSpeed(parseInt(e.target.value))}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  <span>Slow</span>
                  <span>Fast</span>
                </div>
              </div>

              <div className="form-row" style={{ marginTop: '24px' }}>
                {simRunning ? (
                  <button className="btn-primary" onClick={() => setSimRunning(false)} style={{ background: 'var(--color-error)' }}>
                    <Pause size={16} /> Pause
                  </button>
                ) : (
                  <button className="btn-primary" onClick={handleStartSimulation} disabled={simStep >= numTrials}>
                    <Play size={16} /> Run QKD
                  </button>
                )}
                <button className="btn-secondary" onClick={resetSimulation}>
                  <RotateCcw size={16} /> Reset
                </button>
              </div>
            </div>
          </div>

          {/* Node Toolbox */}
          <div className="glass-panel">
            <h2 className="inspector-title">
              <Layers size={18} className="title-cyan" />
              Node Toolbox
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 16px 0' }}>
              Add components to build a custom quantum network topology.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => handleAddDynamicNode('endpoint')} style={{ justifyContent: 'flex-start' }}>
                <Shield size={16} style={{ color: '#06b6d4' }} /> Add Endpoint Node
              </button>
              <button className="btn-secondary" onClick={() => handleAddDynamicNode('source')} style={{ justifyContent: 'flex-start' }}>
                <Sparkles size={16} style={{ color: '#f59e0b' }} /> Add SPDC Source
              </button>
              <button className="btn-secondary" onClick={() => handleAddDynamicNode('transceiver')} style={{ justifyContent: 'flex-start' }}>
                <Repeat size={16} style={{ color: '#a855f7' }} /> Add Transceiver Relay
              </button>
              <button className="btn-secondary" onClick={() => handleAddDynamicNode('bsm')} style={{ justifyContent: 'flex-start' }}>
                <Zap size={16} style={{ color: '#ec4899' }} /> Add BSM Station
              </button>
            </div>
            
            <h2 className="inspector-title" style={{ marginTop: '24px' }}>
              <Network size={18} className="title-cyan" />
              Channel Routing
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 16px 0' }}>
              {drawMode ? `Select source then destination node to create ${drawMode} link...` : "Click below to enter routing mode."}
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className={`btn-${drawMode === 'quantum' ? 'primary' : 'secondary'}`} 
                onClick={() => { setDrawMode(drawMode === 'quantum' ? null : 'quantum'); setDrawSrcId(null); }}
              >
                Quantum Link
              </button>
              <button 
                className={`btn-${drawMode === 'classical' ? 'primary' : 'secondary'}`} 
                onClick={() => { setDrawMode(drawMode === 'classical' ? null : 'classical'); setDrawSrcId(null); }}
              >
                Classical Link
              </button>
            </div>
          </div>
        </aside>

        {/* Center Canvas & Node Inspector Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
            {/* Topology Visualizer */}
            <div className="glass-panel canvas-panel">
              <div className="canvas-header">
                <h2 className="canvas-title">Interactive Topology Map</h2>
                <div style={{ display: 'flex', gap: '8px', fontSize: '11px', alignItems: 'center' }}>
                  <button className={`btn-${viewMode === 'abstract' ? 'primary' : 'secondary'}`} onClick={() => setViewMode('abstract')} style={{ padding: '2px 8px', fontSize: '11px' }}>Abstract</button>
                  <button className={`btn-${viewMode === 'map' ? 'primary' : 'secondary'}`} onClick={() => setViewMode('map')} style={{ padding: '2px 8px', fontSize: '11px' }}>Map</button>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-quantum)', marginLeft: '8px' }}></span> Quantum
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-classical)' }}></span> Classical
                </div>
              </div>

              {viewMode === 'abstract' ? (
                <div 
                  className="canvas-viewport" 
                  ref={canvasRef}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <svg className="svg-canvas">
                    {/* Channels (Links) */}
                    {channels.map(ch => {
                      const srcNode = nodes.find(n => n.id === ch.src);
                      const dstNode = nodes.find(n => n.id === ch.dst);
                      if (!srcNode || !dstNode) return null;

                      const isQuantum = ch.type === 'quantum';
                      const classLine = isQuantum ? 'quantum-channel-line' : 'classical-channel-line';
                      const activeClass = simRunning ? 'channel-line-active' : '';

                      return (
                        <g key={ch.id}>
                          <line
                            x1={srcNode.x}
                            y1={srcNode.y}
                            x2={dstNode.x}
                            y2={dstNode.y}
                            className={`${classLine} ${activeClass}`}
                          />
                          {/* Interactive properties tooltips on link hover */}
                          <title>{`${ch.name}: ${isQuantum ? `Distance=${ch.distance}m, Loss=${ch.attenuation}dB/m` : `Delay=${ch.delay}s`}`}</title>
                        </g>
                      );
                    })}

                    {/* Photon Animations */}
                    {animatingPhotons.map(p => (
                      <circle
                        key={p.id}
                        cx={p.sx}
                        cy={p.sy}
                        r="6"
                        fill={p.id.includes('1') ? '#38bdf8' : '#c084fc'}
                        style={{
                          animation: 'photon-travel 1s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
                          '--dx': `${p.dx}px`,
                          '--dy': `${p.dy}px`
                        }}
                      />
                    ))}

                    {/* Nodes */}
                    {nodes.map(node => {
                      const isSelected = selectedNodeId === node.id || drawSrcId === node.id;
                      const meta = NODE_TYPES[node.type] || NODE_TYPES.endpoint;

                      return (
                        <g 
                          key={node.id} 
                          className={`node-group ${isSelected ? 'selected' : ''}`}
                          transform={`translate(${node.x - 60}, ${node.y - 40})`}
                          onMouseDown={(e) => handleNodeClick(node.id)}
                        >
                          {/* Node Card Container */}
                          <rect
                            width="120"
                            height="80"
                            rx="10"
                            className="node-rect"
                            style={{
                              stroke: isSelected ? meta.color : 'var(--border-color)',
                              filter: isSelected ? `drop-shadow(0 0 10px ${meta.color})` : 'none'
                            }}
                          />
                          
                          {/* Header Bar Accent Fill */}
                          <rect
                            width="120"
                            height="28"
                            rx="10"
                            fill={meta.color}
                            opacity="0.18"
                          />
                          <line x1="0" y1="28" x2="120" y2="28" stroke={meta.color} opacity="0.3" strokeWidth="1" />

                          {/* Node Type Symbol Icon Swatch */}
                          <g transform="translate(10, 6)">
                            <rect width="16" height="16" rx="4" fill={meta.color} />
                            <g transform="translate(1, 1)" color="#ffffff">
                              <circle cx="7" cy="7" r="4" fill="#ffffff" fillOpacity="0.2" />
                            </g>
                          </g>

                          {/* Title & Type Badge */}
                          <text x="34" y="18" fill="#ffffff" fontSize="11" fontWeight="bold" textAnchor="start">
                            {node.id.toUpperCase()}
                          </text>
                          <text x="60" y="48" fill={meta.color} fontSize="11" fontWeight="bold" textAnchor="middle">
                            {meta.shortName}
                          </text>
                          <text x="60" y="65" fill="var(--text-muted)" fontSize="9" textAnchor="middle">
                            {node.name.length > 20 ? node.name.substring(0, 18) + '...' : node.name}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              ) : (
                <div className="canvas-viewport" style={{ padding: 0, position: 'relative' }}>
                  <MapContainer center={[23.0, 76.5]} zoom={7} style={{ height: '100%', width: '100%', minHeight: '380px', borderRadius: '0 0 12px 12px' }}>
                    <MapResizeHandler />
                    <TileLayer
                      url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    />
                    
                    {/* Render Channels as Polylines */}
                    {channels.map(ch => {
                      const srcNode = nodes.find(n => n.id === ch.src);
                      const dstNode = nodes.find(n => n.id === ch.dst);
                      if (!srcNode || !dstNode || !srcNode.lat || !dstNode.lat) return null;

                      const isQuantum = ch.type === 'quantum';
                      return (
                        <Polyline 
                          key={ch.id}
                          positions={[
                            [srcNode.lat, srcNode.lng],
                            [dstNode.lat, dstNode.lng]
                          ]}
                          color={isQuantum ? '#06b6d4' : '#f59e0b'}
                          weight={isQuantum ? 3 : 2}
                          dashArray={isQuantum ? null : "5, 5"}
                          opacity={0.85}
                        >
                          <Popup>
                            <strong>{ch.name}</strong><br/>
                            {isQuantum ? `Quantum Channel: Distance ${Math.round(ch.distance)}m` : `Classical Channel: Delay ${ch.delay.toExponential(2)}s`}
                          </Popup>
                        </Polyline>
                      );
                    })}

                    {/* Render Dynamic Colored Node Markers with Icons */}
                    {nodes.filter(n => n.lat && n.lng).map(node => (
                      <Marker 
                        key={node.id}
                        position={[node.lat, node.lng]}
                        icon={createCustomNodeIcon(node, selectedNodeId === node.id)}
                        draggable={true}
                        eventHandlers={{
                          dragend: (e) => handleMarkerDragEnd(node.id, e),
                          click: () => handleNodeClick(node.id)
                        }}
                      >
                        <Popup>
                          <div style={{ textAlign: 'center' }}>
                            <strong style={{ fontSize: '13px', color: NODE_TYPES[node.type]?.color }}>{node.name}</strong><br/>
                            <span style={{ fontSize: '10px', padding: '2px 6px', background: `${NODE_TYPES[node.type]?.color}22`, color: NODE_TYPES[node.type]?.color, borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                              {NODE_TYPES[node.type]?.label}
                            </span>
                            <p style={{ fontSize: '11px', color: '#64748b', margin: '6px 0 0 0' }}>
                              {NODE_TYPES[node.type]?.description}
                            </p>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>

                  {/* Floating Map Legend Overlay */}
                  <div className="map-legend-panel">
                    <div className="legend-title-row" onClick={() => setLegendOpen(!legendOpen)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Layers size={14} className="title-cyan" />
                        <strong style={{ fontSize: '12px' }}>Map Node & Symbol Legend</strong>
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
                        <div className="legend-divider"></div>
                        <div className="legend-row">
                          <div className="legend-line-swatch quantum"></div>
                          <div className="legend-info">
                            <span className="legend-name" style={{ color: 'var(--color-quantum)' }}>Quantum Fiber Link</span>
                            <span className="legend-desc">Photonic quantum state channel (SPDC outputs & qubits)</span>
                          </div>
                        </div>
                        <div className="legend-row">
                          <div className="legend-line-swatch classical"></div>
                          <div className="legend-info">
                            <span className="legend-name" style={{ color: 'var(--color-classical)' }}>Classical Control Link</span>
                            <span className="legend-desc">Classical sifting protocol & basis match communication</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Node Component Inspector */}
              <div className="glass-panel inspector-panel">
                <div className="inspector-header">
                  <h2 className="inspector-title">
                    <Cpu size={18} className="title-purple" />
                    Node Inspector
                  </h2>
                  {selectedNode && (
                    <span className="component-type" style={{ background: `${NODE_TYPES[selectedNode.type]?.color}22`, color: NODE_TYPES[selectedNode.type]?.color, fontWeight: 'bold' }}>
                      {NODE_TYPES[selectedNode.type]?.shortName}
                    </span>
                  )}
                </div>

                {selectedNode ? (
                  <div className="inspector-body">
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: NODE_TYPES[selectedNode.type]?.color }}></span>
                        {selectedNode.name}
                      </h3>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Manage internal optical modules. Edit values to update simulation bounds.
                      </p>
                    </div>

                    {/* Node Role & Symbol Selector */}
                    <div className="form-group" style={{ marginBottom: '12px', background: 'rgba(255, 255, 255, 0.02)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                        <Settings size={12} className="title-cyan" /> Assign Node Type & Map Symbol
                      </label>
                      <select 
                        className="form-input"
                        value={selectedNode.type}
                        onChange={(e) => handleNodeTypeChange(selectedNode.id, e.target.value)}
                        style={{ borderColor: NODE_TYPES[selectedNode.type]?.color || 'var(--border-color)', fontWeight: 'bold', color: NODE_TYPES[selectedNode.type]?.color }}
                      >
                        {Object.values(NODE_TYPES).map(meta => (
                          <option key={meta.type} value={meta.type} style={{ background: 'var(--bg-secondary)', color: '#fff' }}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                      <p style={{ fontSize: '10px', color: NODE_TYPES[selectedNode.type]?.color || 'var(--text-muted)', margin: '6px 0 0 0', fontStyle: 'italic', lineHeight: '1.3' }}>
                        {NODE_TYPES[selectedNode.type]?.description}
                      </p>
                    </div>

                    {/* Node Internal Graphic representation */}
                    <div className="node-internal-svg-container">
                      <svg width="100%" height="100%" viewBox="0 0 300 180">
                        {selectedNode.type === 'source' ? (
                          <>
                            {/* SPDC Laser crystal emitter diagram */}
                            <rect x="20" y="80" width="45" height="20" fill="#1e293b" stroke="#64748b" rx="3" />
                            <text x="42" y="93" fill="#f59e0b" fontSize="8" textAnchor="middle" fontWeight="bold">LASER</text>
                            
                            {/* Laser pump beam */}
                            <line x1="65" y1="90" x2="140" y2="90" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="3 2" />
                            
                            {/* SPDC non-linear crystal */}
                            <polygon points="140,70 170,80 170,100 140,110" fill="#f59e0b" opacity="0.4" stroke="#fbbf24" strokeWidth="1.5" />
                            <text x="155" y="93" fill="#fff" fontSize="9" textAnchor="middle" fontWeight="bold">BBO</text>

                            {/* Split entangled outputs */}
                            <line x1="170" y1="85" x2="280" y2="50" className="internal-beam" stroke="#06b6d4" />
                            <line x1="170" y1="95" x2="280" y2="130" className="internal-beam" stroke="#8b5cf6" />
                            
                            <text x="250" y="40" fill="#06b6d4" fontSize="8" fontWeight="bold">Photons A</text>
                            <text x="250" y="145" fill="#8b5cf6" fontSize="8" fontWeight="bold">Photons B</text>
                          </>
                        ) : selectedNode.type === 'transceiver' ? (
                          <>
                            {/* Transceiver Relay Diagram */}
                            <line x1="15" y1="90" x2="80" y2="90" stroke="#06b6d4" strokeWidth="2" />
                            <text x="35" y="80" fill="#06b6d4" fontSize="8">Qubit In (L1)</text>

                            {/* Left Detector Array */}
                            <rect x="80" y="70" width="35" height="40" fill="#1e293b" stroke="#a855f7" rx="3" />
                            <text x="97" y="93" fill="#a855f7" fontSize="8" textAnchor="middle" fontWeight="bold">DET 1</text>

                            {/* Quantum Memory / Relay Controller */}
                            <rect x="135" y="60" width="50" height="60" fill="#1e293b" stroke="#a855f7" strokeWidth="2" rx="4" />
                            <text x="160" y="88" fill="#fff" fontSize="8" textAnchor="middle" fontWeight="bold">MEMORY</text>
                            <text x="160" y="102" fill="#a855f7" fontSize="7" textAnchor="middle">RELAY</text>

                            {/* Right Detector Array */}
                            <rect x="205" y="70" width="35" height="40" fill="#1e293b" stroke="#a855f7" rx="3" />
                            <text x="222" y="93" fill="#a855f7" fontSize="8" textAnchor="middle" fontWeight="bold">DET 2</text>

                            <line x1="240" y1="90" x2="285" y2="90" stroke="#3b82f6" strokeWidth="2" />
                            <text x="260" y="80" fill="#3b82f6" fontSize="8">Qubit Out (L2)</text>
                          </>
                        ) : selectedNode.type === 'bsm' ? (
                          <>
                            {/* Bell State Measurement Diagram */}
                            <line x1="20" y1="50" x2="130" y2="90" stroke="#06b6d4" strokeWidth="2" />
                            <line x1="20" y1="130" x2="130" y2="90" stroke="#8b5cf6" strokeWidth="2" />
                            <text x="40" y="42" fill="#06b6d4" fontSize="8">Arm 1</text>
                            <text x="40" y="142" fill="#8b5cf6" fontSize="8">Arm 2</text>

                            {/* 50:50 Beam Splitter */}
                            <polygon points="120,75 150,90 120,105" fill="#ec4899" opacity="0.6" stroke="#f43f5e" />
                            <text x="133" y="93" fill="#fff" fontSize="7" textAnchor="middle" fontWeight="bold">BS</text>

                            {/* 4 SPAD Detectors */}
                            <rect x="210" y="25" width="40" height="20" fill="#1e293b" stroke="#ec4899" rx="2" />
                            <text x="230" y="38" fill="#ec4899" fontSize="8" textAnchor="middle">SPAD 1</text>
                            <rect x="210" y="60" width="40" height="20" fill="#1e293b" stroke="#ec4899" rx="2" />
                            <text x="230" y="73" fill="#ec4899" fontSize="8" textAnchor="middle">SPAD 2</text>
                            <rect x="210" y="95" width="40" height="20" fill="#1e293b" stroke="#ec4899" rx="2" />
                            <text x="230" y="108" fill="#ec4899" fontSize="8" textAnchor="middle">SPAD 3</text>
                            <rect x="210" y="130" width="40" height="20" fill="#1e293b" stroke="#ec4899" rx="2" />
                            <text x="230" y="143" fill="#ec4899" fontSize="8" textAnchor="middle">SPAD 4</text>
                          </>
                        ) : (
                          <>
                            {/* Endpoint Receiver detector array diagram */}
                            <line x1="20" y1="90" x2="110" y2="90" stroke="var(--color-quantum)" strokeWidth="2" />
                            <text x="40" y="80" fill="var(--color-quantum)" fontSize="8">Qubit In</text>

                            {/* Optical Filter tap */}
                            <circle cx="70" cy="90" r="10" fill="#334155" stroke="#94a3b8" />
                            <text x="70" y="93" fill="#fff" fontSize="8" textAnchor="middle">TAP</text>

                            {/* Polarizer / Beam splitter */}
                            <polygon points="110,75 140,90 110,105" fill="#06b6d4" opacity="0.6" stroke="#38bdf8" />
                            <text x="122" y="93" fill="#000" fontSize="7" textAnchor="middle" fontWeight="bold">PBS</text>

                            {/* Horizontal and Vertical components */}
                            <line x1="125" y1="90" x2="220" y2="40" className="internal-beam internal-beam-h" />
                            <line x1="125" y1="90" x2="220" y2="140" className="internal-beam internal-beam-v" />

                            {/* Detectors */}
                            <rect x="220" y="25" width="35" height="25" fill="#1e293b" stroke="#22c55e" rx="3" />
                            <text x="237" y="40" fill="#22c55e" fontSize="8" textAnchor="middle">DET H</text>

                            <rect x="220" y="125" width="35" height="25" fill="#1e293b" stroke="#3b82f6" rx="3" />
                            <text x="237" y="140" fill="#3b82f6" fontSize="8" textAnchor="middle">DET V</text>
                          </>
                        )}
                      </svg>
                    </div>

                    {/* Components Lists */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '180px', overflowY: 'auto' }}>
                      {selectedNode.components.map(comp => (
                        <div key={comp.id} className="component-card">
                          <div className="component-card-header">
                            <span className="component-name">{comp.name}</span>
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '2px', borderRadius: '4px', border: 'none' }}
                              onClick={() => handleDeleteComponent(comp.id)}
                              title="Delete module"
                            >
                              <Trash2 size={12} style={{ color: 'var(--color-error)' }} />
                            </button>
                          </div>
                          <span className="component-type" style={{ alignSelf: 'flex-start' }}>{comp.type}</span>
                          
                          {/* Param Editor in component card */}
                          <div className="component-params">
                            {comp.efficiency !== undefined && (
                              <div className="component-param-row">
                                <span>Efficiency:</span>
                                <input 
                                  type="number" 
                                  className="component-param-value" 
                                  style={{ width: '60px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }} 
                                  value={comp.efficiency} 
                                  step="0.01"
                                  min="0"
                                  max="1"
                                  onChange={(e) => handleUpdateComponentParam(comp.id, 'efficiency', e.target.value)}
                                />
                              </div>
                            )}
                            {comp.dark_count !== undefined && (
                              <div className="component-param-row">
                                <span>Dark Count Rate:</span>
                                <input 
                                  type="number" 
                                  className="component-param-value" 
                                  style={{ width: '70px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }} 
                                  value={comp.dark_count} 
                                  step="1e-7"
                                  onChange={(e) => handleUpdateComponentParam(comp.id, 'dark_count', e.target.value)}
                                />
                              </div>
                            )}
                            {comp.mean_photon_num !== undefined && (
                              <div className="component-param-row">
                                <span>Mean Photon Pair:</span>
                                <input 
                                  type="number" 
                                  className="component-param-value" 
                                  style={{ width: '50px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }} 
                                  value={comp.mean_photon_num} 
                                  step="0.5"
                                  onChange={(e) => handleUpdateComponentParam(comp.id, 'mean_photon_num', e.target.value)}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add Component selector */}
                    <div className="add-comp-select-container">
                      <select 
                        className="form-input" 
                        style={{ padding: '6px' }}
                        value={newCompType} 
                        onChange={(e) => setNewCompType(e.target.value)}
                      >
                        <option value="QSDetectorPolarization">QS Detector (Polarization)</option>
                        <option value="SPDCSource">SPDC Source</option>
                        <option value="MemoryArray">Memory Array</option>
                      </select>
                      <button className="btn-primary" style={{ padding: '6px 12px', width: 'auto' }} onClick={handleAddComponent}>
                        Add
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '20px 0' }}>
                    Select a node on the canvas to configure components.
                  </div>
                )}
              </div>

              {/* Channel Inspector */}
              <div className="glass-panel inspector-panel">
                <div className="inspector-header">
                  <h2 className="inspector-title">
                    <Sliders size={18} className="title-cyan" />
                    Channel Settings
                  </h2>
                </div>
                <div className="inspector-body" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {channels.map(ch => (
                      <div key={ch.id} className="component-card">
                        <div className="component-card-header">
                          <span className="component-name">{ch.name}</span>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '2px', borderRadius: '4px', border: 'none' }}
                            onClick={() => handleDeleteChannel(ch.id)}
                            title="Delete channel"
                          >
                            <Trash2 size={12} style={{ color: 'var(--color-error)' }} />
                          </button>
                        </div>
                        <span className="component-type" style={{ alignSelf: 'flex-start', background: ch.type === 'quantum' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(245, 158, 11, 0.15)', color: ch.type === 'quantum' ? 'var(--color-quantum)' : 'var(--color-classical)' }}>{ch.type.toUpperCase()}</span>
                        
                        <div className="component-params">
                          {ch.distance !== undefined && (
                            <div className="component-param-row">
                              <span>Distance (m):</span>
                              <input 
                                type="number" 
                                className="component-param-value" 
                                style={{ width: '60px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }} 
                                value={ch.distance} 
                                step="100"
                                onChange={(e) => handleUpdateChannelParam(ch.id, 'distance', e.target.value)}
                              />
                            </div>
                          )}
                          {ch.attenuation !== undefined && (
                            <div className="component-param-row">
                              <span>Attenuation (dB/m):</span>
                              <input 
                                type="number" 
                                className="component-param-value" 
                                style={{ width: '70px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }} 
                                value={ch.attenuation} 
                                step="0.0001"
                                onChange={(e) => handleUpdateChannelParam(ch.id, 'attenuation', e.target.value)}
                              />
                            </div>
                          )}
                          {ch.fidelity !== undefined && (
                            <div className="component-param-row">
                              <span>Fidelity:</span>
                              <input 
                                type="number" 
                                className="component-param-value" 
                                style={{ width: '60px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }} 
                                value={ch.fidelity} 
                                step="0.01"
                                min="0"
                                max="1"
                                onChange={(e) => handleUpdateChannelParam(ch.id, 'fidelity', e.target.value)}
                              />
                            </div>
                          )}
                          {ch.delay !== undefined && (
                            <div className="component-param-row">
                              <span>Delay (s):</span>
                              <input 
                                type="number" 
                                className="component-param-value" 
                                style={{ width: '70px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: '#fff', textAlign: 'right' }} 
                                value={ch.delay} 
                                step="1e-7"
                                onChange={(e) => handleUpdateChannelParam(ch.id, 'delay', e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sifting Table, Keys, Statistics and Terminal Dashboard */}
          <div className="glass-panel">
            <h2 className="inspector-title" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <Activity size={18} className="title-cyan" />
              Sifting Operations & Metrics
            </h2>
            
            {/* Live Statistics dashboard */}
            <div className="dashboard-grid">
              <div className="stat-card glass-panel">
                <span className="stat-label">Total Simulated Trials</span>
                <span className="stat-value">{simStep} / {numTrials}</span>
              </div>
              <div className="stat-card glass-panel">
                <span className="stat-label">Sifted Key Length</span>
                <span className="stat-value quantum">{siftedAliceKey.length} bits</span>
              </div>
              <div className="stat-card glass-panel">
                <span className="stat-label">Estimated QBER</span>
                <span className={`stat-value ${qber > 11 ? 'error' : 'success'}`}>{qber.toFixed(2)}%</span>
              </div>
              <div className="stat-card glass-panel">
                <span className="stat-label">Security Threshold</span>
                <span className="stat-value" style={{ color: qber > 11 ? 'var(--color-error)' : 'var(--color-success)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {qber > 11 ? <ShieldAlert size={14} /> : <Check size={14} />}
                  {qber > 11 ? 'UNSAFE (Abort Key)' : 'SECURE (Proceed)'}
                </span>
              </div>
            </div>

            {/* Generated Keys Display */}
            <div className="key-comparison-container" style={{ marginTop: '16px' }}>
              <div className="key-line-wrapper">
                <span className="key-label">Alice's Key</span>
                <span className="key-string" style={{ color: 'var(--color-quantum)' }}>
                  {siftedAliceKey || '— (Sifting in progress)'}
                </span>
              </div>
              <div className="key-line-wrapper">
                <span className="key-label">Bob's Key</span>
                <span className="key-string" style={{ color: 'var(--color-accent)' }}>
                  {siftedBobKey || '— (Sifting in progress)'}
                </span>
              </div>
            </div>

            {/* Sifting Tables and Console Log Split */}
            <div className="sifting-container" style={{ marginTop: '16px' }}>
              
              {/* Sifting Table */}
              <div className="sifting-list">
                <table className="sifting-table">
                  <thead>
                    <tr>
                      <th>Trial</th>
                      <th>Alice Basis</th>
                      <th>Bob Basis</th>
                      <th>Alice Outcome</th>
                      <th>Bob Outcome</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trialsList.slice(-8).reverse().map(trial => {
                      const basisMatch = trial.alice_basis === trial.bob_basis;
                      const statusIcon = basisMatch 
                        ? (trial.alice_result === trial.bob_result ? '✅ Sifted' : '❌ Error')
                        : 'Mismatch';

                      return (
                        <tr key={trial.trial} className={basisMatch ? 'match-row' : 'mismatch-row'}>
                          <td>#{trial.trial}</td>
                          <td>
                            <span className={`basis-pill ${trial.alice_basis === 0 ? 'basis-z' : 'basis-x'}`}>
                              {trial.alice_basis === 0 ? 'Z (Rect)' : 'X (Diag)'}
                            </span>
                          </td>
                          <td>
                            <span className={`basis-pill ${trial.bob_basis === 0 ? 'basis-z' : 'basis-x'}`}>
                              {trial.bob_basis === 0 ? 'Z (Rect)' : 'X (Diag)'}
                            </span>
                          </td>
                          <td className="key-bit alice">{trial.alice_result !== null ? trial.alice_result : '∅'}</td>
                          <td className="key-bit bob">{trial.bob_result !== null ? trial.bob_result : '∅'}</td>
                          <td style={{ color: basisMatch ? (trial.alice_result === trial.bob_result ? 'var(--color-success)' : 'var(--color-error)') : 'var(--text-muted)' }}>
                            {statusIcon}
                          </td>
                        </tr>
                      );
                    })}
                    {trialsList.length === 0 && (
                      <tr>
                        <td colSpan="6" style={{ padding: '24px 0', color: 'var(--text-muted)' }}>
                          Run the simulation to inspect real-time sifting decisions.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Console log */}
              <div className="console-panel">
                <div className="console-header">
                  <span>Simulation Console Event log</span>
                  <Terminal size={12} />
                </div>
                <div className="console-body">
                  {logs.map((log, idx) => (
                    <div key={idx} className="console-line">
                      <span className="console-time">[{log.timestamp}]</span>
                      <span className={`console-${log.type}`}>{log.text}</span>
                    </div>
                  ))}
                  {logs.length === 0 && (
                    <div style={{ color: '#4b5563' }}>Console ready. Run quantum sifting...</div>
                  )}
                </div>
              </div>

            </div>

          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="toast-msg">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
