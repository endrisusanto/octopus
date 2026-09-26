import React, { useState } from 'react';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { WorkflowConfig } from './WorkflowStepper';
import { ChevronDownIcon, ChevronUpIcon, PlayIcon, TerminalIcon, CheckIcon } from './Icons';

interface SuggestionMatchAccordionProps {
  matchedModel: string;
  apFilename: string;
  sourcePcId?: string;
  devices: DeviceItem[];
  selectedIds: string[];
  onToggleSelect: (deviceId: string) => void;
  onSelectAll: (deviceIds: string[]) => void;
  onRunAutomation: (deviceIds: string[]) => void;
  workflowConfig: WorkflowConfig;
  onUpdateWorkflowConfig: (updater: (prev: WorkflowConfig) => WorkflowConfig) => void;
  onOpenLogs: (pcId: string, deviceId: string) => void;
  onOpenWifiModal?: () => void;
}

export const SuggestionMatchAccordion: React.FC<SuggestionMatchAccordionProps> = ({
  matchedModel,
  apFilename,
  sourcePcId,
  devices,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onRunAutomation,
  workflowConfig,
  onUpdateWorkflowConfig,
  onOpenLogs,
  onOpenWifiModal,
}) => {
  const [isOpen, setIsOpen] = useState(true);

  if (!apFilename && devices.length === 0) return null;

  const validMatchedDevices = devices.filter((d) => !sourcePcId || d.pcId === sourcePcId);
  const validMatchedDeviceIds = validMatchedDevices.map((d) => d.id);
  const selectedMatchedIds = validMatchedDeviceIds.filter((id) => selectedIds.includes(id));
  const isAllSelected = selectedMatchedIds.length === validMatchedDeviceIds.length && validMatchedDeviceIds.length > 0;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      // Deselect matched
      const remaining = selectedIds.filter((id) => !validMatchedDeviceIds.includes(id));
      onSelectAll(remaining);
    } else {
      // Select all matched
      const combined = Array.from(new Set([...selectedIds, ...validMatchedDeviceIds]));
      onSelectAll(combined);
    }
  };

  const handleStepToggle = (stepKey: keyof WorkflowConfig) => {
    onUpdateWorkflowConfig((prev) => ({
      ...prev,
      [stepKey]: !prev[stepKey],
    }));
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

  const renderBuildBadge = () => {
    if (!apFilename) return null;
    const lower = apFilename.toLowerCase();
    if (lower.includes('userdebug')) {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            color: 'var(--accent-amber, #f59e0b)',
            border: '1.5px solid var(--accent-amber, #f59e0b)',
            fontSize: '0.625rem',
            padding: '0.08rem 0.38rem',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            borderRadius: '4px',
          }}
        >
          USERDEBUG
        </span>
      );
    }
    if (lower.includes('user') || lower.includes('_ship') || lower.includes('official')) {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            color: 'var(--accent-green, #10b981)',
            border: '1.5px solid var(--accent-green, #10b981)',
            fontSize: '0.625rem',
            padding: '0.08rem 0.38rem',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            borderRadius: '4px',
          }}
        >
          USER
        </span>
      );
    }
    return (
      <span
        className="badge"
        style={{
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          color: 'var(--accent-primary, #3b82f6)',
          border: '1.5px solid var(--accent-primary, #3b82f6)',
          fontSize: '0.625rem',
          padding: '0.08rem 0.38rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          borderRadius: '4px',
        }}
      >
        AP READY
      </span>
    );
  };

  return (
    <div
      className="card accordion-card suggestion-glow-card"
      style={{
        marginBottom: '1rem',
        border: '1.5px solid var(--accent-primary, #3b82f6)',
        boxShadow: '0 0 20px rgba(59, 130, 246, 0.15)',
      }}
    >
      {/* Header Accordion */}
      <div
        className="accordion-header suggestion-header-layout"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '0.5rem',
          padding: '0.65rem 0.85rem',
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: 'rgba(59, 130, 246, 0.04)',
        }}
      >
        {/* Row 1: Title & Model Name on Left, Stacked Badge & Unit on Right */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', minWidth: 0, flex: 1, overflow: 'hidden' }}>
            <button type="button" className="btn btn-icon" style={{ padding: 0, flexShrink: 0, width: '22px', height: '22px', marginTop: '2px' }}>
              {isOpen ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, overflow: 'hidden' }}>
              {/* Line 1: Title without Emoji */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: '0.75rem',
                    color: 'var(--accent-primary)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  SUGGESTION MODEL
                </span>
              </div>

              {/* Line 2: Prominent Model Name below title */}
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '0.925rem',
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: 1.25,
                  marginTop: '1px',
                }}
                title={matchedModel}
              >
                {matchedModel}
              </span>

              {/* Line 3: Full Firmware Filename with horizontal touch drag */}
              {apFilename && (
                <div
                  style={{
                    overflowX: 'auto',
                    whiteSpace: 'nowrap',
                    scrollbarWidth: 'none',
                    WebkitOverflowScrolling: 'touch',
                    cursor: 'grab',
                    marginTop: '2px',
                    maxWidth: '100%',
                  }}
                  onClick={(e) => e.stopPropagation()}
                  title="Scroll/Drag horizontal untuk melihat nama firmware"
                >
                  <span
                    style={{
                      fontSize: '0.625rem',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    FW: {apFilename}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Stacked Build Badge (Top) + Total Unit Pill (Bottom) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', flexShrink: 0 }}>
            {renderBuildBadge()}
            <span
              className="stat-pill active"
              style={{ fontSize: '0.65rem', padding: '0.08rem 0.35rem', whiteSpace: 'nowrap' }}
            >
              {selectedMatchedIds.length}/{devices.length} Unit
            </span>
          </div>
        </div>

        {/* Row 2: Fullwidth 1-Line Inline Breadcrumb Workflow Checklist */}
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
          {/* Step 1: ODIN FLASH */}
          <button
            type="button"
            onClick={() => handleStepToggle('odinFlash')}
            className={`btn-step-pill ${workflowConfig.odinFlash !== false && apFilename ? 'active-amber' : ''}`}
            style={{ flex: 1, minWidth: 0, padding: '0.18rem 0.25rem', fontSize: '0.65rem', justifyContent: 'center' }}
            title="Flash Firmware AP/BL/CP/CSC via Odin (Klik untuk Toggle)"
          >
            <CheckIcon size={10} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>ODIN FLASH</span>
          </button>

          <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', flexShrink: 0 }}>&rsaquo;</span>

          {/* Step 2: SKIP SUW */}
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

          {/* Step 3: SETUP GBA */}
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

          {/* Step 4: WIFI with Long Press on Mobile */}
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

        {/* Row 3: Fullwidth Jalankan Automasi Button */}
        <div onClick={(e) => e.stopPropagation()} style={{ width: '100%' }}>
          <button
            type="button"
            onClick={() => onRunAutomation(selectedMatchedIds.length > 0 ? selectedMatchedIds : validMatchedDeviceIds)}
            className="btn btn-primary"
            style={{
              width: '100%',
              height: '32px',
              fontWeight: 700,
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              borderRadius: 'var(--radius-md)',
            }}
            disabled={devices.length === 0}
          >
            <PlayIcon size={13} /> Jalankan Automasi ({selectedMatchedIds.length > 0 ? selectedMatchedIds.length : devices.length} Unit)
          </button>
        </div>
      </div>

      {/* Body: Matched Devices List */}
      {isOpen && (
        <div className="accordion-body" style={{ padding: '0.45rem 0.75rem 0.75rem 0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
          {devices.length === 0 ? (
            <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <div>Tidak ada unit <strong>{matchedModel}</strong> yang tersambung saat ini.</div>
              <div style={{ fontSize: '0.7rem', marginTop: '0.2rem', color: 'var(--text-secondary)' }}>
                Colokkan perangkat <strong>{matchedModel}</strong> via USB atau pilih file firmware yang sesuai.
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.3rem 0.4rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleToggleSelectAll}
                    className="custom-checkbox"
                  />
                  <span>Pilih Semua Unit {matchedModel}</span>
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {devices.map((device) => {
                  const isSelected = selectedIds.includes(device.id);
                  const isPcMismatch = Boolean(sourcePcId && device.pcId !== sourcePcId);

                  return (
                    <div
                      key={`${device.pcId}-${device.id}`}
                      onClick={() => {
                        if (!isPcMismatch) {
                          onToggleSelect(device.id);
                        }
                      }}
                      title={isPcMismatch ? `File binary dipilih dari PC [${sourcePcId}]. Device ini berada di PC [${device.pcId}]. Checkbox dinonaktifkan.` : ''}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.4rem 0.6rem',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-surface)',
                        cursor: isPcMismatch ? 'not-allowed' : 'pointer',
                        opacity: isPcMismatch ? 0.45 : 1,
                        gap: '0.5rem',
                        fontSize: '0.75rem',
                        overflowX: 'auto',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0, flexShrink: 0, whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isPcMismatch}
                          onChange={() => {
                            if (!isPcMismatch) onToggleSelect(device.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="custom-checkbox"
                          style={{ cursor: isPcMismatch ? 'not-allowed' : 'pointer' }}
                        />
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{device.model}</span>
                        <span className="pc-badge" style={{ fontSize: '0.65rem', padding: '0.08rem 0.35rem', whiteSpace: 'nowrap' }}>{device.pcId}</span>
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                          SN: {device.serial || device.id}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                          {device.port}
                        </span>
                        {isPcMismatch && (
                          <span className="badge" style={{ fontSize: '0.6rem', padding: '0.05rem 0.3rem', backgroundColor: 'rgba(239, 68, 68, 0.12)', color: 'var(--accent-red, #ef4444)', border: '1px solid var(--accent-red, #ef4444)' }}>
                            PC Berbeda ({device.pcId})
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        <span className={`badge ${device.status === 'Ready' ? 'badge-ready' : 'badge-offline'}`} style={{ fontSize: '0.65rem', padding: '0.08rem 0.35rem', whiteSpace: 'nowrap' }}>
                          {device.status}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenLogs(device.pcId, device.id);
                          }}
                          className="btn btn-icon btn-sm"
                          style={{ height: '24px', width: '24px', padding: 0 }}
                          title="Inspect Live Log"
                        >
                          <TerminalIcon size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
