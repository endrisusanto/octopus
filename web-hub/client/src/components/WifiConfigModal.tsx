import React, { useState } from 'react';
import { CloseIcon, WifiIcon } from './Icons';

interface WifiConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  ssid: string;
  password?: string;
  enabled: boolean;
  onSave: (config: { enabled: boolean; ssid: string; password?: string }) => void;
}

export const WifiConfigModal: React.FC<WifiConfigModalProps> = ({
  isOpen,
  onClose,
  ssid,
  password = '',
  enabled,
  onSave,
}) => {
  const [localSsid, setLocalSsid] = useState(ssid);
  const [localPass, setLocalPass] = useState(password);
  const [localEnabled, setLocalEnabled] = useState(enabled);

  React.useEffect(() => {
    if (isOpen) {
      setLocalSsid(ssid || 'RTT / IEEE 802.11');
      setLocalPass(password || '1234qwer');
      setLocalEnabled(enabled);
    }
  }, [isOpen, ssid, password, enabled]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      enabled: localEnabled,
      ssid: localSsid.trim(),
      password: localPass,
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.85rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <WifiIcon size={22} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Konfigurasi Konek Wi-Fi</h3>
          </div>
          <button onClick={onClose} className="btn btn-icon">
            <CloseIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer', fontSize: '0.925rem', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={localEnabled}
              onChange={(e) => setLocalEnabled(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
            />
            Aktifkan Auto-Connect Wi-Fi pada Provisioning
          </label>

          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              SSID / Nama Jaringan
            </label>
            <input
              type="text"
              className="search-input"
              style={{ paddingLeft: '0.85rem', marginTop: '0.4rem', width: '100%', fontSize: '0.925rem' }}
              placeholder="e.g. LAB-PROVISIONING-5G"
              value={localSsid}
              onChange={(e) => setLocalSsid(e.target.value)}
              required={localEnabled}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Password Wi-Fi (Kosongkan jika open)
            </label>
            <input
              type="password"
              className="search-input"
              style={{ paddingLeft: '0.85rem', marginTop: '0.4rem', width: '100%', fontSize: '0.925rem' }}
              placeholder="Password WPA2/WPA3"
              value={localPass}
              onChange={(e) => setLocalPass(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.75rem' }}>
            <button type="button" onClick={onClose} className="btn" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '0.5rem 1.25rem' }}>
              Simpan Wi-Fi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
