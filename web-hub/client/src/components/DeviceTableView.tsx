import React from 'react';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { ProgressRing } from './ProgressRing';

interface DeviceTableViewProps {
  devices: DeviceItem[];
  selectedIds: string[];
  sourcePcId?: string;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onOpenLogs?: (pcId: string, deviceId: string) => void;
  onAction?: (pcId: string, deviceId: string, action: string) => void;
  apFilename?: string;
  isFirmwareForModel: (ap?: string, model?: string) => boolean;
}

export const DeviceTableView: React.FC<DeviceTableViewProps> = ({
  devices,
  selectedIds,
  sourcePcId,
  onToggleSelect,
  onSelectAll,
  apFilename,
  isFirmwareForModel,
}) => {
  const selectableDevices = devices.filter((d) => !sourcePcId || d.pcId === sourcePcId);
  const allSelected = selectableDevices.length > 0 && selectableDevices.every((d) => selectedIds.includes(d.id));

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
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => {
            const isSelected = selectedIds.includes(device.id);
            const isPcMismatch = Boolean(sourcePcId && device.pcId !== sourcePcId);
            const isMatch = isFirmwareForModel(apFilename, device.model);
            const rawProgress = device.progress || 0;
            const isFlashing = device.status === 'Flashing...' && typeof device.progress === 'number';
            const isOdinStage = isFlashing && (
              device.currentTask?.toLowerCase().includes('flashing') ||
              rawProgress <= 50
            );

            const odinProgress = isOdinStage ? rawProgress : 100;
            const overallProgress = isOdinStage
              ? Math.min(Math.round(odinProgress * 0.5), 50)
              : rawProgress;

            // ponytail: Background filled loading: Hijau saat Odin Flashing, Biru saat Workflow
            const rowBackground = isFlashing
              ? isOdinStage
                ? `linear-gradient(to right, rgba(16, 185, 129, 0.14) 0%, rgba(16, 185, 129, 0.14) ${odinProgress}%, transparent ${odinProgress}%)`
                : `linear-gradient(to right, rgba(59, 130, 246, 0.14) 0%, rgba(59, 130, 246, 0.14) ${overallProgress}%, transparent ${overallProgress}%)`
              : undefined;

            return (
              <tr
                key={`${device.pcId}-${device.id}`}
                className={`${isSelected ? 'selected' : ''} ${isFlashing ? 'flashing-row' : ''}`}
                title={isPcMismatch ? `File binary dipilih dari PC [${sourcePcId}]. Device ini berada di PC [${device.pcId}]. Checkbox dinonaktifkan.` : undefined}
                style={{
                  background: rowBackground,
                  opacity: isPcMismatch ? 0.45 : 1,
                  cursor: isPcMismatch ? 'not-allowed' : undefined,
                  transition: 'background 0.25s linear',
                }}
              >
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isPcMismatch}
                    onChange={() => {
                      if (!isPcMismatch) onToggleSelect(device.id);
                    }}
                    style={{ cursor: isPcMismatch ? 'not-allowed' : 'pointer' }}
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
                  {isFlashing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      {/* Differentiated Progress Rings */}
                      {isOdinStage ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <ProgressRing progress={odinProgress} size={26} strokeWidth={2.5} color="var(--accent-green, #10b981)" title={`Odin Step: ${odinProgress}%`} />
                          <ProgressRing progress={overallProgress} size={26} strokeWidth={2.5} color="#60a5fa" title={`Overall Workflow: ${overallProgress}%`} />
                        </div>
                      ) : (
                        <ProgressRing progress={overallProgress} size={26} strokeWidth={2.5} color="#60a5fa" title={`Overall Workflow: ${overallProgress}%`} />
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: isOdinStage ? 'var(--accent-green, #10b981)' : '#60a5fa',
                          }}
                        >
                          {device.currentTask || (isOdinStage ? 'Flashing AP...' : 'Workflow In Progress...')}
                        </span>
                        <div className="progress-track" style={{ height: '3px' }}>
                          <div
                            className="progress-fill"
                            style={{
                              width: `${isOdinStage ? odinProgress : overallProgress}%`,
                              backgroundColor: isOdinStage ? 'var(--accent-green, #10b981)' : '#3b82f6',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {device.currentTask || 'Idle'}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
