import React, { useState } from 'react';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { WorkflowConfig } from './WorkflowStepper';
import { ChevronDownIcon, ChevronUpIcon, PlayIcon, CheckIcon, RefreshIcon, BatteryIcon, ThermometerIcon, FlashlightIcon } from './Icons';

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
  onOpenLogs?: (pcId: string, deviceId: string) => void;
  onOpenWifiModal?: () => void;
  onToggleTorch?: (deviceId: string, pcId: string, serial?: string) => void;
  pendingTorchIds?: string[];
  isMd5Verifying?: boolean;
  md5VerifyProgress?: number;
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
  onOpenWifiModal,
  onToggleTorch,
  pendingTorchIds,
  isMd5Verifying = false,
  md5VerifyProgress = 0,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const wifiLongPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isWifiLongPressedRef = React.useRef(false);

  if (!apFilename && (!Array.isArray(devices) || devices.length === 0)) return null;

  const validMatchedDevices = (devices || []).filter((d) => d && (!sourcePcId || d.pcId === sourcePcId));
  const validMatchedDeviceIds = validMatchedDevices.map((d) => d.id);
  const selectedMatchedIds = validMatchedDeviceIds.filter((id) => (selectedIds || []).includes(id));
  const isAllSelected = selectedMatchedIds.length === validMatchedDeviceIds.length && validMatchedDeviceIds.length > 0;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      // Deselect matched
      const remaining = (selectedIds || []).filter((id) => !validMatchedDeviceIds.includes(id));
      onSelectAll(remaining);
    } else {
      // Select all matched
      const combined = Array.from(new Set([...(selectedIds || []), ...validMatchedDeviceIds]));
      onSelectAll(combined);
    }
  };

  const handleStepToggle = (stepKey: keyof WorkflowConfig) => {
    onUpdateWorkflowConfig((prev) => ({
      ...prev,
      [stepKey]: !prev[stepKey],
    }));
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
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: 'rgba(59, 130, 246, 0.04)',
        }}
      >
        {/* =========================================================================
            DESKTOP HEADER LAYOUT (Screens >= 768px): Original Clean Single-Row Design
            ========================================================================= */}
        <div
          className="suggestion-desktop-header"
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--accent-primary)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                SUGGESTION MODEL
              </span>
              <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                {matchedModel}
              </span>
              {renderBuildBadge()}
              <span className="stat-pill active" style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem', whiteSpace: 'nowrap' }}>
                {selectedMatchedIds.length}/{devices.length} Unit
              </span>
              {apFilename && (
                <span
                  style={{
                    fontSize: '0.725rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '260px',
                    marginLeft: '0.25rem',
                  }}
                  title={apFilename}
                >
                  ({apFilename})
                </span>
              )}
            </div>
          </div>

          {/* Stepper Pills & Automation Button Inline on Desktop */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                type="button"
                onClick={() => handleStepToggle('odinFlash')}
                className={`btn-step-pill ${workflowConfig.odinFlash !== false && apFilename ? 'active-amber' : ''}`}
                title="Flash Firmware AP/BL/CP/CSC via Odin"
              >
                <CheckIcon size={12} /> ODIN FLASH
              </button>
              <span style={{ color: 'var(--text-muted)' }}>&rsaquo;</span>
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
              onClick={() => onRunAutomation(selectedMatchedIds.length > 0 ? selectedMatchedIds : validMatchedDeviceIds)}
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
                cursor: isMd5Verifying ? 'not-allowed' : devices.length === 0 ? 'not-allowed' : 'pointer',
                opacity: devices.length === 0 && !isMd5Verifying ? 0.6 : 1,
              }}
              disabled={devices.length === 0 || isMd5Verifying}
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
                  <PlayIcon size={14} /> Jalankan Automasi ({selectedMatchedIds.length > 0 ? selectedMatchedIds.length : devices.length} Unit)
                </span>
              )}
            </button>
          </div>
        </div>

        {/* =========================================================================
            MOBILE HEADER LAYOUT (Screens < 768px): Touch-Optimized Stacked Rows
            ========================================================================= */}
        <div
          className="suggestion-mobile-header"
          style={{
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: '0.5rem',
            width: '100%',
          }}
        >
          {/* Row 1: Title & Model Name on Left, Stacked Badge & Unit on Right */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', minWidth: 0, flex: 1, overflow: 'hidden' }}>
              <button type="button" className="btn btn-icon" style={{ padding: 0, flexShrink: 0, width: '22px', height: '22px', marginTop: '2px' }}>
                {isOpen ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                {/* Line 1: Title (Prominent, matching Firmware accordion size) */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: '0.95rem',
                      color: 'var(--accent-primary)',
                      letterSpacing: '0.02em',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    SUGGESTION MODEL
                  </span>
                </div>

                {/* Line 2: Model Name below title (Smaller subtitle size) */}
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
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

          {/* Row 3: Fullwidth Jalankan Automasi Button on Mobile */}
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%' }}>
            <button
              type="button"
              onClick={() => onRunAutomation(selectedMatchedIds.length > 0 ? selectedMatchedIds : validMatchedDeviceIds)}
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
                cursor: isMd5Verifying ? 'not-allowed' : devices.length === 0 ? 'not-allowed' : 'pointer',
                opacity: devices.length === 0 && !isMd5Verifying ? 0.6 : 1,
              }}
              disabled={devices.length === 0 || isMd5Verifying}
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
                  <PlayIcon size={13} /> Jalankan Automasi ({selectedMatchedIds.length > 0 ? selectedMatchedIds.length : devices.length} Unit)
                </span>
              )}
            </button>
          </div>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.85rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '0.65rem', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleToggleSelectAll}
                    className="custom-checkbox"
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span>Pilih Semua Unit {matchedModel}</span>
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
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
                        padding: '0 1rem',
                        height: '48px',
                        minHeight: '48px',
                        maxHeight: '48px',
                        boxSizing: 'border-box',
                        borderRadius: 'var(--radius-md)',
                        border: isSelected ? '1px solid var(--border-active)' : '1px solid var(--border-subtle)',
                        boxShadow: 'none',
                        backgroundColor: isSelected ? 'rgba(9, 105, 218, 0.08)' : 'var(--bg-surface)',
                        cursor: isPcMismatch ? 'not-allowed' : 'pointer',
                        opacity: isPcMismatch ? 0.45 : 1,
                        gap: '0.75rem',
                        fontSize: '0.85rem',
                        overflowX: 'auto',
                        whiteSpace: 'nowrap',
                        transition: 'border-color 0.15s, background-color 0.15s, box-shadow 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flexShrink: 0, whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isPcMismatch}
                          onChange={() => {
                            if (!isPcMismatch) onToggleSelect(device.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="custom-checkbox"
                          style={{ cursor: isPcMismatch ? 'not-allowed' : 'pointer', width: '16px', height: '16px' }}
                        />
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', fontSize: '0.875rem' }}>{device.model}</span>
                        <span className="pc-badge" style={{ fontSize: '0.75rem', padding: '0.15rem 0.45rem', whiteSpace: 'nowrap' }}>{device.pcId}</span>
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          SN: {device.serial || device.id}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {device.port}
                        </span>
                        {isPcMismatch && (
                          <span className="badge" style={{ fontSize: '0.65rem', padding: '0.08rem 0.35rem', backgroundColor: 'rgba(239, 68, 68, 0.12)', color: 'var(--accent-red, #ef4444)', border: '1px solid var(--accent-red, #ef4444)' }}>
                            PC Berbeda ({device.pcId})
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        <span className={`badge ${device.status === 'Ready' ? 'badge-ready' : 'badge-offline'}`} style={{ fontSize: '0.725rem', padding: '0.15rem 0.45rem', whiteSpace: 'nowrap' }}>
                          {device.status}
                        </span>

                        {/* Badge: Battery Level */}
                        <span
                          className="stat-pill"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.72rem',
                            padding: '0.15rem 0.45rem',
                            fontWeight: 600,
                            backgroundColor: (device.batteryLevel ?? 100) >= 50
                              ? 'rgba(16, 185, 129, 0.12)'
                              : (device.batteryLevel ?? 100) >= 20
                              ? 'rgba(245, 158, 11, 0.12)'
                              : 'rgba(239, 68, 68, 0.12)',
                            color: (device.batteryLevel ?? 100) >= 50
                              ? 'var(--accent-green, #10b981)'
                              : (device.batteryLevel ?? 100) >= 20
                              ? 'var(--accent-warning, #f59e0b)'
                              : 'var(--accent-red, #ef4444)',
                            border: `1px solid ${(device.batteryLevel ?? 100) >= 50 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                          }}
                          title={`Kapasitas Baterai: ${device.batteryLevel ?? 100}%`}
                        >
                          <BatteryIcon size={12} />
                          <span>{device.batteryLevel ?? 100}%</span>
                        </span>

                        {/* Badge: Temperature */}
                        <span
                          className="stat-pill"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.72rem',
                            padding: '0.15rem 0.45rem',
                            fontWeight: 600,
                            backgroundColor: (device.batteryTemp ?? 32) > 38
                              ? 'rgba(239, 68, 68, 0.12)'
                              : 'rgba(59, 130, 246, 0.12)',
                            color: (device.batteryTemp ?? 32) > 38
                              ? 'var(--accent-red, #ef4444)'
                              : 'var(--accent-primary, #3b82f6)',
                            border: `1px solid ${(device.batteryTemp ?? 32) > 38 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(59, 130, 246, 0.25)'}`,
                          }}
                          title={`Suhu Perangkat: ${device.batteryTemp ? (device.batteryTemp > 100 ? (device.batteryTemp / 10).toFixed(1) : device.batteryTemp.toFixed(1)) : '32.0'}°C`}
                        >
                          <ThermometerIcon size={12} />
                          <span>{device.batteryTemp ? (device.batteryTemp > 100 ? (device.batteryTemp / 10).toFixed(1) : device.batteryTemp.toFixed(1)) : '32.0'}°C</span>
                        </span>

                        {/* Button: Toggle Flash */}
                        {(() => {
                          const isTorchPending = Boolean(
                            pendingTorchIds &&
                            (pendingTorchIds.includes(device.id) || (device.serial && pendingTorchIds.includes(device.serial)))
                          );

                          return (
                            <button
                              type="button"
                              disabled={isTorchPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleTorch?.(device.id, device.pcId, device.serial);
                              }}
                              className={`btn btn-sm ${isTorchPending ? 'flash-loading-shimmer' : ''}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                fontSize: '0.72rem',
                                padding: '0.15rem 0.5rem',
                                fontWeight: 700,
                                cursor: isTorchPending ? 'wait' : 'pointer',
                                borderRadius: 'var(--radius-sm, 4px)',
                                backgroundColor: isTorchPending
                                  ? undefined
                                  : device.torchOn
                                  ? 'rgba(245, 158, 11, 0.22)'
                                  : 'var(--bg-subtle, #1e293b)',
                                color: isTorchPending
                                  ? '#f59e0b'
                                  : device.torchOn
                                  ? 'var(--accent-warning, #f59e0b)'
                                  : 'var(--text-secondary, #94a3b8)',
                                border: isTorchPending
                                  ? undefined
                                  : device.torchOn
                                  ? '1px solid var(--accent-warning, #f59e0b)'
                                  : '1px solid var(--border-subtle, #334155)',
                                boxShadow: isTorchPending
                                  ? '0 0 10px rgba(245, 158, 11, 0.3)'
                                  : device.torchOn
                                  ? '0 0 8px rgba(245, 158, 11, 0.35)'
                                  : 'none',
                                transition: 'all 0.15s ease',
                              }}
                              title={
                                isTorchPending
                                  ? 'Memverifikasi status flash ke perangkat...'
                                  : device.torchOn
                                  ? 'Flash Aktif (Klik untuk Mematikan)'
                                  : 'Flash Mati (Klik untuk Menyalakan)'
                              }
                            >
                              <FlashlightIcon size={13} fill={device.torchOn ? 'currentColor' : 'none'} />
                              <span>
                                {isTorchPending
                                  ? 'CEK...'
                                  : device.torchOn
                                  ? 'Flash ON'
                                  : 'Flash OFF'}
                              </span>
                            </button>
                          );
                        })()}
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
