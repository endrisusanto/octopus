import React, { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, RotateCcwIcon, CheckIcon, CloseIcon, FileCodeIcon } from './Icons';
import { BinaryItem } from '../hooks/useFleetWebSocket';
import { BinarySelectModal } from './BinarySelectModal';

export interface FirmwareSlotState {
  filename: string;
  path: string;
  sizeBytes: number;
  pcId?: string;
  status: 'idle' | 'verifying' | 'verified' | 'error';
  progress: number;
}

export interface FirmwareSlotsMap {
  bl: FirmwareSlotState;
  ap: FirmwareSlotState;
  cp: FirmwareSlotState;
  csc: FirmwareSlotState;
  userdata: FirmwareSlotState;
}

interface FirmwareAccordionProps {
  slots: FirmwareSlotsMap;
  onUpdateSlot: (slotKey: keyof FirmwareSlotsMap, file: BinaryItem | null) => void;
  onResetAll: () => void;
  binaries: BinaryItem[];
  onRefreshBinaries?: () => void;
}

const SLOT_CONFIGS: { key: keyof FirmwareSlotsMap; label: string; name: string; color: string; bg: string }[] = [
  { key: 'bl', label: 'BL', name: 'Bootloader', color: 'var(--accent-amber, #f59e0b)', bg: 'rgba(245, 158, 11, 0.1)' },
  { key: 'ap', label: 'AP', name: 'System / PDA', color: 'var(--accent-primary, #3b82f6)', bg: 'rgba(59, 130, 246, 0.1)' },
  { key: 'cp', label: 'CP', name: 'Phone / Modem', color: 'var(--accent-purple, #a855f7)', bg: 'rgba(168, 85, 247, 0.1)' },
  { key: 'csc', label: 'CSC', name: 'Consumer Software Customization', color: 'var(--accent-green, #10b981)', bg: 'rgba(16, 185, 129, 0.1)' },
  { key: 'userdata', label: 'USERDATA', name: 'Userdata Storage', color: 'var(--accent-red, #ef4444)', bg: 'rgba(239, 68, 68, 0.1)' },
];

export const FirmwareAccordion: React.FC<FirmwareAccordionProps> = ({
  slots,
  onUpdateSlot,
  onResetAll,
  binaries,
  onRefreshBinaries,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [activeSlotModal, setActiveSlotModal] = useState<keyof FirmwareSlotsMap | null>(null);

  const hasAnyFile = Object.values(slots).some((s) => s.filename.length > 0);
  const isApVerified = slots.ap.status === 'verified';
  const isApVerifying = slots.ap.status === 'verifying';

  const handlePickBinary = (slotKey: keyof FirmwareSlotsMap, filename: string) => {
    const selectedItem = binaries.find((b) => b.filename === filename) || {
      filename,
      path: filename,
      sizeBytes: 0,
      pcId: 'local',
    };

    onUpdateSlot(slotKey, selectedItem);

    // Auto-populate companion slots if AP is picked
    if (slotKey === 'ap') {
      const baseDir = selectedItem.path.substring(0, selectedItem.path.lastIndexOf('/') + 1) ||
                      selectedItem.path.substring(0, selectedItem.path.lastIndexOf('\\') + 1);

      ['bl', 'cp', 'csc', 'userdata'].forEach((k) => {
        const key = k as keyof FirmwareSlotsMap;
        if (!slots[key].filename) {
          const companion = binaries.find((b) => {
            const prefix = key.toUpperCase() + '_';
            const inSameDir = baseDir ? b.path.startsWith(baseDir) : true;
            return inSameDir && b.filename.toUpperCase().startsWith(prefix);
          });
          if (companion) {
            onUpdateSlot(key, companion);
          }
        }
      });
    }
  };

  const renderBuildTypeBadge = (filename: string) => {
    if (!filename) return null;
    const lower = filename.toLowerCase();
    if (lower.includes('userdebug')) {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            color: 'var(--accent-amber, #f59e0b)',
            border: '1.5px solid var(--accent-amber, #f59e0b)',
            fontSize: '0.625rem',
            padding: '0.08rem 0.38rem',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            borderRadius: '4px',
          }}
        >
          USERDEBUG
        </span>
      );
    }
    if (lower.includes('user') || lower.includes('_ship') || lower.includes('official')) {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            color: 'var(--accent-green, #10b981)',
            border: '1.5px solid var(--accent-green, #10b981)',
            fontSize: '0.625rem',
            padding: '0.08rem 0.38rem',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            borderRadius: '4px',
          }}
        >
          USER
        </span>
      );
    }
    return (
      <span
        className="badge"
        style={{
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          color: 'var(--accent-primary, #3b82f6)',
          border: '1.5px solid var(--accent-primary, #3b82f6)',
          fontSize: '0.625rem',
          padding: '0.08rem 0.38rem',
          fontWeight: 700,
          flexShrink: 0,
          whiteSpace: 'nowrap',
          borderRadius: '4px',
        }}
      >
        AP READY
      </span>
    );
  };

  return (
    <div className="card accordion-card" style={{ marginBottom: '1rem' }}>
      {/* Header Accordion */}
      <div
        className="accordion-header"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '0.35rem',
          padding: '0.65rem 0.85rem',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Row 1: Title, Build Type Badge, and Reset Button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
            <button type="button" className="btn btn-icon" style={{ padding: 0, flexShrink: 0, width: '22px', height: '22px' }}>
              {isOpen ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
            </button>

            <span style={{ fontWeight: 800, fontSize: '0.825rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              FIRMWARE BINARY
            </span>

            {isApVerified && renderBuildTypeBadge(slots.ap.filename)}
            {isApVerifying && (
              <span className="badge badge-flashing" style={{ fontSize: '0.625rem', padding: '0.08rem 0.35rem', whiteSpace: 'nowrap' }}>
                Verifying {slots.ap.progress}%
              </span>
            )}
          </div>

          {/* Action Header: Reset Button */}
          {hasAnyFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={onResetAll}
                className="btn btn-sm btn-outline-danger"
                style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem', height: '26px', padding: '0 0.5rem', whiteSpace: 'nowrap' }}
                title="Reset seluruh file slot firmware"
              >
                <RotateCcwIcon size={11} /> Reset File
              </button>
            </div>
          )}
        </div>

        {/* Row 2: Full-Width Horizontal Touch-Scrollable Firmware Filename */}
        {isApVerified && (
          <div
            style={{
              width: '100%',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              scrollbarWidth: 'none',
              WebkitOverflowScrolling: 'touch',
              cursor: 'grab',
              padding: '0.1rem 0',
            }}
            onClick={(e) => e.stopPropagation()}
            title="Scroll/Drag horizontal untuk melihat nama file lengkap"
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.725rem',
                fontWeight: 600,
                color: 'var(--accent-primary)',
                letterSpacing: '-0.01em',
                userSelect: 'text',
              }}
            >
              {slots.ap.filename}
            </span>
          </div>
        )}
      </div>

      {/* Body Accordion: 5 Slots */}
      {isOpen && (
        <div
          className="accordion-body"
          style={{
            padding: '1rem 1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
          }}
        >
          {SLOT_CONFIGS.map((slot) => {
            const data = slots[slot.key];
            const isFilled = data.filename.length > 0;
            const isVerifying = data.status === 'verifying';
            const isVerified = data.status === 'verified';

            return (
              <div
                key={slot.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${isVerifying ? slot.color : isFilled ? slot.color : 'var(--border-subtle)'}`,
                  backgroundColor: isFilled ? 'var(--bg-surface)' : 'var(--bg-subtle)',
                  transition: 'border-color 0.2s, background-color 0.2s',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Background Fill Loading Bar when Verifying */}
                {isVerifying && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: `${data.progress}%`,
                      backgroundColor: slot.bg,
                      transition: 'width 0.15s ease-out',
                      zIndex: 0,
                      pointerEvents: 'none',
                      borderRight: `2px solid ${slot.color}`,
                    }}
                  />
                )}

                {/* Slot Badge */}
                <div
                  style={{
                    width: '75px',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                    color: slot.color,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    flexShrink: 0,
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  <FileCodeIcon size={15} />
                  <span>{slot.label}</span>
                </div>

                {/* Slot Content or Input Click Area */}
                <div
                  onClick={() => setActiveSlotModal(slot.key)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  {isFilled ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, width: '100%' }}>
                      <div
                        style={{
                          overflowX: 'auto',
                          whiteSpace: 'nowrap',
                          scrollbarWidth: 'none',
                          WebkitOverflowScrolling: 'touch',
                          cursor: 'grab',
                          flex: 1,
                          minWidth: 0,
                          padding: '0.1rem 0',
                        }}
                        title={data.filename}
                      >
                        <span
                          style={{
                            fontSize: '0.675rem',
                            fontFamily: 'var(--font-mono, monospace)',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            letterSpacing: '-0.01em',
                            display: 'inline-block',
                          }}
                        >
                          {data.filename}
                        </span>
                      </div>
                      {isVerified && <CheckIcon size={14} className="text-ready" style={{ flexShrink: 0 }} />}
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Klik untuk pilih file {slot.label} ({slot.name})...
                    </span>
                  )}

                  {/* Verification Progress Bar & Info */}
                  {isVerifying && (
                    <div style={{ marginTop: '0.35rem', width: '100%', maxWidth: '380px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: slot.color, marginBottom: '0.2rem', fontWeight: 600 }}>
                        <span>Memverifikasi MD5 Binary...</span>
                        <span>{data.progress}%</span>
                      </div>
                      <div
                        style={{
                          height: '6px',
                          backgroundColor: 'var(--bg-base)',
                          borderRadius: 'var(--radius-full)',
                          overflow: 'hidden',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${data.progress}%`,
                            backgroundColor: slot.color,
                            borderRadius: 'var(--radius-full)',
                            transition: 'width 0.15s ease-out',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0, position: 'relative', zIndex: 1 }}>
                  <button
                    type="button"
                    onClick={() => setActiveSlotModal(slot.key)}
                    className="btn btn-sm"
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                  >
                    {isFilled ? 'Ganti' : 'Pilih'}
                  </button>

                  {isFilled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateSlot(slot.key, null);
                      }}
                      className="btn btn-icon btn-sm"
                      title={`Hapus file ${slot.label}`}
                    >
                      <CloseIcon size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Pick Binary */}
      {activeSlotModal && (
        <BinarySelectModal
          isOpen={true}
          onClose={() => setActiveSlotModal(null)}
          currentBinary={slots[activeSlotModal].filename}
          binaries={binaries}
          onSave={(filename) => {
            handlePickBinary(activeSlotModal, filename);
            setActiveSlotModal(null);
          }}
          onRefreshBinaries={onRefreshBinaries}
        />
      )}
    </div>
  );
};
