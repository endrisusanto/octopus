import React, { useState } from 'react';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { WorkflowConfig } from './WorkflowStepper';
import { DeviceTableView } from './DeviceTableView';
import { ChevronDownIcon, ChevronUpIcon, PlayIcon, CheckIcon, RefreshIcon } from './Icons';

interface ReadyDevicesAccordionProps {
  devices: DeviceItem[];
  selectedIds: string[];
  sourcePcId?: string;
  onToggleSelect: (deviceId: string) => void;
  onSelectAll: (deviceIds: string[]) => void;
  onOpenLogs: (pcId: string, deviceId: string) => void;
  onAction: (pcId: string, deviceId: string, action: string) => void;
  onToggleTorch?: (deviceId: string, pcId: string, serial?: string) => void;
  pendingTorchIds?: string[];
  onRunAutomation?: (deviceIds: string[]) => void;
  workflowConfig?: WorkflowConfig;
  onUpdateWorkflowConfig?: (updater: (prev: WorkflowConfig) => WorkflowConfig) => void;
  onOpenWifiModal?: () => void;
  apFilename?: string;
  isFirmwareForModel: (apFilename: string | undefined, modelName: string | undefined) => boolean;
  isMd5Verifying?: boolean;
  md5VerifyProgress?: number;
}

export const ReadyDevicesAccordion: React.FC<ReadyDevicesAccordionProps> = ({
  devices,
  selectedIds,
  sourcePcId,
  onToggleSelect,
  onSelectAll,
  onOpenLogs,
  onAction,
  onToggleTorch,
  pendingTorchIds,
  onRunAutomation,
  workflowConfig,
  onUpdateWorkflowConfig,
  onOpenWifiModal,
  apFilename,
  isFirmwareForModel,
  isMd5Verifying = false,
  md5VerifyProgress = 0,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [modelFilter, setModelFilter] = useState<string | null>(null);
  const wifiLongPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isWifiLongPressedRef = React.useRef(false);

  const validDevices = Array.isArray(devices) ? devices : [];

  // Group summary by model
  const modelCounts: Record<string, number> = {};
  validDevices.forEach((d) => {
    if (!d) return;
    const modelKey = d.model || 'UNKNOWN';
    modelCounts[modelKey] = (modelCounts[modelKey] || 0) + 1;
  });

  // Filter devices if a model chip is active
  const displayedDevices = modelFilter
    ? devices.filter((d) => d && d.model === modelFilter)
    : devices;

  const validStandbyDevices = displayedDevices.filter((d) => Boolean(d));
  const validStandbyIds = validStandbyDevices.map((d) => d.id);
  const selectedStandbyIds = validStandbyIds.filter((id) => (selectedIds || []).includes(id));
  const isAllStandbySelected = validStandbyIds.length > 0 && selectedStandbyIds.length === validStandbyIds.length;

  const handleTableSelectAll = () => {
    if (isAllStandbySelected) {
      onSelectAll((selectedIds || []).filter((id) => !validStandbyIds.includes(id)));
    } else {
      onSelectAll(Array.from(new Set([...selectedIds, ...validStandbyIds])));
    }
  };

  const handleChipClick = (model: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setModelFilter((prev) => (prev === model ? null : model));
  };

  const handleStepToggle = (stepKey: keyof WorkflowConfig) => {
    if (onUpdateWorkflowConfig) {
      onUpdateWorkflowConfig((prev) => {
        const currentVal = prev[stepKey];
        const isCurrentlyActive = currentVal !== false;
        return {
          ...prev,
          [stepKey]: !isCurrentlyActive,
        };
      });
    }
  };

  const handleWifiTouchStart = () => {
    isWifiLongPressedRef.current = false;
    wifiLongPressTimerRef.current = setTimeout(() => {
      isWifiLongPressedRef.current = true;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(50); } catch (_) {}
      }
      if (onOpenWifiModal) onOpenWifiModal();
    }, 500);
  };

  const handleWifiTouchEnd = () => {
    if (wifiLongPressTimerRef.current) {
      clearTimeout(wifiLongPressTimerRef.current);
      wifiLongPressTimerRef.current = null;
    }
  };

  const handleWifiClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isWifiLongPressedRef.current) {
      isWifiLongPressedRef.current = false;
      return;
    }
    handleStepToggle('wifiEnabled');
  };

  return (
    <div className="card accordion-card" style={{ marginBottom: '1rem' }}>
      {/* Header Accordion */}
      <div
        className="accordion-header ready-header-layout"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.45rem',
          padding: '0.75rem 1rem',
        }}
      >
        {/* Row 1: Title + Selection Count + Stepper / Automation Button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
            <button type="button" className="btn btn-icon" style={{ padding: 0, flexShrink: 0, width: '26px', height: '26px' }}>
              {isOpen ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
            </button>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              DAFTAR PERANGKAT STANDBY
            </span>
            {selectedStandbyIds.length > 0 && (
              <span className="stat-pill active" style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem', whiteSpace: 'nowrap' }}>
                {selectedStandbyIds.length}/{displayedDevices.length}
              </span>
            )}
          </div>

          {/* Stepper & Action button */}
          {workflowConfig && (
            <div className="ready-header-actions" onClick={(e) => e.stopPropagation()}>
              <div className="ready-stepper-row">
                <button
                  type="button"
                  onClick={() => handleStepToggle('skipSuw')}
                  className={`btn-step-pill ${workflowConfig.skipSuw !== false ? 'active-blue' : ''}`}
                  title="Lewati Setup Wizard"
                >
                  <CheckIcon size={12} /> <span>SKIP SUW</span>
                </button>
                <span style={{ color: 'var(--text-muted)' }}>&rsaquo;</span>
                <button
                  type="button"
                  onClick={() => handleStepToggle('setupGba')}
                  className={`btn-step-pill ${workflowConfig.setupGba !== false ? 'active-purple' : ''}`}
                  title="Setup Google Basic Authentication"
                >
                  <CheckIcon size={12} /> <span>SETUP GBA</span>
                </button>
                <span style={{ color: 'var(--text-muted)' }}>&rsaquo;</span>
                <button
                  type="button"
                  onTouchStart={handleWifiTouchStart}
                  onTouchEnd={handleWifiTouchEnd}
                  onTouchCancel={handleWifiTouchEnd}
                  onTouchMove={handleWifiTouchEnd}
                  onMouseDown={handleWifiTouchStart}
                  onMouseUp={handleWifiTouchEnd}
                  onMouseLeave={handleWifiTouchEnd}
                  onClick={handleWifiClick}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onOpenWifiModal) onOpenWifiModal();
                  }}
                  className={`btn-step-pill ${workflowConfig.wifiEnabled !== false ? 'active-green' : ''}`}
                  title="Klik: Toggle Wi-Fi | Tahan / Klik Kanan: Konfigurasi SSID/Password"
                >
                  <CheckIcon size={12} /> <span>WIFI</span>
                </button>
              </div>

              {selectedStandbyIds.length > 0 && onRunAutomation && (
                <button
                  type="button"
                  onClick={() => onRunAutomation(selectedStandbyIds)}
                  className="btn btn-primary ready-run-btn"
                  disabled={isMd5Verifying}
                  title={isMd5Verifying ? `Sedang memverifikasi MD5 checksum (${md5VerifyProgress}%)` : undefined}
                >
                  {isMd5Verifying && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        bottom: 0,
                        width: `${md5VerifyProgress}%`,
                        backgroundColor: 'rgba(59, 130, 246, 0.45)',
                        transition: 'width 0.2s linear',
                        pointerEvents: 'none',
                        zIndex: 0,
                      }}
                    />
                  )}
                  {isMd5Verifying ? (
                    <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <RefreshIcon size={14} className="spin" /> Verify MD5 . . . {md5VerifyProgress}%
                    </span>
                  ) : (
                    <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <PlayIcon size={14} fill="currentColor" /> Jalankan Automasi
                    </span>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Row 2: Model Filter Chips - 1 Line Horizontal Touch-Scrollable */}
        {Object.keys(modelCounts).length > 0 && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'nowrap',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              scrollbarWidth: 'none',
              WebkitOverflowScrolling: 'touch',
              gap: '0.35rem',
              marginTop: '0.15rem',
              paddingLeft: '2rem',
              paddingBottom: '2px',
              cursor: 'grab',
            }}
            onClick={(e) => e.stopPropagation()}
            title="Scroll/Geser horizontal untuk filter model"
          >
            {modelFilter && (
              <button
                type="button"
                onClick={() => setModelFilter(null)}
                className="binary-chip-btn active"
                style={{ fontSize: '0.72rem', height: '26px', flexShrink: 0 }}
                title="Tampilkan Semua Model"
              >
                <span>Semua</span>
                <span className="binary-chip-count">{displayedDevices.length}</span>
              </button>
            )}
            {Object.entries(modelCounts)
              .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
              .map(([model, count]) => {
                const isActive = modelFilter === model;
                return (
                  <button
                    key={model}
                    type="button"
                    onClick={(e) => handleChipClick(model, e)}
                    className={`binary-chip-btn ${isActive ? 'active' : ''}`}
                    style={{ fontSize: '0.72rem', height: '26px', flexShrink: 0 }}
                    title={`Filter hanya model ${model}`}
                  >
                    <span>{model}</span>
                    <span className="binary-chip-count">{count}</span>
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* Body Accordion: Device Table */}
      {isOpen && (
        <div className="accordion-body" style={{ borderTop: '1px solid var(--border-subtle)', padding: 0 }}>
          {displayedDevices.length === 0 ? (
            <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Tidak ada perangkat standby terdeteksi. Hubungkan perangkat Android via USB.
            </div>
          ) : (
            <DeviceTableView
              devices={displayedDevices}
              selectedIds={selectedIds}
              sourcePcId={sourcePcId}
              onToggleSelect={onToggleSelect}
              onSelectAll={handleTableSelectAll}
              onOpenLogs={onOpenLogs}
              onAction={onAction}
              onToggleTorch={onToggleTorch}
              pendingTorchIds={pendingTorchIds}
              apFilename={apFilename}
              isFirmwareForModel={isFirmwareForModel}
            />
          )}
        </div>
      )}
    </div>
  );
};
