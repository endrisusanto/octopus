import React, { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, RotateCcwIcon, CheckIcon, CloseIcon, FileCodeIcon } from './Icons';
import { BinaryItem } from '../hooks/useFleetWebSocket';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { BinarySelectModal } from './BinarySelectModal';
import { ProgressRing } from './ProgressRing';

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
  onUpdateSlot?: (slotKey: keyof FirmwareSlotsMap, file: BinaryItem | null) => void;
  onUpdateSlotsBatch: (updates: { slotKey: keyof FirmwareSlotsMap; fileItem: BinaryItem | null }[]) => void;
  onResetAll: () => void;
  binaries: BinaryItem[];
  devices?: DeviceItem[];
  onRefreshBinaries?: () => void;
}

const SLOT_CONFIGS: { key: keyof FirmwareSlotsMap; label: string; name: string; color: string; bg: string }[] = [
  { key: 'bl', label: 'BL', name: 'Bootloader', color: 'var(--accent-amber, #f59e0b)', bg: 'rgba(245, 158, 11, 0.1)' },
  { key: 'ap', label: 'AP', name: 'System / PDA', color: 'var(--accent-primary, #3b82f6)', bg: 'rgba(59, 130, 246, 0.1)' },
  { key: 'cp', label: 'CP', name: 'Phone / Modem', color: 'var(--accent-purple, #a855f7)', bg: 'rgba(168, 85, 247, 0.1)' },
  { key: 'csc', label: 'CSC', name: 'Consumer Customization', color: 'var(--accent-green, #10b981)', bg: 'rgba(16, 185, 129, 0.1)' },
  { key: 'userdata', label: 'USERDATA', name: 'Userdata Storage', color: 'var(--accent-red, #ef4444)', bg: 'rgba(239, 68, 68, 0.1)' },
];

export const FirmwareAccordion: React.FC<FirmwareAccordionProps> = ({
  slots,
  onUpdateSlotsBatch,
  onResetAll,
  binaries,
  devices,
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

    const updates: { slotKey: keyof FirmwareSlotsMap; fileItem: BinaryItem | null }[] = [
      { slotKey, fileItem: selectedItem },
    ];

    // Auto-populate companion slots if AP is picked
    if (slotKey === 'ap') {
      const baseDir = selectedItem.path.substring(0, selectedItem.path.lastIndexOf('/') + 1) ||
                      selectedItem.path.substring(0, selectedItem.path.lastIndexOf('\\') + 1);

      ['bl', 'cp', 'csc', 'userdata'].forEach((k) => {
        const key = k as keyof FirmwareSlotsMap;
        const companion = binaries.find((b) => {
          const prefix = key.toUpperCase() + '_';
          const inSameDir = baseDir ? b.path.startsWith(baseDir) : true;
          return inSameDir && b.filename.toUpperCase().startsWith(prefix);
        });
        if (companion) {
          updates.push({ slotKey: key, fileItem: companion });
        }
      });
    }

    onUpdateSlotsBatch(updates);
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
          gap: '0.45rem',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Row 1: Title, Progress Ring, and Reset Button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
            <button type="button" className="btn btn-icon" style={{ padding: 0, flexShrink: 0, width: '26px', height: '26px' }}>
              {isOpen ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
            </button>

            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              FIRMWARE
            </span>

            {isApVerifying && (
              <div style={{ display: 'flex', alignItems: 'center', marginLeft: '0.35rem' }}>
                <ProgressRing
                  progress={slots.ap.progress}
                  size={24}
                  strokeWidth={2.5}
                  color="var(--accent-primary, #3b82f6)"
                  title={`Verifikasi AP MD5: ${slots.ap.progress}%`}
                />
              </div>
            )}
          </div>

          {/* Action Header: Reset Button */}
          {hasAnyFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={onResetAll}
                className="btn btn-sm btn-outline-danger"
                style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem', height: '30px', padding: '0 0.65rem', whiteSpace: 'nowrap' }}
                title="Reset seluruh file slot firmware"
              >
                <RotateCcwIcon size={13} /> Reset File
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
              padding: '0.15rem 0',
            }}
            onClick={(e) => e.stopPropagation()}
            title="Scroll/Drag horizontal untuk melihat nama file lengkap"
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
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
                className="firmware-slot-row ifta-slot-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.4rem 0.85rem',
                  height: '54px',
                  minHeight: '54px',
                  maxHeight: '54px',
                  boxSizing: 'border-box',
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
                  <>
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
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        height: '3px',
                        width: `${data.progress}%`,
                        backgroundColor: slot.color,
                        transition: 'width 0.15s ease-out',
                        zIndex: 2,
                      }}
                    />
                  </>
                )}

                {/* Ifta Content Area: Stacked Floating Label Top + Input Value Bottom */}
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
                    gap: '0.12rem',
                  }}
                >
                  {/* Ifta In-Field Floating Label */}
                  <div
                    className="ifta-slot-label"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      color: slot.color,
                      fontSize: '0.675rem',
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      lineHeight: 1,
                    }}
                  >
                    <FileCodeIcon size={12} style={{ flexShrink: 0 }} />
                    <span>{slot.label}</span>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.625rem', textTransform: 'none' }}>
                      &bull; {slot.name}
                    </span>
                  </div>

                  {/* Value / Filename / Placeholder */}
                  {isFilled ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, width: '100%' }}>
                      <div
                        style={{
                          overflowX: 'auto',
                          whiteSpace: 'nowrap',
                          scrollbarWidth: 'none',
                          WebkitOverflowScrolling: 'touch',
                          cursor: 'grab',
                          flex: 1,
                          minWidth: 0,
                        }}
                        title={data.filename}
                      >
                        <span
                          className="firmware-slot-filename"
                          style={{
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
                      {isVerifying && (
                        <span style={{ fontSize: '0.725rem', color: slot.color, fontWeight: 700, flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                          MD5: {data.progress}%
                        </span>
                      )}
                      {isVerified && <CheckIcon size={15} className="text-ready" style={{ flexShrink: 0 }} />}
                    </div>
                  ) : (
                    <span className="firmware-slot-placeholder" style={{ color: 'var(--text-muted)' }}>
                      Pilih file binary {slot.label}...
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0, position: 'relative', zIndex: 1 }}>
                  <button
                    type="button"
                    onClick={() => setActiveSlotModal(slot.key)}
                    className="btn btn-sm btn-slot-pick"
                    style={{
                      fontSize: '0.825rem',
                      height: '32px',
                      minHeight: '32px',
                      padding: '0 0.85rem',
                      fontWeight: 700,
                      backgroundColor: slot.bg,
                      color: slot.color,
                      border: `1px solid ${slot.color}`,
                    }}
                  >
                    {isFilled ? 'Ganti' : 'Pilih'}
                  </button>

                  {isFilled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateSlotsBatch([{ slotKey: slot.key, fileItem: null }]);
                      }}
                      className="btn btn-icon btn-sm"
                      style={{ height: '32px', minHeight: '32px', width: '32px', padding: 0 }}
                      title={`Hapus file ${slot.label}`}
                    >
                      <CloseIcon size={14} />
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
          devices={devices}
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
