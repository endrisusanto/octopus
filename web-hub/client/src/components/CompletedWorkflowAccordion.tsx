import React, { useState } from 'react';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { ChevronDownIcon, ChevronUpIcon, CheckIcon, TerminalIcon, PlayIcon, RefreshIcon, BatteryIcon, ThermometerIcon, DotIcon } from './Icons';

interface CompletedWorkflowAccordionProps {
  devices: DeviceItem[];
  onOpenLogs: (pcId: string, deviceId: string) => void;
  onResetStatus: (deviceId: string) => void;
  onResetAllCompleted: () => void;
  onRerunAutomation?: (deviceIds: string[]) => void;
  onToggleTorch?: (deviceId: string, pcId: string, serial?: string) => void;
  pendingTorchIds?: string[];
  isOpen?: boolean;
  onToggleOpen?: () => void;
}

export const CompletedWorkflowAccordion: React.FC<CompletedWorkflowAccordionProps> = ({
  devices,
  onOpenLogs,
  onResetStatus,
  onResetAllCompleted,
  onRerunAutomation,
  onToggleTorch,
  pendingTorchIds,
  isOpen: isOpenProp,
  onToggleOpen,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(true);
  const isOpen = isOpenProp !== undefined ? isOpenProp : internalIsOpen;
  const toggleOpen = onToggleOpen || (() => setInternalIsOpen(!internalIsOpen));

  if (devices.length === 0) return null;

  const passCount = devices.filter((d) => d.status === 'Pass').length;
  const failCount = devices.filter((d) => d.status === 'Fail').length;

  return (
    <div
      className="card accordion-card"
      style={{
        marginBottom: '1rem',
        border: '1px solid var(--accent-green, #10b981)',
        backgroundColor: 'var(--bg-surface)',
      }}
    >
      {/* Header Accordion */}
      <div
        className="accordion-header"
        onClick={toggleOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.85rem 1.25rem',
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: 'rgba(16, 185, 129, 0.05)',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button type="button" className="btn btn-icon" style={{ padding: 0 }}>
            {isOpen ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckIcon size={16} className="text-pass" />
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              WORKFLOW SELESAI ({devices.length} Unit)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {passCount > 0 && (
              <span className="status-badge pass" style={{ fontSize: '0.7rem', padding: '0.1rem 0.45rem' }}>
                {passCount} Pass
              </span>
            )}
            {failCount > 0 && (
              <span className="status-badge fail" style={{ fontSize: '0.7rem', padding: '0.1rem 0.45rem' }}>
                {failCount} Fail
              </span>
            )}
          </div>
        </div>

        {/* Right Action: Clear All Completed back to Standby */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onResetAllCompleted}
            className="btn btn-sm btn-outline"
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            title="Kembalikan semua perangkat selesai ke status Standby"
          >
            <RefreshIcon size={13} />
            <span>Reset ke Standby</span>
          </button>
        </div>
      </div>

      {/* Body Accordion */}
      {isOpen && (
        <div
          className="accordion-body"
          style={{
            padding: '0.75rem 1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {devices.map((device) => {
            const isPass = device.status === 'Pass';
            return (
              <div
                key={`${device.pcId}-${device.id}`}
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${isPass ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                  backgroundColor: isPass ? 'rgba(16, 185, 129, 0.04)' : 'rgba(239, 68, 68, 0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  fontSize: '0.8rem',
                }}
              >
                {/* Left Device Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <span className={`status-badge ${isPass ? 'pass' : 'fail'}`} style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}>
                    {isPass ? 'PASS' : 'FAILED'}
                  </span>
                  <span style={{ fontWeight: 700 }}>{device.model}</span>
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                    SN: {device.serial || device.id}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    [{device.pcId} &bull; {device.port}]
                  </span>
                  <span style={{ color: isPass ? 'var(--accent-green, #10b981)' : 'var(--accent-red, #ef4444)', fontWeight: 600, fontSize: '0.75rem' }}>
                    {device.currentTask || (isPass ? 'Provisioning Selesai 100%' : 'Gagal')}
                  </span>
                </div>

                {/* Right Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  {/* Badge: Battery */}
                  <span
                    className="stat-pill"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.2rem',
                      fontSize: '0.7rem',
                      padding: '0.12rem 0.4rem',
                      fontWeight: 600,
                      backgroundColor: (device.batteryLevel ?? 100) >= 50
                        ? 'rgba(16, 185, 129, 0.12)'
                        : 'rgba(245, 158, 11, 0.12)',
                      color: (device.batteryLevel ?? 100) >= 50
                        ? 'var(--accent-green, #10b981)'
                        : 'var(--accent-warning, #f59e0b)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                    }}
                    title={`Baterai: ${device.batteryLevel ?? 100}%`}
                  >
                    <BatteryIcon size={11} />
                    <span>{device.batteryLevel ?? 100}%</span>
                  </span>

                  {/* Badge: Temp */}
                  <span
                    className="stat-pill"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.2rem',
                      fontSize: '0.7rem',
                      padding: '0.12rem 0.4rem',
                      fontWeight: 600,
                      backgroundColor: 'rgba(59, 130, 246, 0.12)',
                      color: 'var(--accent-primary, #3b82f6)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                    }}
                    title={`Suhu: ${device.batteryTemp ? (device.batteryTemp > 100 ? (device.batteryTemp / 10).toFixed(1) : device.batteryTemp.toFixed(1)) : '32.0'}°C`}
                  >
                    <ThermometerIcon size={11} />
                    <span>{device.batteryTemp ? (device.batteryTemp > 100 ? (device.batteryTemp / 10).toFixed(1) : device.batteryTemp.toFixed(1)) : '32.0'}°C</span>
                  </span>

                  {/* Button: Toggle Ping */}
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
                        className={`btn btn-sm ${isTorchPending ? 'flash-loading-shimmer' : ''}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.7rem',
                          padding: '0.12rem 0.45rem',
                          fontWeight: 700,
                          cursor: isTorchPending ? 'wait' : 'pointer',
                          borderRadius: 'var(--radius-sm, 4px)',
                          backgroundColor: isTorchPending
                            ? undefined
                            : device.torchOn
                            ? 'rgba(245, 158, 11, 0.25)'
                            : 'var(--bg-subtle, rgba(255,255,255,0.05))',
                          color: isTorchPending ? '#f59e0b' : device.torchOn ? '#f59e0b' : 'var(--text-secondary)',
                          border: isTorchPending
                            ? undefined
                            : `1px solid ${device.torchOn ? '#f59e0b' : 'var(--border-subtle)'}`,
                          boxShadow: isTorchPending
                            ? '0 0 10px rgba(245, 158, 11, 0.3)'
                            : device.torchOn
                            ? '0 0 8px rgba(245, 158, 11, 0.4)'
                            : 'none',
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

                  <button
                    type="button"
                    onClick={() => onOpenLogs(device.pcId, device.id)}
                    className="btn btn-icon btn-sm"
                    title="Inspect Logs"
                  >
                    <TerminalIcon size={13} />
                  </button>

                  {onRerunAutomation && (
                    <button
                      type="button"
                      onClick={() => onRerunAutomation([device.id])}
                      className="btn btn-icon btn-sm text-primary"
                      title="Jalankan Ulang Automasi"
                    >
                      <PlayIcon size={13} />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onResetStatus(device.id)}
                    className="btn btn-icon btn-sm"
                    title="Kembalikan ke Standby"
                  >
                    <RefreshIcon size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
