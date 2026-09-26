import React, { useState } from 'react';
import { CloseIcon, FileCodeIcon, RefreshIcon, CheckIcon } from './Icons';
import { BinaryItem } from '../hooks/useFleetWebSocket';

interface BinarySelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBinary: string;
  binaries: BinaryItem[];
  onSave: (binaryFile: string) => void;
  onRefreshBinaries?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export const BinarySelectModal: React.FC<BinarySelectModalProps> = ({
  isOpen,
  onClose,
  currentBinary,
  binaries,
  onSave,
  onRefreshBinaries,
}) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedPc, setSelectedPc] = useState('all');
  const [customBinary, setCustomBinary] = useState(currentBinary);

  if (!isOpen) return null;

  const uniquePcs = Array.from(new Set(binaries.map((b) => b.pcId)));

  const filteredBinaries = binaries.filter((b) => {
    const matchSearch =
      b.filename.toLowerCase().includes(searchFilter.toLowerCase()) ||
      b.path.toLowerCase().includes(searchFilter.toLowerCase());
    const matchPc = selectedPc === 'all' || b.pcId === selectedPc;
    return matchSearch && matchPc;
  });

  const handleSelectBinary = (filename: string) => {
    onSave(filename);
    onClose();
  };

  const handleSaveCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (customBinary.trim()) {
      onSave(customBinary.trim());
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileCodeIcon size={18} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Pilih Binary dari Bridge PC Workstations</h3>
          </div>
          <button onClick={onClose} className="btn btn-icon">
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="search-input"
            style={{ flex: 1, minWidth: '200px', paddingLeft: '0.75rem' }}
            placeholder="Cari file binary (.tar.md5, AP_...)"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />

          {uniquePcs.length > 0 && (
            <select
              className="filter-select"
              value={selectedPc}
              onChange={(e) => setSelectedPc(e.target.value)}
              style={{ minWidth: '150px' }}
            >
              <option value="all">Semua PC ({binaries.length} files)</option>
              {uniquePcs.map((pc) => (
                <option key={pc} value={pc}>
                  {pc} ({binaries.filter((b) => b.pcId === pc).length})
                </option>
              ))}
            </select>
          )}

          {onRefreshBinaries && (
            <button
              type="button"
              onClick={onRefreshBinaries}
              className="btn btn-sm"
              title="Minta semua PC bridge untuk scan ulang folder lokal firmware"
            >
              <RefreshIcon size={14} /> Scan Ulang
            </button>
          )}
        </div>

        {/* Binary List */}
        <div style={{ flex: 1, overflowY: 'auto', marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '320px', paddingRight: '0.25rem' }}>
          {binaries.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <div style={{ marginBottom: '0.4rem', fontWeight: 600 }}>Belum ada binary terdeteksi di folder Bridge PC</div>
              <div style={{ fontSize: '0.75rem' }}>
                Simpan file firmware (AP_*.tar.md5) pada folder lokal bridge (misal: <code>C:\FlashKit\Firmware</code> atau <code>/opt/flashkit/firmware</code>), atau masukkan nama file manual di bawah.
              </div>
            </div>
          ) : filteredBinaries.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Tidak ada file binary yang cocok dengan pencarian.
            </div>
          ) : (
            filteredBinaries.map((b) => {
              const isSelected = currentBinary === b.filename;
              return (
                <div
                  key={`${b.pcId}-${b.path}`}
                  onClick={() => handleSelectBinary(b.filename)}
                  className={`device-row ${isSelected ? 'selected' : ''}`}
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    backgroundColor: isSelected ? 'var(--bg-subtle)' : 'var(--bg-surface)',
                    transition: 'border-color 0.15s, background-color 0.15s',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.filename}
                      </span>
                      {isSelected && <CheckIcon size={14} className="text-ready" />}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>[{b.pcId}]</span> &bull; {b.path}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <span className="stat-pill" style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}>
                      {formatBytes(b.sizeBytes)}
                    </span>
                    <button
                      type="button"
                      className={`btn btn-sm ${isSelected ? 'btn-primary' : ''}`}
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                    >
                      {isSelected ? 'Terpilih' : 'Pilih'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Custom / Manual Input Form */}
        <form onSubmit={handleSaveCustom} style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="text"
            className="search-input"
            style={{ flex: 1, paddingLeft: '0.75rem' }}
            placeholder="Atau ketik nama binary manual (e.g. AP_S908BXXU2AVF1...)"
            value={customBinary}
            onChange={(e) => setCustomBinary(e.target.value)}
          />
          <button type="submit" className="btn btn-sm">
            Set Manual
          </button>
        </form>
      </div>
    </div>
  );
};
