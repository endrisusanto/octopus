import React, { useState, useRef, useMemo } from 'react';
import { DeviceItem, extractModelFromFirmware } from '../hooks/useFlashKitSort';
import { WorkflowConfig } from './WorkflowStepper';
import { FirmwareSlotsMap } from './FirmwareAccordion';
import { DeviceTableView } from './DeviceTableView';
import { BinarySelectModal } from './BinarySelectModal';
import { ProgressRing } from './ProgressRing';
import { BinaryItem, BridgeInfo } from '../hooks/useFleetWebSocket';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlayIcon,
  CheckIcon,
  TrashIcon,
  RefreshIcon,
  RotateCcwIcon,
  FileCodeIcon,
} from './Icons';

interface ModelParentAccordionProps {
  modelKey: string;
  slots: FirmwareSlotsMap;
  onUpdateSlotsBatch: (updates: { slotKey: keyof FirmwareSlotsMap; fileItem: BinaryItem | null }[]) => void;
  onResetModel: () => void;
  binaries: BinaryItem[];
  bridges?: BridgeInfo[];
  devices: DeviceItem[];
  selectedIds: string[];
  onToggleSelect: (deviceId: string) => void;
  onSelectAllModel: (deviceIds: string[]) => void;
  onRunAutomation: (deviceIds: string[], config: WorkflowConfig, slots: FirmwareSlotsMap) => void;
  workflowConfig: WorkflowConfig;
  onUpdateWorkflowConfig: (updater: (prev: WorkflowConfig) => WorkflowConfig) => void;
  onOpenLogs?: (pcId: string, deviceId: string) => void;
  onOpenWifiModal?: () => void;
  onToggleTorch?: (deviceId: string, pcId: string, serial?: string) => void;
  pendingTorchIds?: string[];
  torchMode?: 'flash' | 'screen' | 'tweet';
  onRefreshBinaries?: () => void;
  onCopyBinary?: (sourcePcId: string, targetPcId: string, filename: string, path?: string) => void;
  isFirmwareForModel: (ap?: string, model?: string) => boolean;
}

const SLOT_CONFIGS: { key: keyof FirmwareSlotsMap; label: string; name: string; color: string; bg: string }[] = [
  { key: 'bl', label: 'BL', name: 'Bootloader', color: 'var(--accent-amber, #f59e0b)', bg: 'rgba(245, 158, 11, 0.1)' },
  { key: 'ap', label: 'AP', name: 'System / PDA', color: 'var(--accent-primary, #3b82f6)', bg: 'rgba(59, 130, 246, 0.1)' },
  { key: 'cp', label: 'CP', name: 'Phone / Modem', color: 'var(--accent-purple, #a855f7)', bg: 'rgba(168, 85, 247, 0.1)' },
  { key: 'csc', label: 'CSC', name: 'Consumer Customization', color: 'var(--accent-green, #10b981)', bg: 'rgba(16, 185, 129, 0.1)' },
  { key: 'userdata', label: 'USERDATA', name: 'Userdata Storage', color: 'var(--accent-red, #ef4444)', bg: 'rgba(239, 68, 68, 0.1)' },
];

export const ModelParentAccordion: React.FC<ModelParentAccordionProps> = ({
  modelKey,
  slots,
  onUpdateSlotsBatch,
  onResetModel,
  binaries,
  bridges,
  devices,
  selectedIds,
  onToggleSelect,
  onSelectAllModel,
  onRunAutomation,
  workflowConfig,
  onUpdateWorkflowConfig,
  onOpenWifiModal,
  onToggleTorch,
  pendingTorchIds,
  onRefreshBinaries,
  onCopyBinary,
  isFirmwareForModel,
}) => {
  // Accordion open/collapse states
  const [isParentOpen, setIsParentOpen] = useState(true);
  const [isFirmwareOpen, setIsFirmwareOpen] = useState(true);
  const [isDevicesOpen, setIsDevicesOpen] = useState(true);
  const [activeSlotModal, setActiveSlotModal] = useState<keyof FirmwareSlotsMap | null>(null);

  const wifiLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isWifiLongPressedRef = useRef(false);

  // Safe fallback guarantees
  const safeWorkflowConfig: WorkflowConfig = workflowConfig || {
    binaryFile: '',
    odinFlash: true,
    skipSuw: true,
    setupGba: true,
    wifiEnabled: true,
    wifiSsid: 'RTT / IEEE 802.11',
    wifiPassword: '1234qwer',
  };

  const safeSlots: FirmwareSlotsMap = slots || {
    bl: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
    ap: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
    cp: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
    csc: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
    userdata: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
  };

  const apFilename = safeSlots.ap?.filename || '';
  const detectedModel = apFilename ? extractModelFromFirmware(apFilename) : null;
  const displayModelName = detectedModel
    ? (detectedModel.toUpperCase().startsWith('SM-') ? detectedModel.toUpperCase() : `SM-${detectedModel.toUpperCase()}`)
    : (modelKey.toUpperCase().includes('MODEL') ? 'FIRMWARE & MODEL' : modelKey.toUpperCase());
  const validDeviceIds = devices.map((d) => d.id);
  const selectedModelIds = validDeviceIds.filter((id) => selectedIds.includes(id));
  const isAllSelected = selectedModelIds.length === validDeviceIds.length && validDeviceIds.length > 0;

  const firstLoadedPcId = useMemo(() => {
    for (const slot of Object.values(safeSlots)) {
      if (slot?.filename && slot?.pcId) return slot.pcId;
    }
    return undefined;
  }, [safeSlots]);

  const hasAnyFile = Object.values(safeSlots).some((s) => s.filename.length > 0);
  const isAnyVerifying = Object.values(safeSlots).some((s) => s.status === 'verifying');
  const verifyingProgress = (() => {
    const active = Object.values(safeSlots).filter((s) => s.status === 'verifying');
    if (active.length === 0) return 100;
    return Math.round(active.reduce((acc, curr) => acc + (curr.progress || 0), 0) / active.length);
  })();

  const handleStepToggle = (stepKey: keyof WorkflowConfig) => {
    onUpdateWorkflowConfig((prev) => {
      const cfg = prev || safeWorkflowConfig;
      const current = cfg[stepKey];
      const isCurrentlyActive = current !== false;
      return {
        ...cfg,
        [stepKey]: !isCurrentlyActive,
      };
    });
  };

  const handlePickBinary = (slotKey: keyof FirmwareSlotsMap, filename: string) => {
    const selectedItem = binaries.find((b) => b.filename === filename) || {
      filename,
      path: filename,
      sizeBytes: 0,
      pcId: firstLoadedPcId || 'local',
    };

    onUpdateSlotsBatch([{ slotKey, fileItem: selectedItem }]);
  };

  const handleResetSlotsOnly = () => {
    const emptyUpdates = (Object.keys(safeSlots) as (keyof FirmwareSlotsMap)[]).map((k) => ({
      slotKey: k,
      fileItem: null,
    }));
    onUpdateSlotsBatch(emptyUpdates);
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
            border: '1px solid var(--accent-amber, #f59e0b)',
            fontSize: '0.625rem',
            padding: '0.1rem 0.4rem',
            fontWeight: 800,
            textTransform: 'uppercase',
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
            border: '1px solid var(--accent-green, #10b981)',
            fontSize: '0.625rem',
            padding: '0.1rem 0.4rem',
            fontWeight: 800,
            textTransform: 'uppercase',
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
          border: '1px solid var(--accent-primary, #3b82f6)',
          fontSize: '0.625rem',
          padding: '0.1rem 0.4rem',
          fontWeight: 700,
          borderRadius: '4px',
        }}
      >
        AP READY
      </span>
    );
  };

  const handleSelectAllToggle = () => {
    if (isAllSelected) {
      const remaining = selectedIds.filter((id) => !validDeviceIds.includes(id));
      onSelectAllModel(remaining);
    } else {
      const combined = Array.from(new Set([...selectedIds, ...validDeviceIds]));
      onSelectAllModel(combined);
    }
  };

  const handleTriggerRun = () => {
    const targetIds = selectedModelIds.length > 0 ? selectedModelIds : validDeviceIds;
    if (targetIds.length === 0) return;
    onRunAutomation(targetIds, safeWorkflowConfig, safeSlots);
  };

  return (
    <div
      className="card accordion-card parent-model-accordion"
      style={{
        marginBottom: '1.25rem',
        border: '1.5px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-surface)',
      }}
    >
      {/* =========================================================================
          PARENT ACCORDION HEADER
          ========================================================================= */}
      <div
        className="accordion-header parent-model-header"
        onClick={() => setIsParentOpen(!isParentOpen)}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
          padding: '0.75rem 1rem',
          borderBottom: isParentOpen ? '1px solid var(--border-subtle)' : 'none',
        }}
      >
        {/* Desktop Layout (>= 768px) */}
        <div
          className="desktop-header-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            gap: '1rem',
          }}
        >
          {/* Left: Chevron + Model Title + Badge + Unit Count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flex: 1 }}>
            <button
              type="button"
              className="btn btn-icon"
              style={{ padding: 0, flexShrink: 0, width: '26px', height: '26px' }}
              onClick={(e) => {
                e.stopPropagation();
                setIsParentOpen(!isParentOpen);
              }}
            >
              {isParentOpen ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '0.875rem',
                  color: 'var(--accent-primary, #3b82f6)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                MODEL
              </span>
              <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                {displayModelName}
              </span>
              {renderBuildBadge()}
              <span className="stat-pill active" style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem', whiteSpace: 'nowrap' }}>
                {selectedModelIds.length}/{devices.length} Unit
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
                    maxWidth: '220px',
                  }}
                  title={apFilename}
                >
                  ({apFilename})
                </span>
              )}
            </div>
          </div>

          {/* Right: Stepper Pills + Action Button + Reset */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <button
                type="button"
                onClick={() => handleStepToggle('odinFlash')}
                className={`btn-step-pill ${safeWorkflowConfig.odinFlash !== false && apFilename ? 'active-amber' : ''}`}
                title="Flash Firmware AP/BL/CP/CSC via Odin"
              >
                <CheckIcon size={12} /> <span>ODIN FLASH</span>
              </button>
              <span style={{ color: 'var(--text-muted)' }}>&rsaquo;</span>
              <button
                type="button"
                onClick={() => handleStepToggle('skipSuw')}
                className={`btn-step-pill ${safeWorkflowConfig.skipSuw !== false ? 'active-blue' : ''}`}
                title="Lewati Setup Wizard"
              >
                <CheckIcon size={12} /> <span>SKIP SUW</span>
              </button>
              <span style={{ color: 'var(--text-muted)' }}>&rsaquo;</span>
              <button
                type="button"
                onClick={() => handleStepToggle('setupGba')}
                className={`btn-step-pill ${safeWorkflowConfig.setupGba !== false ? 'active-purple' : ''}`}
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
                className={`btn-step-pill ${safeWorkflowConfig.wifiEnabled !== false ? 'active-green' : ''}`}
                title="Klik: Toggle Wi-Fi | Klik Kanan: Konfigurasi SSID/Password"
              >
                <CheckIcon size={12} /> <span>WIFI</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleTriggerRun}
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
                cursor: isAnyVerifying ? 'not-allowed' : devices.length === 0 ? 'not-allowed' : 'pointer',
                opacity: devices.length === 0 && !isAnyVerifying ? 0.6 : 1,
              }}
              disabled={devices.length === 0 || isAnyVerifying}
              title={isAnyVerifying ? `Sedang memverifikasi MD5 checksum (${verifyingProgress}%)` : undefined}
            >
              {isAnyVerifying ? (
                <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <RefreshIcon size={14} className="spin" /> Verify MD5 {verifyingProgress}%
                </span>
              ) : (
                <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <PlayIcon size={14} fill="currentColor" /> Jalankan Automasi
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onResetModel}
              className="btn btn-icon"
              title="Hapus / Reset Model Ini"
              style={{ width: '32px', height: '32px', color: 'var(--text-muted)' }}
            >
              <TrashIcon size={15} />
            </button>
          </div>
        </div>

        {/* Mobile Header Layout (< 768px) */}
        <div
          className="mobile-header-column"
          style={{
            display: 'none',
            flexDirection: 'column',
            gap: '0.5rem',
            width: '100%',
          }}
        >
          {/* Row 1: Model Title + Badge + Count */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
              <button
                type="button"
                className="btn btn-icon"
                style={{ padding: 0, flexShrink: 0, width: '22px', height: '22px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsParentOpen(!isParentOpen);
                }}
              >
                {isParentOpen ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
              </button>
              <span style={{ fontWeight: 800, fontSize: '0.8rem', color: 'var(--accent-primary)', textTransform: 'uppercase' }}>
                MODEL
              </span>
              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {displayModelName}
              </span>
              {renderBuildBadge()}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span className="stat-pill active" style={{ fontSize: '0.675rem', padding: '0.1rem 0.4rem' }}>
                {selectedModelIds.length}/{devices.length} Unit
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onResetModel();
                }}
                className="btn btn-icon"
                style={{ width: '24px', height: '24px', padding: 0 }}
                title="Hapus Model"
              >
                <TrashIcon size={13} />
              </button>
            </div>
          </div>

          {/* Row 2: 4-Group Stepper Pills */}
          <div
            className="mobile-stepper-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '0.25rem',
              width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => handleStepToggle('odinFlash')}
              className={`btn-step-pill ${safeWorkflowConfig.odinFlash !== false && apFilename ? 'active-amber' : ''}`}
              style={{ justifyContent: 'center', padding: '0.25rem 0.15rem', fontSize: '0.65rem' }}
            >
              <CheckIcon size={10} /> <span>ODIN</span>
            </button>
            <button
              type="button"
              onClick={() => handleStepToggle('skipSuw')}
              className={`btn-step-pill ${safeWorkflowConfig.skipSuw !== false ? 'active-blue' : ''}`}
              style={{ justifyContent: 'center', padding: '0.25rem 0.15rem', fontSize: '0.65rem' }}
            >
              <CheckIcon size={10} /> <span>SUW</span>
            </button>
            <button
              type="button"
              onClick={() => handleStepToggle('setupGba')}
              className={`btn-step-pill ${safeWorkflowConfig.setupGba !== false ? 'active-purple' : ''}`}
              style={{ justifyContent: 'center', padding: '0.25rem 0.15rem', fontSize: '0.65rem' }}
            >
              <CheckIcon size={10} /> <span>GBA</span>
            </button>
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
              className={`btn-step-pill ${safeWorkflowConfig.wifiEnabled !== false ? 'active-green' : ''}`}
              style={{ justifyContent: 'center', padding: '0.25rem 0.15rem', fontSize: '0.65rem' }}
            >
              <CheckIcon size={10} /> <span>WIFI</span>
            </button>
          </div>

          {/* Row 3: 1 Full-Width Automation Button */}
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%' }}>
            <button
              type="button"
              onClick={handleTriggerRun}
              className="btn btn-primary"
              style={{
                position: 'relative',
                overflow: 'hidden',
                width: '100%',
                height: '34px',
                fontWeight: 700,
                fontSize: '0.775rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                borderRadius: 'var(--radius-md)',
                cursor: isAnyVerifying ? 'not-allowed' : devices.length === 0 ? 'not-allowed' : 'pointer',
                opacity: devices.length === 0 && !isAnyVerifying ? 0.6 : 1,
              }}
              disabled={devices.length === 0 || isAnyVerifying}
            >
              {isAnyVerifying ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <RefreshIcon size={14} className="spin" /> Verifikasi MD5 {verifyingProgress}%
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <PlayIcon size={14} fill="currentColor" /> Jalankan Automasi
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PARENT ACCORDION BODY (Contains 2 Nested Accordions)
          ========================================================================= */}
      {isParentOpen && (
        <div className="parent-model-body" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* CHILD ACCORDION 1: FIRMWARE 5-SLOT FORM (5 Compact Horizontal Rows) */}
          <div
            className="card child-accordion-card"
            style={{
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            {/* Header Child 1 */}
            <div
              className="child-accordion-header"
              onClick={() => setIsFirmwareOpen(!isFirmwareOpen)}
              style={{
                padding: '0.55rem 0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none',
                backgroundColor: 'rgba(255, 255, 255, 0.015)',
                borderBottom: isFirmwareOpen ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button type="button" className="btn btn-icon" style={{ padding: 0, width: '22px', height: '22px' }}>
                  {isFirmwareOpen ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                </button>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
                  FIRMWARE
                </span>
                {isAnyVerifying && (
                  <ProgressRing
                    progress={verifyingProgress}
                    size={20}
                    strokeWidth={2}
                    color="var(--accent-primary, #3b82f6)"
                  />
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                {hasAnyFile && (
                  <button
                    type="button"
                    onClick={handleResetSlotsOnly}
                    className="btn btn-sm btn-outline-danger"
                    style={{ fontSize: '0.75rem', height: '26px', padding: '0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                    title="Reset seluruh slot file firmware model ini"
                  >
                    <RotateCcwIcon size={12} /> Reset File
                  </button>
                )}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {Object.values(safeSlots).filter((s) => s.filename).length} / 5 File
                </span>
              </div>
            </div>

            {/* Body Child 1: Direct 5 Horizontal Rows */}
            {isFirmwareOpen && (
              <div style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {SLOT_CONFIGS.map((slot) => {
                  const data = safeSlots[slot.key];
                  const isFilled = data?.filename?.length > 0;
                  const isVerifying = data?.status === 'verifying';
                  const isVerified = data?.status === 'verified';

                  return (
                    <div
                      key={slot.key}
                      className="firmware-slot-row ifta-slot-row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.4rem 0.85rem',
                        height: '52px',
                        minHeight: '52px',
                        maxHeight: '52px',
                        boxSizing: 'border-box',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${isVerifying ? slot.color : isFilled ? slot.color : 'var(--border-subtle)'}`,
                        backgroundColor: isFilled ? 'var(--bg-surface)' : 'var(--bg-subtle)',
                        transition: 'border-color 0.2s, background-color 0.2s',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Background Fill Loading Bar when Verifying */}
                      {isVerifying && (
                        <>
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              bottom: 0,
                              width: `${data.progress}%`,
                              backgroundColor: slot.bg,
                              transition: 'width 0.15s ease-out',
                              zIndex: 0,
                              pointerEvents: 'none',
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              height: '3px',
                              width: `${data.progress}%`,
                              backgroundColor: slot.color,
                              transition: 'width 0.15s ease-out',
                              zIndex: 2,
                            }}
                          />
                        </>
                      )}

                      {/* Ifta Content Area: Stacked Floating Label Top + Input Value Bottom */}
                      <div
                        onClick={() => setActiveSlotModal(slot.key)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          position: 'relative',
                          zIndex: 1,
                          gap: '0.12rem',
                        }}
                      >
                        {/* Ifta In-Field Floating Label */}
                        <div
                          className="ifta-slot-label"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            color: slot.color,
                            fontSize: '0.675rem',
                            fontWeight: 800,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            lineHeight: 1,
                          }}
                        >
                          <FileCodeIcon size={12} style={{ flexShrink: 0 }} />
                          <span>{slot.label}</span>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.625rem', textTransform: 'none' }}>
                            &bull; {slot.name}
                          </span>
                        </div>

                        {/* Value / Filename / Placeholder */}
                        {isFilled ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, width: '100%' }}>
                            <div
                              style={{
                                overflowX: 'auto',
                                whiteSpace: 'nowrap',
                                scrollbarWidth: 'none',
                                WebkitOverflowScrolling: 'touch',
                                cursor: 'grab',
                                flex: 1,
                                minWidth: 0,
                              }}
                              title={data.filename}
                            >
                              <span
                                className="firmware-slot-filename"
                                style={{
                                  fontFamily: 'var(--font-mono, monospace)',
                                  fontWeight: 600,
                                  color: 'var(--text-primary)',
                                  letterSpacing: '-0.01em',
                                  display: 'inline-block',
                                }}
                              >
                                {data.filename}
                              </span>
                            </div>
                            {isVerifying && (
                              <span style={{ fontSize: '0.725rem', color: slot.color, fontWeight: 700, flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                                MD5: {data.progress}%
                              </span>
                            )}
                            {isVerified && <CheckIcon size={15} className="text-ready" style={{ flexShrink: 0 }} />}
                          </div>
                        ) : (
                          <span
                            className="firmware-slot-placeholder"
                            style={{
                              color: 'var(--text-muted)',
                              fontSize: '0.8rem',
                              fontWeight: 500,
                              lineHeight: 1.2,
                            }}
                          >
                            Klik untuk memilih file binary {slot.label}...
                          </span>
                        )}
                      </div>

                      {/* Action Buttons: Browse & Clear */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          flexShrink: 0,
                          position: 'relative',
                          zIndex: 2,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveSlotModal(slot.key)}
                          className="btn btn-secondary btn-sm"
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '0.25rem 0.65rem',
                            height: '28px',
                            minHeight: '28px',
                            maxHeight: '28px',
                          }}
                        >
                          Pilih File
                        </button>

                        {isFilled && (
                          <button
                            type="button"
                            onClick={() => onUpdateSlotsBatch([{ slotKey: slot.key, fileItem: null }])}
                            className="btn btn-icon"
                            style={{
                              width: '28px',
                              height: '28px',
                              minWidth: '28px',
                              minHeight: '28px',
                              maxHeight: '28px',
                              padding: 0,
                              color: 'var(--text-muted)',
                            }}
                            title={`Hapus file slot ${slot.label}`}
                          >
                            <TrashIcon size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* CHILD ACCORDION 2: DEVICE LIST MODEL (Only shown when firmware is loaded) */}
          {hasAnyFile && (
            <div
              className="card child-accordion-card"
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              {/* Header Child 2 */}
              <div
                className="child-accordion-header"
                onClick={() => setIsDevicesOpen(!isDevicesOpen)}
                style={{
                  padding: '0.55rem 0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                  backgroundColor: 'rgba(255, 255, 255, 0.015)',
                  borderBottom: isDevicesOpen ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-icon" style={{ padding: 0, width: '22px', height: '22px' }}>
                    {isDevicesOpen ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                  </button>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
                    DEVICES ({devices.length} Unit)
                  </span>
                </div>
                {devices.length > 0 && (
                  <span className="stat-pill active" style={{ fontSize: '0.675rem', padding: '0.1rem 0.4rem' }}>
                    {selectedModelIds.length} Terpilih
                  </span>
                )}
              </div>

              {/* Body Child 2: Elongated Device Table */}
              {isDevicesOpen && (
                <div>
                  {devices.length === 0 ? (
                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                      Belum ada perangkat model <strong>{displayModelName}</strong> yang terhubung via ADB/Odin.
                    </div>
                  ) : (
                    <DeviceTableView
                      devices={devices}
                      selectedIds={selectedIds}
                      onToggleSelect={onToggleSelect}
                      onSelectAll={handleSelectAllToggle}
                      onToggleTorch={onToggleTorch}
                      pendingTorchIds={pendingTorchIds}
                      apFilename={apFilename}
                      isFirmwareForModel={isFirmwareForModel}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Binary Selection Modal for Slot Picking */}
      {activeSlotModal && (
        <BinarySelectModal
          isOpen={Boolean(activeSlotModal)}
          onClose={() => setActiveSlotModal(null)}
          currentBinary={safeSlots[activeSlotModal]?.filename || ''}
          binaries={binaries}
          bridges={bridges}
          devices={devices}
          preferredPcId={firstLoadedPcId}
          onSave={(filename) => {
            handlePickBinary(activeSlotModal, filename);
            setActiveSlotModal(null);
          }}
          onRefreshBinaries={onRefreshBinaries}
          onCopyBinary={onCopyBinary}
        />
      )}
    </div>
  );
};
