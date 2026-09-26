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
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
            Batch Execution ({selectedCount} Devices Selected)
          </h3>
          <button onClick={onClose} className="btn btn-icon">
            <CloseIcon size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Action Type
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${actionType === 'flash' ? 'btn-primary' : ''}`}
                onClick={() => setActionType('flash')}
                style={{ flex: 1 }}
              >
                <PlayIcon size={14} /> Flash Firmware
              </button>
              <button
                type="button"
                className={`btn btn-sm ${actionType === 'suw_bypass' ? 'btn-primary' : ''}`}
                onClick={() => setActionType('suw_bypass')}
                style={{ flex: 1 }}
              >
                <BoltIcon size={14} /> Bypass SUW
              </button>
            </div>
          </div>

          {actionType === 'flash' && (
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                AP Firmware File / Target Model Matcher
              </label>
              <input
                type="text"
                className="search-input"
                style={{ paddingLeft: '0.75rem', marginTop: '0.35rem' }}
                placeholder="e.g. AP_S908BXXU2AVF1_CL24220556.tar.md5"
                value={apInput}
                onChange={(e) => setApInput(e.target.value)}
              />
              <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                Devices matching this firmware model will be sorted to the top and targeted.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button onClick={onClose} className="btn">
            Cancel
          </button>
          <button onClick={handleConfirm} className="btn btn-primary">
            Dispatch to {selectedCount} Devices
          </button>
        </div>
      </div>
    </div>
  );
};
