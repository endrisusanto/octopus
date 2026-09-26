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
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <WifiIcon size={18} />
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Konfigurasi Konek Wi-Fi</h3>
          </div>
          <button onClick={onClose} className="btn btn-icon">
            <CloseIcon size={16} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={localEnabled}
              onChange={(e) => setLocalEnabled(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
            />
            Aktifkan Auto-Connect Wi-Fi pada Provisioning
          </label>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              SSID / Nama Jaringan
            </label>
            <input
              type="text"
              className="search-input"
              style={{ paddingLeft: '0.75rem', marginTop: '0.35rem', width: '100%' }}
              placeholder="e.g. LAB-PROVISIONING-5G"
              value={localSsid}
              onChange={(e) => setLocalSsid(e.target.value)}
              required={localEnabled}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Password Wi-Fi (Kosongkan jika open)
            </label>
            <input
              type="password"
              className="search-input"
              style={{ paddingLeft: '0.75rem', marginTop: '0.35rem', width: '100%' }}
              placeholder="Password WPA2/WPA3"
              value={localPass}
              onChange={(e) => setLocalPass(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} className="btn">
              Batal
            </button>
            <button type="submit" className="btn btn-primary">
              Simpan Wi-Fi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
