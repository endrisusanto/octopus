import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFleetWebSocket, BinaryItem } from './hooks/useFleetWebSocket';
import { useFlashKitSort, isFirmwareForModel, extractModelFromFirmware } from './hooks/useFlashKitSort';
import { FleetHeader } from './components/FleetHeader';
import { WorkflowConfig } from './components/WorkflowStepper';
import { FirmwareSlotsMap } from './components/FirmwareAccordion';
import { ModelParentAccordion } from './components/ModelParentAccordion';
import { RunningWorkflowAccordion } from './components/RunningWorkflowAccordion';
import { CompletedWorkflowAccordion } from './components/CompletedWorkflowAccordion';
import { ReadyDevicesAccordion } from './components/ReadyDevicesAccordion';
import { LogDrawer } from './components/LogDrawer';
import { WifiConfigModal } from './components/WifiConfigModal';
import { UpdateModal } from './components/UpdateModal';
import { BulkActionBar } from './components/BulkActionBar';
import { LedAnimationModal } from './components/LedAnimationModal';
import { AutomationConfirmModal } from './components/AutomationConfirmModal';
import { BinaryTransferToast } from './components/BinaryTransferToast';
import { SearchIcon, TerminalIcon, PlusIcon } from './components/Icons';

export interface ModelProfile {
  slots: FirmwareSlotsMap;
  workflowConfig: WorkflowConfig;
}

const createInitialSlots = (): FirmwareSlotsMap => ({
  bl: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
  ap: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
  cp: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
  csc: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
  userdata: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
});

const createInitialWorkflowConfig = (): WorkflowConfig => ({
  binaryFile: '',
  odinFlash: true,
  skipSuw: true,
  setupGba: true,
  wifiEnabled: true,
  wifiSsid: 'RTT / IEEE 802.11',
  wifiPassword: '1234qwer',
});

export const App: React.FC = () => {
  const {
    devices,
    setDevices,
    bridges,
    binaries,
    binaryTransfers,
    requestCopyBinary,
    controlBinaryTransfer,
    dismissBinaryTransfer,
    isConnected,
    logs,
    md5Progress,
    serverSessionState,
    syncModelProfiles,
    syncDeviceApMap,
    syncAccordionStates,
    syncTorchMode,
    syncAutomationSettings,
    syncStandbyWorkflowConfig,
    startWorkflow,
    rackCalibration,
    saveRackCalibration,
    blinkDevice,
    dispatchAction,
    toggleTorch,
    setTorchBulk,
    playSound,
    stopSound,
    customSoundName,
    uploadCustomSound,
    resetCustomSound,
    pendingTorchIds,
  } = useFleetWebSocket();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPcId, setSelectedPcId] = useState('all');
  const [selectedMode, setSelectedMode] = useState('all');
  const [isLedModalOpen, setIsLedModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  // Multi-Model Profiles (Each Model owns its independent 5-slot firmware form & stepper config)
  const [modelProfiles, setModelProfiles] = useState<Record<string, ModelProfile>>(() => {
    return {
      'SM-MODEL-1': {
        slots: createInitialSlots(),
        workflowConfig: createInitialWorkflowConfig(),
      },
    };
  });

  // Sync state from server when WebSocket session state updates
  useEffect(() => {
    if (serverSessionState?.modelProfiles && Object.keys(serverSessionState.modelProfiles).length > 0) {
      const sanitized: Record<string, ModelProfile> = {};
      for (const [mKey, prof] of Object.entries(serverSessionState.modelProfiles)) {
        const nextSlots = { ...prof.slots };
        for (const [sKey, sData] of Object.entries(nextSlots)) {
          if (sData && (sData as any).status === 'verifying') {
            nextSlots[sKey as keyof FirmwareSlotsMap] = {
              ...(sData as any),
              status: 'verified',
              progress: 100,
            };
          }
        }
        sanitized[mKey] = { ...prof, slots: nextSlots };
      }
      setModelProfiles(sanitized);
    }
  }, [serverSessionState?.modelProfiles]);

  // Standby Ready Devices Independent Stepper State (Unified State)
  const [standbyWorkflowConfig, setStandbyWorkflowConfig] = useState<WorkflowConfig>(() => ({
    binaryFile: '',
    odinFlash: false,
    skipSuw: true,
    setupGba: true,
    wifiEnabled: true,
    wifiSsid: 'RTT / IEEE 802.11',
    wifiPassword: '1234qwer',
  }));

  useEffect(() => {
    if (serverSessionState?.standbyWorkflowConfig) {
      setStandbyWorkflowConfig(serverSessionState.standbyWorkflowConfig);
    }
  }, [serverSessionState?.standbyWorkflowConfig]);

  const handleUpdateStandbyWorkflowConfig = useCallback(
    (updater: ((prev: WorkflowConfig) => WorkflowConfig) | WorkflowConfig) => {
      setStandbyWorkflowConfig((prev) => {
        const next = typeof updater === 'function' ? (updater as (prev: WorkflowConfig) => WorkflowConfig)(prev) : updater;
        syncStandbyWorkflowConfig(next);
        return next;
      });
    },
    [syncStandbyWorkflowConfig]
  );

  // Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Senter (Torch) / Sound Mode: Flash Camera vs Screen Brightness vs Tweet (Unified State)
  const [torchMode, setTorchMode] = useState<'flash' | 'screen' | 'tweet'>('flash');

  useEffect(() => {
    if (serverSessionState?.torchMode) {
      setTorchMode(serverSessionState.torchMode);
    }
  }, [serverSessionState?.torchMode]);

  const handleTorchModeChange = (mode: 'flash' | 'screen' | 'tweet') => {
    setTorchMode(mode);
    syncTorchMode(mode);
  };

  // Post-Automation Completion Action Settings (Unified State, defaults to Sound)
  const [automationSettings, setAutomationSettings] = useState<{ postTorch: boolean; postSound: boolean }>({
    postTorch: false,
    postSound: true,
  });

  useEffect(() => {
    if (serverSessionState?.automationSettings) {
      setAutomationSettings(serverSessionState.automationSettings);
    }
  }, [serverSessionState?.automationSettings]);

  const handleUpdateAutomationSettings = useCallback(
    (settings: { postTorch: boolean; postSound: boolean }) => {
      setAutomationSettings(settings);
      syncAutomationSettings(settings);
    },
    [syncAutomationSettings]
  );

  // Drawer & Modal State
  const [logDrawerState, setLogDrawerState] = useState<{ isOpen: boolean; pcId?: string; deviceId?: string }>({
    isOpen: false,
  });
  const [wifiModalTarget, setWifiModalTarget] = useState<{
    isOpen: boolean;
    config: WorkflowConfig;
    onSave: (cfg: { enabled: boolean; ssid: string; password?: string }) => void;
  }>({
    isOpen: false,
    config: standbyWorkflowConfig,
    onSave: () => {},
  });

  // Global Device AP mapping (Unified State)
  const [deviceApMap, setDeviceApMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (serverSessionState?.deviceApMap) {
      setDeviceApMap(serverSessionState.deviceApMap);
    }
  }, [serverSessionState?.deviceApMap]);

  // Unified Accordion Expand/Collapse States (Unified State)
  const [accordionStates, setAccordionStates] = useState<Record<string, boolean>>({
    running: true,
    completed: true,
    ready: true,
  });

  useEffect(() => {
    if (serverSessionState?.accordionStates) {
      setAccordionStates((prev) => ({ ...prev, ...serverSessionState.accordionStates }));
    }
  }, [serverSessionState?.accordionStates]);

  const handleToggleAccordion = useCallback(
    (key: string) => {
      setAccordionStates((prev) => {
        const currentVal = prev[key] !== false;
        const next = { ...prev, [key]: !currentVal };
        syncAccordionStates(next);
        return next;
      });
    },
    [syncAccordionStates]
  );

  // Sync real-time MD5 verification progress into matching model profiles
  useEffect(() => {
    if (md5Progress && md5Progress.slotKey) {
      const key = md5Progress.slotKey as keyof FirmwareSlotsMap;
      setModelProfiles((prev) => {
        let changed = false;
        const next = { ...prev };

        for (const [mKey, profile] of Object.entries(next)) {
          const slot = profile.slots[key];
          if (slot && slot.filename && (!md5Progress.filename || slot.filename === md5Progress.filename)) {
            next[mKey] = {
              ...profile,
              slots: {
                ...profile.slots,
                [key]: {
                  ...slot,
                  status: md5Progress.status,
                  progress: md5Progress.progress,
                },
              },
            };
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    }
  }, [md5Progress]);

  // Batch slot update for a specific model profile
  const handleUpdateSlotsBatchForModel = useCallback(
    (modelKey: string, updates: { slotKey: keyof FirmwareSlotsMap; fileItem: BinaryItem | null }[]) => {
      setModelProfiles((prev) => {
        const existingProfile = prev[modelKey] || {
          slots: createInitialSlots(),
          workflowConfig: createInitialWorkflowConfig(),
        };

        const nextSlots = { ...existingProfile.slots };
        const verificationsToDispatch: { targetPc: string; slotKey: string; path: string; filename: string }[] = [];
        const cancellationsToDispatch: string[] = [];

        for (const update of updates) {
          const { slotKey, fileItem } = update;
          if (!fileItem) {
            nextSlots[slotKey] = {
              filename: '',
              path: '',
              sizeBytes: 0,
              status: 'idle',
              progress: 0,
            };
            cancellationsToDispatch.push(slotKey);
          } else {
            nextSlots[slotKey] = {
              filename: fileItem.filename,
              path: fileItem.path,
              sizeBytes: fileItem.sizeBytes,
              pcId: fileItem.pcId,
              status: 'verifying',
              progress: 0,
            };

            const targetPc =
              fileItem.pcId && fileItem.pcId !== 'local' ? fileItem.pcId : bridges[0]?.pcId || 'system';
            verificationsToDispatch.push({
              targetPc,
              slotKey,
              path: fileItem.path,
              filename: fileItem.filename,
            });
          }
        }

        for (const slotKey of cancellationsToDispatch) {
          dispatchAction('all', 'system', 'CANCEL_VERIFY_MD5', { slotKey });
        }

        for (const v of verificationsToDispatch) {
          dispatchAction(v.targetPc, 'system', 'VERIFY_MD5', {
            slotKey: v.slotKey,
            path: v.path,
            filename: v.filename,
          });
        }

        // Sync AP filename into workflow config
        let nextConfig = { ...existingProfile.workflowConfig };
        const apUpdate = updates.find((u) => u.slotKey === 'ap');
        if (apUpdate !== undefined) {
          const nextAp = apUpdate.fileItem ? apUpdate.fileItem.filename : '';
          nextConfig = { ...nextConfig, binaryFile: nextAp };
        }

        // Auto rename model key if AP has clear model name
        const apFile = nextSlots.ap.filename;
        const detectedModel = apFile ? extractModelFromFirmware(apFile) : null;
        let targetKey = modelKey;
        if (detectedModel && modelKey === 'SM-A155F' && !prev[detectedModel]) {
          targetKey = detectedModel;
        }

        const nextProfiles = { ...prev };
        if (targetKey !== modelKey) {
          delete nextProfiles[modelKey];
        }
        nextProfiles[targetKey] = {
          slots: nextSlots,
          workflowConfig: nextConfig,
        };

        syncModelProfiles(nextProfiles);
        return nextProfiles;
      });
    },
    [bridges, dispatchAction, syncModelProfiles]
  );

  const handleResetModelProfile = (modelKey: string) => {
    dispatchAction('all', 'system', 'CANCEL_VERIFY_MD5', { slotKey: 'all' });
    setModelProfiles((prev) => {
      const keys = Object.keys(prev);
      if (keys.length <= 1) {
        const cleanState = {
          'SM-MODEL-1': {
            slots: createInitialSlots(),
            workflowConfig: createInitialWorkflowConfig(),
          },
        };
        syncModelProfiles(cleanState);
        return cleanState;
      }
      const next = { ...prev };
      delete next[modelKey];
      syncModelProfiles(next);
      return next;
    });
  };

  const handleAddNewModel = () => {
    const newKey = `SM-MODEL-${Object.keys(modelProfiles).length + 1}`;
    setModelProfiles((prev) => {
      const next = {
        ...prev,
        [newKey]: {
          slots: createInitialSlots(),
          workflowConfig: createInitialWorkflowConfig(),
        },
      };
      syncModelProfiles(next);
      return next;
    });
  };

  // Device Sorting & Filtering
  const sortedDevices = useFlashKitSort(devices, undefined, searchQuery, selectedPcId, selectedMode);

  // Group Devices by Workflow Status
  const runningDevices = useMemo(
    () => sortedDevices.filter((d) => d.status === 'Flashing...' || (typeof d.progress === 'number' && d.progress > 0 && d.progress < 100)),
    [sortedDevices]
  );

  const completedDevices = useMemo(
    () => sortedDevices.filter((d) => d.status === 'Pass' || d.status === 'Fail'),
    [sortedDevices]
  );

  const readyStandbyDevices = useMemo(
    () => sortedDevices.filter((d) => d.status !== 'Flashing...' && d.status !== 'Pass' && d.status !== 'Fail'),
    [sortedDevices]
  );

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleSelectAll = (ids: string[]) => {
    setSelectedIds(ids);
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  // Single device actions
  const handleDeviceAction = (pcId: string, deviceId: string, action: string) => {
    dispatchAction(pcId, deviceId, action, {});
  };

  const handleOpenLogs = (pcId: string, deviceId: string) => {
    setLogDrawerState({ isOpen: true, pcId, deviceId });
  };

  // Automation Execution State & Confirmation Modal
  const [confirmTarget, setConfirmTarget] = useState<{
    targetIds: string[];
    config: WorkflowConfig;
    slots: FirmwareSlotsMap;
  } | null>(null);

  const handleRunModelAutomation = (targetIds: string[], config: WorkflowConfig, slots: FirmwareSlotsMap) => {
    if (targetIds.length === 0) return;
    setConfirmTarget({ targetIds, config, slots });
  };

  const handleRunStandbyAutomation = (targetIds: string[]) => {
    if (targetIds.length === 0) return;
    setConfirmTarget({
      targetIds,
      config: standbyWorkflowConfig,
      slots: createInitialSlots(),
    });
  };

  const executeConfirmedAutomation = (postTorch: boolean, postSound: boolean) => {
    if (!confirmTarget || confirmTarget.targetIds.length === 0) return;
    const { targetIds, config, slots } = confirmTarget;

    // Abort/Cancel any background MD5 verification tasks on all bridges
    dispatchAction('all', 'system', 'CANCEL_VERIFY_MD5', { slotKey: 'all' });

    // Clean up any remaining 'verifying' status in modelProfiles
    setModelProfiles((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [mKey, profile] of Object.entries(next)) {
        let profileChanged = false;
        const nextSlots = { ...profile.slots };
        for (const [sKey, slotData] of Object.entries(profile.slots)) {
          if (slotData.status === 'verifying') {
            nextSlots[sKey as keyof FirmwareSlotsMap] = {
              ...slotData,
              status: 'verified',
              progress: 100,
            };
            profileChanged = true;
          }
        }
        if (profileChanged) {
          changed = true;
          next[mKey] = { ...profile, slots: nextSlots };
        }
      }
      if (changed) {
        syncModelProfiles(next);
        return next;
      }
      return prev;
    });

    const sourcePcId = slots.ap.pcId || bridges[0]?.pcId;

    // Save AP mapping (Unified State)
    if (slots.ap.filename) {
      setDeviceApMap((prev) => {
        const next = { ...prev };
        for (const id of targetIds) {
          next[id] = slots.ap.filename;
        }
        syncDeviceApMap(next);
        return next;
      });
    }

    // Build payload with full slot paths & per-slot metadata
    const payload = {
      targetIds,
      sourcePcId,
      binaryFile: slots.ap.filename || config.binaryFile || '',
      blFile: slots.bl.filename || '',
      blPath: slots.bl.path || slots.bl.filename || '',
      blPcId: slots.bl.pcId || '',
      apFile: slots.ap.filename || '',
      apPath: slots.ap.path || slots.ap.filename || '',
      apPcId: slots.ap.pcId || sourcePcId || '',
      cpFile: slots.cp.filename || '',
      cpPath: slots.cp.path || slots.cp.filename || '',
      cpPcId: slots.cp.pcId || '',
      cscFile: slots.csc.filename || '',
      cscPath: slots.csc.path || slots.csc.filename || '',
      cscPcId: slots.csc.pcId || '',
      userdataFile: slots.userdata.filename || '',
      userdataPath: slots.userdata.path || slots.userdata.filename || '',
      userdataPcId: slots.userdata.pcId || '',
      odinFlash: Boolean(config.odinFlash && slots.ap.filename),
      skipSuw: config.skipSuw !== false,
      setupGba: config.setupGba !== false,
      wifiEnabled: config.wifiEnabled !== false,
      wifiSsid: config.wifiSsid || 'RTT / IEEE 802.11',
      wifiPassword: config.wifiPassword || '1234qwer',
      postTorch,
      postSound,
      torchMode,
    };

    startWorkflow(targetIds, payload);
    setConfirmTarget(null);
  };

  const handleAbortWorkflow = (pcId: string, deviceId: string) => {
    const dev = devices.find(
      (d) => (d.id === deviceId || d.serial === deviceId || d.port === deviceId) && (pcId === 'all' || d.pcId === pcId)
    );
    setDevices((prev) =>
      prev.map((d) => {
        const isMatch =
          (d.id === deviceId || d.serial === deviceId || d.port === deviceId || (dev && (d.id === dev.id || (dev.serial && d.serial === dev.serial)))) &&
          (pcId === 'all' || d.pcId === pcId);
        return isMatch ? { ...d, status: 'Ready', progress: 0, currentTask: 'Dibatalkan' } : d;
      })
    );
    dispatchAction(pcId, deviceId, 'ABORT_TASK', {
      serial: dev?.serial,
      port: dev?.port,
      id: dev?.id || deviceId,
    });
  };

  const handleAbortAllWorkflows = () => {
    setDevices((prev) =>
      prev.map((d) =>
        d.status === 'Flashing...' || (typeof d.progress === 'number' && d.progress > 0 && d.progress < 100)
          ? { ...d, status: 'Ready', progress: 0, currentTask: 'Dibatalkan' }
          : d
      )
    );
    dispatchAction('all', 'all', 'ABORT_TASK', {});
  };

  const handleResetDeviceStatus = (pcId: string, deviceId: string) => {
    const dev = devices.find(
      (d) => (d.id === deviceId || d.serial === deviceId || d.port === deviceId) && (pcId === 'all' || d.pcId === pcId)
    );
    setDevices((prev) =>
      prev.map((d) => {
        const isMatch =
          (d.id === deviceId || d.serial === deviceId || d.port === deviceId || (dev && (d.id === dev.id || (dev.serial && d.serial === dev.serial)))) &&
          (pcId === 'all' || d.pcId === pcId);
        return isMatch ? { ...d, status: 'Ready', progress: 0, currentTask: undefined } : d;
      })
    );
    dispatchAction(pcId, deviceId, 'RESET_STATUS', {
      serial: dev?.serial,
      port: dev?.port,
      id: dev?.id || deviceId,
    });
  };

  const handleResetAllCompleted = () => {
    setDevices((prev) =>
      prev.map((d) => (d.status === 'Pass' || d.status === 'Fail' ? { ...d, status: 'Ready', progress: 0, currentTask: undefined } : d))
    );
    dispatchAction('all', 'all', 'RESET_STATUS', {});
  };

  // Bulk Actions
  const handleBulkTorch = (deviceIds: string[], state: 'on' | 'off') => {
    setTorchBulk(deviceIds, state, torchMode);
  };

  const handleBulkDispatch = (deviceIds: string[], action: string, params?: any) => {
    for (const id of deviceIds) {
      const dev = devices.find((d) => d.id === id);
      if (dev) {
        dispatchAction(dev.pcId, dev.id, action, params);
      }
    }
  };

  const handleRefreshBinaries = () => {
    for (const bridge of bridges) {
      dispatchAction(bridge.pcId, 'system', 'SCAN_BINARIES', {});
    }
  };

  const profileEntries = Object.entries(modelProfiles);

  return (
    <div className="app-container">
      {/* Top Fixed Header Navbar */}
      <FleetHeader
        isConnected={isConnected}
        devices={devices}
        bridges={bridges}
        torchMode={torchMode}
        onTorchModeChange={handleTorchModeChange}
        onRefresh={handleRefreshBinaries}
        onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
      />

      {/* Main Container */}
      <main className="main-content">
        {/* Global Toolbar Filters */}
        <section className="toolbar-section" style={{ marginBottom: '1rem' }}>
          <div className="toolbar-row">
            <div className="search-input-wrapper">
              <SearchIcon className="search-icon" size={16} />
              <input
                type="text"
                placeholder="Cari serial number, model, PC ID, atau devnode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>

            <select
              className="filter-select"
              value={selectedPcId}
              onChange={(e) => setSelectedPcId(e.target.value)}
            >
              <option value="all">Semua Workstation PC ({bridges.length})</option>
              {bridges.map((b) => (
                <option key={b.pcId} value={b.pcId}>
                  {b.pcId}
                </option>
              ))}
            </select>

            <select
              className="filter-select"
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value)}
            >
              <option value="all">Semua Mode</option>
              <option value="odin">Odin Mode (Download)</option>
              <option value="adb">ADB Mode</option>
              <option value="offline">Offline</option>
            </select>

            <button
              onClick={() => setLogDrawerState({ isOpen: true })}
              className="btn btn-sm btn-toolbar-terminal"
              title="Buka Terminal Live Logs"
            >
              <TerminalIcon size={15} /> Terminal Logs
            </button>
          </div>
        </section>

        {/* =========================================================================
            PARENT ACCORDIONS PER MODEL (Wraps Firmware 5-Slot Form + Matched Devices)
            ========================================================================= */}
        {profileEntries.map(([mKey, profile]) => {
          const apFile = profile.slots.ap?.filename;
          const detectedModel = apFile ? extractModelFromFirmware(apFile) : null;
          const targetModel = detectedModel || mKey;

          const modelDevices = sortedDevices.filter((d) => {
            if (apFile) {
              return isFirmwareForModel(apFile, d.model);
            }
            if (profileEntries.length === 1) {
              return true;
            }
            return Boolean(d.model && d.model.toUpperCase().includes(targetModel.toUpperCase().replace(/^SM[-_]/i, '')));
          });

          return (
            <ModelParentAccordion
              key={mKey}
              modelKey={mKey}
              slots={profile.slots}
              onUpdateSlotsBatch={(updates) => handleUpdateSlotsBatchForModel(mKey, updates)}
              onResetModel={() => handleResetModelProfile(mKey)}
              binaries={binaries}
              bridges={bridges}
              devices={modelDevices}
              allDevices={devices}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onSelectAllModel={handleSelectAll}
              onRunAutomation={(targetIds, cfg, sls) => handleRunModelAutomation(targetIds, cfg, sls)}
              workflowConfig={profile.workflowConfig}
              onUpdateWorkflowConfig={(updater) => {
                setModelProfiles((prev) => {
                  const curr = prev[mKey];
                  if (!curr) return prev;
                  const next = {
                    ...prev,
                    [mKey]: {
                      ...curr,
                      workflowConfig: updater(curr.workflowConfig),
                    },
                  };
                  syncModelProfiles(next);
                  return next;
                });
              }}
              onOpenLogs={handleOpenLogs}
              onOpenWifiModal={() => {
                setWifiModalTarget({
                  isOpen: true,
                  config: profile.workflowConfig,
                  onSave: (cfg) => {
                    setModelProfiles((prev) => {
                      const curr = prev[mKey];
                      if (!curr) return prev;
                      const next = {
                        ...prev,
                        [mKey]: {
                          ...curr,
                          workflowConfig: {
                            ...curr.workflowConfig,
                            wifiEnabled: cfg.enabled,
                            wifiSsid: cfg.ssid,
                            wifiPassword: cfg.password || '1234qwer',
                          },
                        },
                      };
                      syncModelProfiles(next);
                      return next;
                    });
                  },
                });
              }}
              onToggleTorch={(id, pcId, serial) => toggleTorch(id, pcId, serial, torchMode)}
              pendingTorchIds={pendingTorchIds}
              torchMode={torchMode}
              onRefreshBinaries={handleRefreshBinaries}
              onCopyBinary={requestCopyBinary}
              isFirmwareForModel={isFirmwareForModel}
              isParentOpen={accordionStates[`model_parent_${mKey}`] !== false}
              onToggleParentOpen={() => handleToggleAccordion(`model_parent_${mKey}`)}
              isFirmwareOpen={accordionStates[`model_firmware_${mKey}`] !== false}
              onToggleFirmwareOpen={() => handleToggleAccordion(`model_firmware_${mKey}`)}
              isDevicesOpen={accordionStates[`model_devices_${mKey}`] !== false}
              onToggleDevicesOpen={() => handleToggleAccordion(`model_devices_${mKey}`)}
            />
          );
        })}

        {/* Tactile Button to Add Another Model Profile */}
        <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={handleAddNewModel}
            className="btn btn-secondary btn-tactile"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.55rem 1.25rem',
              fontWeight: 700,
              fontSize: '0.85rem',
              borderRadius: 'var(--radius-md)',
              border: '1.5px dashed var(--border-subtle)',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              color: 'var(--text-secondary)',
            }}
          >
            <PlusIcon size={16} /> Tambah Model Firmware Baru
          </button>
        </div>

        {/* Accordion 3: Workflow Sedang Berjalan (In-Progress Executions) */}
        {runningDevices.length > 0 && (
          <RunningWorkflowAccordion
            devices={runningDevices}
            apFilename={profileEntries[0]?.[1]?.slots.ap.filename || ''}
            deviceApMap={deviceApMap}
            binaries={binaries}
            onOpenLogs={handleOpenLogs}
            onAbort={handleAbortWorkflow}
            onAbortAll={handleAbortAllWorkflows}
            isOpen={accordionStates['running'] !== false}
            onToggleOpen={() => handleToggleAccordion('running')}
          />
        )}

        {/* Accordion 4: Workflow Selesai (Completed Pass/Fail Executions) */}
        {completedDevices.length > 0 && (
          <CompletedWorkflowAccordion
            devices={completedDevices}
            onOpenLogs={handleOpenLogs}
            onResetStatus={(deviceId) => {
              const dev = devices.find((d) => d.id === deviceId);
              const pcId = dev?.pcId || 'all';
              handleResetDeviceStatus(pcId, deviceId);
            }}
            onResetAllCompleted={handleResetAllCompleted}
            onRerunAutomation={(targetIds) => handleRunStandbyAutomation(targetIds)}
            onToggleTorch={(id, pcId, serial) => toggleTorch(id, pcId, serial, torchMode)}
            pendingTorchIds={pendingTorchIds}
            isOpen={accordionStates['completed'] !== false}
            onToggleOpen={() => handleToggleAccordion('completed')}
          />
        )}

        {/* Accordion 5: Standby Ready Devices List (Decoupled with Independent Stepper) */}
        <ReadyDevicesAccordion
          devices={readyStandbyDevices}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onOpenLogs={handleOpenLogs}
          onAction={handleDeviceAction}
          onToggleTorch={(id, pcId, serial) => toggleTorch(id, pcId, serial, torchMode)}
          pendingTorchIds={pendingTorchIds}
          onRunAutomation={handleRunStandbyAutomation}
          workflowConfig={standbyWorkflowConfig}
          onUpdateWorkflowConfig={handleUpdateStandbyWorkflowConfig}
          onOpenWifiModal={() => {
            setWifiModalTarget({
              isOpen: true,
              config: standbyWorkflowConfig,
              onSave: (cfg) => {
                handleUpdateStandbyWorkflowConfig((prev) => ({
                  ...prev,
                  wifiEnabled: cfg.enabled,
                  wifiSsid: cfg.ssid,
                  wifiPassword: cfg.password || '1234qwer',
                }));
              },
            });
          }}
          apFilename={profileEntries[0]?.[1]?.slots.ap.filename || ''}
          isFirmwareForModel={isFirmwareForModel}
          isMd5Verifying={false}
          md5VerifyProgress={100}
          isOpen={accordionStates['ready'] !== false}
          onToggleOpen={() => handleToggleAccordion('ready')}
        />
      </main>

      {/* Floating Multi-Device Bulk Action Bar */}
      <BulkActionBar
        selectedIds={selectedIds}
        devices={devices}
        rackCalibration={rackCalibration}
        onSaveCalibration={saveRackCalibration}
        onBlinkDevice={blinkDevice}
        onDeselectAll={handleDeselectAll}
        onToggleTorchBulk={handleBulkTorch}
        onPlaySound={(pattern, targetIds) => playSound(pattern, undefined, undefined, undefined, targetIds)}
        onStopSound={stopSound}
        onDispatchActionBulk={handleBulkDispatch}
        customSoundName={customSoundName}
        onUploadCustomSound={uploadCustomSound}
        onResetCustomSound={resetCustomSound}
        pendingTorchIds={pendingTorchIds}
      />

      {/* Standalone Matrix & Rack Calibration Modal */}
      <LedAnimationModal
        isOpen={isLedModalOpen}
        onClose={() => setIsLedModalOpen(false)}
        selectedCount={selectedIds.length}
        devices={devices}
        rackCalibration={rackCalibration}
        onSaveCalibration={saveRackCalibration}
        onBlinkDevice={blinkDevice}
        onPlaySound={(pattern, targetIds) => playSound(pattern, undefined, undefined, undefined, targetIds)}
        onStopSound={stopSound}
        customSoundName={customSoundName}
        onUploadCustomSound={uploadCustomSound}
        onResetCustomSound={resetCustomSound}
        onStartAnimation={(preset, loop, speed, mode) => {
          const targetPcId = bridges[0]?.pcId || 'ubuntu-desktop';
          dispatchAction(targetPcId, 'all', 'RUN_LED_ANIM', {
            preset,
            loop,
            speed,
            mode: mode || 'flash',
          });
        }}
        onStopAnimation={() => {
          const targetPcId = bridges[0]?.pcId || 'ubuntu-desktop';
          dispatchAction(targetPcId, 'all', 'STOP_LED_ANIM', {});
        }}
      />

      {/* Slide-Over Log Drawer */}
      <LogDrawer
        isOpen={logDrawerState.isOpen}
        onClose={() => setLogDrawerState({ isOpen: false })}
        pcId={logDrawerState.pcId}
        deviceId={logDrawerState.deviceId}
        logs={logs}
      />

      {/* Wi-Fi Credentials Config Modal */}
      <WifiConfigModal
        isOpen={wifiModalTarget.isOpen}
        onClose={() => setWifiModalTarget((prev) => ({ ...prev, isOpen: false }))}
        enabled={wifiModalTarget.config.wifiEnabled}
        ssid={wifiModalTarget.config.wifiSsid}
        password={wifiModalTarget.config.wifiPassword}
        onSave={wifiModalTarget.onSave}
      />

      {/* Automation Confirmation Modal */}
      <AutomationConfirmModal
        isOpen={Boolean(confirmTarget && confirmTarget.targetIds.length > 0)}
        onClose={() => setConfirmTarget(null)}
        onConfirm={executeConfirmedAutomation}
        targetDeviceIds={confirmTarget?.targetIds || []}
        devices={devices}
        workflowConfig={confirmTarget?.config || standbyWorkflowConfig}
        apFilename={confirmTarget?.slots.ap.filename || confirmTarget?.config.binaryFile}
        torchMode={torchMode}
        postTorchDefault={automationSettings.postTorch}
        postSoundDefault={automationSettings.postSound}
        onSettingsChange={handleUpdateAutomationSettings}
      />

      {/* Floating Bottom-Left Cross-Node Binary Transfer Progress Toast */}
      <BinaryTransferToast
        transfers={binaryTransfers}
        onDismiss={dismissBinaryTransfer}
        onControl={controlBinaryTransfer}
      />

      {/* System Update Modal */}
      <UpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        bridgeCount={bridges.length}
      />
    </div>
  );
};
