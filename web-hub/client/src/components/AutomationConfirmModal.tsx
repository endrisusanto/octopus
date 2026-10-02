import React, { useState, useEffect } from 'react';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { WorkflowConfig } from './WorkflowStepper';

interface AutomationConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (postTorch: boolean, postSound: boolean) => void;
  targetDeviceIds: string[];
  devices: DeviceItem[];
  workflowConfig: WorkflowConfig;
  apFilename?: string;
  torchMode?: 'flash' | 'screen' | 'tweet';
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
  const [postTorch, setPostTorch] = useState<boolean>(torchMode !== 'tweet');
  const [postSound, setPostSound] = useState<boolean>(torchMode === 'tweet');

  useEffect(() => {
    if (isOpen) {
      setPostTorch(torchMode !== 'tweet');
      setPostSound(torchMode === 'tweet');
    }
  }, [isOpen, torchMode]);

  if (!isOpen || targetDeviceIds.length === 0) return null;

  const targetDevices = devices.filter((d) => targetDeviceIds.includes(d.id));
  const count = targetDevices.length;

  const handleStart = () => {
    onConfirm(postTorch, postSound);
    onClose();
  };

  return (
    <div className="automation-confirm-backdrop" onClick={onClose}>
      <div className="automation-confirm-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Jalankan Automasi
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              {count} perangkat siap diproses
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-icon"
            style={{
              width: '26px',
              height: '26px',
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Target Devices Preview */}
        <div
          style={{
            backgroundColor: 'var(--bg-subtle, #0f172a)',
            borderRadius: '6px',
            padding: '0.5rem 0.65rem',
            border: '1px solid var(--border-subtle, #334155)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            maxHeight: '95px',
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            TARGET ({count}):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            {targetDevices.map((d) => (
              <span
                key={d.id}
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  backgroundColor: 'rgba(59, 130, 246, 0.12)',
                  color: 'var(--accent-primary, #60a5fa)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  padding: '0.1rem 0.35rem',
                  borderRadius: '3px',
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
            gap: '0.3rem',
            fontSize: '0.7rem',
          }}
        >
          {apFilename && (
            <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', padding: '0.15rem 0.45rem', borderRadius: '3px', color: '#60a5fa', fontWeight: 600 }}>
              Odin Flash
            </span>
          )}
          {workflowConfig.skipSuw && (
            <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', padding: '0.15rem 0.45rem', borderRadius: '3px', color: '#10b981', fontWeight: 600 }}>
              Skip SUW
            </span>
          )}
          {workflowConfig.setupGba && (
            <span style={{ backgroundColor: 'rgba(168, 85, 247, 0.12)', padding: '0.15rem 0.45rem', borderRadius: '3px', color: '#c084fc', fontWeight: 600 }}>
              Setup GBA
            </span>
          )}
          {workflowConfig.wifiEnabled && (
            <span style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)', padding: '0.15rem 0.45rem', borderRadius: '3px', color: '#f59e0b', fontWeight: 600 }}>
              Wi-Fi: {workflowConfig.wifiSsid}
            </span>
          )}
        </div>

        {/* Post Completed Action Checkboxes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {/* Torch Option */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              cursor: 'pointer',
              userSelect: 'none',
              backgroundColor: postTorch ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-subtle, #0f172a)',
              border: postTorch ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border-subtle, #334155)',
              borderRadius: '8px',
              padding: '0.5rem 0.65rem',
              transition: 'all 0.15s ease',
            }}
          >
            <input
              type="checkbox"
              checked={postTorch}
              onChange={(e) => setPostTorch(e.target.checked)}
              style={{
                width: '16px',
                height: '16px',
                cursor: 'pointer',
                accentColor: '#f59e0b',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: postTorch ? '#f59e0b' : 'var(--text-primary)' }}>
                Senter ({torchMode === 'screen' ? 'Layar 100%' : 'Flash'})
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.2 }}>
                Visual saat Pass
              </div>
            </div>
          </label>

          {/* Sound Option */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              cursor: 'pointer',
              userSelect: 'none',
              backgroundColor: postSound ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-subtle, #0f172a)',
              border: postSound ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--border-subtle, #334155)',
              borderRadius: '8px',
              padding: '0.5rem 0.65rem',
              transition: 'all 0.15s ease',
            }}
          >
            <input
              type="checkbox"
              checked={postSound}
              onChange={(e) => setPostSound(e.target.checked)}
              style={{
                width: '16px',
                height: '16px',
                cursor: 'pointer',
                accentColor: '#3b82f6',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: postSound ? '#60a5fa' : 'var(--text-primary)' }}>
                Suara (Tweet)
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.2 }}>
                Audio saat selesai
              </div>
            </div>
          </label>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.2rem' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-outline"
            style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem' }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleStart}
            className="btn btn-primary"
            style={{
              fontSize: '0.78rem',
              padding: '0.4rem 1rem',
              fontWeight: 700,
              boxShadow: '0 0 14px rgba(59, 130, 246, 0.35)',
            }}
          >
            Jalankan ({count})
          </button>
        </div>
      </div>
    </div>
  );
};
