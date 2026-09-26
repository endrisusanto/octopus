import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../hooks/useFleetWebSocket';
import { CloseIcon, TerminalIcon } from './Icons';

interface LogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pcId?: string;
  deviceId?: string;
  logs: LogEntry[];
}

export const LogDrawer: React.FC<LogDrawerProps> = ({
  isOpen,
  onClose,
  pcId,
  deviceId,
  logs,
}) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const filteredLogs = logs.filter((l) => {
    if (pcId && l.pcId !== pcId) return false;
    if (deviceId && l.deviceId && l.deviceId !== deviceId) return false;
    return true;
  });

  useEffect(() => {
    if (isOpen) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TerminalIcon size={18} />
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                Live Stream: {deviceId ? `Device ${deviceId}` : `PC ${pcId || 'All'}`}
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Target Bridge: {pcId || 'Global Stream'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-icon" title="Close Drawer">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="drawer-content">
          <div className="terminal-box">
            {filteredLogs.length === 0 ? (
              <div style={{ color: '#6e7681' }}>// Waiting for log output from bridge...</div>
            ) : (
              filteredLogs.map((log, index) => (
                <div key={index} className={`terminal-line ${log.level}`}>
                  <span style={{ color: '#6e7681', marginRight: '0.5rem' }}>
                    [{new Date(log.timestamp).toLocaleTimeString()}]
                  </span>
                  <span style={{ color: '#d29922', marginRight: '0.5rem' }}>[{log.pcId}]</span>
                  <span>{log.message}</span>
                </div>
              ))
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};
