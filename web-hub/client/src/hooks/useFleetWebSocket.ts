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

export function useFleetWebSocket() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [bridges, setBridges] = useState<BridgeInfo[]>([]);
  const [binaries, setBinaries] = useState<BinaryItem[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
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
              setDevices(msg.payload.devices || []);
              if (msg.payload.binaries) {
                setBinaries(msg.payload.binaries);
              }
              break;
            }

            case 'BINARIES_SYNC': {
              setBinaries(msg.payload.binaries || []);
              break;
            }

            case 'DEVICE_PROGRESS_UPDATE': {
              const updatedDev: DeviceItem = msg.payload;
              setDevices((prev) =>
                prev.map((d) => (d.pcId === updatedDev.pcId && d.id === updatedDev.id ? updatedDev : d))
              );
              break;
            }

            case 'LOG_EVENT': {
              const log: LogEntry = msg.payload;
              setLogs((prev) => [...prev.slice(-300), log]); // Keep latest 300 logs
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

  return {
    devices,
    bridges,
    binaries,
    isConnected,
    logs,
    dispatchAction,
  };
}
