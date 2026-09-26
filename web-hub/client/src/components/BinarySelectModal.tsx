import React, { useState } from 'react';
import { CloseIcon, FileCodeIcon } from './Icons';

interface BinarySelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBinary: string;
  onSave: (binaryFile: string) => void;
}

export const BinarySelectModal: React.FC<BinarySelectModalProps> = ({
  isOpen,
  onClose,
  currentBinary,
  onSave,
}) => {
  const [binaryInput, setBinaryInput] = useState(currentBinary);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(binaryInput.trim());
    onClose();
  };

  const sampleBinaries = [
    'AP_S908BXXU2AVF1_CL24220556_QB53243178_REV01_user_low_ship_MULTI_CERT_meta_OS12.tar.md5',
    'AP_A536BXXU4BVK1_CL25241852_QB58931201_REV00_user_low_ship_MULTI_CERT_meta_OS13.tar.md5',
    'AP_A336BXXU5CWC1_CL26148301_QB63210492_REV00_user_low_ship_MULTI_CERT_meta_OS13.tar.md5',
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileCodeIcon size={18} />
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Pilih Odin AP Binary Firmware</h3>
          </div>
          <button onClick={onClose} className="btn btn-icon">
            <CloseIcon size={16} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Nama File Binary AP (.tar / .tar.md5)
            </label>
            <input
              type="text"
              className="search-input"
              style={{ paddingLeft: '0.75rem', marginTop: '0.35rem', width: '100%' }}
              placeholder="e.g. AP_S908BXXU2AVF1..."
              value={binaryInput}
              onChange={(e) => setBinaryInput(e.target.value)}
            />
            <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Device yang cocok dengan model binary akan otomatis diurutkan ke prioritas teratas (*FlashKit Sort*).
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Preset / Contoh Binary Cepat:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {sampleBinaries.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setBinaryInput(s)}
                  className="btn btn-sm"
                  style={{
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    justifyContent: 'flex-start',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} className="btn">
              Batal
            </button>
            <button type="submit" className="btn btn-primary">
              Simpan Binary
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
