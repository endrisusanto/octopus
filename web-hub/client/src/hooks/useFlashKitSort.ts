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
  batteryTemp?: number;
  torchOn?: boolean;
  buildType?: string;
  pdaVersion?: string;
  lastSeen: number;
}

// Normalize full model name for display (e.g. "SM-S947B")
export function normalizeModel(model: string | undefined): string {
  if (!model) return 'UNKNOWN';
  const clean = String(model).toUpperCase().replace(/^SAMSUNG[-_ ]?/i, '').trim();
  return clean.startsWith('SM-') || clean.startsWith('SM_') ? clean.replace('_', '-') : `SM-${clean}`;
}

// Extract core model code without any SM/SAMSUNG prefix (e.g. "A065F", "S947B", "A276B")
export function extractCoreModel(name: string | undefined): string {
  if (!name) return '';
  return String(name)
    .toUpperCase()
    .replace(/^SAMSUNG[-_ ]?/i, '')
    .replace(/^SM[-_ ]?/i, '')
    .trim();
}

// Extract model code from Samsung AP/Firmware filename (e.g. "ALL_ODM_A266BXXUCDZI1..." -> "A266B", "ALL_OXM_S926BXXSHDZI1..." -> "S926B")
export function extractModelFromFirmware(filename: string | undefined): string {
  if (!filename) return '';
  const upper = String(filename).toUpperCase();

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

  const cleanFw = String(apFilename).toUpperCase();
  if (devCore && devCore.length >= 4 && cleanFw.includes(devCore)) {
    return true;
  }

  return false;
}

export function useFlashKitSort(
  devices: DeviceItem[] = [],
  apFilename?: string,
  searchQuery: string = '',
  selectedPcId: string = 'all',
  selectedMode: string = 'all'
) {
  return useMemo(() => {
    if (!Array.isArray(devices)) return [];

    // 1. Filter defensively
    const filtered = devices.filter((dev) => {
      if (!dev) return false;

      // Search query (Model, Serial, Port, PC ID)
      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          (dev.model ? String(dev.model).toLowerCase().includes(q) : false) ||
          (dev.serial ? String(dev.serial).toLowerCase().includes(q) : false) ||
          (dev.port ? String(dev.port).toLowerCase().includes(q) : false) ||
          (dev.pcId ? String(dev.pcId).toLowerCase().includes(q) : false) ||
          (dev.id ? String(dev.id).toLowerCase().includes(q) : false);
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

    // 2. Sort defensively using a shallow copy
    return [...filtered].sort((a, b) => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;

      // Rule 1: AP Firmware Model Match on top
      const aMatch = isFirmwareForModel(apFilename, a.model);
      const bMatch = isFirmwareForModel(apFilename, b.model);

      if (aMatch !== bMatch) {
        return aMatch ? -1 : 1;
      }

      // Rule 2: Status Weight Rank
      // Ready (3) > Flashing/Pass (2) > Others/Offline/Fail (1)
      const getWeight = (d: DeviceItem) => {
        if (!d) return 0;
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
      const pcA = String(a.pcId || '');
      const pcB = String(b.pcId || '');
      if (pcA !== pcB) {
        return pcA.localeCompare(pcB);
      }

      const portA = String(a.port || '');
      const portB = String(b.port || '');
      if (portA !== portB) {
        return portA.localeCompare(portB, undefined, { numeric: true, sensitivity: 'base' });
      }

      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }, [devices, apFilename, searchQuery, selectedPcId, selectedMode]);
}
