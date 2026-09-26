import React from 'react';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { TerminalIcon, BoltIcon, PlayIcon } from './Icons';

interface DeviceTableViewProps {
  devices: DeviceItem[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onOpenLogs: (pcId: string, deviceId: string) => void;
  onAction: (pcId: string, deviceId: string, action: string) => void;
  apFilename?: string;
  isFirmwareForModel: (ap?: string, model?: string) => boolean;
}

export const DeviceTableView: React.FC<DeviceTableViewProps> = ({
  devices,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onOpenLogs,
  onAction,
  apFilename,
  isFirmwareForModel,
}) => {
  const allSelected = devices.length > 0 && selectedIds.length === devices.length;

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
    <div className="table-container">
      <table className="device-table">
        <thead>
          <tr>
            <th style={{ width: '40px', textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onSelectAll}
                style={{ cursor: 'pointer' }}
              />
            </th>
            <th>PC ID</th>
            <th>PORT / DEVNODE</th>
            <th>MODEL</th>
            <th>SERIAL</th>
            <th>MODE</th>
            <th>STATUS</th>
            <th style={{ minWidth: '180px' }}>PROGRESS / TASK</th>
            <th style={{ textAlign: 'right' }}>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => {
            const isSelected = selectedIds.includes(device.id);
            const isMatch = isFirmwareForModel(apFilename, device.model);

            return (
              <tr key={`${device.pcId}-${device.id}`} className={isSelected ? 'selected' : ''}>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(device.id)}
                    style={{ cursor: 'pointer' }}
                  />
                </td>
                <td>
                  <span className="pc-badge">{device.pcId}</span>
                </td>
                <td>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {device.port}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontWeight: 600 }}>{device.model}</span>
                    {isMatch && (
                      <span
                        className="status-badge"
                        style={{ backgroundColor: 'var(--status-pass-bg)', color: 'var(--status-pass-text)', fontSize: '0.65rem' }}
                      >
                        FW Match
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {device.serial || device.id}
                  </span>
                </td>
                <td>
                  <span style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {device.mode}
                  </span>
                </td>
                <td>{getStatusBadge(device.status)}</td>
                <td>
                  {device.status === 'Flashing...' && typeof device.progress === 'number' ? (
                    <div className="progress-container">
                      <div className="progress-header">
                        <span>{device.currentTask || 'Flashing AP...'}</span>
                        <span>{device.progress}%</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${device.progress}%` }} />
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {device.currentTask || 'Idle'}
                    </span>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                    {device.mode === 'odin' && (
                      <button
                        onClick={() => onAction(device.pcId, device.id, 'flash')}
                        className="btn btn-sm btn-primary"
                        disabled={device.status === 'Flashing...'}
                      >
                        <PlayIcon size={12} /> Flash
                      </button>
                    )}
                    {device.mode === 'adb' && (
                      <button
                        onClick={() => onAction(device.pcId, device.id, 'suw_bypass')}
                        className="btn btn-sm"
                      >
                        <BoltIcon size={12} /> Bypass
                      </button>
                    )}
                    <button
                      onClick={() => onOpenLogs(device.pcId, device.id)}
                      className="btn btn-sm btn-icon"
                      title="Logs"
                    >
                      <TerminalIcon size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
