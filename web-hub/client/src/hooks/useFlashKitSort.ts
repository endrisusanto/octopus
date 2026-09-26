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

// Normalize full model name for display (e.g. "SM-S947B")
export function normalizeModel(model: string | undefined): string {
  if (!model) return 'UNKNOWN';
  const clean = model.toUpperCase().replace(/^SAMSUNG[-_ ]?/i, '').trim();
  return clean.startsWith('SM-') || clean.startsWith('SM_') ? clean.replace('_', '-') : `SM-${clean}`;
}

// Extract core model code without any SM/SAMSUNG prefix (e.g. "A065F", "S947B", "A276B")
export function extractCoreModel(name: string | undefined): string {
  if (!name) return '';
  return name
    .toUpperCase()
    .replace(/^SAMSUNG[-_ ]?/i, '')
    .replace(/^SM[-_ ]?/i, '')
    .trim();
}

// Extract model code from Samsung AP/Firmware filename (e.g. "ALL_ODM_A266BXXUCDZI1..." -> "A266B", "ALL_OXM_S926BXXSHDZI1..." -> "S926B")
export function extractModelFromFirmware(filename: string | undefined): string {
  if (!filename) return '';
  const upper = filename.toUpperCase();

  // Pattern 1: Scan tokens for Samsung standard model code format (e.g. A266B, A065F, S926B, F741B, S721B)
  const tokens = upper.split(/[_\-.\s/\\()]+/);
  for (const token of tokens) {
    if (['ALL', 'ODM', 'OLE', 'OXM', 'OJM', 'OYN', 'OWO', 'AP', 'BL', 'CP', 'CSC', 'HOME', 'USERDATA', 'USER', 'SHIP', 'MULTI', 'CERT', 'META', 'REV00', 'REV01', 'REV02', 'LOW'].includes(token)) {
      continue;
    }
    const tokenMatch = token.match(/^(?:SM[-_]?)?([ASFMNGTXZEWY][0-9]{3}[A-Z0-9])/i);
    if (tokenMatch && tokenMatch[1]) {
      const res = tokenMatch[1].toUpperCase();
      if (!['USER', 'SHIP', 'CERT', 'META'].includes(res)) {
        return res;
      }
    }
  }

  // Pattern 2: Search anywhere in filename after prefix
  const match = upper.match(/(?:ALL_[A-Z0-9]{3,4}_|AP_|BL_|CP_|CSC_|HOME_CSC_|USERDATA_|SM[-_])([ASFMNGTXZEWY][0-9]{3}[A-Z0-9])/i);
  if (match && match[1]) {
    const res = match[1].toUpperCase();
    if (!['USER', 'SHIP', 'CERT', 'META'].includes(res)) {
      return res;
    }
  }

  return '';
}

// Check if a firmware file is intended for a given device model
export function isFirmwareForModel(apFilename: string | undefined, deviceModel: string | undefined): boolean {
  if (!apFilename || !deviceModel) return false;

  const fwModel = extractModelFromFirmware(apFilename);
  const devCore = extractCoreModel(deviceModel);

  if (fwModel && devCore) {
    if (devCore.includes(fwModel) || fwModel.includes(devCore)) {
      return true;
    }
  }

  const cleanFw = apFilename.toUpperCase();
  if (devCore && devCore.length >= 4 && cleanFw.includes(devCore)) {
    return true;
  }

  return false;
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
