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

  if (!Array.isArray(devices) || devices.length === 0) return null;

  // Group summary by model
  const modelCounts: Record<string, number> = {};
  devices.forEach((d) => {
    if (!d) return;
    const modelKey = d.model || 'UNKNOWN';
    modelCounts[modelKey] = (modelCounts[modelKey] || 0) + 1;
  });

  // Filter devices if a model chip is active
  const displayedDevices = modelFilter
    ? devices.filter((d) => d && d.model === modelFilter)
    : devices;

  const validStandbyDevices = displayedDevices.filter((d) => d && (!sourcePcId || d.pcId === sourcePcId));
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
      onUpdateWorkflowConfig((prev) => ({
        ...prev,
        [stepKey]: !prev[stepKey],
      }));
    }
  };

  const wifiLongPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isWifiLongPressedRef = React.useRef(false);

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
        }}
      >
        {/* =========================================================================
            DESKTOP HEADER LAYOUT (Screens >= 768px): Original Clean Single-Row Design
            ========================================================================= */}
        <div
          className="ready-desktop-header"
          style={{
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flex: 1 }}>
            <button type="button" className="btn btn-icon" style={{ padding: 0, flexShrink: 0, width: '26px', height: '26px' }}>
              {isOpen ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
            </button>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              DAFTAR PERANGKAT STANDBY ({displayedDevices.length}{modelFilter ? `/${devices.length}` : ''} Unit)
            </span>
            {selectedStandbyIds.length > 0 && (
              <span className="stat-pill active" style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem', whiteSpace: 'nowrap' }}>
                {selectedStandbyIds.length}/{displayedDevices.length} Dipilih
              </span>
            )}

            {/* Model Filter Chips inline on Desktop */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflowX: 'auto', marginLeft: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
              {modelFilter && (
                <button type="button" onClick={() => setModelFilter(null)} className="btn btn-sm btn-icon" style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', height: '24px' }}>
                  Semua
                </button>
              )}
              {Object.entries(modelCounts).map(([model, count]) => {
                const isActive = modelFilter === model;
                return (
                  <button
                    key={model}
                    type="button"
                    onClick={(e) => handleChipClick(model, e)}
                    className={`stat-pill ${isActive ? 'active' : ''}`}
                    style={{
                      fontSize: '0.7rem',
                      padding: '0.15rem 0.45rem',
                      cursor: 'pointer',
                      border: isActive ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      backgroundColor: isActive ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-subtle)',
                      color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      fontWeight: isActive ? 700 : 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {model} <strong>({count})</strong>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stepper & Action button inline on Desktop when devices are selected */}
          {selectedStandbyIds.length > 0 && workflowConfig && onRunAutomation && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => handleStepToggle('skipSuw')}
                  className={`btn-step-pill ${workflowConfig.skipSuw ? 'active-blue' : ''}`}
                  title="Lewati Setup Wizard"
                >
                  <CheckIcon size={12} /> SKIP SUW
                </button>
                <span style={{ color: 'var(--text-muted)' }}>&rsaquo;</span>
                <button
                  type="button"
                  onClick={() => handleStepToggle('setupGba')}
                  className={`btn-step-pill ${workflowConfig.setupGba ? 'active-purple' : ''}`}
                  title="Setup Google Basic Authentication"
                >
                  <CheckIcon size={12} /> SETUP GBA
                </button>
                <span style={{ color: 'var(--text-muted)' }}>&rsaquo;</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStepToggle('wifiEnabled');
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onOpenWifiModal) onOpenWifiModal();
                  }}
                  className={`btn-step-pill ${workflowConfig.wifiEnabled ? 'active-green' : ''}`}
                  title="Klik: Toggle Wi-Fi | Klik Kanan: Konfigurasi SSID/Password"
                >
                  <CheckIcon size={12} /> WIFI
                </button>
              </div>

              <button
                type="button"
                onClick={() => onRunAutomation(selectedStandbyIds)}
                className="btn btn-primary"
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.85rem',
                  height: '32px',
                  whiteSpace: 'nowrap',
                  cursor: isMd5Verifying ? 'not-allowed' : 'pointer',
                }}
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
                    <PlayIcon size={14} /> Jalankan Automasi ({selectedStandbyIds.length} Unit)
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* =========================================================================
            MOBILE HEADER LAYOUT (Screens < 768px): Touch-Optimized Stacked Rows
            ========================================================================= */}
        <div
          className="ready-mobile-header"
          style={{
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: '0.6rem',
            width: '100%',
          }}
        >
          {/* Row 1: Title & Count */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, overflow: 'hidden' }}>
              <button type="button" className="btn btn-icon" style={{ padding: 0, flexShrink: 0 }}>
                {isOpen ? <ChevronUpIcon size={15} /> : <ChevronDownIcon size={15} />}
              </button>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                DAFTAR PERANGKAT STANDBY ({displayedDevices.length}{modelFilter ? `/${devices.length}` : ''} Unit)
              </span>
            </div>

            {selectedStandbyIds.length > 0 && (
              <span
                className="stat-pill active"
                style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                {selectedStandbyIds.length}/{displayedDevices.length} Dipilih
              </span>
            )}
          </div>

          {/* Row 2: Conditional Workflow Automation Breadcrumb OR Model Filter Chips on Mobile */}
          {selectedStandbyIds.length > 0 && workflowConfig && onRunAutomation ? (
            <>
              {/* Fullwidth 1-Line Breadcrumb Steps on Mobile */}
              <div
                className="workflow-breadcrumb-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.2rem',
                  width: '100%',
                  flexWrap: 'nowrap',
                  whiteSpace: 'nowrap',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Step 1: SKIP SUW */}
                <button
                  type="button"
                  onClick={() => handleStepToggle('skipSuw')}
                  className={`btn-step-pill ${workflowConfig.skipSuw ? 'active-blue' : ''}`}
                  style={{ flex: 1, minWidth: 0, padding: '0.18rem 0.25rem', fontSize: '0.65rem', justifyContent: 'center' }}
                  title="Lewati Setup Wizard (SUW) setelah boot"
                >
                  <CheckIcon size={10} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>SKIP SUW</span>
                </button>

                <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', flexShrink: 0 }}>&rsaquo;</span>

                {/* Step 2: SETUP GBA */}
                <button
                  type="button"
                  onClick={() => handleStepToggle('setupGba')}
                  className={`btn-step-pill ${workflowConfig.setupGba ? 'active-purple' : ''}`}
                  style={{ flex: 1, minWidth: 0, padding: '0.18rem 0.25rem', fontSize: '0.65rem', justifyContent: 'center' }}
                  title="Setup Google Basic Authentication"
                >
                  <CheckIcon size={10} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>SETUP GBA</span>
                </button>

                <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', flexShrink: 0 }}>&rsaquo;</span>

                {/* Step 3: WIFI with Long Press on Mobile */}
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
                  className={`btn-step-pill ${workflowConfig.wifiEnabled ? 'active-green' : ''}`}
                  style={{ flex: 1, minWidth: 0, padding: '0.18rem 0.25rem', fontSize: '0.65rem', justifyContent: 'center' }}
                  title="Tap: Toggle Wi-Fi | Tahan / Klik Kanan: Konfigurasi SSID/Password"
                >
                  <CheckIcon size={10} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>WIFI</span>
                </button>
              </div>

              {/* Row 3: Run Automation Button on Mobile */}
              <div onClick={(e) => e.stopPropagation()} style={{ width: '100%' }}>
                <button
                  type="button"
                  onClick={() => onRunAutomation(selectedStandbyIds)}
                  className="btn btn-primary"
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    width: '100%',
                    height: '32px',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    borderRadius: 'var(--radius-md)',
                    cursor: isMd5Verifying ? 'not-allowed' : 'pointer',
                  }}
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
                      <RefreshIcon size={13} className="spin" /> Verify MD5 . . . {md5VerifyProgress}%
                    </span>
                  ) : (
                    <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <PlayIcon size={13} /> Jalankan Automasi ({selectedStandbyIds.length} Unit)
                    </span>
                  )}
                </button>
              </div>
            </>
          ) : (
            /* Model Summary Chips as 1-line Scrollable Filters on Mobile */
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                overflowX: 'auto',
                flexWrap: 'nowrap',
                whiteSpace: 'nowrap',
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch',
                width: '100%',
                paddingBottom: '2px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {modelFilter && (
                <button
                  type="button"
                  onClick={() => setModelFilter(null)}
                  className="btn btn-sm btn-icon"
                  style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', height: '24px', flexShrink: 0, whiteSpace: 'nowrap' }}
                  title="Reset Filter Model"
                >
                  Semua
                </button>
              )}

              {Object.entries(modelCounts).map(([model, count]) => {
                const isActive = modelFilter === model;
                return (
                  <button
                    key={model}
                    type="button"
                    onClick={(e) => handleChipClick(model, e)}
                    className={`stat-pill ${isActive ? 'active' : ''}`}
                    style={{
                      fontSize: '0.7rem',
                      padding: '0.15rem 0.45rem',
                      cursor: 'pointer',
                      border: isActive ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      backgroundColor: isActive ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-subtle)',
                      color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      fontWeight: isActive ? 700 : 500,
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                    }}
                    title={`Filter hanya model ${model}`}
                  >
                    {model} <strong>({count})</strong>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Body Accordion: Device Table */}
      {isOpen && (
        <div className="accordion-body" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <DeviceTableView
            devices={displayedDevices}
            selectedIds={selectedIds}
            sourcePcId={sourcePcId}
            onToggleSelect={onToggleSelect}
            onSelectAll={handleTableSelectAll}
            onOpenLogs={onOpenLogs}
            onAction={onAction}
            apFilename={apFilename}
            isFirmwareForModel={isFirmwareForModel}
          />
        </div>
      )}
    </div>
  );
};
