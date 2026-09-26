import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

export interface DeviceInfo {
  id: string;              // unique id (serial or path)
  pcId: string;            // bridge PC identifier (e.g. UBUNTU-LAB-01, WIN11-RIG-02)
  pcOs: 'ubuntu' | 'windows' | 'linux';
  port: string;            // USB devnode or COM port
  serial?: string;
  model: string;           // Device model name (e.g. SM-S908B, SM-A536B)
  mode: 'odin' | 'adb' | 'recovery' | 'offline';
  status: 'Ready' | 'Flashing...' | 'Pass' | 'Fail' | 'Busy' | 'Offline';
  progress?: number;       // 0 to 100
  currentTask?: string;    // e.g. "Flashing AP...", "SUW Bypass", "Idle"
  batteryLevel?: number;
  lastSeen: number;
}

export interface BinaryInfo {
  filename: string;
  path: string;
  sizeBytes: number;
  pcId: string;
}

export interface BridgeNode {
  pcId: string;
  os: 'ubuntu' | 'windows' | 'linux';
  ip: string;
  connectedAt: number;
  ws?: WebSocket;
}

export interface FirmwareSlotState {
  filename: string;
  path: string;
  sizeBytes: number;
  pcId?: string;
  status: 'idle' | 'verifying' | 'verified' | 'error';
  progress: number;
}

export interface FirmwareSlotsMap {
  bl: FirmwareSlotState;
  ap: FirmwareSlotState;
  cp: FirmwareSlotState;
  csc: FirmwareSlotState;
  userdata: FirmwareSlotState;
}

export interface WorkflowConfig {
  binaryFile: string;
  skipSuw: boolean;
  setupGba: boolean;
  wifiEnabled: boolean;
  wifiSsid?: string;
  wifiPassword?: string;
  odinFlash?: boolean;
}

// Global Single Session State across all devices/clients
let globalFirmwareSlots: FirmwareSlotsMap = {
  bl: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
  ap: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
  cp: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
  csc: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
  userdata: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
};

let globalWorkflowConfig: WorkflowConfig = {
  binaryFile: '',
  odinFlash: true,
  skipSuw: true,
  setupGba: true,
  wifiEnabled: true,
  wifiSsid: 'RTT / IEEE 802.11',
  wifiPassword: '1234qwer',
};

let globalSelectedDeviceIds: string[] = [];

// ponytail: Memory-efficient fleet & binary registry
const connectedBridges = new Map<string, BridgeNode>();
const fleetDevices = new Map<string, DeviceInfo>();
const bridgeBinaries = new Map<string, BinaryInfo[]>();
const uiClients = new Set<WebSocket>();

function getAllBinaries(): BinaryInfo[] {
  const list: BinaryInfo[] = [];
  for (const bins of bridgeBinaries.values()) {
    list.push(...bins);
  }
  return list;
}

// Locate static dist folder
const clientDistPath = fs.existsSync(path.resolve(process.cwd(), 'web-hub/client/dist'))
  ? path.resolve(process.cwd(), 'web-hub/client/dist')
  : path.resolve(process.cwd(), '../client/dist');

const server = http.createServer((req, res) => {
  // Simple REST endpoint for health / debug
  if (req.url === '/api/fleet') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      bridges: Array.from(connectedBridges.values()).map(b => ({ pcId: b.pcId, os: b.os, ip: b.ip })),
      devices: Array.from(fleetDevices.values()),
      binaries: getAllBinaries(),
    }));
    return;
  }

  if (req.url === '/api/binaries') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ binaries: getAllBinaries() }));
    return;
  }

  // Serve static files for Web UI
  if (fs.existsSync(clientDistPath)) {
    let reqPath = req.url?.split('?')[0] || '/';
    if (reqPath === '/') reqPath = '/index.html';
    let filePath = path.join(clientDistPath, reqPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(clientDistPath, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff2': 'font/woff2',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
      return;
    } catch {
      // Fallback
    }
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
  res.end('Octopus Fleet Hub Running. (Build client dist to enable UI)\n');
});

const wss = new WebSocketServer({ server });

function broadcastToUI(type: string, payload: any) {
  const message = JSON.stringify({ type, payload, timestamp: Date.now() });
  for (const client of uiClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function broadcastFleetState() {
  broadcastToUI('FLEET_SYNC', {
    bridges: Array.from(connectedBridges.values()).map(b => ({
      pcId: b.pcId,
      os: b.os,
      ip: b.ip,
      connectedAt: b.connectedAt,
    })),
    devices: Array.from(fleetDevices.values()),
  });
}

wss.on('connection', (ws, req) => {
  const path = req.url || '';
  const ip = req.socket.remoteAddress || '127.0.0.1';

  if (path.startsWith('/ws/bridge')) {
    let bridgePcId = '';

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case 'BRIDGE_REGISTER': {
            bridgePcId = msg.payload.pcId;
            connectedBridges.set(bridgePcId, {
              pcId: bridgePcId,
              os: msg.payload.os || 'linux',
              ip,
              connectedAt: Date.now(),
              ws,
            });
            console.log(`[Bridge Connected] PC: ${bridgePcId} (${msg.payload.os}) from ${ip}`);
            broadcastFleetState();
            break;
          }

          case 'BINARY_LIST_UPDATE': {
            if (!bridgePcId) break;
            const rawBins = msg.payload.binaries || [];
            const mapped: BinaryInfo[] = rawBins.map((b: any) => ({
              filename: b.filename,
              path: b.path,
              sizeBytes: b.sizeBytes || 0,
              pcId: bridgePcId,
            }));
            bridgeBinaries.set(bridgePcId, mapped);
            console.log(`[Binaries Scanned] PC: ${bridgePcId} reported ${mapped.length} firmware binaries`);
            broadcastToUI('BINARIES_SYNC', { binaries: getAllBinaries() });
            break;
          }

          case 'DEVICE_LIST_UPDATE': {
            if (!bridgePcId) break;
            const incomingDevices: DeviceInfo[] = msg.payload.devices || [];
            const newKeys = new Set<string>();

            // Find all actively executing devices for this bridge
            const activeRunning = new Map<string, DeviceInfo>();
            for (const [key, dev] of fleetDevices.entries()) {
              if (dev.pcId === bridgePcId && (dev.status === 'Flashing...' || dev.status === 'Busy')) {
                activeRunning.set(key, dev);
              }
            }

            for (const d of incomingDevices) {
              // Check if this device matches any active running task (by ID, serial, or USB port)
              let matchingActive: DeviceInfo | undefined = undefined;
              for (const [_, runningDev] of activeRunning.entries()) {
                if (
                  runningDev.id === d.id ||
                  (runningDev.serial && d.serial && runningDev.serial === d.serial) ||
                  (runningDev.port && d.port && runningDev.port === d.port)
                ) {
                  matchingActive = runningDev;
                  break;
                }
              }

              const primaryId = matchingActive ? matchingActive.id : d.id;
              const fullKey = `${bridgePcId}:${primaryId}`;
              newKeys.add(fullKey);

              if (matchingActive) {
                fleetDevices.set(fullKey, {
                  ...d,
                  id: primaryId,
                  pcId: bridgePcId,
                  model: matchingActive.model && matchingActive.model !== 'SAMSUNG USB' && matchingActive.model !== 'SAMSUNG ODIN' && matchingActive.model !== 'SAMSUNG (Download Mode)' ? matchingActive.model : d.model,
                  serial: matchingActive.serial || d.serial,
                  status: matchingActive.status,
                  progress: matchingActive.progress,
                  currentTask: matchingActive.currentTask,
                  lastSeen: Date.now(),
                });
              } else {
                fleetDevices.set(fullKey, { ...d, pcId: bridgePcId, lastSeen: Date.now() });
              }
            }

            // Remove devices physically disconnected, EXCEPT those actively running a workflow!
            for (const [key, dev] of fleetDevices.entries()) {
              if (dev.pcId === bridgePcId && !newKeys.has(key)) {
                // If it's running automation, keep it (it might be rebooting / switching USB mode)
                if (dev.status === 'Flashing...' || dev.status === 'Busy') {
                  if (Date.now() - dev.lastSeen > 300000) {
                    fleetDevices.delete(key);
                  }
                } else {
                  fleetDevices.delete(key);
                }
              }
            }

            broadcastFleetState();
            break;
          }

          case 'DEVICE_PROGRESS': {
            const { deviceId, progress, status, currentTask } = msg.payload;
            let dev = fleetDevices.get(`${bridgePcId}:${deviceId}`);
            if (!dev) {
              for (const [_, d] of fleetDevices.entries()) {
                if (d.pcId === bridgePcId && (d.id === deviceId || d.serial === deviceId || d.port === deviceId)) {
                  dev = d;
                  break;
                }
              }
            }
            if (dev) {
              dev.progress = progress;
              if (status) dev.status = status;
              if (currentTask) dev.currentTask = currentTask;
              dev.lastSeen = Date.now();
              broadcastToUI('DEVICE_PROGRESS_UPDATE', dev);
            }
            break;
          }

          case 'LOG_STREAM': {
            broadcastToUI('LOG_EVENT', {
              pcId: bridgePcId,
              deviceId: msg.payload.deviceId,
              level: msg.payload.level || 'info',
              message: msg.payload.message,
              timestamp: Date.now(),
            });
            break;
          }

          case 'MD5_PROGRESS': {
            if (msg.payload.slotKey) {
              const k = msg.payload.slotKey as keyof FirmwareSlotsMap;
              if (globalFirmwareSlots[k]) {
                globalFirmwareSlots[k] = {
                  ...globalFirmwareSlots[k],
                  status: msg.payload.status,
                  progress: msg.payload.progress,
                };
              }
            }
            broadcastToUI('MD5_PROGRESS_UPDATE', {
              pcId: bridgePcId,
              ...msg.payload,
            });
            break;
          }
        }
      } catch (err) {
        console.error('[Bridge Msg Parse Error]', err);
      }
    });

    ws.on('close', () => {
      if (bridgePcId) {
        console.log(`[Bridge Disconnected] PC: ${bridgePcId}`);
        connectedBridges.delete(bridgePcId);
        bridgeBinaries.delete(bridgePcId);
        // Remove devices belonging to disconnected bridge
        for (const [key, dev] of fleetDevices.entries()) {
          if (dev.pcId === bridgePcId) {
            fleetDevices.delete(key);
          }
        }
        broadcastFleetState();
        broadcastToUI('BINARIES_SYNC', { binaries: getAllBinaries() });
      }
    });

  } else {
    // UI Client Connection (1-Session synchronized across all devices)
    uiClients.add(ws);
    console.log(`[UI Client Connected] Active UI clients: ${uiClients.size}`);

    // Send initial fleet state snapshot
    ws.send(JSON.stringify({
      type: 'FLEET_SYNC',
      payload: {
        bridges: Array.from(connectedBridges.values()).map(b => ({
          pcId: b.pcId,
          os: b.os,
          ip: b.ip,
          connectedAt: b.connectedAt,
        })),
        devices: Array.from(fleetDevices.values()),
        binaries: getAllBinaries(),
      },
      timestamp: Date.now(),
    }));

    // Send initial 1-session state snapshot
    ws.send(JSON.stringify({
      type: 'SESSION_STATE_SYNC',
      payload: {
        firmwareSlots: globalFirmwareSlots,
        workflowConfig: globalWorkflowConfig,
        selectedDeviceIds: globalSelectedDeviceIds,
      },
      timestamp: Date.now(),
    }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        
        // 1-Session state synchronization from UI clients
        if (msg.type === 'SYNC_FIRMWARE_SLOTS') {
          if (msg.payload?.firmwareSlots) {
            globalFirmwareSlots = msg.payload.firmwareSlots;
            broadcastToUI('SESSION_STATE_SYNC', {
              firmwareSlots: globalFirmwareSlots,
              workflowConfig: globalWorkflowConfig,
              selectedDeviceIds: globalSelectedDeviceIds,
            });
          }
        } else if (msg.type === 'SYNC_WORKFLOW_CONFIG') {
          if (msg.payload?.workflowConfig) {
            globalWorkflowConfig = msg.payload.workflowConfig;
            broadcastToUI('SESSION_STATE_SYNC', {
              firmwareSlots: globalFirmwareSlots,
              workflowConfig: globalWorkflowConfig,
              selectedDeviceIds: globalSelectedDeviceIds,
            });
          }
        } else if (msg.type === 'SYNC_SELECTED_DEVICES') {
          if (msg.payload?.selectedDeviceIds) {
            globalSelectedDeviceIds = msg.payload.selectedDeviceIds;
            broadcastToUI('SESSION_STATE_SYNC', {
              firmwareSlots: globalFirmwareSlots,
              workflowConfig: globalWorkflowConfig,
              selectedDeviceIds: globalSelectedDeviceIds,
            });
          }
        } else if (msg.type === 'DISPATCH_ACTION') {
          const { targetPcId, deviceId, action, params } = msg.payload;
          const bridge = connectedBridges.get(targetPcId);
          if (bridge && bridge.ws && bridge.ws.readyState === WebSocket.OPEN) {
            // Optimistic update state on server
            const fullKey = `${targetPcId}:${deviceId}`;
            const dev = fleetDevices.get(fullKey);
            if (dev) {
              dev.status = 'Flashing...';
              dev.progress = 10;
              dev.currentTask = 'Memulai Automasi...';
              broadcastToUI('DEVICE_PROGRESS_UPDATE', dev);
            }

            bridge.ws.send(JSON.stringify({
              type: 'EXECUTE_COMMAND',
              payload: { deviceId, action, params },
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'DISPATCH_ERROR',
              payload: { message: `Bridge PC ${targetPcId} is not connected` },
            }));
          }
        }
      } catch (err) {
        console.error('[UI Msg Parse Error]', err);
      }
    });

    ws.on('close', () => {
      uiClients.delete(ws);
      console.log(`[UI Client Disconnected] Remaining UI clients: ${uiClients.size}`);
    });
  }
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(` Octopus Fleet Web Hub Server`);
  console.log(` HTTP & WS Port: ${PORT}`);
  console.log(` WebSocket Agent Endpoint: ws://localhost:${PORT}/ws/bridge`);
  console.log(` WebSocket UI Endpoint:    ws://localhost:${PORT}/ws/ui`);
  console.log(`=========================================`);
});
