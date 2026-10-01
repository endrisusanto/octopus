import React, { useState, useEffect, useCallback } from 'react';
import { useFleetWebSocket, BinaryItem } from './hooks/useFleetWebSocket';
import { useFlashKitSort, isFirmwareForModel, extractModelFromFirmware } from './hooks/useFlashKitSort';
import { FleetHeader } from './components/FleetHeader';
import { WorkflowConfig } from './components/WorkflowStepper';
import { FirmwareAccordion, FirmwareSlotsMap } from './components/FirmwareAccordion';
import { SuggestionMatchAccordion } from './components/SuggestionMatchAccordion';
import { RunningWorkflowAccordion } from './components/RunningWorkflowAccordion';
import { CompletedWorkflowAccordion } from './components/CompletedWorkflowAccordion';
import { ReadyDevicesAccordion } from './components/ReadyDevicesAccordion';
import { LogDrawer } from './components/LogDrawer';
import { WifiConfigModal } from './components/WifiConfigModal';
import { BulkActionBar } from './components/BulkActionBar';
import { LedAnimationModal } from './components/LedAnimationModal';
import { AutomationConfirmModal } from './components/AutomationConfirmModal';
import { BinaryTransferToast } from './components/BinaryTransferToast';
import { SearchIcon, TerminalIcon } from './components/Icons';

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
    rackCalibration,
    saveRackCalibration,
    blinkDevice,
    syncFirmwareSlots,
    syncWorkflowConfig,
    syncSelectedDevices,
    dispatchAction,
    toggleTorch,
    setTorchBulk,
    pendingTorchIds,
  } = useFleetWebSocket();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPcId, setSelectedPcId] = useState('all');
  const [selectedMode, setSelectedMode] = useState('all');
  const [isLedModalOpen, setIsLedModalOpen] = useState(false);

  // Firmware 5-Slot State
  const [firmwareSlots, setFirmwareSlots] = useState<FirmwareSlotsMap>({
    bl: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
    ap: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
    cp: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
    csc: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
    userdata: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
  });

  // Workflow Automation Checklist State with default preset
  const [workflowConfig, setWorkflowConfig] = useState<WorkflowConfig>({
    binaryFile: '',
    odinFlash: true,
    skipSuw: true,
    setupGba: true,
    wifiEnabled: true,
    wifiSsid: 'RTT / IEEE 802.11',
    wifiPassword: '1234qwer',
  });

  // Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Senter (Torch) Mode: Flash Camera vs Screen Brightness
  const [torchMode, setTorchMode] = useState<'flash' | 'screen'>(() => {
    return (localStorage.getItem('octopus_torch_mode') as 'flash' | 'screen') || 'flash';
  });

  const handleTorchModeChange = (mode: 'flash' | 'screen') => {
    setTorchMode(mode);
    localStorage.setItem('octopus_torch_mode', mode);
  };

  // Drawer & Modal State
  const [logDrawerState, setLogDrawerState] = useState<{ isOpen: boolean; pcId?: string; deviceId?: string }>({
    isOpen: false,
  });
  const [isWifiModalOpen, setIsWifiModalOpen] = useState(false);
  const [deviceApMap, setDeviceApMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('octopus_device_ap_map');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('octopus_device_ap_map', JSON.stringify(deviceApMap));
    } catch (_) {}
  }, [deviceApMap]);

  // Sync server session state into local state safely without cyclic re-render echo
  useEffect(() => {
    if (serverSessionState) {
      if (serverSessionState.firmwareSlots) {
        setFirmwareSlots((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(serverSessionState.firmwareSlots)) return prev;
          return serverSessionState.firmwareSlots!;
        });
      }
      if (serverSessionState.workflowConfig) {
        setWorkflowConfig((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(serverSessionState.workflowConfig)) return prev;
          return serverSessionState.workflowConfig!;
        });
      }
      if (serverSessionState.selectedDeviceIds) {
        setSelectedIds((prev) => {
          const prevStr = prev.slice().sort().join(',');
          const nextStr = (serverSessionState.selectedDeviceIds || []).slice().sort().join(',');
          if (prevStr === nextStr) return prev;
          return serverSessionState.selectedDeviceIds!;
        });
      }
    }
  }, [serverSessionState]);

  // Sync real-time MD5 verification progress from Bridge
  useEffect(() => {
    if (md5Progress && md5Progress.slotKey) {
      const key = md5Progress.slotKey as keyof FirmwareSlotsMap;
      setFirmwareSlots((prev) => {
        if (!prev[key]) return prev;
        
        // Anti-glitch guard: Discard progress if slot is currently empty/idle
        if (!prev[key].filename || prev[key].filename.trim() === '') {
          return prev;
        }
        // Anti-glitch guard: Discard progress if message is for an older or different file
        if (md5Progress.filename && prev[key].filename !== md5Progress.filename) {
          return prev;
        }

        return {
          ...prev,
          [key]: {
            ...prev[key],
            status: md5Progress.status,
            progress: md5Progress.progress,
          },
        };
      });
    }
  }, [md5Progress]);

  // Atomic batch slot update with MD5 verification dispatch
  const handleUpdateSlotsBatch = useCallback(
    (updates: { slotKey: keyof FirmwareSlotsMap; fileItem: BinaryItem | null }[]) => {
      setFirmwareSlots((prev) => {
        const nextSlots = { ...prev };
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

        // 1-Session state sync to server
        syncFirmwareSlots(nextSlots);

        // Cancel previous running verifications if cleared
        for (const slotKey of cancellationsToDispatch) {
          dispatchAction('all', 'system', 'CANCEL_VERIFY_MD5', { slotKey });
        }

        // Dispatch new verification task(s)
        for (const v of verificationsToDispatch) {
          dispatchAction(v.targetPc, 'system', 'VERIFY_MD5', {
            slotKey: v.slotKey,
            path: v.path,
            filename: v.filename,
          });
        }

        // Keep workflowConfig.binaryFile in sync with AP slot
        const apUpdate = updates.find((u) => u.slotKey === 'ap');
        if (apUpdate !== undefined) {
          const nextAp = apUpdate.fileItem ? apUpdate.fileItem.filename : '';
          setWorkflowConfig((cfg) => {
            if (cfg.binaryFile === nextAp) return cfg;
            const nextCfg = { ...cfg, binaryFile: nextAp };
            syncWorkflowConfig(nextCfg);
            return nextCfg;
          });
        }

        return nextSlots;
      });
    },
    [bridges, dispatchAction, syncFirmwareSlots, syncWorkflowConfig]
  );

  const handleUpdateSlot = (slotKey: keyof FirmwareSlotsMap, fileItem: BinaryItem | null) => {
    handleUpdateSlotsBatch([{ slotKey, fileItem }]);
  };

  const handleResetAllSlots = () => {
    // Abort active verification tasks on all bridges immediately
    dispatchAction('all', 'system', 'CANCEL_VERIFY_MD5', { slotKey: 'all' });

    const emptySlots: FirmwareSlotsMap = {
      bl: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
      ap: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
      cp: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
      csc: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
      userdata: { filename: '', path: '', sizeBytes: 0, status: 'idle', progress: 0 },
    };
    setFirmwareSlots(emptySlots);
    syncFirmwareSlots(emptySlots);
    const newCfg = { ...workflowConfig, binaryFile: '' };
    setWorkflowConfig(newCfg);
    syncWorkflowConfig(newCfg);
  };

  const handleUpdateWorkflowConfig = (updater: (prev: WorkflowConfig) => WorkflowConfig) => {
    setWorkflowConfig((prev) => {
      const next = updater(prev);
      syncWorkflowConfig(next);
      return next;
    });
  };

  // Sort & Filter All Devices
  const sortedDevices = useFlashKitSort(devices, workflowConfig.binaryFile, searchQuery, selectedPcId, selectedMode);

  // Group devices into: Running, Completed (Pass/Fail), Suggestion Match (matching AP), and Standby Ready
  const runningDevices = sortedDevices.filter((d) => d.status === 'Flashing...' || d.status === 'Busy');
  const completedDevices = sortedDevices.filter((d) => d.status === 'Pass' || d.status === 'Fail');

  // Active AP filename & Source PC ID
  const activeAp = firmwareSlots.ap.filename || workflowConfig.binaryFile;
  const sourcePcId = firmwareSlots.ap.pcId || firmwareSlots.bl.pcId || firmwareSlots.cp.pcId || firmwareSlots.csc.pcId || firmwareSlots.userdata.pcId;

  const extractedFwModel = extractModelFromFirmware(activeAp);
  const matchedModelName = extractedFwModel
    ? (extractedFwModel.toUpperCase().startsWith('SM-') ? extractedFwModel.toUpperCase() : `SM-${extractedFwModel.toUpperCase()}`)
    : 'SM-DEVICE';

  const matchedDevices = activeAp
    ? sortedDevices.filter(
        (d) =>
          !runningDevices.some((r) => r.id === d.id) &&
          !completedDevices.some((c) => c.id === d.id) &&
          isFirmwareForModel(activeAp, d.model)
      )
    : [];

  const readyStandbyDevices = sortedDevices.filter(
    (d) =>
      !runningDevices.some((r) => r.id === d.id) &&
      !completedDevices.some((c) => c.id === d.id) &&
      !matchedDevices.some((m) => m.id === d.id)
  );

  // Check if any firmware slot is verifying MD5
  const isMd5Verifying = Object.values(firmwareSlots).some((s) => s.status === 'verifying');
  const md5VerifyProgress = (() => {
    const verifying = Object.values(firmwareSlots).filter((s) => s.status === 'verifying');
    if (verifying.length === 0) return 100;
    const sum = verifying.reduce((acc, curr) => acc + (curr.progress || 0), 0);
    return Math.round(sum / verifying.length);
  })();

  // Reset Completed Device Status back to Standby
  const handleResetDeviceStatus = (deviceId: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, status: 'Ready', progress: 0, currentTask: 'Standby Ready' } : d))
    );
  };

  const handleResetAllCompleted = () => {
    setDevices((prev) =>
      prev.map((d) =>
        d.status === 'Pass' || d.status === 'Fail'
          ? { ...d, status: 'Ready', progress: 0, currentTask: 'Standby Ready' }
          : d
      )
    );
  };

  // Auto-select matched devices when matched model changes (across all connected nodes)
  useEffect(() => {
    if (matchedDevices.length > 0) {
      const valid = matchedDevices.map((d) => d.id);
      setSelectedIds((prev) => {
        const prevStr = prev.slice().sort().join(',');
        const validStr = valid.slice().sort().join(',');
        if (prevStr === validStr) return prev;
        syncSelectedDevices(valid);
        return valid;
      });
    }
  }, [activeAp, matchedDevices.length, syncSelectedDevices]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      syncSelectedDevices(next);
      return next;
    });
  };

  const handleSelectAll = (ids: string[]) => {
    setSelectedIds(ids);
    syncSelectedDevices(ids);
  };

  const handleOpenLogs = (pcId: string, deviceId: string) => {
    setLogDrawerState({ isOpen: true, pcId, deviceId });
  };

  const handleDeviceAction = (pcId: string, deviceId: string, action: string) => {
    const apToUse = firmwareSlots.ap.filename || workflowConfig.binaryFile;
    if (apToUse) {
      setDeviceApMap((prev) => ({ ...prev, [deviceId]: apToUse }));
    }
    dispatchAction(pcId, deviceId, action, {
      apFilename: apToUse,
      apPath: firmwareSlots.ap.path || firmwareSlots.ap.filename || workflowConfig.binaryFile,
      blPath: firmwareSlots.bl.path || firmwareSlots.bl.filename,
      cpPath: firmwareSlots.cp.path || firmwareSlots.cp.filename,
      cscPath: firmwareSlots.csc.path || firmwareSlots.csc.filename,
      userdataPath: firmwareSlots.userdata.path || firmwareSlots.userdata.filename,
      odinFlash: true,
      skipSuw: workflowConfig.skipSuw,
      setupGba: workflowConfig.setupGba,
      wifiEnabled: workflowConfig.wifiEnabled,
      wifiSsid: workflowConfig.wifiSsid,
      wifiPassword: workflowConfig.wifiPassword,
    });
  };

  // Automation Confirmation State
  const [confirmTargetIds, setConfirmTargetIds] = useState<string[] | null>(null);

  // Trigger Confirmation Modal when user clicks "Jalankan Automasi"
  const handleRunAutomation = (targetDeviceIds: string[]) => {
    if (!targetDeviceIds || targetDeviceIds.length === 0) return;
    setConfirmTargetIds(targetDeviceIds);
  };

  // Execute Automation after user confirms in the modal
  const executeConfirmedAutomation = (postTorch: boolean) => {
    if (!confirmTargetIds || confirmTargetIds.length === 0) return;
    const targetDeviceIds = confirmTargetIds;
    const targetDevices = devices.filter((d) => targetDeviceIds.includes(d.id));
    if (targetDevices.length === 0) return;

    const apToUse = firmwareSlots.ap.filename || workflowConfig.binaryFile;
    if (apToUse) {
      setDeviceApMap((prev) => {
        const next = { ...prev };
        targetDevices.forEach((d) => {
          next[d.id] = apToUse;
        });
        return next;
      });
    }

    // Optimistically update device states so they appear in RunningWorkflowAccordion immediately
    setDevices((prev) =>
      prev.map((d) =>
        targetDeviceIds.includes(d.id)
          ? {
              ...d,
              status: 'Flashing...',
              progress: 10,
              currentTask: 'Memulai automasi...',
            }
          : d
      )
    );

    // Unselect targeted devices
    setSelectedIds((prev) => {
      const next = prev.filter((id) => !targetDeviceIds.includes(id));
      syncSelectedDevices(next);
      return next;
    });

    for (const dev of targetDevices) {
      dispatchAction(dev.pcId, dev.id, 'WORKFLOW_PIPELINE', {
        apFilename: apToUse,
        apPath: firmwareSlots.ap.path || firmwareSlots.ap.filename || workflowConfig.binaryFile,
        blPath: firmwareSlots.bl.path || firmwareSlots.bl.filename,
        cpPath: firmwareSlots.cp.path || firmwareSlots.cp.filename,
        cscPath: firmwareSlots.csc.path || firmwareSlots.csc.filename,
        userdataPath: firmwareSlots.userdata.path || firmwareSlots.userdata.filename,
        odinFlash: workflowConfig.odinFlash !== false && Boolean(apToUse),
        skipSuw: workflowConfig.skipSuw,
        setupGba: workflowConfig.setupGba,
        wifiEnabled: workflowConfig.wifiEnabled,
        wifiSsid: workflowConfig.wifiSsid,
        wifiPassword: workflowConfig.wifiPassword,
        postTorch,
      });
    }

    // Reset firmware slots after triggering automation
    handleResetAllSlots();
    setConfirmTargetIds(null);
  };

  const handleBulkTorch = (targetDeviceIds: string[], state: 'on' | 'off') => {
    setTorchBulk(targetDeviceIds, state, torchMode);
  };

  const handleBulkDispatch = (targetDeviceIds: string[], action: string, params: any = {}) => {
    targetDeviceIds.forEach((id) => {
      const dev = devices.find((d) => d.id === id);
      if (dev) {
        dispatchAction(dev.pcId, dev.id, action, params);
      }
    });
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
    syncSelectedDevices([]);
  };

  const handleTriggerAgentUpdate = () => {
    for (const b of bridges) {
      dispatchAction(b.pcId, 'system', 'SELF_UPDATE', { targetVersion: 'latest' });
    }
    setLogDrawerState({ isOpen: true });
  };

  const handleReloadDevices = () => {
    for (const b of bridges) {
      dispatchAction(b.pcId, 'system', 'RELOAD_DEVICES', {});
    }
  };

  const handleRefreshBinaries = () => {
    for (const b of bridges) {
      dispatchAction(b.pcId, 'system', 'SCAN_BINARIES', {});
    }
  };

  return (
    <div className="app-container">
      <FleetHeader
        bridges={bridges}
        devices={devices}
        isConnected={isConnected}
        torchMode={torchMode}
        onTorchModeChange={handleTorchModeChange}
        onRefresh={handleTriggerAgentUpdate}
        onReloadDevices={handleReloadDevices}
      />

      <main className="main-content">
        {/* Global Toolbar Filters - Located Above Firmware Card */}
        <section className="toolbar-section" style={{ marginBottom: '1rem' }}>
          <div className="toolbar-row">
            <div className="search-input-wrapper">
              <SearchIcon size={16} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Cari Model, Serial, Port, atau PC ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
                  {b.pcId} ({b.os})
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

        {/* Accordion 1: Firmware Binary Slots (BL, AP, CP, CSC, USERDATA) */}
        <FirmwareAccordion
          slots={firmwareSlots}
          onUpdateSlot={handleUpdateSlot}
          onUpdateSlotsBatch={handleUpdateSlotsBatch}
          onResetAll={handleResetAllSlots}
          binaries={binaries}
          bridges={bridges}
          devices={devices}
          onRefreshBinaries={handleRefreshBinaries}
          onCopyBinary={requestCopyBinary}
        />

        {/* Accordion 2: Suggestion Match (Highlighted with Accent Glow Outline) */}
        {activeAp && (
          <SuggestionMatchAccordion
            matchedModel={matchedModelName}
            apFilename={activeAp}
            sourcePcId={sourcePcId}
            devices={matchedDevices}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onRunAutomation={handleRunAutomation}
            workflowConfig={workflowConfig}
            onUpdateWorkflowConfig={handleUpdateWorkflowConfig}
            onOpenLogs={handleOpenLogs}
            onOpenWifiModal={() => setIsWifiModalOpen(true)}
            onToggleTorch={(id, pcId, serial) => toggleTorch(id, pcId, serial, torchMode)}
            pendingTorchIds={pendingTorchIds}
            isMd5Verifying={isMd5Verifying}
            md5VerifyProgress={md5VerifyProgress}
          />
        )}

        {/* Accordion 3: Workflow Sedang Berjalan (In-Progress Executions) */}
        {runningDevices.length > 0 && (
          <RunningWorkflowAccordion
            devices={runningDevices}
            apFilename={firmwareSlots.ap.filename || workflowConfig.binaryFile}
            deviceApMap={deviceApMap}
            binaries={binaries}
            onOpenLogs={handleOpenLogs}
            onAbort={(pcId, deviceId) => dispatchAction(pcId, deviceId, 'ABORT_TASK', {})}
          />
        )}

        {/* Accordion 4: Workflow Selesai (Completed Pass/Fail Executions) */}
        {completedDevices.length > 0 && (
          <CompletedWorkflowAccordion
            devices={completedDevices}
            onOpenLogs={handleOpenLogs}
            onResetStatus={handleResetDeviceStatus}
            onResetAllCompleted={handleResetAllCompleted}
            onRerunAutomation={handleRunAutomation}
            onToggleTorch={(id, pcId, serial) => toggleTorch(id, pcId, serial, torchMode)}
            pendingTorchIds={pendingTorchIds}
          />
        )}

        {/* Accordion 5: Standby Ready Devices List */}
        {sortedDevices.length === 0 ? (
          <div className="empty-state">
            <h3 className="empty-state-title">Tidak Ada Perangkat Terdeteksi</h3>
            <p className="empty-state-desc">
              Pastikan Agent Bridge (Windows atau Ubuntu) sedang berjalan dan perangkat Android terhubung via USB.
            </p>
          </div>
        ) : (
          <ReadyDevicesAccordion
            devices={readyStandbyDevices}
            selectedIds={selectedIds}
            sourcePcId={sourcePcId}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onOpenLogs={handleOpenLogs}
            onAction={handleDeviceAction}
            onToggleTorch={(id, pcId, serial) => toggleTorch(id, pcId, serial, torchMode)}
            pendingTorchIds={pendingTorchIds}
            onRunAutomation={handleRunAutomation}
            workflowConfig={workflowConfig}
            onUpdateWorkflowConfig={handleUpdateWorkflowConfig}
            onOpenWifiModal={() => setIsWifiModalOpen(true)}
            apFilename={workflowConfig.binaryFile}
            isFirmwareForModel={isFirmwareForModel}
            isMd5Verifying={isMd5Verifying}
            md5VerifyProgress={md5VerifyProgress}
          />
        )}
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
        onDispatchActionBulk={handleBulkDispatch}
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
        onStartAnimation={(preset, loop, speed) => {
          const targetPcId = bridges[0]?.pcId || 'ubuntu-desktop';
          dispatchAction(targetPcId, 'all', 'RUN_LED_ANIM', {
            preset,
            loop,
            speed,
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
        isOpen={isWifiModalOpen}
        onClose={() => setIsWifiModalOpen(false)}
        enabled={workflowConfig.wifiEnabled}
        ssid={workflowConfig.wifiSsid}
        password={workflowConfig.wifiPassword}
        onSave={(cfg) =>
          setWorkflowConfig((prev) => ({
            ...prev,
            wifiEnabled: cfg.enabled,
            wifiSsid: cfg.ssid,
            wifiPassword: cfg.password,
          }))
        }
      />

      {/* Automation Confirmation & Post-Torch Option Modal */}
      <AutomationConfirmModal
        isOpen={Boolean(confirmTargetIds && confirmTargetIds.length > 0)}
        onClose={() => setConfirmTargetIds(null)}
        onConfirm={executeConfirmedAutomation}
        targetDeviceIds={confirmTargetIds || []}
        devices={devices}
        workflowConfig={workflowConfig}
        apFilename={firmwareSlots.ap.filename || workflowConfig.binaryFile}
      />

      {/* Floating Bottom-Left Cross-Node Binary Transfer Progress Toast */}
      <BinaryTransferToast
        transfers={binaryTransfers}
        onDismiss={dismissBinaryTransfer}
        onControl={controlBinaryTransfer}
      />
    </div>
  );
};
