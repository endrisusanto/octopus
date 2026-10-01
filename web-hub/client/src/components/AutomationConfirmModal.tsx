import React, { useState } from 'react';
import { PlayIcon, CloseIcon, FlashlightIcon, SunIcon, CheckIcon } from './Icons';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { WorkflowConfig } from './WorkflowStepper';

interface AutomationConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (postTorch: boolean) => void;
  targetDeviceIds: string[];
  devices: DeviceItem[];
  workflowConfig: WorkflowConfig;
  apFilename?: string;
  torchMode?: 'flash' | 'screen';
}

export const AutomationConfirmModal: React.FC<AutomationConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  targetDeviceIds,
  devices,
  workflowConfig,
  apFilename,
  torchMode = 'flash',
}) => {
  const [postTorch, setPostTorch] = useState<boolean>(true);

  if (!isOpen || targetDeviceIds.length === 0) return null;

  const targetDevices = devices.filter((d) => targetDeviceIds.includes(d.id));
  const count = targetDevices.length;

  const handleStart = () => {
    onConfirm(postTorch);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 100000 }}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '520px',
          width: '94%',
          padding: '1.2rem 1.4rem',
          borderRadius: 'var(--radius-lg, 14px)',
          backgroundColor: 'var(--bg-surface, #1e293b)',
          border: '1px solid var(--border-subtle, #334155)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6), 0 0 32px rgba(59, 130, 246, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          animation: 'slideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
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
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary, #3b82f6)',
                flexShrink: 0,
              }}
            >
              <PlayIcon size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary, #f8fafc)', margin: 0 }}>
                Konfirmasi Jalankan Automasi
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a3b8)', margin: 0, marginTop: '2px' }}>
                Siap memproses <strong>{count} Perangkat</strong> secara terorkestrasikan
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-icon"
            style={{ width: '28px', height: '28px', color: 'var(--text-muted, #64748b)' }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Target Devices Preview */}
        <div
          style={{
            backgroundColor: 'var(--bg-subtle, #0f172a)',
            borderRadius: '8px',
            padding: '0.65rem 0.85rem',
            border: '1px solid var(--border-subtle, #334155)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem',
            maxHeight: '130px',
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary, #94a3b8)' }}>
            DAFTAR PERANGKAT TARGET ({count} UNIT):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {targetDevices.map((d) => (
              <span
                key={d.id}
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  backgroundColor: 'rgba(59, 130, 246, 0.12)',
                  color: 'var(--accent-primary, #60a5fa)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {d.model} &bull; {d.serial || d.id}
              </span>
            ))}
          </div>
        </div>

        {/* Workflow Steps Preview */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.4rem',
            fontSize: '0.72rem',
          }}
        >
          {apFilename && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px', color: 'var(--accent-primary, #60a5fa)', fontWeight: 600 }}>
              <CheckIcon size={12} /> Odin Flash
            </span>
          )}
          {workflowConfig.skipSuw && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px', color: '#10b981', fontWeight: 600 }}>
              <CheckIcon size={12} /> Skip SUW
            </span>
          )}
          {workflowConfig.setupGba && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', backgroundColor: 'rgba(168, 85, 247, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px', color: '#c084fc', fontWeight: 600 }}>
              <CheckIcon size={12} /> Setup GBA
            </span>
          )}
          {workflowConfig.wifiEnabled && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px', color: '#f59e0b', fontWeight: 600 }}>
              <CheckIcon size={12} /> Wi-Fi ({workflowConfig.wifiSsid})
            </span>
          )}
        </div>

        {/* Post Completed Action Checkbox (Torch Option) */}
        <div
          style={{
            backgroundColor: postTorch ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-subtle, #0f172a)',
            border: postTorch ? '1.5px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border-subtle, #334155)',
            borderRadius: '10px',
            padding: '0.75rem 0.9rem',
            transition: 'all 0.15s ease',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={postTorch}
              onChange={(e) => setPostTorch(e.target.checked)}
              style={{
                width: '18px',
                height: '18px',
                marginTop: '2px',
                cursor: 'pointer',
                accentColor: '#f59e0b',
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {torchMode === 'screen' ? (
                  <SunIcon size={15} style={{ color: postTorch ? '#f59e0b' : 'var(--text-secondary)' }} />
                ) : (
                  <FlashlightIcon size={15} fill={postTorch ? '#f59e0b' : 'none'} style={{ color: postTorch ? '#f59e0b' : 'var(--text-secondary)' }} />
                )}
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: postTorch ? '#f59e0b' : 'var(--text-primary, #f8fafc)' }}>
                  Nyalakan Senter ({torchMode === 'screen' ? 'Screen Brightness 100%' : 'Flash Kamera Belakang'}) Setelah Workflow Selesai
                </span>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #94a3b8)', margin: 0, marginTop: '3px', lineHeight: 1.35 }}>
                {torchMode === 'screen'
                  ? 'Layar perangkat akan otomatis menyala putih terang 100% di rak sampel fisik sebagai penanda visual jelas bahwa provisioning telah sukses 100% (Pass).'
                  : 'Flash HP akan otomatis menyala di rak sampel fisik sebagai penanda visual yang jelas bahwa seluruh proses provisioning telah sukses 100% (Pass).'}
              </p>
            </div>
          </label>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.25rem' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-outline"
            style={{ fontSize: '0.82rem', padding: '0.45rem 1rem' }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleStart}
            className="btn btn-primary"
            style={{
              fontSize: '0.82rem',
              padding: '0.45rem 1.25rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontWeight: 700,
              boxShadow: '0 0 16px rgba(59, 130, 246, 0.4)',
            }}
          >
            <PlayIcon size={14} />
            <span>Mulai Automasi ({count} Unit)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
