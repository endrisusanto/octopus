import React, { useEffect } from 'react';

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVersion?: string;
  bridgeCount?: number;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  currentVersion = '1.0.32',
  bridgeCount = 0,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '460px',
          width: '92vw',
          padding: '1.25rem',
          borderRadius: 'var(--radius-lg, 8px)',
          border: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Pembaruan Sistem
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-icon"
            style={{ padding: '0.2rem', height: '24px', width: '24px', lineHeight: 1 }}
            title="Tutup"
          >
            &times;
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '0.85rem 0', display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Versi Saat Ini:</span>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--accent-primary)' }}>
              v{currentVersion}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Node Bridge Aktif:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {bridgeCount} Workstation PC
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Status Auto-Updater:</span>
            <span style={{ color: 'var(--accent-green, #10b981)', fontWeight: 600 }}>
              Aktif (Silent Update)
            </span>
          </div>

          <div
            style={{
              padding: '0.65rem 0.75rem',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 4px)',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              marginTop: '0.25rem',
            }}
          >
            Node bridge melakukan pengecekan berkala terhadap rilis bertanda tangan pada repositori GitHub. Paket biner baru otomatis diunduh dan diterapkan saat idle.
          </div>
        </div>

        {/* Actions Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm"
            style={{ padding: '0.35rem 0.75rem' }}
          >
            Tutup
          </button>
          <a
            href="https://github.com/endrisusanto/octopus/releases"
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm btn-primary"
            style={{ padding: '0.35rem 0.75rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            Buka Rilis GitHub
          </a>
        </div>
      </div>
    </div>
  );
};
