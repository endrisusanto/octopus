import React from 'react';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { BatteryIcon, ThermometerIcon, DotIcon } from './Icons';

interface DeviceTableViewProps {
  devices: DeviceItem[];
  selectedIds: string[];
  sourcePcId?: string;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onOpenLogs?: (pcId: string, deviceId: string) => void;
  onAction?: (pcId: string, deviceId: string, action: string) => void;
  onToggleTorch?: (deviceId: string, pcId: string, serial?: string) => void;
  pendingTorchIds?: string[];
  apFilename?: string;
  isFirmwareForModel: (ap?: string, model?: string) => boolean;
}

export const DeviceTableView: React.FC<DeviceTableViewProps> = ({
  devices,
  selectedIds,
  sourcePcId,
  onToggleSelect,
  onSelectAll,
  onToggleTorch,
  pendingTorchIds,
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
            <th style={{ minWidth: '200px', textAlign: 'center' }}>BATTERY / TEMP / FLASH</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => {
            const isSelected = selectedIds.includes(device.id);
            const isPcMismatch = Boolean(sourcePcId && device.pcId !== sourcePcId);
            const isMatch = isFirmwareForModel(apFilename, device.model);
            const rawProgress = device.progress || 0;
            const isFlashing = (device.status === 'Flashing...' || device.status === 'Busy') && typeof device.progress === 'number';
            const isRunning = device.status === 'Flashing...' || device.status === 'Busy';
            const isWaitingBoot = isFlashing && (
              device.currentTask?.toLowerCase().includes('reboot') ||
              device.currentTask?.toLowerCase().includes('boot') ||
              device.currentTask?.toLowerCase().includes('menunggu')
            );
            const isOdinStage = isFlashing && (
              device.currentTask?.toLowerCase().includes('flashing') ||
              rawProgress <= 50
            );

            const odinProgress = isOdinStage ? rawProgress : 100;
            const overallProgress = isOdinStage
              ? Math.min(Math.round(odinProgress * 0.5), 50)
              : rawProgress;

            // Sleek bottom underline progress line
            const rowBackground = isFlashing && !isWaitingBoot
              ? isOdinStage
                ? `linear-gradient(to right, var(--accent-green, #10b981) ${odinProgress}%, rgba(255, 255, 255, 0.08) ${odinProgress}%) bottom / 100% 2.5px no-repeat`
                : `linear-gradient(to right, var(--accent-primary, #3b82f6) ${overallProgress}%, rgba(255, 255, 255, 0.08) ${overallProgress}%) bottom / 100% 2.5px no-repeat`
              : undefined;

            return (
              <tr
                key={`${device.pcId}-${device.id}`}
                className={`${isSelected ? 'selected' : ''} ${isFlashing ? 'flashing-row' : ''} ${isWaitingBoot ? 'waiting-boot' : ''}`}
                title={
                  isRunning
                    ? 'Perangkat sedang menjalankan workflow. Checkbox dinonaktifkan.'
                    : isPcMismatch
                    ? `File binary dipilih dari PC [${sourcePcId}]. Device ini berada di PC [${device.pcId}]. Checkbox dinonaktifkan.`
                    : undefined
                }
                style={{
                  background: rowBackground,
                  opacity: isPcMismatch ? 0.45 : 1,
                  cursor: (isPcMismatch || isRunning) ? 'not-allowed' : undefined,
                  transition: 'background 0.25s linear',
                }}
              >
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isPcMismatch || isRunning}
                    onChange={() => {
                      if (!isPcMismatch && !isRunning) onToggleSelect(device.id);
                    }}
                    style={{ cursor: (isPcMismatch || isRunning) ? 'not-allowed' : 'pointer' }}
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span
                        className="binary-chip-btn"
                        style={{
                          height: '24px',
                          padding: '0 0.55rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: 'var(--bg-subtle)',
                          border: '1px solid var(--border-subtle)',
                          cursor: 'default',
                          borderRadius: 'var(--radius-full)',
                        }}
                      >
                        {device.model}
                      </span>
                      {isMatch && (
                        <span
                          className="status-badge"
                          style={{
                            backgroundColor: 'var(--status-pass-bg)',
                            color: 'var(--status-pass-text)',
                            fontSize: '0.625rem',
                            padding: '0.1rem 0.4rem',
                            fontWeight: 800,
                            borderRadius: '4px',
                          }}
                        >
                          FW MATCH
                        </span>
                      )}
                      {device.buildType && (
                        <span
                          className={`badge ${device.buildType.toLowerCase().includes('userdebug') ? 'badge-userdebug' : ''}`}
                          style={{
                            fontSize: '0.65rem',
                            padding: '0.05rem 0.35rem',
                            borderRadius: '3px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            backgroundColor: device.buildType.toLowerCase() === 'user' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                            color: device.buildType.toLowerCase() === 'user' ? 'var(--accent-green, #10b981)' : 'var(--accent-amber, #f59e0b)',
                            border: device.buildType.toLowerCase() === 'user' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(245, 158, 11, 0.25)',
                          }}
                          title={`Build Type: ${device.buildType}`}
                        >
                          {device.buildType.toLowerCase().includes('userdebug') ? (
                            <>
                              <span className="badge-text-full">USERDEBUG</span>
                              <span className="badge-text-short">DEBUG</span>
                            </>
                          ) : (
                            device.buildType.toUpperCase()
                          )}
                        </span>
                      )}
                    </div>
                    {device.pdaVersion && (
                      <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-muted)' }}>
                        PDA: {device.pdaVersion}
                      </div>
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
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                    {/* Badge: Battery Level */}
                    <span
                      className="stat-pill"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        height: '24px',
                        boxSizing: 'border-box',
                        fontSize: '0.72rem',
                        padding: '0.15rem 0.45rem',
                        fontWeight: 600,
                        borderRadius: 'var(--radius-sm, 4px)',
                        backgroundColor: (device.batteryLevel ?? 100) >= 50
                          ? 'rgba(16, 185, 129, 0.12)'
                          : (device.batteryLevel ?? 100) >= 20
                          ? 'rgba(245, 158, 11, 0.12)'
                          : 'rgba(239, 68, 68, 0.12)',
                        color: (device.batteryLevel ?? 100) >= 50
                          ? 'var(--accent-green, #10b981)'
                          : (device.batteryLevel ?? 100) >= 20
                          ? 'var(--accent-warning, #f59e0b)'
                          : 'var(--accent-red, #ef4444)',
                        border: `1px solid ${(device.batteryLevel ?? 100) >= 50 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                      }}
                      title={`Kapasitas Baterai: ${device.batteryLevel ?? 100}%`}
                    >
                      <BatteryIcon size={12} />
                      <span>{device.batteryLevel ?? 100}%</span>
                    </span>

                    {/* Badge: Temperature */}
                    <span
                      className="stat-pill"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        height: '24px',
                        boxSizing: 'border-box',
                        fontSize: '0.72rem',
                        padding: '0.15rem 0.45rem',
                        fontWeight: 600,
                        borderRadius: 'var(--radius-sm, 4px)',
                        backgroundColor: (device.batteryTemp ?? 32) > 38
                          ? 'rgba(239, 68, 68, 0.12)'
                          : 'rgba(59, 130, 246, 0.12)',
                        color: (device.batteryTemp ?? 32) > 38
                          ? 'var(--accent-red, #ef4444)'
                          : 'var(--accent-primary, #3b82f6)',
                        border: `1px solid ${(device.batteryTemp ?? 32) > 38 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(59, 130, 246, 0.25)'}`,
                      }}
                      title={`Suhu Perangkat: ${device.batteryTemp ? (device.batteryTemp > 100 ? (device.batteryTemp / 10).toFixed(1) : device.batteryTemp.toFixed(1)) : '32.0'}°C`}
                    >
                      <ThermometerIcon size={12} />
                      <span>{device.batteryTemp ? (device.batteryTemp > 100 ? (device.batteryTemp / 10).toFixed(1) : device.batteryTemp.toFixed(1)) : '32.0'}°C</span>
                    </span>

                    {/* Button: Toggle Flash / PING (Exact match to Battery/Temp shape) */}
                    {(() => {
                      const isTorchPending = Boolean(
                        pendingTorchIds &&
                        (pendingTorchIds.includes(device.id) || (device.serial && pendingTorchIds.includes(device.serial)))
                      );

                      return (
                        <button
                          type="button"
                          disabled={isTorchPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleTorch?.(device.id, device.pcId, device.serial);
                          }}
                          className={`stat-pill ${isTorchPending ? 'flash-loading-shimmer' : ''}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            height: '24px',
                            boxSizing: 'border-box',
                            fontSize: '0.72rem',
                            padding: '0.15rem 0.45rem',
                            fontWeight: 700,
                            cursor: isTorchPending ? 'wait' : 'pointer',
                            borderRadius: 'var(--radius-sm, 4px)',
                            backgroundColor: isTorchPending
                              ? undefined
                              : device.torchOn
                              ? 'rgba(245, 158, 11, 0.22)'
                              : 'var(--bg-subtle, rgba(255,255,255,0.05))',
                            color: isTorchPending ? '#f59e0b' : device.torchOn ? 'var(--accent-warning, #f59e0b)' : 'var(--text-secondary, #94a3b8)',
                            border: isTorchPending
                              ? undefined
                              : `1px solid ${device.torchOn ? 'var(--accent-warning, #f59e0b)' : 'var(--border-subtle)'}`,
                            boxShadow: isTorchPending
                              ? '0 0 10px rgba(245, 158, 11, 0.3)'
                              : device.torchOn
                              ? '0 0 8px rgba(245, 158, 11, 0.35)'
                              : 'none',
                            transition: 'all 0.15s ease',
                          }}
                          title={
                            isTorchPending
                              ? 'Memverifikasi status ke perangkat...'
                              : device.torchOn
                              ? 'Matikan Ping'
                              : 'Nyalakan Ping'
                          }
                        >
                          <DotIcon
                            size={10}
                            style={{
                              color: device.torchOn || isTorchPending ? '#f59e0b' : 'currentColor',
                              opacity: isTorchPending ? 0.8 : 1,
                            }}
                          />
                          <span>
                            {isTorchPending
                              ? 'CEK...'
                              : device.torchOn
                              ? 'PING ON'
                              : 'PING'}
                          </span>
                        </button>
                      );
                    })()}
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
