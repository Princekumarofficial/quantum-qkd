# ChaQra - Quantum Network Simulator Frontend

Interactive React + Vite frontend UI for **ChaQra - Quantum Network Simulator**.

## Features
- Dynamic drag-and-drop network topology editor (Endpoints, SPDC Sources, Repeater Nodes, BSM Stations).
- Real-time photon propagation animations and step-by-step trial logging.
- GIS Map view (Leaflet) and Abstract Schematic topology view.
- Configurable hardware components (`MemoryArray`, `QSDetectorPolarization`, `SPDCSource`) and lossy fiber channels (attenuation, distance, fidelity, delay).
- Full compatibility with the FastAPI backend for single-hop BBM92 and multi-hop quantum repeater simulations.

## Development
```bash
npm install
npm run dev
```
