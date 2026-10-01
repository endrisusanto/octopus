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
  batteryTemp?: number;
  torchOn?: boolean;
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
let globalRackCalibration: any = {
  layout: [
    [1, 1, 0, 1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1, 0, 1, 1]
  ],
  rows: 3,
  cols: 8,
  slots: []
};

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

  // ponytail: HTTP Stream & Cross-Node Binary Streaming Gateway with Range Support
  if (req.url?.startsWith('/api/binaries/stream')) {
    const hostHeader = req.headers.host || '127.0.0.1:4000';
    const urlObj = new URL(req.url, `http://${hostHeader}`);
    const targetPath = urlObj.searchParams.get('path') || '';
    const targetFilename = urlObj.searchParams.get('filename') || '';
    const sourcePcId = urlObj.searchParams.get('sourcePcId') || '';

    // 1. Check local hub filesystem
    let resolvedFilePath = '';
    if (targetPath && fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
      resolvedFilePath = targetPath;
    } else {
      const allBins = getAllBinaries();
      const match = allBins.find(b =>
        (targetPath && b.path === targetPath) ||
        (targetFilename && b.filename === targetFilename) ||
        (targetPath && b.filename === path.basename(targetPath))
      );
      if (match && fs.existsSync(match.path) && fs.statSync(match.path).isFile()) {
        resolvedFilePath = match.path;
      }
    }

    if (resolvedFilePath) {
      const stat = fs.statSync(resolvedFilePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const fileStream = fs.createReadStream(resolvedFilePath, { start, end });
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
          'Content-Disposition': `attachment; filename="${path.basename(resolvedFilePath)}"`,
        });
        fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': 'application/octet-stream',
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'Content-Disposition': `attachment; filename="${path.basename(resolvedFilePath)}"`,
        });
        fs.createReadStream(resolvedFilePath).pipe(res);
      }
      return;
    }

    // 2. If file is on remote bridge node, proxy stream from bridge's mini HTTP stream server (port 4005)
    let autoSourcePcId = sourcePcId;
    if (!autoSourcePcId) {
      const allBins = getAllBinaries();
      const match = allBins.find(b =>
        (targetPath && b.path === targetPath) ||
        (targetFilename && b.filename === targetFilename) ||
        (targetPath && b.filename === path.basename(targetPath))
      );
      if (match && match.pcId) {
        autoSourcePcId = match.pcId;
      }
    }

    if (autoSourcePcId) {
      const sourceBridge = connectedBridges.get(autoSourcePcId);
      if (sourceBridge && sourceBridge.ip) {
        const bridgeStreamUrl = `http://${sourceBridge.ip}:4005/stream?path=${encodeURIComponent(targetPath || targetFilename)}`;
        const proxyReq = http.request(bridgeStreamUrl, {
          method: req.method,
          headers: {
            ...req.headers,
            host: `${sourceBridge.ip}:4005`,
          }
        }, (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 200, {
            ...proxyRes.headers,
            'Access-Control-Allow-Origin': '*',
          });
          proxyRes.pipe(res);
        });
        proxyReq.on('error', (err) => {
          console.error(`[Stream Error] Proxying to ${bridgeStreamUrl} failed:`, err.message);
          res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: `Failed to stream from bridge ${autoSourcePcId}: ${err.message}` }));
        });
        req.pipe(proxyReq);
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Firmware binary file not found on hub or source node.' }));
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
                // If device was rebooting and is now detected back online in Ready state, clear Busy/Rebooting status!
                const isRebootFinished = (matchingActive.currentTask?.toLowerCase().includes('reboot') || matchingActive.status === 'Busy') && d.status === 'Ready';
                fleetDevices.set(fullKey, {
                  ...d,
                  id: primaryId,
                  pcId: bridgePcId,
                  model: matchingActive.model && matchingActive.model !== 'SAMSUNG USB' && matchingActive.model !== 'SAMSUNG ODIN' && matchingActive.model !== 'SAMSUNG (Download Mode)' ? matchingActive.model : d.model,
                  serial: matchingActive.serial || d.serial,
                  status: isRebootFinished ? 'Ready' : matchingActive.status,
                  progress: isRebootFinished ? 0 : matchingActive.progress,
                  currentTask: isRebootFinished ? undefined : matchingActive.currentTask,
                  lastSeen: Date.now(),
                });
              } else {
                fleetDevices.set(fullKey, {
                  ...d,
                  pcId: bridgePcId,
                  lastSeen: Date.now(),
                });
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
                // If globalFirmwareSlots has a different filename than msg.payload.filename, ignore stale progress
                if (msg.payload.filename && globalFirmwareSlots[k].filename && globalFirmwareSlots[k].filename !== msg.payload.filename) {
                  break;
                }
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

          case 'TORCH_STATUS_UPDATE': {
            const { deviceId, torchOn } = msg.payload;
            for (const [_, dev] of fleetDevices.entries()) {
              if (dev.pcId === bridgePcId && (dev.id === deviceId || dev.serial === deviceId || dev.port === deviceId)) {
                dev.torchOn = torchOn;
                dev.lastSeen = Date.now();
                broadcastToUI('TORCH_STATUS_UPDATE', {
                  pcId: bridgePcId,
                  deviceId: dev.id,
                  serial: dev.serial,
                  torchOn,
                });
                break;
              }
            }
            break;
          }

          case 'RACK_CALIBRATION_SYNC': {
            if (msg.payload?.calibration) {
              globalRackCalibration = msg.payload.calibration;
            } else if (msg.payload) {
              globalRackCalibration = msg.payload;
            }
            console.log(`[Calibration Sync] Received rack calibration from bridge PC: ${bridgePcId}`);
            broadcastToUI('RACK_CALIBRATION_SYNC', { calibration: globalRackCalibration });
            break;
          }

          case 'BINARY_COPY_PROGRESS': {
            broadcastToUI('BINARY_COPY_PROGRESS', msg.payload);
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

    // Send initial rack calibration snapshot
    if (globalRackCalibration) {
      ws.send(JSON.stringify({
        type: 'RACK_CALIBRATION_SYNC',
        payload: {
          calibration: globalRackCalibration,
        },
        timestamp: Date.now(),
      }));
    }

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
        } else if (msg.type === 'SAVE_RACK_CALIBRATION') {
          const calibData = msg.payload?.calibration || msg.payload;
          if (calibData) {
            globalRackCalibration = calibData;
            console.log(`[Calibration Save] Saved rack calibration from UI client`);
            broadcastToUI('RACK_CALIBRATION_SYNC', { calibration: globalRackCalibration });
            // Forward save command to all connected bridges
            for (const bridge of connectedBridges.values()) {
              if (bridge.ws && bridge.ws.readyState === WebSocket.OPEN) {
                bridge.ws.send(JSON.stringify({
                  type: 'EXECUTE_COMMAND',
                  payload: {
                    deviceId: 'all',
                    action: 'SAVE_RACK_CALIBRATION',
                    params: { calibration: globalRackCalibration },
                  },
                }));
              }
            }
          }
        } else if (msg.type === 'BLINK_DEVICE' || msg.type === 'BLINK_SLOT') {
          const { deviceId, serial } = msg.payload || {};
          const targetSerial = serial || deviceId;
          for (const bridge of connectedBridges.values()) {
            if (bridge.ws && bridge.ws.readyState === WebSocket.OPEN) {
              bridge.ws.send(JSON.stringify({
                type: 'EXECUTE_COMMAND',
                payload: {
                  deviceId: targetSerial,
                  action: 'BLINK_SLOT',
                },
              }));
            }
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
        } else if (msg.type === 'START_WORKFLOW') {
          const { deviceIds, config: wfConfig } = msg.payload || {};
          if (Array.isArray(deviceIds) && deviceIds.length > 0) {
            for (const devId of deviceIds) {
              // Find target bridge
              let targetPcId = '';
              for (const [_, dev] of fleetDevices) {
                if (dev.id === devId || dev.serial === devId || dev.port === devId) {
                  targetPcId = dev.pcId;
                  break;
                }
              }
              if (!targetPcId && connectedBridges.size > 0) {
                targetPcId = Array.from(connectedBridges.keys())[0];
              }
              const bridge = connectedBridges.get(targetPcId);
              if (bridge && bridge.ws && bridge.ws.readyState === WebSocket.OPEN) {
                const fullKey = `${targetPcId}:${devId}`;
                const dev = fleetDevices.get(fullKey);
                if (dev) {
                  dev.status = 'Flashing...';
                  dev.progress = 10;
                  dev.currentTask = 'Memulai Automasi...';
                  broadcastToUI('DEVICE_PROGRESS_UPDATE', dev);
                }

                const apFile = globalFirmwareSlots.ap.filename || globalWorkflowConfig.binaryFile || (wfConfig?.apFilename as string) || '';
                const apPath = globalFirmwareSlots.ap.path || globalFirmwareSlots.ap.filename || globalWorkflowConfig.binaryFile || (wfConfig?.apPath as string) || '';

                bridge.ws.send(JSON.stringify({
                  type: 'EXECUTE_COMMAND',
                  payload: {
                    deviceId: devId,
                    action: 'WORKFLOW_PIPELINE',
                    params: {
                      apFilename: apFile,
                      apPath: apPath,
                      apPcId: globalFirmwareSlots.ap.pcId || wfConfig?.apPcId || '',
                      blPath: globalFirmwareSlots.bl.path || globalFirmwareSlots.bl.filename || (wfConfig?.blPath as string) || '',
                      blPcId: globalFirmwareSlots.bl.pcId || wfConfig?.blPcId || '',
                      cpPath: globalFirmwareSlots.cp.path || globalFirmwareSlots.cp.filename || (wfConfig?.cpPath as string) || '',
                      cpPcId: globalFirmwareSlots.cp.pcId || wfConfig?.cpPcId || '',
                      cscPath: globalFirmwareSlots.csc.path || globalFirmwareSlots.csc.filename || (wfConfig?.cscPath as string) || '',
                      cscPcId: globalFirmwareSlots.csc.pcId || wfConfig?.cscPcId || '',
                      userdataPath: globalFirmwareSlots.userdata.path || globalFirmwareSlots.userdata.filename || (wfConfig?.userdataPath as string) || '',
                      userdataPcId: globalFirmwareSlots.userdata.pcId || wfConfig?.userdataPcId || '',
                      odinFlash: wfConfig?.odinFlash !== false,
                      skipSuw: wfConfig?.skipSuw !== false,
                      setupGba: wfConfig?.setupGba !== false,
                      wifiEnabled: wfConfig?.wifiEnabled !== false,
                      wifiSsid: wfConfig?.wifiSsid || 'RTT / IEEE 802.11',
                      wifiPassword: wfConfig?.wifiPassword || '1234qwer',
                      postTorch: wfConfig?.postTorch !== false,
                      postSound: Boolean(wfConfig?.postSound || wfConfig?.autoSoundOn || wfConfig?.autoTweetOn),
                      torchMode: wfConfig?.torchMode || 'flash',
                    },
                  },
                }));
              }
            }
          }
        } else if (msg.type === 'TOGGLE_TORCH' || msg.type === 'SET_TORCH') {
          const { deviceId, targetPcId, serial, deviceIds, state, mode } = msg.payload || {};
          const targetState = state || (msg.type === 'TOGGLE_TORCH' ? 'toggle' : 'off');
          const torchMode = mode === 'screen' ? 'screen' : (mode === 'tweet' ? 'tweet' : 'flash');
          const targetSerials: string[] = [];

          if (Array.isArray(deviceIds) && deviceIds.length > 0) {
            deviceIds.forEach((id: string) => {
              const dev = Array.from(fleetDevices.values()).find((d) => d.id === id || d.serial === id);
              if (dev && dev.serial) targetSerials.push(dev.serial);
              else targetSerials.push(id);
            });
          } else if (serial || deviceId) {
            targetSerials.push(serial || deviceId);
          }

          // Broadcast command to connected bridges
          for (const [_, bridge] of connectedBridges) {
            if (bridge.ws && bridge.ws.readyState === WebSocket.OPEN) {
              bridge.ws.send(JSON.stringify({
                type: 'EXECUTE_COMMAND',
                payload: {
                  deviceId: targetSerials.length === 1 ? targetSerials[0] : (targetSerials.length === 0 ? 'ALL' : targetSerials[0]),
                  action: targetState === 'on' ? 'TORCH_ON' : (targetState === 'off' ? 'TORCH_OFF' : 'TOGGLE_TORCH'),
                  params: {
                    state: targetState,
                    deviceIds: targetSerials,
                    mode: torchMode,
                  },
                },
              }));
            }
          }
        } else if (msg.type === 'PLAY_SOUND' || msg.type === 'PLAY_TWEET') {
          const { deviceId, targetPcId, serial, deviceIds, pattern } = msg.payload || {};
          const soundPattern = pattern || 'single';
          const targetSerials: string[] = [];

          if (Array.isArray(deviceIds) && deviceIds.length > 0) {
            deviceIds.forEach((id: string) => {
              const dev = Array.from(fleetDevices.values()).find((d) => d.id === id || d.serial === id);
              if (dev && dev.serial) targetSerials.push(dev.serial);
              else targetSerials.push(id);
            });
          } else if (serial || deviceId) {
            targetSerials.push(serial || deviceId);
          }

          for (const [_, bridge] of connectedBridges) {
            if (bridge.ws && bridge.ws.readyState === WebSocket.OPEN) {
              bridge.ws.send(JSON.stringify({
                type: 'EXECUTE_COMMAND',
                payload: {
                  deviceId: targetSerials.length === 1 ? targetSerials[0] : (targetSerials.length === 0 ? 'ALL' : targetSerials[0]),
                  action: 'PLAY_SOUND',
                  params: {
                    pattern: soundPattern,
                    deviceIds: targetSerials,
                  },
                },
              }));
            }
          }
        } else if (msg.type === 'REQUEST_COPY_BINARY') {
          const { sourcePcId, targetPcId, filename, path } = msg.payload || {};
          if (targetPcId && filename) {
            const targetBridge = connectedBridges.get(targetPcId);
            if (targetBridge && targetBridge.ws && targetBridge.ws.readyState === WebSocket.OPEN) {
              targetBridge.ws.send(JSON.stringify({
                type: 'DOWNLOAD_BINARY_COMMAND',
                payload: {
                  sourcePcId,
                  targetPcId,
                  filename,
                  path,
                }
              }));
              console.log(`[Binary Copy] Forwarded copy request for ${filename} from ${sourcePcId} to ${targetPcId}`);
            }
          }
        } else if (msg.type === 'CONTROL_BINARY_TRANSFER') {
          const { action, targetPcId, filename, sourcePcId } = msg.payload || {};
          if (targetPcId && filename && action) {
            const targetBridge = connectedBridges.get(targetPcId);
            if (targetBridge && targetBridge.ws && targetBridge.ws.readyState === WebSocket.OPEN) {
              targetBridge.ws.send(JSON.stringify({
                type: 'CONTROL_BINARY_TRANSFER_COMMAND',
                payload: {
                  action,
                  targetPcId,
                  filename,
                  sourcePcId,
                }
              }));
              console.log(`[Binary Control] Forwarded ${action} command for ${filename} to ${targetPcId}`);
            }
          }
        } else if (msg.type === 'DISPATCH_ACTION') {
          const { targetPcId, deviceId, action, params } = msg.payload;
          const bridge = connectedBridges.get(targetPcId);
          if (bridge && bridge.ws && bridge.ws.readyState === WebSocket.OPEN) {
            // Optimistic update state on server
            const fullKey = `${targetPcId}:${deviceId}`;
            const dev = fleetDevices.get(fullKey);
            if (dev) {
              if (action === 'WORKFLOW_PIPELINE' || action === 'flash' || action === 'FLASH_ODIN') {
                dev.status = 'Flashing...';
                dev.progress = 10;
                dev.currentTask = 'Memulai Automasi...';
                broadcastToUI('DEVICE_PROGRESS_UPDATE', dev);
              } else if (action === 'REBOOT' || action === 'reboot' || action === 'REBOOT_DOWNLOAD' || action === 'REBOOT_RECOVERY') {
                dev.status = 'Busy';
                dev.currentTask = 'Rebooting...';
                broadcastToUI('DEVICE_PROGRESS_UPDATE', dev);
              }
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
