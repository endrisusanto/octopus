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
}

export const FleetHeader: React.FC<FleetHeaderProps> = ({
  bridges,
  devices,
  isConnected,
  onRefresh,
}) => {
  const odinCount = devices.filter((d) => d.mode === 'odin').length;
  const adbCount = devices.filter((d) => d.mode === 'adb').length;
  const activeFlashCount = devices.filter((d) => d.status === 'Flashing...').length;

  return (
    <header className="header-bar">
      <div className="brand-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: '#0969da',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <ServerIcon size={16} />
          </div>
          <div>
            <h1 className="brand-title">OCTOPUS FLEET HUB</h1>
            <div className="brand-subtitle">Distributed Web-Managed Provisioning Suite</div>
          </div>
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

        <div
          className="stat-pill"
          style={{
            borderColor: isConnected ? 'var(--status-ready-border)' : 'var(--status-fail-border)',
            color: isConnected ? 'var(--status-ready-text)' : 'var(--status-fail-text)',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isConnected ? 'var(--status-ready-text)' : 'var(--status-fail-text)',
            }}
          />
          <span>{isConnected ? 'Hub Online' : 'Hub Reconnecting'}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          onClick={() => onRefresh && onRefresh()}
          className="btn btn-sm"
          title="Trigger Silent Update on all connected PC Bridges"
          style={{ fontSize: '0.75rem' }}
        >
          Update Agent
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
};
