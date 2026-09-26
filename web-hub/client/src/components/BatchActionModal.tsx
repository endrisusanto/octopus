import React, { useState } from 'react';
import { CloseIcon, PlayIcon, BoltIcon } from './Icons';

interface BatchActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  onExecuteBatch: (action: string, params: { apFilename?: string; command?: string }) => void;
  currentApFilename: string;
  onSetApFilename: (name: string) => void;
}

export const BatchActionModal: React.FC<BatchActionModalProps> = ({
  isOpen,
  onClose,
  selectedCount,
  onExecuteBatch,
  currentApFilename,
  onSetApFilename,
}) => {
  const [apInput, setApInput] = useState(currentApFilename);
  const [actionType, setActionType] = useState<'flash' | 'suw_bypass' | 'at_exploit'>('flash');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onSetApFilename(apInput);
    onExecuteBatch(actionType, { apFilename: apInput });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.85rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
            Batch Execution ({selectedCount} Devices Selected)
          </h3>
          <button onClick={onClose} className="btn btn-icon">
            <CloseIcon size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Action Type
            </label>
            <div style={{ display: 'flex', gap: '0.65rem', marginTop: '0.45rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${actionType === 'flash' ? 'btn-primary' : ''}`}
                onClick={() => setActionType('flash')}
                style={{ flex: 1, fontSize: '0.875rem', padding: '0.55rem' }}
              >
                <PlayIcon size={16} /> Flash Firmware
              </button>
              <button
                type="button"
                className={`btn btn-sm ${actionType === 'suw_bypass' ? 'btn-primary' : ''}`}
                onClick={() => setActionType('suw_bypass')}
                style={{ flex: 1, fontSize: '0.875rem', padding: '0.55rem' }}
              >
                <BoltIcon size={16} /> Bypass SUW
              </button>
            </div>
          </div>

          {actionType === 'flash' && (
            <div>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                AP Firmware File / Target Model Matcher
              </label>
              <input
                type="text"
                className="search-input"
                style={{ paddingLeft: '0.85rem', marginTop: '0.4rem', fontSize: '0.9rem' }}
                placeholder="e.g. AP_S908BXXU2AVF1_CL24220556.tar.md5"
                value={apInput}
                onChange={(e) => setApInput(e.target.value)}
              />
              <div style={{ fontSize: '0.785rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                Devices matching this firmware model will be sorted to the top and targeted.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '1rem' }}>
          <button onClick={onClose} className="btn" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
            Cancel
          </button>
          <button onClick={handleConfirm} className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '0.5rem 1.25rem' }}>
            Dispatch to {selectedCount} Devices
          </button>
        </div>
      </div>
    </div>
  );
};
