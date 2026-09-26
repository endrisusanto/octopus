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
            // Clear previous devices from this bridge
            for (const [key, dev] of fleetDevices.entries()) {
              if (dev.pcId === bridgePcId) {
                fleetDevices.delete(key);
              }
            }
            // Add current devices
            const devices: DeviceInfo[] = msg.payload.devices || [];
            for (const d of devices) {
              fleetDevices.set(`${bridgePcId}:${d.id}`, { ...d, pcId: bridgePcId, lastSeen: Date.now() });
            }
            broadcastFleetState();
            break;
          }

          case 'DEVICE_PROGRESS': {
            const { deviceId, progress, status, currentTask } = msg.payload;
            const fullKey = `${bridgePcId}:${deviceId}`;
            const dev = fleetDevices.get(fullKey);
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
        }
      } catch (err) {
        console.error('[Bridge Msg Parse Error]', err);
      }
    });

    ws.on('close', () => {
      if (bridgePcId) {
        console.log(`[Bridge Disconnected] PC: ${bridgePcId}`);
        connectedBridges.delete(bridgePcId);
        // Mark devices as offline or remove
        for (const [key, dev] of fleetDevices.entries()) {
          if (dev.pcId === bridgePcId) {
            fleetDevices.delete(key);
          }
        }
        broadcastFleetState();
      }
    });

  } else {
    // UI Client Connection
    uiClients.add(ws);
    console.log(`[UI Client Connected] Active UI clients: ${uiClients.size}`);

    // Send initial snapshot
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
      },
      timestamp: Date.now(),
    }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        
        // UI Dispatching actions to specific Bridge
        if (msg.type === 'DISPATCH_ACTION') {
          const { targetPcId, deviceId, action, params } = msg.payload;
          const bridge = connectedBridges.get(targetPcId);
          if (bridge && bridge.ws && bridge.ws.readyState === WebSocket.OPEN) {
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
