import React, { useState, useMemo } from 'react';
import { CloseIcon, FileCodeIcon, RefreshIcon, CheckIcon, DownloadIcon } from './Icons';
import { BinaryItem } from '../hooks/useFleetWebSocket';
import { extractModelFromFirmware, extractCoreModel, DeviceItem } from '../hooks/useFlashKitSort';

interface BinarySelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBinary: string;
  binaries: BinaryItem[];
  devices?: DeviceItem[];
  onSave: (binaryFile: string) => void;
  onRefreshBinaries?: () => void;
  onCopyBinary?: (sourcePcId: string, targetPcId: string, filename: string, path?: string) => void;
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
  devices,
  onSave,
  onRefreshBinaries,
  onCopyBinary,
}) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedPc, setSelectedPc] = useState('all');
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const uniquePcs = Array.from(new Set(binaries.map((b) => b.pcId)));

  // Set of connected models currently online/ready in the fleet
  const connectedModelSet = useMemo(() => {
    const set = new Set<string>();
    if (!devices) return set;
    for (const d of devices) {
      if (d.mode === 'offline' || d.status === 'Offline') continue;
      const core = extractCoreModel(d.model);
      if (core && core.length >= 3 && core !== 'ODIN' && core !== 'DEVICE' && core !== 'UNKNOWN') {
        set.add(core.toUpperCase());
      }
    }
    return set;
  }, [devices]);

  const isModelConnected = (model: string): boolean => {
    if (connectedModelSet.size === 0) return false;
    const cleanChip = extractCoreModel(model).toUpperCase();
    if (!cleanChip) return false;
    for (const connected of connectedModelSet) {
      if (connected.includes(cleanChip) || cleanChip.includes(connected)) {
        return true;
      }
    }
    return false;
  };

  // Extract model frequency counts from all available binaries
  const { modelCounts, availableModels } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of binaries) {
      const model = extractModelFromFirmware(b.filename);
      if (model) {
        counts[model] = (counts[model] || 0) + 1;
      }
    }
    // Sort models ASC (e.g. A065F, A266B, F741B, S926B...)
    const models = Object.keys(counts).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );
    return { modelCounts: counts, availableModels: models };
  }, [binaries]);

  if (!isOpen) return null;

  const filteredBinaries = binaries.filter((b) => {
    const matchSearch =
      b.filename.toLowerCase().includes(searchFilter.toLowerCase()) ||
      b.path.toLowerCase().includes(searchFilter.toLowerCase());
    const matchPc = selectedPc === 'all' || b.pcId === selectedPc;
    
    let matchModel = true;
    if (selectedModel) {
      const detected = extractModelFromFirmware(b.filename);
      matchModel = detected === selectedModel || b.filename.toUpperCase().includes(selectedModel.toUpperCase());
    }

    return matchSearch && matchPc && matchModel;
  });

  const handleSelectBinary = (filename: string) => {
    onSave(filename);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card binary-select-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '1100px', width: '92vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="binary-modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.65rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <FileCodeIcon size={20} className="binary-modal-icon" />
            <h3 className="binary-modal-title" style={{ fontWeight: 700, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Pilih Binary Firmware
            </h3>
          </div>
          <button onClick={onClose} className="btn btn-icon" style={{ flexShrink: 0 }}>
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="binary-modal-toolbar">
          <input
            type="text"
            className="search-input binary-modal-search"
            placeholder="Cari file binary (.tar.md5, AP_...)"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />

          <div className="binary-modal-actions-row">
            {uniquePcs.length > 0 && (
              <select
                className="filter-select binary-modal-select"
                value={selectedPc}
                onChange={(e) => setSelectedPc(e.target.value)}
              >
                <option value="all">Semua Workstation PC ({binaries.length})</option>
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
                className="btn btn-sm binary-modal-scan-btn"
                title="Scan ulang folder lokal firmware di semua PC bridge"
              >
                <RefreshIcon size={14} />
                <span className="binary-modal-scan-text">Scan Ulang</span>
              </button>
            )}
          </div>
        </div>

        {/* Model Filter Chips */}
        {availableModels.length > 0 && (
          <div className="binary-modal-chips-wrapper">
            <div className="binary-modal-chips-row">
              <button
                type="button"
                onClick={() => setSelectedModel(null)}
                className={`binary-chip-btn ${!selectedModel ? 'active' : ''}`}
              >
                <span>Semua Model</span>
                <span className="binary-chip-count">{binaries.length}</span>
              </button>
              {availableModels.map((model) => {
                const count = modelCounts[model];
                const isActive = selectedModel === model;
                const isConnected = isModelConnected(model);
                return (
                  <button
                    key={model}
                    type="button"
                    onClick={() => setSelectedModel((prev) => (prev === model ? null : model))}
                    className={`binary-chip-btn ${isActive ? 'active' : ''} ${isConnected ? 'is-connected' : ''}`}
                    title={isConnected ? `Model ${model} terhubung dan aktif di Workstation PC` : undefined}
                  >
                    <span>{model}</span>
                    <span className="binary-chip-count">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Binary List */}
        <div
          className="binary-modal-list"
          style={{
            flex: 1,
            overflowY: 'auto',
            marginTop: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem',
            maxHeight: '560px',
            minHeight: '200px',
            paddingRight: '0.25rem',
          }}
        >
          {binaries.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              <div style={{ marginBottom: '0.5rem', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Belum ada binary terdeteksi di folder Bridge PC</div>
              <div style={{ fontSize: '0.85rem', lineHeight: '1.6' }}>
                Simpan file firmware (AP_*.tar.md5 / .tar / .zip) pada folder lokal bridge (misal: semua partisi <code>C:\</code> s/d <code>Z:\</code> di Windows, atau <code>/run/media</code> / <code>/media</code> di Ubuntu/Linux).
              </div>
            </div>
          ) : filteredBinaries.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Tidak ada file binary yang cocok dengan pencarian.
            </div>
          ) : (
            filteredBinaries.map((b) => {
              const isSelected = currentBinary === b.filename;
              return (
                <div
                  key={`${b.pcId}-${b.path}`}
                  onClick={() => handleSelectBinary(b.filename)}
                  className={`device-row binary-item-row ${isSelected ? 'selected' : ''}`}
                  style={{
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${isSelected ? 'var(--border-active)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.65rem',
                    backgroundColor: isSelected ? 'var(--bg-subtle)' : 'var(--bg-surface)',
                    transition: 'border-color 0.15s, background-color 0.15s',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                      <span
                        className="binary-item-filename"
                        style={{
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono, monospace)',
                          letterSpacing: '-0.01em',
                          color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block',
                        }}
                      >
                        {b.filename}
                      </span>
                      {isSelected && <CheckIcon size={14} className="text-ready" style={{ flexShrink: 0 }} />}
                    </div>
                    <div className="binary-item-meta" style={{ color: 'var(--text-muted)', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>[{b.pcId}]</span> &bull; {b.path}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                    <span className="stat-pill binary-item-size" style={{ fontWeight: 700 }}>
                      {formatBytes(b.sizeBytes)}
                    </span>

                    {onCopyBinary && uniquePcs.filter((p) => p !== b.pcId).map((targetPc) => (
                      <button
                        key={targetPc}
                        type="button"
                        className="btn btn-sm binary-item-copy-btn"
                        title={`Salin firmware ini ke folder ${targetPc}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCopyBinary(b.pcId, targetPc, b.filename, b.path);
                        }}
                      >
                        <DownloadIcon size={13} />
                        <span>Salin ke {targetPc}</span>
                      </button>
                    ))}

                    <button
                      type="button"
                      className={`btn btn-sm binary-item-btn ${isSelected ? 'btn-primary' : ''}`}
                    >
                      {isSelected ? 'Terpilih' : 'Pilih'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
