import { useMemo } from 'react';

export interface DeviceItem {
  id: string;
  pcId: string;
  pcOs: 'ubuntu' | 'windows' | 'linux';
  port: string;
  serial?: string;
  model: string;
  mode: 'odin' | 'adb' | 'recovery' | 'offline';
  status: 'Ready' | 'Flashing...' | 'Pass' | 'Fail' | 'Busy' | 'Offline';
  progress?: number;
  currentTask?: string;
  batteryLevel?: number;
  lastSeen: number;
}

// FlashKit Model Normalizer
export function normalizeModel(model: string | undefined): string {
  if (!model) return 'UNKNOWN';
  return model.toUpperCase().replace(/^SAMSUNG[-_ ]?/i, '').trim();
}

// FlashKit AP Firmware Matcher
export function isFirmwareForModel(apFilename: string | undefined, modelName: string | undefined): boolean {
  if (!apFilename || !modelName) return false;
  
  const cleanModel = normalizeModel(modelName);
  const cleanAp = apFilename.toUpperCase();

  // Strip prefixes
  const pureAp = cleanAp
    .replace(/^AP[_-]/i, '')
    .replace(/^BL[_-]/i, '')
    .replace(/^CP[_-]/i, '')
    .replace(/^CSC[_-]/i, '');

  return pureAp.includes(cleanModel) || cleanModel.includes(pureAp.split('_')[0] || '---');
}

export function useFlashKitSort(
  devices: DeviceItem[],
  apFilename?: string,
  searchQuery: string = '',
  selectedPcId: string = 'all',
  selectedMode: string = 'all'
) {
  return useMemo(() => {
    // 1. Filter
    const filtered = devices.filter((dev) => {
      // Search query (Model, Serial, Port, PC ID)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          dev.model.toLowerCase().includes(q) ||
          (dev.serial && dev.serial.toLowerCase().includes(q)) ||
          dev.port.toLowerCase().includes(q) ||
          dev.pcId.toLowerCase().includes(q) ||
          dev.id.toLowerCase().includes(q);
        if (!match) return false;
      }

      // PC ID filter
      if (selectedPcId !== 'all' && dev.pcId !== selectedPcId) {
        return false;
      }

      // Mode filter
      if (selectedMode !== 'all' && dev.mode !== selectedMode) {
        return false;
      }

      return true;
    });

    // 2. Sort by FlashKit Rules
    return filtered.sort((a, b) => {
      // Rule 1: AP Firmware Model Match on top
      const aMatch = isFirmwareForModel(apFilename, a.model);
      const bMatch = isFirmwareForModel(apFilename, b.model);

      if (aMatch !== bMatch) {
        return aMatch ? -1 : 1;
      }

      // Rule 2: Status Weight Rank
      // Ready (3) > Flashing/Pass (2) > Others/Offline/Fail (1)
      const getWeight = (d: DeviceItem) => {
        if (d.status === 'Ready') return 3;
        if (d.status === 'Flashing...' || d.status === 'Pass') return 2;
        return 1;
      };

      const wA = getWeight(a);
      const wB = getWeight(b);

      if (wA !== wB) {
        return wB - wA;
      }

      // Rule 3: Deterministic Alphanumeric Fallback (PC ID -> Port -> ID)
      if (a.pcId !== b.pcId) {
        return a.pcId.localeCompare(b.pcId);
      }
      if (a.port !== b.port) {
        return a.port.localeCompare(b.port);
      }
      return a.id.localeCompare(b.id);
    });
  }, [devices, apFilename, searchQuery, selectedPcId, selectedMode]);
}
