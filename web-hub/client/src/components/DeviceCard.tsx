import React from 'react';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { SmartphoneIcon, TerminalIcon, BoltIcon, PlayIcon } from './Icons';

interface DeviceCardProps {
  device: DeviceItem;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onOpenLogs: (pcId: string, deviceId: string) => void;
  onAction: (pcId: string, deviceId: string, action: string) => void;
  isFirmwareMatch?: boolean;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  isSelected,
  onToggleSelect,
  onOpenLogs,
  onAction,
  isFirmwareMatch = false,
}) => {
  const getStatusClass = (status: string) => {
    switch (status) {
      case 'Ready':
        return 'status-ready';
      case 'Flashing...':
        return 'status-flashing';
      case 'Pass':
        return 'status-pass';
      case 'Fail':
        return 'status-fail';
      case 'Offline':
      default:
        return 'status-offline';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Ready':
        return <span className="status-badge ready">Ready</span>;
      case 'Flashing...':
        return <span className="status-badge flashing">Flashing</span>;
      case 'Pass':
        return <span className="status-badge pass">Pass</span>;
      case 'Fail':
        return <span className="status-badge fail">Failed</span>;
      case 'Offline':
      default:
        return <span className="status-badge offline">Offline</span>;
    }
  };

  return (
    <div
      className={`device-card ${getStatusClass(device.status)} ${isSelected ? 'selected' : ''}`}
      style={isFirmwareMatch ? { borderRight: '3px solid #58a6ff' } : {}}
    >
      <div className="device-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(device.id)}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <span className="pc-badge">{device.pcId}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {isFirmwareMatch && (
            <span
              className="status-badge"
              style={{ backgroundColor: '#112338', color: '#58a6ff', border: '1px solid #1f6feb', fontSize: '0.65rem' }}
            >
              FW Match
            </span>
          )}
          {getStatusBadge(device.status)}
        </div>
      </div>

      <div className="device-card-title">
        <SmartphoneIcon size={16} />
        <span>{device.model}</span>
      </div>

      <div className="device-card-meta">
        <div className="meta-item">
          <span className="meta-label">Serial Number</span>
          <span className="meta-value">{device.serial || device.id}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Port / Node</span>
          <span className="meta-value">{device.port}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Mode</span>
          <span className="meta-value" style={{ textTransform: 'uppercase' }}>{device.mode}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Battery</span>
          <span className="meta-value">{device.batteryLevel ? `${device.batteryLevel}%` : 'N/A'}</span>
        </div>
      </div>

      {device.currentTask && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '0.2rem 0' }}>
          <strong>Task:</strong> {device.currentTask}
        </div>
      )}

      {device.status === 'Flashing...' && typeof device.progress === 'number' && (
        <div className="progress-container">
          <div className="progress-header">
            <span>Flashing Progress</span>
            <span>{device.progress}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${device.progress}%` }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.4rem', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
        {device.mode === 'odin' && (
          <button
            onClick={() => onAction(device.pcId, device.id, 'flash')}
            className="btn btn-sm btn-primary"
            style={{ flex: 1 }}
            disabled={device.status === 'Flashing...'}
          >
            <PlayIcon size={14} /> Flash AP
          </button>
        )}
        {device.mode === 'adb' && (
          <button
            onClick={() => onAction(device.pcId, device.id, 'suw_bypass')}
            className="btn btn-sm"
            style={{ flex: 1 }}
          >
            <BoltIcon size={14} /> Bypass SUW
          </button>
        )}
        <button
          onClick={() => onOpenLogs(device.pcId, device.id)}
          className="btn btn-sm btn-icon"
          title="View Device Logs"
        >
          <TerminalIcon size={14} />
        </button>
      </div>
    </div>
  );
};
