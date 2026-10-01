import React, { useEffect } from 'react';
import { AlertCircleIcon, CloseIcon, FileCodeIcon, ArrowRightIcon, StopIcon } from './Icons';

interface CancelTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  filename: string;
  sourcePcId?: string;
  targetPcId: string;
}

export const CancelTransferModal: React.FC<CancelTransferModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  filename,
  sourcePcId,
  targetPcId,
}) => {
  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ zIndex: 100005, backdropFilter: 'blur(4px)' }}
    >
      <div
        className="modal-card modal-wiggle-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '460px',
          width: '94%',
          padding: '1.25rem 1.4rem',
          borderRadius: 'var(--radius-lg, 14px)',
          backgroundColor: 'var(--bg-surface, #1e293b)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6), 0 0 28px rgba(239, 68, 68, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--fail-color, #ef4444)',
                flexShrink: 0,
              }}
            >
              <AlertCircleIcon size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary, #f8fafc)', margin: 0 }}>
                Batalkan Transfer Firmware?
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a3b8)', margin: 0, marginTop: '2px' }}>
                Konfirmasi pembatalan transfer berkas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-icon"
            style={{ width: '28px', height: '28px', color: 'var(--text-muted, #64748b)' }}
            aria-label="Tutup"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Transfer Item Details Preview */}
        <div
          style={{
            backgroundColor: 'var(--bg-subtle, #0f172a)',
            borderRadius: '8px',
            padding: '0.75rem 0.9rem',
            border: '1px solid var(--border-subtle, #334155)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.75rem' }}>
            <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>[{sourcePcId || 'Hub'}]</span>
            <ArrowRightIcon size={11} />
            <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-primary, #60a5fa)' }}>[{targetPcId}]</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
            <FileCodeIcon size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: 'var(--text-primary, #f8fafc)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={filename}
            >
              {filename}
            </span>
          </div>
        </div>

        {/* Explanation Alert Note */}
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary, #94a3b8)',
            lineHeight: 1.45,
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '8px',
            padding: '0.6rem 0.8rem',
          }}
        >
          Proses pengiriman firmware akan dihentikan dan file sementara (<code>.part</code>) pada node target <strong>[{targetPcId}]</strong> akan otomatis dihapus.
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.25rem' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-outline"
            style={{ fontSize: '0.82rem', padding: '0.45rem 1rem' }}
          >
            Kembali
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="btn btn-danger"
            style={{
              fontSize: '0.82rem',
              padding: '0.45rem 1.25rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontWeight: 700,
              backgroundColor: 'var(--fail-color, #ef4444)',
              color: '#ffffff',
              border: 'none',
              boxShadow: '0 0 16px rgba(239, 68, 68, 0.4)',
              cursor: 'pointer',
              borderRadius: 'var(--radius-md, 8px)',
            }}
          >
            <StopIcon size={14} />
            <span>Ya, Batalkan Transfer</span>
          </button>
        </div>
      </div>
    </div>
  );
};
