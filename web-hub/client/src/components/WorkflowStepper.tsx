import React from 'react';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { CheckIcon, PlayIcon } from './Icons';

export interface WorkflowConfig {
  binaryFile: string;
  skipSuw: boolean;
  setupGba: boolean;
  wifiEnabled: boolean;
  wifiSsid: string;
  wifiPassword?: string;
}

interface WorkflowStepperProps {
  devices: DeviceItem[];
  selectedIds: string[];
  config: WorkflowConfig;
  onChangeConfig: (newConfig: Partial<WorkflowConfig>) => void;
  onOpenBinaryModal: () => void;
  onOpenWifiModal: () => void;
  onExecuteWorkflow: () => void;
}

export const WorkflowStepper: React.FC<WorkflowStepperProps> = ({
  devices,
  selectedIds,
  config,
  onChangeConfig,
  onOpenBinaryModal,
  onOpenWifiModal,
  onExecuteWorkflow,
}) => {
  const selectedCount = selectedIds.length;
  const flashingCount = devices.filter((d) => d.status === 'Flashing...').length;
  const passedCount = devices.filter((d) => d.status === 'Pass').length;

  const isBinaryDone = Boolean(config.binaryFile.trim());
  const isSuwDone = config.skipSuw;
  const isGbaDone = config.setupGba;
  const isWifiDone = config.wifiEnabled && Boolean(config.wifiSsid.trim());

  return (
    <section className="workflow-stepper" aria-label="Octopus Provisioning Checklist">
      <div className="stepper-track">
        {/* Step 1: Pilih Binary */}
        <div
          className={`stepper-item ${isBinaryDone ? 'completed' : 'active'} clickable`}
          onClick={onOpenBinaryModal}
          title="Klik untuk memilih file firmware / AP Binary"
        >
          <div className="step-badge">
            {isBinaryDone ? <CheckIcon size={12} /> : '1'}
          </div>
          <div className="step-content">
            <span className="step-label">1. Pilih Binary</span>
            <span className="step-meta" style={{ maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isBinaryDone ? config.binaryFile : 'Pilih AP Binary...'}
            </span>
          </div>
        </div>

        <div className="step-divider" />

        {/* Step 2: Skip SUW */}
        <div
          className={`stepper-item ${isSuwDone ? 'completed' : 'pending'} clickable`}
          onClick={() => onChangeConfig({ skipSuw: !config.skipSuw })}
          title="Klik untuk toggle bypass Setup Wizard (SUW)"
        >
          <div className="step-badge">
            {isSuwDone ? <CheckIcon size={12} /> : '2'}
          </div>
          <div className="step-content">
            <span className="step-label">2. Skip SUW</span>
            <span className="step-meta">
              {isSuwDone ? 'Bypass Aktif' : 'Nonaktif (Klik ON)'}
            </span>
          </div>
        </div>

        <div className="step-divider" />

        {/* Step 3: Setup GBA */}
        <div
          className={`stepper-item ${isGbaDone ? 'completed' : 'pending'} clickable`}
          onClick={() => onChangeConfig({ setupGba: !config.setupGba })}
          title="Klik untuk toggle Google Basic Apps (GBA) Profile Setup"
        >
          <div className="step-badge">
            {isGbaDone ? <CheckIcon size={12} /> : '3'}
          </div>
          <div className="step-content">
            <span className="step-label">3. Setup GBA</span>
            <span className="step-meta">
              {isGbaDone ? 'GBA Aktif' : 'Nonaktif (Klik ON)'}
            </span>
          </div>
        </div>

        <div className="step-divider" />

        {/* Step 4: Konek Wi-Fi */}
        <div
          className={`stepper-item ${isWifiDone ? 'completed' : 'pending'} clickable`}
          onClick={onOpenWifiModal}
          title="Klik untuk atur SSID & Password Wi-Fi otomatis"
        >
          <div className="step-badge">
            {isWifiDone ? <CheckIcon size={12} /> : '4'}
          </div>
          <div className="step-content">
            <span className="step-label">4. Konek Wi-Fi</span>
            <span className="step-meta" style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isWifiDone ? config.wifiSsid : 'Atur Wi-Fi...'}
            </span>
          </div>
        </div>

        <div className="step-divider" />

        {/* Step 5: Eksekusi Workflow */}
        <div className="stepper-action" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {flashingCount > 0 && (
            <span className="stat-pill" style={{ borderColor: 'var(--status-flashing-border)', color: '#d29922' }}>
              {flashingCount} Flashing...
            </span>
          )}
          {passedCount > 0 && (
            <span className="stat-pill" style={{ borderColor: '#2ea043', color: '#3fb950' }}>
              {passedCount} Pass
            </span>
          )}

          <button
            onClick={onExecuteWorkflow}
            className="btn btn-primary btn-sm"
            disabled={selectedCount === 0}
            title={selectedCount === 0 ? 'Pilih minimal 1 device' : `Jalankan workflow provisioning pada ${selectedCount} devices`}
            style={{ fontWeight: 700, padding: '0.4rem 0.85rem' }}
          >
            <PlayIcon size={13} /> Run Workflow ({selectedCount})
          </button>
        </div>
      </div>
    </section>
  );
};
