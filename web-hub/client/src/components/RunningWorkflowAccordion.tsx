import React, { useState } from 'react';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { ChevronDownIcon, ChevronUpIcon } from './Icons';
import { ProgressRing } from './ProgressRing';

interface RunningWorkflowAccordionProps {
  devices: DeviceItem[];
  apFilename?: string;
  onOpenLogs?: (pcId: string, deviceId: string) => void;
  onAbort?: (pcId: string, deviceId: string) => void;
}

export const RunningWorkflowAccordion: React.FC<RunningWorkflowAccordionProps> = ({
  devices,
  apFilename,
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
      {/* Header Accordion without Bolt Icon */}
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
            const rawProgress = device.progress || 0;
            const isOdinStage =
              device.status === 'Flashing...' &&
              (device.currentTask?.toLowerCase().includes('flashing') || rawProgress <= 50);

            // Odin file/binary progress (0-100%)
            const odinProgress = isOdinStage ? rawProgress : 100;

            // Overall workflow progress (0-100% across all phases)
            const overallProgress = isOdinStage
              ? Math.min(Math.round(odinProgress * 0.5), 50)
              : rawProgress;

            const taskDescription =
              device.currentTask || (isOdinStage ? 'Flashing Firmware...' : 'Processing Workflow...');

            return (
              <div
                key={`${device.pcId}-${device.id}`}
                className="workflow-device-card"
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  padding: '0.65rem 0.95rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                }}
              >
                {/* ponytail: Background filled loading overlay */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: `${isOdinStage ? odinProgress : overallProgress}%`,
                    backgroundColor: isOdinStage ? 'rgba(16, 185, 129, 0.18)' : 'rgba(59, 130, 246, 0.18)',
                    borderRight:
                      (isOdinStage ? odinProgress : overallProgress) > 0 &&
                      (isOdinStage ? odinProgress : overallProgress) < 100
                        ? `2px solid ${isOdinStage ? 'var(--accent-green, #10b981)' : '#3b82f6'}`
                        : 'none',
                    transition: 'width 0.25s linear',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />

                {/* Main Content Row */}
                <div
                  className="workflow-device-content-row"
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                  }}
                >
                  {/* Left Column: Device Info & Task Info */}
                  <div
                    className="workflow-device-info-col"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.2rem',
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    {/* Line 1: Model Name & Status */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 800,
                          fontSize: '0.875rem',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {device.model}
                      </span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: isOdinStage ? 'var(--accent-green, #10b981)' : '#60a5fa',
                          fontSize: '0.75rem',
                          backgroundColor: isOdinStage ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                          padding: '0.08rem 0.4rem',
                          borderRadius: '4px',
                          border: isOdinStage
                            ? '1px solid rgba(16, 185, 129, 0.25)'
                            : '1px solid rgba(59, 130, 246, 0.25)',
                        }}
                      >
                        {taskDescription}
                      </span>
                    </div>

                    {/* Line 2: Serial Number */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span
                        style={{
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.75rem',
                          letterSpacing: '0.02em',
                        }}
                      >
                        SN: {device.serial || device.id}
                      </span>
                    </div>

                    {/* Line 3: Port */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.725rem' }}>
                        Port: {device.port}
                      </span>
                    </div>

                    {/* Line 4: Workstation ID */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                        Workstation: {device.pcId}
                      </span>
                    </div>

                    {/* Line 5: AP Firmware Filename */}
                    {apFilename && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          overflowX: 'auto',
                          whiteSpace: 'nowrap',
                          scrollbarWidth: 'none',
                          WebkitOverflowScrolling: 'touch',
                          cursor: 'grab',
                          maxWidth: '100%',
                          marginTop: '1px',
                        }}
                        title={apFilename}
                      >
                        <span
                          style={{
                            color: 'var(--accent-primary, #3b82f6)',
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: '0.675rem',
                            fontWeight: 600,
                          }}
                        >
                          FW: {apFilename}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Vertically Stacked Progress Rings */}
                  <div
                    className="workflow-device-rings-col"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: '0.35rem',
                      flexShrink: 0,
                      alignSelf: 'center',
                    }}
                  >
                    {isOdinStage && (
                      <div
                        title={`Odin Flashing Step: ${odinProgress}%`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.4rem',
                          backgroundColor: 'rgba(16, 185, 129, 0.12)',
                          padding: '0.15rem 0.45rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                          minWidth: '85px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: 'var(--accent-green, #10b981)',
                          }}
                        >
                          Odin
                        </span>
                        <ProgressRing
                          progress={odinProgress}
                          size={24}
                          strokeWidth={2.5}
                          color="var(--accent-green, #10b981)"
                        />
                      </div>
                    )}

                    <div
                      title={`Progres Keseluruhan Workflow: ${overallProgress}%`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.4rem',
                        backgroundColor: 'rgba(59, 130, 246, 0.12)',
                        padding: '0.15rem 0.45rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        minWidth: '85px',
                      }}
                    >
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#60a5fa' }}>
                        Workflow
                      </span>
                      <ProgressRing
                        progress={overallProgress}
                        size={24}
                        strokeWidth={2.5}
                        color="#60a5fa"
                      />
                    </div>
                  </div>
                </div>

                {/* Progress Bar Track */}
                <div
                  className="progress-bar-bg"
                  style={{ position: 'relative', zIndex: 1, height: '4px', marginTop: '0.2rem' }}
                >
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
