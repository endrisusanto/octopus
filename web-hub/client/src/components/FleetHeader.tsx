import React from 'react';
import { ThemeToggle } from './ThemeToggle';
import { BridgeInfo } from '../hooks/useFleetWebSocket';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { ServerIcon, SmartphoneIcon } from './Icons';

interface FleetHeaderProps {
  bridges: BridgeInfo[];
  devices: DeviceItem[];
  isConnected: boolean;
  onRefresh?: () => void;
  onReloadDevices?: () => void;
  onOpenWebFlasher?: () => void;
}

export const FleetHeader: React.FC<FleetHeaderProps> = ({
  bridges,
  devices,
  isConnected,
  onRefresh,
  onReloadDevices,
  onOpenWebFlasher,
}) => {
  const odinCount = devices.filter((d) => d.mode === 'odin').length;
  const adbCount = devices.filter((d) => d.mode === 'adb').length;
  const activeFlashCount = devices.filter((d) => d.status === 'Flashing...').length;

  return (
    <header className="header-bar">
      <div
        className="brand-section"
        onClick={onOpenWebFlasher}
        title="⚡ Klik untuk Buka Direct Browser WebUSB Flasher"
        style={{
          cursor: onOpenWebFlasher ? 'pointer' : 'default',
          transition: 'all 0.15s ease',
          padding: '0.2rem 0.4rem',
          borderRadius: '8px',
        }}
        onMouseEnter={(e) => {
          if (onOpenWebFlasher) {
            e.currentTarget.style.backgroundColor = 'var(--bg-hover, rgba(255, 255, 255, 0.05))';
          }
        }}
        onMouseLeave={(e) => {
          if (onOpenWebFlasher) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        <img
          src="/logo-light.png"
          alt="Octopus Mascot"
          className="brand-logo"
          style={{
            width: '28px',
            height: '28px',
            objectFit: 'contain',
            display: 'block',
            flexShrink: 0,
          }}
        />
        <div className="brand-text">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <h1 className="brand-title">OCTOPUS HUB</h1>
            <span
              style={{
                fontSize: '0.625rem',
                fontWeight: 700,
                padding: '0.1rem 0.35rem',
                borderRadius: '4px',
                background: 'rgba(31, 111, 235, 0.15)',
                color: '#58a6ff',
                border: '1px solid rgba(31, 111, 235, 0.4)',
                letterSpacing: '0.04em',
              }}
            >
              WEBUSB
            </span>
          </div>
          <div className="brand-subtitle">Automated Odin Firmware Orchestration Engine</div>
        </div>
      </div>

      <div className="fleet-stats-bar">
        <div className="stat-pill active">
          <ServerIcon size={14} />
          <span>Bridges:</span>
          <span className="count">{bridges.length}</span>
        </div>

        <div className="stat-pill active">
          <SmartphoneIcon size={14} />
          <span>Devices:</span>
          <span className="count">{devices.length}</span>
        </div>

        <div className="stat-pill">
          <span>Odin:</span>
          <span className="count" style={{ color: '#0969da' }}>{odinCount}</span>
        </div>

        <div className="stat-pill">
          <span>ADB:</span>
          <span className="count" style={{ color: '#1a7f37' }}>{adbCount}</span>
        </div>

        {activeFlashCount > 0 && (
          <div className="stat-pill" style={{ borderColor: 'var(--status-flashing-border)' }}>
            <span>Flashing:</span>
            <span className="count" style={{ color: '#d29922' }}>{activeFlashCount}</span>
          </div>
        )}
      </div>

      {/* Action Group: Online Badge, Reload, Update, ThemeToggle - 1 inline row with equal height */}
      <div className="header-actions-row">
        <div
          className="stat-pill online-pill"
          style={{
            borderColor: isConnected ? 'var(--status-ready-border)' : 'var(--status-fail-border)',
            color: isConnected ? 'var(--status-ready-text)' : 'var(--status-fail-text)',
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: isConnected ? 'var(--status-ready-text)' : 'var(--status-fail-text)',
              flexShrink: 0,
            }}
          />
          <span>{isConnected ? 'Hub Online' : 'Hub Offline'}</span>
        </div>

        <button
          type="button"
          onClick={() => onReloadDevices && onReloadDevices()}
          className="btn btn-header-action"
          title="Reload udev rules dan refresh koneksi ADB pada seluruh Workstation PC"
        >
          Reload
        </button>

        <button
          type="button"
          onClick={() => onRefresh && onRefresh()}
          className="btn btn-header-action"
          title="Trigger Silent Update on all connected PC Bridges"
        >
          Update
        </button>

        <ThemeToggle />
      </div>
    </header>
  );
};
