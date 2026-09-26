import React, { useState } from 'react';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { ChevronDownIcon, ChevronUpIcon, BoltIcon, TerminalIcon, CloseIcon } from './Icons';
import { ProgressRing } from './ProgressRing';

interface RunningWorkflowAccordionProps {
  devices: DeviceItem[];
  onOpenLogs: (pcId: string, deviceId: string) => void;
  onAbort?: (pcId: string, deviceId: string) => void;
}

export const RunningWorkflowAccordion: React.FC<RunningWorkflowAccordionProps> = ({
  devices,
  onOpenLogs,
  onAbort,
}) => {
  const [isOpen, setIsOpen] = useState(true);

  if (devices.length === 0) return null;

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
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.85rem 1.25rem',
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: 'rgba(16, 185, 129, 0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button type="button" className="btn btn-icon" style={{ padding: 0 }}>
            {isOpen ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BoltIcon size={16} className="text-pass" />
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              WORKFLOW SEDANG BERJALAN ({devices.length} Unit)
            </span>
          </div>
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--accent-green, #10b981)', fontWeight: 600 }}>
          Proses Odin Flashing Aktif
        </div>
      </div>

      {/* Body Accordion */}
      {isOpen && (
        <div className="accordion-body" style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {devices.map((device) => {
            const rawProgress = device.progress || 0;
            const isOdinStage = device.status === 'Flashing...' && (
              device.currentTask?.toLowerCase().includes('flashing') ||
              rawProgress <= 50
            );

            // Odin file/binary progress (0-100%)
            const odinProgress = isOdinStage ? rawProgress : 100;

            // Overall workflow progress (0-100% across all phases)
            const overallProgress = isOdinStage
              ? Math.min(Math.round(odinProgress * 0.5), 50)
              : rawProgress;

            return (
              <div
                key={`${device.pcId}-${device.id}`}
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                }}
              >
                {/* ponytail: Background filled loading overlay: Hijau saat Odin Flashing, Biru saat Workflow */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: `${isOdinStage ? odinProgress : overallProgress}%`,
                    backgroundColor: isOdinStage ? 'rgba(16, 185, 129, 0.18)' : 'rgba(59, 130, 246, 0.18)',
                    borderRight: (isOdinStage ? odinProgress : overallProgress) > 0 && (isOdinStage ? odinProgress : overallProgress) < 100
                      ? `2px solid ${isOdinStage ? 'var(--accent-green, #10b981)' : '#3b82f6'}`
                      : 'none',
                    transition: 'width 0.25s linear',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />

                <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700 }}>{device.model}</span>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                      SN: {device.serial || device.id}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      [{device.pcId} &bull; {device.port}]
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span
                      style={{
                        fontWeight: 600,
                        color: isOdinStage ? 'var(--accent-green, #10b981)' : '#60a5fa',
                        fontSize: '0.75rem',
                      }}
                    >
                      {device.currentTask || (isOdinStage ? 'Flashing Firmware...' : 'Processing Workflow...')}
                    </span>

                    {/* Dual Progress: Odin Step & Overall Workflow */}
                    {isOdinStage ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        {/* Odin Flash Progress Ring */}
                        <div
                          title={`Odin Flashing Step: ${odinProgress}%`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            backgroundColor: 'rgba(16, 185, 129, 0.12)',
                            padding: '0.15rem 0.45rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                          }}
                        >
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent-green, #10b981)' }}>Odin</span>
                          <ProgressRing progress={odinProgress} size={28} strokeWidth={2.5} color="var(--accent-green, #10b981)" />
                        </div>

                        {/* Overall Workflow Ring */}
                        <div
                          title={`Progres Keseluruhan Workflow: ${overallProgress}%`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            backgroundColor: 'rgba(59, 130, 246, 0.12)',
                            padding: '0.15rem 0.45rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid rgba(59, 130, 246, 0.25)',
                          }}
                        >
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#60a5fa' }}>Workflow</span>
                          <ProgressRing progress={overallProgress} size={28} strokeWidth={2.5} color="#60a5fa" />
                        </div>
                      </div>
                    ) : (
                      <div
                        title={`Progres Keseluruhan Workflow: ${overallProgress}%`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          backgroundColor: 'rgba(59, 130, 246, 0.12)',
                          padding: '0.15rem 0.45rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                        }}
                      >
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#60a5fa' }}>Workflow</span>
                        <ProgressRing progress={overallProgress} size={28} strokeWidth={2.5} color="#60a5fa" />
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenLogs(device.pcId, device.id)}
                      className="btn btn-icon btn-sm"
                      title="Inspect Logs"
                    >
                      <TerminalIcon size={13} />
                    </button>
                    {onAbort && (
                      <button
                        type="button"
                        onClick={() => onAbort(device.pcId, device.id)}
                        className="btn btn-icon btn-sm text-offline"
                        title="Batalkan Proses"
                      >
                        <CloseIcon size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar: Hijau saat Odin Flashing, Biru saat Workflow */}
                <div className="progress-bar-bg" style={{ position: 'relative', zIndex: 1, height: '4px' }}>
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${isOdinStage ? odinProgress : overallProgress}%`,
                      backgroundColor: isOdinStage ? 'var(--accent-green, #10b981)' : '#3b82f6',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
