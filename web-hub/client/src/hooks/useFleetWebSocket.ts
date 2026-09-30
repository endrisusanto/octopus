import { useState, useEffect, useRef, useCallback } from 'react';
import { DeviceItem } from './useFlashKitSort';

export interface BridgeInfo {
  pcId: string;
  os: 'ubuntu' | 'windows' | 'linux';
  ip: string;
  connectedAt: number;
}

export interface LogEntry {
  pcId: string;
  deviceId?: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

export interface BinaryItem {
  filename: string;
  path: string;
  sizeBytes: number;
  pcId: string;
}

export interface Md5ProgressEvent {
  pcId: string;
  slotKey: string;
  filename: string;
  progress: number;
  status: 'verifying' | 'verified' | 'error';
  calculatedMd5?: string;
  errorMessage?: string;
}

export interface SessionStatePayload {
  firmwareSlots?: any;
  workflowConfig?: any;
  selectedDeviceIds?: string[];
}

export interface RackSlotMapping {
  row: number;
  col: number;
  serial: string;
}

export interface RackCalibrationData {
  layout: number[][];
  rows: number;
  cols: number;
  slots: RackSlotMapping[];
}

export function useFleetWebSocket() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [bridges, setBridges] = useState<BridgeInfo[]>([]);
  const [binaries, setBinaries] = useState<BinaryItem[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [md5Progress, setMd5Progress] = useState<Md5ProgressEvent | null>(null);
  const [serverSessionState, setServerSessionState] = useState<SessionStatePayload | null>(null);
  const [rackCalibration, setRackCalibration] = useState<RackCalibrationData | null>(null);
  const [pendingTorchIds, setPendingTorchIds] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    // Determine ws endpoint
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.port === '3000' ? `${window.location.hostname}:4000` : window.location.host;
    const url = `${protocol}//${host}/ws/ui`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log('[Fleet WS] Connected to Hub Server');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'FLEET_SYNC': {
              setBridges(msg.payload.bridges || []);
              const incoming: DeviceItem[] = msg.payload.devices || [];
              setDevices((prev) => {
                const activeRunning = prev.filter((p) => p.status === 'Flashing...' || p.status === 'Busy');
                const mapped: DeviceItem[] = incoming.map((inc): DeviceItem => {
                  const curr = activeRunning.find(
                    (p) =>
                      p.pcId === inc.pcId &&
                      (p.id === inc.id ||
                        (p.port && inc.port && p.port === inc.port) ||
                        (p.serial && inc.serial && p.serial === inc.serial))
                  );

                  if (curr && inc.status === 'Ready') {
                    return {
                      ...inc,
                      id: curr.id,
                      model:
                        curr.model &&
                        curr.model !== 'SAMSUNG USB' &&
                        curr.model !== 'SAMSUNG ODIN' &&
                        curr.model !== 'SAMSUNG (Download Mode)'
                          ? curr.model
                          : inc.model,
                      serial: curr.serial || inc.serial,
                      status: curr.status,
                      progress: curr.progress ?? inc.progress,
                      currentTask: curr.currentTask ?? inc.currentTask,
                    };
                  }
                  return inc;
                });

                // Preserve running devices during mode switch rebooting
                for (const runDev of activeRunning) {
                  const exists = mapped.some(
                    (m) =>
                      m.pcId === runDev.pcId &&
                      (m.id === runDev.id || (m.port && runDev.port && m.port === runDev.port))
                  );
                  if (!exists) {
                    mapped.push(runDev);
                  }
                }

                return mapped;
              });
              if (msg.payload.binaries) {
                setBinaries(msg.payload.binaries);
              }
              break;
            }

            case 'BINARIES_SYNC': {
              setBinaries(msg.payload.binaries || []);
              break;
            }

            case 'TORCH_STATUS_UPDATE': {
              const { deviceId, serial, torchOn } = msg.payload || {};
              const targetKeys = [deviceId, serial].filter(Boolean);
              setPendingTorchIds((prev) =>
                prev.filter((id) => !targetKeys.includes(id))
              );
              setDevices((prev) =>
                prev.map((d) => {
                  if (d.id === deviceId || (serial && d.serial === serial) || (d.id === serial)) {
                    return { ...d, torchOn };
                  }
                  return d;
                })
              );
              break;
            }

            case 'DEVICE_PROGRESS_UPDATE': {
              const updatedDev: DeviceItem = msg.payload;
              setDevices((prev) =>
                prev.map((d) => {
                  if (
                    d.pcId === updatedDev.pcId &&
                    (d.id === updatedDev.id ||
                      (d.port && updatedDev.port && d.port === updatedDev.port) ||
                      (d.serial && updatedDev.serial && d.serial === updatedDev.serial))
                  ) {
                    return {
                      ...d,
                      ...updatedDev,
                      id: d.id,
                      model:
                        d.model &&
                        d.model !== 'SAMSUNG USB' &&
                        d.model !== 'SAMSUNG ODIN' &&
                        d.model !== 'SAMSUNG (Download Mode)'
                          ? d.model
                          : updatedDev.model,
                    };
                  }
                  return d;
                })
              );
              break;
            }

            case 'MD5_PROGRESS_UPDATE': {
              const event: Md5ProgressEvent = msg.payload;
              setMd5Progress(event);
              break;
            }

            case 'LOG_EVENT': {
              const log: LogEntry = msg.payload;
              setLogs((prev) => [...prev.slice(-300), log]); // Keep latest 300 logs
              break;
            }

            case 'SESSION_STATE_SYNC': {
              if (msg.payload) {
                setServerSessionState(msg.payload);
              }
              break;
            }

            case 'RACK_CALIBRATION_SYNC': {
              if (msg.payload?.calibration) {
                setRackCalibration(msg.payload.calibration);
              } else if (msg.payload) {
                setRackCalibration(msg.payload);
              }
              break;
            }
          }
        } catch (e) {
          console.error('[Fleet WS Msg Parse Error]', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Exponential backoff reconnect
        reconnectTimeoutRef.current = window.setTimeout(connect, 2000);
      };

      ws.onerror = (err) => {
        console.error('[Fleet WS Error]', err);
        ws.close();
      };
    } catch (e) {
      console.error('[Fleet WS Connect Failed]', e);
      reconnectTimeoutRef.current = window.setTimeout(connect, 2000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const syncFirmwareSlots = useCallback((slots: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'SYNC_FIRMWARE_SLOTS',
          payload: { firmwareSlots: slots },
        })
      );
    }
  }, []);

  const syncWorkflowConfig = useCallback((config: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'SYNC_WORKFLOW_CONFIG',
          payload: { workflowConfig: config },
        })
      );
    }
  }, []);

  const syncSelectedDevices = useCallback((selectedIds: string[]) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'SYNC_SELECTED_DEVICES',
          payload: { selectedDeviceIds: selectedIds },
        })
      );
    }
  }, []);

  const saveRackCalibration = useCallback((calibration: RackCalibrationData) => {
    setRackCalibration(calibration);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'SAVE_RACK_CALIBRATION',
          payload: { calibration },
        })
      );
    }
  }, []);

  const blinkDevice = useCallback((serial: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'BLINK_DEVICE',
          payload: { serial, deviceId: serial },
        })
      );
    }
  }, []);

  const dispatchAction = useCallback((targetPcId: string, deviceId: string, action: string, params: any = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'DISPATCH_ACTION',
          payload: { targetPcId, deviceId, action, params },
        })
      );
    }
  }, []);

  const toggleTorch = useCallback((deviceId: string, targetPcId?: string, serial?: string) => {
    const targetIds = [deviceId, ...(serial ? [serial] : [])];
    setPendingTorchIds((prev) => Array.from(new Set([...prev, ...targetIds])));

    // Determine target state from active devices for direct zero-latency execution
    const currentDev = devices.find((d) => d.id === deviceId || d.serial === deviceId || (serial && d.serial === serial));
    const nextState = currentDev?.torchOn ? 'off' : 'on';

    // Auto timeout fallback
    setTimeout(() => {
      setPendingTorchIds((prev) => prev.filter((id) => !targetIds.includes(id)));
    }, 3500);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'TOGGLE_TORCH',
          payload: { deviceId, targetPcId, serial, state: nextState },
        })
      );
    }
  }, [devices]);

  const setTorchBulk = useCallback((deviceIds: string[], state: 'on' | 'off') => {
    setPendingTorchIds((prev) => Array.from(new Set([...prev, ...deviceIds])));

    setTimeout(() => {
      setPendingTorchIds((prev) => prev.filter((id) => !deviceIds.includes(id)));
    }, 3500);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'SET_TORCH',
          payload: {
            deviceIds,
            state,
          },
        })
      );
    }
  }, []);

  return {
    devices,
    setDevices,
    bridges,
    binaries,
    isConnected,
    logs,
    md5Progress,
    serverSessionState,
    rackCalibration,
    saveRackCalibration,
    blinkDevice,
    syncFirmwareSlots,
    syncWorkflowConfig,
    syncSelectedDevices,
    dispatchAction,
    toggleTorch,
    setTorchBulk,
    pendingTorchIds,
  };
}
