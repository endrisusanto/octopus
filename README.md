# Octopus 🐙

Distributed Fleet Web-Managed Provisioning Suite with Lightweight Native Rust Agent Bridge for Linux (Ubuntu) & Windows.

---

## Key Highlights

- **Centralized Web UI & Control Hub**: Manage, flash, bypass SUW, configure Wi-Fi, and run AT exploits across all remote PC nodes from a single modern browser interface.
- **Better UI & Ponytail Design Engineering**:
  - **Ifta Label Firmware Input System**: In-field floating slot labels (`BL`, `AP`, `CP`, `CSC`, `USERDATA`) maximizing 100% horizontal filename width.
  - **Clean Monochromatic Minimal Aesthetics**: Zero decorative emojis, uncluttered headers, and high-contrast status pills.
  - **Responsive Dual-Tier Progress Rings**: Vertical-stacked progress badges (`Odin` flash phase & `Workflow` overall) in running workflow view.
  - **Mobile-Optimized Modal File Picker**: Compact viewport layout with side-by-side workstation selector and icon-only rescan action.
  - Industrial density Table Matrix view & Card Grid view with zero layout shifts.
  - Dark Mode & Light Mode support with smooth spring transitions and `localStorage` persistence.
  - Physical micro-interactions: card hover lift, button scale feedback (`active: scale(0.97)`), slide-over live terminal drawer.
- **FlashKit Multi-Tier Sorting Rules**:
  1. **AP Firmware Model Matching**: Prioritizes matching target models to the top when AP firmware filename is entered.
  2. **Status Weight Ranking**: `Ready` (Weight 3) > `Flashing...` / `Pass` (Weight 2) > `Busy` / `Offline` / `Fail` (Weight 1).
  3. **Deterministic Fallback**: Alphanumeric sort by `PC ID` $\rightarrow$ `Port / DevNode` $\rightarrow$ `Device ID`.
- **Lightweight Rust Agent Bridge (`agent-bridge`)**:
  - Memory footprint < 15MB.
  - Native hardware detection (ADB + Odin / USB devnodes / Windows COM ports).
  - Preserves exact user-defined Workstation ID without forced case transformation.
  - Real-time WebSocket connection to Web Hub.

---

## Directory Structure

```
octopus/
├── web-hub/
│   ├── client/          # Modern React + Vite + TypeScript Frontend
│   └── server/          # Node.js + WebSocket Fleet Hub Server
├── agent-bridge/        # Native Rust Client Daemon (Linux & Windows)
└── package.json         # Unified task orchestration
```

---

## Running Locally

### 1. Start Central Web Hub & UI
```bash
npm run dev
```
- **Web App UI**: `http://localhost:3000`
- **Hub WebSocket Server**: `ws://localhost:4000`

### 2. Run Rust Agent Bridge on Worker PC (Ubuntu / Windows)
```bash
cd agent-bridge
cargo run
```
To connect to a remote hub or set custom PC ID:
```bash
HUB_URL=ws://192.168.1.50:4000/ws/bridge PC_ID=WIN11-WORKSTATION-01 cargo run
```
