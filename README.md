# Octopus

Distributed fleet firmware flashing and provisioning suite for Samsung Android devices across remote Linux and Windows workstation nodes.

![Octopus Fleet Hub Dashboard](docs/screenshots/dashboard.png)

---

## Overview

Octopus coordinates large-scale firmware flashing across multiple workstation PCs running native agent daemons. Operators manage connected devices, flash multi-part Samsung firmware packages (`BL`, `AP`, `CP`, `CSC`, `USERDATA`), and track provisioning progress from a central web dashboard.

---

## Core Capabilities

### Central Web Hub & Fleet Dashboard
- **Real-Time Fleet State**: Tracks connected devices, active flashing jobs, and bridge nodes using WebSocket synchronization across all operator screens.
- **Multi-Model Orchestration**: Organizes firmware packages and compatible devices into model-locked accordions with independent workflow configs.
- **Workflow Step Controls**: Toggles for post-flash automation steps (Skip Setup Wizard, Setup Google Basic Auth, Wi-Fi provisioning).
- **Underline Progress Tracking**: Renders per-device progress lines with an indeterminate infinite animation while waiting for device boot cycles.
- **Natural Alphanumeric Sorting**: Groups and sorts model filter chips in ascending order for fast filtering across large benches.
- **Device Health Metrics**: Displays battery percentage, temperature badges, full-capital build types (`USER`, `ENG`, `USERDEBUG`), and single-click PING flash indicators.
- **Control Panel & Calibration**: 2D rack layout visualizer and pattern controls for rack-mounted device setups.

### Native Rust Agent Bridge
- **Low Footprint**: Standalone binary compiled in Rust with minimal memory usage.
- **Hardware Detection**: Scans Linux devnodes and Windows COM ports for Odin mode, ADB endpoints, and download interfaces.
- **Automated Verification**: Verifies MD5 checksums locally before starting flash routines.
- **Self-Updating**: Supports background silent updates using signed release manifests.

---

## Repository Structure

```
octopus/
├── web-hub/
│   ├── client/          # React, Vite, and TypeScript frontend
│   └── server/          # Node.js backend and WebSocket hub server
├── agent-bridge/        # Native Rust client daemon (Linux and Windows)
├── docs/                # Screenshots and technical references
├── release.sh           # Automated release script for version bump and tagging
└── package.json         # Workspace scripts
```

---

## Getting Started

### 1. Run the Web Hub with Docker
```bash
docker compose up -d
```
- **Web App UI**: `http://localhost:4000`
- **WebSocket Endpoints**: `ws://localhost:4000/ws/ui` (Web clients) and `ws://localhost:4000/ws/bridge` (Agent bridges)

### 2. Run Local Development
```bash
# Install workspace dependencies
npm install

# Start both client and server in development mode
npm run dev
```

### 3. Run Agent Bridge on a Workstation
```bash
cd agent-bridge
cargo run
```

To connect to a custom hub host and assign a specific workstation ID:
```bash
HUB_URL=ws://192.168.1.50:4000/ws/bridge PC_ID=WORKSTATION-01 cargo run
```

---

## Releases

To trigger a version bump, update package manifests, and dispatch release builds:
```bash
# Patch release (default)
./release.sh patch "Description of changes"

# Minor or major release
./release.sh minor "Description of changes"
```

GitHub Actions builds signed Linux packages (`.deb`, `.rpm`) and Windows installer (`.exe`) artifacts published on the [Releases](https://github.com/endrisusanto/octopus/releases) page.
