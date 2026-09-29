import React, { useState, useRef } from 'react';
import { FlashlightIcon, RotateCcwIcon, CloseIcon } from './Icons';
import { LedAnimationModal } from './LedAnimationModal';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { RackCalibrationData } from '../hooks/useFleetWebSocket';

interface BulkActionBarProps {
  selectedIds: string[];
  devices: DeviceItem[];
  rackCalibration: RackCalibrationData | null;
  onSaveCalibration: (calib: RackCalibrationData) => void;
  onBlinkDevice: (serial: string) => void;
  onDeselectAll: () => void;
  onToggleTorchBulk: (deviceIds: string[], state: 'on' | 'off') => void;
  onDispatchActionBulk: (deviceIds: string[], action: string, params?: any) => void;
  pendingTorchIds?: string[];
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedIds,
  devices,
  rackCalibration,
  onSaveCalibration,
  onBlinkDevice,
  onDeselectAll,
  onToggleTorchBulk,
  onDispatchActionBulk,
  pendingTorchIds,
}) => {
  const [isLedModalOpen, setIsLedModalOpen] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressedRef = useRef(false);

  if (!selectedIds || selectedIds.length === 0) return null;

  const count = selectedIds.length;

  const handleTorch = (state: 'on' | 'off') => {
    onToggleTorchBulk(selectedIds, state);
  };

  const handleRebootSystem = () => {
    onDispatchActionBulk(selectedIds, 'reboot');
  };

  const handleStartAnimation = (preset: string, isLoop: boolean, speed: number = 0.12) => {
    onDispatchActionBulk(selectedIds, 'RUN_LED_ANIM', {
      preset,
      loop: isLoop,
      speed,
      devices: selectedIds,
    });
  };

  const handleStopAnimation = () => {
    onDispatchActionBulk(selectedIds, 'STOP_LED_ANIM', {});
  };

  // Touch handlers for mobile long-press
  const handleTouchStart = () => {
    isLongPressedRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressedRef.current = true;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(50); } catch (_) {}
      }
      setIsLedModalOpen(true);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTorchClick = () => {
    if (isLongPressedRef.current) {
      isLongPressedRef.current = false;
      return;
    }
    handleTorch('on');
  };

  return (
    <>
      <div
        className="bulk-action-bar"
        style={{
          position: 'fixed',
          bottom: '1.25rem',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.65rem',
          padding: '0.4rem 0.65rem',
          backgroundColor: 'var(--bg-surface, #1e293b)',
          border: '1px solid var(--accent-primary, #3b82f6)',
          borderRadius: 'var(--radius-lg, 12px)',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(59, 130, 246, 0.25)',
          backdropFilter: 'blur(12px)',
          animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          width: 'max-content',
          maxWidth: 'calc(100vw - 2rem)',
        }}
      >
        {/* Selected Count Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            paddingRight: '0.5rem',
            borderRight: '1px solid var(--border-subtle, #334155)',
            flexShrink: 0,
          }}
          title={`${count} perangkat terpilih`}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '22px',
              height: '22px',
              padding: '0 5px',
              borderRadius: '11px',
              backgroundColor: 'var(--accent-primary, #3b82f6)',
              color: '#fff',
              fontSize: '0.72rem',
              fontWeight: 800,
            }}
          >
            {count}
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: 'var(--text-secondary, #cbd5e1)',
              letterSpacing: '-0.01em',
            }}
          >
            Dipilih
          </span>
        </div>

        {/* 1-Line Fullwidth Connected Action Button Group */}
        <div
          className="bulk-action-btn-group"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-subtle, #0f172a)',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle, #334155)',
            padding: '2px',
            gap: '4px',
            flexShrink: 0,
          }}
        >
          {/* Action 1: Flash ON */}
          {(() => {
            const isAnyPending = Boolean(
              pendingTorchIds &&
              selectedIds.some((id) => pendingTorchIds.includes(id))
            );

            return (
              <button
                type="button"
                disabled={isAnyPending}
                onClick={handleTorchClick}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsLedModalOpen(true);
                }}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                onMouseDown={handleTouchStart}
                onMouseUp={handleTouchEnd}
                onMouseLeave={handleTouchEnd}
                className={`btn btn-sm ${isAnyPending ? 'flash-loading-shimmer' : ''}`}
                style={{
                  flex: '0 0 auto',
                  height: '32px',
                  padding: '0 0.65rem',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isAnyPending ? undefined : 'rgba(245, 158, 11, 0.15)',
                  color: 'var(--accent-warning, #f59e0b)',
                  border: isAnyPending ? undefined : '1px solid rgba(245, 158, 11, 0.35)',
                  cursor: isAnyPending ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
                title={isAnyPending ? 'Memverifikasi status flash perangkat...' : "Flash ON (Klik Kiri: Nyalakan | Klik Kanan/Tahan: Matrix 2D)"}
              >
                <FlashlightIcon size={14} fill="currentColor" />
                <span className="bulk-btn-label">{isAnyPending ? 'CEK...' : 'Flash ON'}</span>
              </button>
            );
          })()}

          {/* Action 2: Flash OFF */}
          {(() => {
            const isAnyPending = Boolean(
              pendingTorchIds &&
              selectedIds.some((id) => pendingTorchIds.includes(id))
            );

            return (
              <button
                type="button"
                disabled={isAnyPending}
                onClick={() => handleTorch('off')}
                className={`btn btn-sm ${isAnyPending ? 'flash-loading-shimmer' : ''}`}
                style={{
                  flex: '0 0 auto',
                  height: '32px',
                  padding: '0 0.65rem',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isAnyPending ? undefined : 'transparent',
                  color: isAnyPending ? 'var(--accent-warning, #f59e0b)' : 'var(--text-secondary, #94a3b8)',
                  border: isAnyPending ? undefined : '1px solid transparent',
                  cursor: isAnyPending ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
                title={isAnyPending ? 'Memverifikasi status flash perangkat...' : "Flash OFF (Matikan Semua)"}
              >
                <FlashlightIcon size={14} fill="none" />
                <span className="bulk-btn-label">{isAnyPending ? 'CEK...' : 'Flash OFF'}</span>
              </button>
            );
          })()}

          {/* Action 3: 2D Matrix & Calibration Modal */}
          <button
            type="button"
            onClick={() => setIsLedModalOpen(true)}
            className="btn btn-sm"
            style={{
              flex: '0 0 auto',
              height: '32px',
              padding: '0 0.65rem',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              color: 'var(--accent-primary, #60a5fa)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
            title="Animasi Matrix 2D & Kalibrasi Rak 6x3"
          >
            <span role="img" aria-label="matrix" style={{ fontSize: '0.9rem' }}>🎆</span>
            <span className="bulk-btn-label">Matrix 2D</span>
          </button>

          {/* Action 4: Reboot System Normal */}
          <button
            type="button"
            onClick={handleRebootSystem}
            className="btn btn-sm"
            style={{
              flex: '0 0 auto',
              height: '32px',
              padding: '0 0.65rem',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent',
              color: 'var(--text-primary, #f8fafc)',
              border: '1px solid transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
            title="Reboot System (Normal)"
          >
            <RotateCcwIcon size={14} />
            <span className="bulk-btn-label">Reboot</span>
          </button>

          {/* Action 5: Deselect All */}
          <button
            type="button"
            onClick={onDeselectAll}
            className="btn btn-sm btn-icon"
            style={{
              flex: '0 0 auto',
              height: '32px',
              padding: '0 0.5rem',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent',
              color: 'var(--text-muted, #64748b)',
              border: '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Batalkan Pilihan"
          >
            <CloseIcon size={15} />
          </button>
        </div>
      </div>

      {/* Running LED Animation & Matrix Calibration Modal */}
      <LedAnimationModal
        isOpen={isLedModalOpen}
        onClose={() => setIsLedModalOpen(false)}
        selectedCount={count}
        devices={devices}
        rackCalibration={rackCalibration}
        onSaveCalibration={onSaveCalibration}
        onBlinkDevice={onBlinkDevice}
        onStartAnimation={handleStartAnimation}
        onStopAnimation={handleStopAnimation}
      />
    </>
  );
};
