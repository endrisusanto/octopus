import React, { useState } from 'react';
import { useFleetWebSocket } from './hooks/useFleetWebSocket';
import { useFlashKitSort, isFirmwareForModel } from './hooks/useFlashKitSort';
import { FleetHeader } from './components/FleetHeader';
import { DeviceCard } from './components/DeviceCard';
import { DeviceTableView } from './components/DeviceTableView';
import { LogDrawer } from './components/LogDrawer';
import { BatchActionModal } from './components/BatchActionModal';
import { SearchIcon, GridIcon, ListIcon, PlayIcon, TerminalIcon } from './components/Icons';

export const App: React.FC = () => {
  const { devices, bridges, isConnected, logs, dispatchAction, simulateAction } = useFleetWebSocket();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPcId, setSelectedPcId] = useState('all');
  const [selectedMode, setSelectedMode] = useState('all');
  const [apFilename, setApFilename] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Drawer & Modal State
  const [logDrawerState, setLogDrawerState] = useState<{ isOpen: boolean; pcId?: string; deviceId?: string }>({
    isOpen: false,
  });
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

  // Apply FlashKit Sort Rules
  const sortedDevices = useFlashKitSort(devices, apFilename, searchQuery, selectedPcId, selectedMode);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleSelectAll = () => {
    if (selectedIds.length === sortedDevices.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(sortedDevices.map((d) => d.id));
    }
  };

  const handleOpenLogs = (pcId: string, deviceId: string) => {
    setLogDrawerState({ isOpen: true, pcId, deviceId });
  };

  const handleDeviceAction = (pcId: string, deviceId: string, action: string) => {
    dispatchAction(pcId, deviceId, action, { apFilename });
    simulateAction(pcId, deviceId, action);
  };

  const handleExecuteBatch = (action: string, params: { apFilename?: string; command?: string }) => {
    const selectedDevices = devices.filter((d) => selectedIds.includes(d.id));
    for (const dev of selectedDevices) {
      dispatchAction(dev.pcId, dev.id, action, params);
      simulateAction(dev.pcId, dev.id, action);
    }
  };

  const handleTriggerAgentUpdate = () => {
    for (const b of bridges) {
      dispatchAction(b.pcId, 'system', 'SELF_UPDATE', { targetVersion: 'latest' });
    }
    setLogDrawerState({ isOpen: true });
  };

  return (
    <div className="app-container">
      <FleetHeader
        bridges={bridges}
        devices={devices}
        isConnected={isConnected}
        onRefresh={handleTriggerAgentUpdate}
      />

      <main className="main-content">
        {/* Controls Toolbar */}
        <section className="toolbar-section">
          <div className="toolbar-row">
            {/* Search Input */}
            <div className="search-input-wrapper">
              <SearchIcon size={16} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search Model, Serial, Port, or PC ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* PC ID Filter */}
            <select
              className="filter-select"
              value={selectedPcId}
              onChange={(e) => setSelectedPcId(e.target.value)}
            >
              <option value="all">All PC Workstations ({bridges.length})</option>
              {bridges.map((b) => (
                <option key={b.pcId} value={b.pcId}>
                  {b.pcId} ({b.os})
                </option>
              ))}
            </select>

            {/* Mode Filter */}
            <select
              className="filter-select"
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value)}
            >
              <option value="all">All Modes</option>
              <option value="odin">Odin Mode (Download)</option>
              <option value="adb">ADB Mode</option>
              <option value="offline">Offline</option>
            </select>

            {/* AP Firmware Input */}
            <input
              type="text"
              className="search-input"
              style={{ maxWidth: '280px', paddingLeft: '0.75rem' }}
              placeholder="AP Firmware Filter (e.g. AP_S908B...)"
              value={apFilename}
              onChange={(e) => setApFilename(e.target.value)}
              title="Enter firmware filename to prioritize matching device models to top"
            />

            {/* View Mode Toggle */}
            <div className="view-mode-group">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
                title="Table Matrix View"
              >
                <ListIcon size={15} /> Table
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'cards' ? 'active' : ''}`}
                onClick={() => setViewMode('cards')}
                title="Card Grid View"
              >
                <GridIcon size={15} /> Cards
              </button>
            </div>
          </div>

          {/* Action Batch Row */}
          <div className="toolbar-row" style={{ paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Showing <strong>{sortedDevices.length}</strong> of <strong>{devices.length}</strong> devices
              {selectedIds.length > 0 && ` (${selectedIds.length} selected)`}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setIsBatchModalOpen(true)}
                className="btn btn-primary btn-sm"
                disabled={selectedIds.length === 0}
              >
                <PlayIcon size={14} /> Batch Actions ({selectedIds.length})
              </button>

              <button
                onClick={() => setLogDrawerState({ isOpen: true })}
                className="btn btn-sm"
              >
                <TerminalIcon size={14} /> Global Logs
              </button>
            </div>
          </div>
        </section>

        {/* Content View: Table or Card Grid */}
        {sortedDevices.length === 0 ? (
          <div className="empty-state">
            <h3 className="empty-state-title">No Devices Detected</h3>
            <p className="empty-state-desc">
              Ensure connected Agent Bridges (Windows or Ubuntu) are running and target Android devices are plugged in via USB.
            </p>
          </div>
        ) : viewMode === 'table' ? (
          <DeviceTableView
            devices={sortedDevices}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onOpenLogs={handleOpenLogs}
            onAction={handleDeviceAction}
            apFilename={apFilename}
            isFirmwareForModel={isFirmwareForModel}
          />
        ) : (
          <div className="device-grid">
            {sortedDevices.map((device) => (
              <DeviceCard
                key={`${device.pcId}-${device.id}`}
                device={device}
                isSelected={selectedIds.includes(device.id)}
                onToggleSelect={handleToggleSelect}
                onOpenLogs={handleOpenLogs}
                onAction={handleDeviceAction}
                isFirmwareMatch={isFirmwareForModel(apFilename, device.model)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Terminal Slide-Over Drawer */}
      <LogDrawer
        isOpen={logDrawerState.isOpen}
        onClose={() => setLogDrawerState({ isOpen: false })}
        pcId={logDrawerState.pcId}
        deviceId={logDrawerState.deviceId}
        logs={logs}
      />

      {/* Batch Action Modal */}
      <BatchActionModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        selectedCount={selectedIds.length}
        onExecuteBatch={handleExecuteBatch}
        currentApFilename={apFilename}
        onSetApFilename={setApFilename}
      />
    </div>
  );
};
