import React from 'react';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { BatteryIcon, ThermometerIcon, FlashlightIcon } from './Icons';

interface DeviceTableViewProps {
  devices: DeviceItem[];
  selectedIds: string[];
  sourcePcId?: string;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onOpenLogs?: (pcId: string, deviceId: string) => void;
  onAction?: (pcId: string, deviceId: string, action: string) => void;
  onToggleTorch?: (deviceId: string, pcId: string, serial?: string) => void;
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
            <th style={{ minWidth: '260px', textAlign: 'center' }}>BUILD / AP / BATTERY / TEMP / FLASH</th>
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
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                    {/* Badge: Build Type [ro.system.build.type] */}
                    {device.buildType && (
                      <span
                        className="stat-pill"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          fontSize: '0.68rem',
                          padding: '0.15rem 0.4rem',
                          fontWeight: 700,
                          textTransform: 'lowercase',
                          backgroundColor: device.buildType.toLowerCase().includes('userdebug')
                            ? 'rgba(236, 72, 153, 0.14)'
                            : 'rgba(100, 116, 139, 0.14)',
                          color: device.buildType.toLowerCase().includes('userdebug')
                            ? 'var(--accent-magenta, #ec4899)'
                            : 'var(--text-secondary, #94a3b8)',
                          border: `1px solid ${device.buildType.toLowerCase().includes('userdebug') ? 'rgba(236, 72, 153, 0.3)' : 'rgba(100, 116, 139, 0.3)'}`,
                        }}
                        title={`Build Type [ro.system.build.type]: ${device.buildType}`}
                      >
                        {device.buildType}
                      </span>
                    )}

                    {/* Badge: AP Version [ro.build.PDA] */}
                    {device.pdaVersion && (
                      <span
                        className="stat-pill"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.68rem',
                          padding: '0.15rem 0.45rem',
                          fontWeight: 600,
                          backgroundColor: 'rgba(59, 130, 246, 0.12)',
                          color: 'var(--accent-primary, #60a5fa)',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                        }}
                        title={`AP Version [ro.build.PDA]: ${device.pdaVersion}`}
                      >
                        {device.pdaVersion}
                      </span>
                    )}

                    {/* Badge: Battery Level */}
                    <span
                      className="stat-pill"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.72rem',
                        padding: '0.15rem 0.45rem',
                        fontWeight: 600,
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
                        fontSize: '0.72rem',
                        padding: '0.15rem 0.45rem',
                        fontWeight: 600,
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

                    {/* Button: Toggle Flash */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleTorch?.(device.id, device.pcId, device.serial);
                      }}
                      className="btn btn-sm"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        fontSize: '0.72rem',
                        padding: '0.15rem 0.5rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        borderRadius: 'var(--radius-sm, 4px)',
                        backgroundColor: device.torchOn
                          ? 'rgba(245, 158, 11, 0.22)'
                          : 'var(--bg-subtle, rgba(255,255,255,0.05))',
                        color: device.torchOn ? '#f59e0b' : 'var(--text-secondary)',
                        border: `1px solid ${device.torchOn ? '#f59e0b' : 'var(--border-subtle)'}`,
                        boxShadow: device.torchOn ? '0 0 8px rgba(245, 158, 11, 0.4)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                      title={device.torchOn ? 'Matikan Flash' : 'Nyalakan Flash'}
                    >
                      <FlashlightIcon size={13} style={{ color: device.torchOn ? '#f59e0b' : 'currentColor' }} />
                      <span>{device.torchOn ? 'FLASH ON' : 'FLASH'}</span>
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
