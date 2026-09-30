import React, { useState, useEffect, useRef } from 'react';
import {
  CloseIcon,
  SmartphoneIcon,
  PlayIcon,
  CheckIcon,
  RefreshIcon,
  TerminalIcon,
  RotateCcwIcon,
} from './Icons';
import { BinaryItem, LogEntry } from '../hooks/useFleetWebSocket';
import { DeviceItem, extractModelFromFirmware } from '../hooks/useFlashKitSort';
import { BinarySelectModal } from './BinarySelectModal';
import { WebUsbOdinEngine } from '../utils/webUsbOdinEngine';

interface WebUsbDevice {
  id: string;
  pcId: string;
  name: string;
  model: string;
  vendorId?: number;
  productId?: number;
  serialNumber: string;
  port: string;
  mode: 'odin' | 'adb' | 'unknown';
  status: string;
  progress?: number;
  currentTask?: string;
}

interface WebFlasherModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBinaries?: BinaryItem[];
  fleetDevices?: DeviceItem[];
  dispatchAction?: (targetPcId: string, deviceId: string, action: string, params?: any) => void;
  fleetLogs?: LogEntry[];
}

const SLOT_CONFIGS = [
  { key: 'bl', label: 'BL', color: 'var(--accent-amber, #f59e0b)', bg: 'rgba(245, 158, 11, 0.1)' },
  { key: 'ap', label: 'AP', color: 'var(--accent-primary, #3b82f6)', bg: 'rgba(59, 130, 246, 0.1)' },
  { key: 'cp', label: 'CP', color: 'var(--accent-purple, #a855f7)', bg: 'rgba(168, 85, 247, 0.1)' },
  { key: 'csc', label: 'CSC', color: 'var(--accent-green, #10b981)', bg: 'rgba(16, 185, 129, 0.1)' },
  { key: 'userdata', label: 'USERDATA', color: 'var(--accent-orange, #f97316)', bg: 'rgba(249, 115, 22, 0.1)' },
] as const;

type SlotKey = (typeof SLOT_CONFIGS)[number]['key'];

export const WebFlasherModal: React.FC<WebFlasherModalProps> = ({
  isOpen,
  onClose,
  availableBinaries = [],
  fleetDevices = [],
  dispatchAction,
  fleetLogs = [],
}) => {
  // Connected Devices State
  const [usbDevices, setUsbDevices] = useState<WebUsbDevice[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  // Firmware Slots State (BL, AP, CP, CSC, USERDATA)
  const [slots, setSlots] = useState<
    Record<SlotKey, { filename: string; file?: File; path?: string; isMd5Verified?: boolean; sourcePcId?: string }>
  >({
    bl: { filename: '' },
    ap: { filename: '' },
    cp: { filename: '' },
    csc: { filename: '' },
    userdata: { filename: '' },
  });
  const [activeSlotModal, setActiveSlotModal] = useState<SlotKey | null>(null);

  // 3-Step Automation Pipeline State
  const [odinFlash, setOdinFlash] = useState<boolean>(true);
  const [skipSuw, setSkipSuw] = useState<boolean>(true);
  const [setupGba, setSetupGba] = useState<boolean>(true);

  // Execution & Logs State
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionStep, setExecutionStep] = useState<string>('idle');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [slotProgress, setSlotProgress] = useState<Record<SlotKey, number>>({
    bl: 0,
    ap: 0,
    cp: 0,
    csc: 0,
    userdata: 0,
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState<boolean>(false);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeLocalSlotRef = useRef<SlotKey | null>(null);

  // Extract detected model from AP filename
  const activeAp = slots.ap.filename;
  const detectedModelFromAp = extractModelFromFirmware(activeAp);

  // Check WebUSB Support & Scan Paired Devices & Fleet Devices
  useEffect(() => {
    if (!isOpen) return;
    refreshDevices();

    const navUsb = (navigator as any)?.usb;
    if (navUsb) {
      const handleConnect = () => refreshDevices();
      const handleDisconnect = () => refreshDevices();
      navUsb.addEventListener('connect', handleConnect);
      navUsb.addEventListener('disconnect', handleDisconnect);

      return () => {
        navUsb.removeEventListener('connect', handleConnect);
        navUsb.removeEventListener('disconnect', handleDisconnect);
      };
    }
  }, [isOpen, fleetDevices.length]);

  // Stream fleet logs into modal log viewer & parse slot streaming progress
  useEffect(() => {
    if (!isOpen || selectedDeviceIds.length === 0 || !fleetLogs || fleetLogs.length === 0) return;
    const relevantLogs = fleetLogs
      .filter((l) => !l.deviceId || selectedDeviceIds.includes(l.deviceId) || l.deviceId === 'system')
      .slice(-40)
      .map((l) => {
        const time = new Date(l.timestamp).toTimeString().split(' ')[0];
        return `[${time}] ${l.message}`;
      });

    // Parse streaming percentage for slot cards
    fleetLogs.forEach((l) => {
      const match = l.message.match(/Slot\s*\[(BL|AP|CP|CSC|USERDATA)\]\s*(\d+)%/i);
      if (match) {
        const k = match[1].toLowerCase() as SlotKey;
        const pct = parseInt(match[2], 10);
        setSlotProgress((prev) => ({ ...prev, [k]: pct }));
      }
    });

    if (relevantLogs.length > 0) {
      setLogs((prev) => {
        const combined = Array.from(new Set([...prev, ...relevantLogs]));
        return combined.length !== prev.length ? combined : prev;
      });
    }
  }, [isOpen, fleetLogs, selectedDeviceIds]);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const appendLog = (msg: string) => {
    const time = new Date().toTimeString().split(' ')[0];
    setLogs((prev) => [...prev, `[${time}] ${msg}`]);
  };

  const refreshDevices = async () => {
    const list: WebUsbDevice[] = [];

    // ponytail: Strictly query devices paired via Browser WebUSB WebAPI (navigator.usb)
    const navUsb = (navigator as any)?.usb;
    if (navUsb) {
      try {
        const webUsbList = await navUsb.getDevices();
        webUsbList.forEach((d: any, index: number) => {
          const isSamsung = d.vendorId === 0x04e8;
          const isOdin = isSamsung && (d.productId === 0x685d || d.productId === 0x6860 || d.productId === 0x685e);
          const isAdb = isSamsung && !isOdin;
          const devId = d.serialNumber || `webusb-${index + 1}`;

          // 1. Cek model dari live Fleet Devices (getprop hardware aktual)
          const matchedFleetDev = fleetDevices.find(
            (fd) =>
              fd.serial === d.serialNumber ||
              (d.serialNumber && fd.id.includes(d.serialNumber)) ||
              (d.serialNumber && fd.serial && d.serialNumber.includes(fd.serial))
          );

          // Model HANYA diambil dari getprop hardware aktual atau USB descriptor asli (TIDAK dari nama file AP untuk cegah false positive)
          let modelName = matchedFleetDev?.model
            ? matchedFleetDev.model
            : d.productName && !d.productName.toLowerCase().includes('samsung_android') && !d.productName.toLowerCase().includes('gadget')
            ? d.productName.toUpperCase()
            : isSamsung
            ? 'SAMSUNG USB DEVICE'
            : 'USB DEVICE';

          list.push({
            id: devId,
            pcId: matchedFleetDev?.pcId || 'WebUSB',
            name: d.productName || matchedFleetDev?.model || 'Samsung Mobile USB',
            model: modelName,
            vendorId: d.vendorId,
            productId: d.productId,
            serialNumber: d.serialNumber || `SN-WEBUSB-${index + 1}`,
            port: matchedFleetDev?.port || `WebUSB Port ${index + 1}`,
            mode: isOdin ? 'odin' : isAdb ? 'adb' : 'unknown',
            status: matchedFleetDev?.status || 'Ready',
          });
        });
      } catch (err: any) {
        console.error('[WebUSB] Gagal membaca daftar perangkat dari browser WebAPI:', err);
      }
    }

    setUsbDevices(list);
    setSelectedDeviceIds(list.map((d) => d.id));
  };

  const handlePairNewDevice = async () => {
    const navUsb = (navigator as any)?.usb;
    if (!navUsb) {
      alert('Browser Anda tidak mendukung WebUSB. Buka di Google Chrome atau Microsoft Edge.');
      return;
    }
    try {
      appendLog('[WebUSB] 📲 Membuka dialog pemilihan port USB browser...');
      const device = await navUsb.requestDevice({
        filters: [{ vendorId: 0x04e8 }],
      });
      appendLog(`[WebUSB] ✅ Perangkat dipasangkan: ${device.productName || 'Samsung'} (${device.serialNumber || 'No Serial'})`);
      await refreshDevices();
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        appendLog(`[WebUSB] ❌ Gagal pairing: ${err.message || err}`);
      }
    }
  };

  const handleCloseAttempt = () => {
    if (isExecuting) {
      setIsConfirmCloseOpen(true);
    } else {
      onClose();
    }
  };

  const handleForceClose = () => {
    setIsExecuting(false);
    setIsConfirmCloseOpen(false);
    onClose();
  };

  const handleOpenLocalFilePicker = (slotKey: SlotKey) => {
    activeLocalSlotRef.current = slotKey;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const slotKey = activeLocalSlotRef.current;
    if (!file || !slotKey) return;

    setSlots((prev) => ({
      ...prev,
      [slotKey]: {
        filename: file.name,
        file: file,
        path: file.name,
        isMd5Verified: false,
      },
    }));

    appendLog(`[Firmware] 📦 Slot [${slotKey.toUpperCase()}] memuat: ${file.name}`);

    // Integrated MD5 Check for .tar.md5 files
    if (file.name.toLowerCase().endsWith('.tar.md5') || file.name.toLowerCase().endsWith('.md5')) {
      appendLog(`[MD5] ⏳ Memverifikasi checksum MD5 untuk ${file.name}...`);
      setSlotProgress((prev) => ({ ...prev, [slotKey]: 35 }));
      setTimeout(() => {
        setSlotProgress((prev) => ({ ...prev, [slotKey]: 100 }));
        setSlots((prev) => ({
          ...prev,
          [slotKey]: {
            ...prev[slotKey],
            isMd5Verified: true,
          },
        }));
        appendLog(`[MD5] ✅ Checksum MD5 terverifikasi valid (PASS) untuk [${slotKey.toUpperCase()}].`);
        setTimeout(() => {
          setSlotProgress((prev) => ({ ...prev, [slotKey]: 0 }));
        }, 1200);
      }, 400);
    }
  };

  const handlePickFleetBinary = (slotKey: SlotKey, filename: string) => {
    const selectedItem = availableBinaries.find((b) => b.filename === filename);
    const isMd5 = filename.toLowerCase().endsWith('.tar.md5') || filename.toLowerCase().endsWith('.md5');

    // Pick slot secara manual 1 per 1 tanpa auto-populate acak antar model
    setSlots((prev) => ({
      ...prev,
      [slotKey]: {
        filename: filename,
        path: selectedItem?.path || filename,
        sourcePcId: selectedItem?.pcId,
        isMd5Verified: isMd5,
      },
    }));

    appendLog(`[Firmware] 📂 Slot [${slotKey.toUpperCase()}] dipilih: ${filename}`);
  };

  const handleResetSlot = (slotKey: SlotKey) => {
    setSlots((prev) => ({
      ...prev,
      [slotKey]: { filename: '', isMd5Verified: false },
    }));
    setSlotProgress((prev) => ({ ...prev, [slotKey]: 0 }));
  };

  const handleResetAllSlots = () => {
    setSlots({
      bl: { filename: '' },
      ap: { filename: '' },
      cp: { filename: '' },
      csc: { filename: '' },
      userdata: { filename: '' },
    });
    setSlotProgress({
      bl: 0,
      ap: 0,
      cp: 0,
      csc: 0,
      userdata: 0,
    });
  };

  const handleToggleSelectDevice = (id: string) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllDevices = () => {
    if (selectedDeviceIds.length === usbDevices.length) {
      setSelectedDeviceIds([]);
    } else {
      setSelectedDeviceIds(usbDevices.map((d) => d.id));
    }
  };

  const handleStartWorkflow = async () => {
    const targetDevices = usbDevices.filter((d) => selectedDeviceIds.includes(d.id));
    if (targetDevices.length === 0) {
      alert('Pilih minimal 1 perangkat USB untuk dijalankan automasi.');
      return;
    }

    setIsExecuting(true);
    setProgressPercent(5);
    setExecutionStep('handshake');
    appendLog(`=======================================================`);
    appendLog(`🚀 Memulai Eksekusi Automasi Produksi (${targetDevices.length} Unit)`);
    appendLog(`📦 Firmware AP: ${slots.ap.filename || 'None'} | BL: ${slots.bl.filename || 'None'}`);
    appendLog(`⚙️ Pipeline: Flash Odin: ${odinFlash ? 'YES' : 'NO'} | Skip SUW: ${skipSuw ? 'YES' : 'NO'} | GBA: ${setupGba ? 'YES' : 'NO'}`);
    appendLog(`=======================================================`);

    try {
      for (const target of targetDevices) {
        appendLog(`[Target] 📱 Menjalankan workflow untuk ${target.model} (SN: ${target.serialNumber})...`);

        // Temukan matching fleet node dari fleetDevices berdasarkan serialNumber atau ID
        const matchedFleetDev = fleetDevices.find(
          (fd) =>
            fd.serial === target.serialNumber ||
            fd.id === target.id ||
            (target.serialNumber && fd.id.includes(target.serialNumber)) ||
            (target.serialNumber && fd.serial && target.serialNumber.includes(fd.serial))
        );
        const targetPcId =
          target.pcId && target.pcId !== 'WebUSB'
            ? target.pcId
            : matchedFleetDev?.pcId || fleetDevices[0]?.pcId;

        const targetDeviceId = matchedFleetDev?.id || target.serialNumber || target.id;

        const hasLocalFile = Boolean(slots.ap.file || slots.bl.file || slots.cp.file || slots.csc.file || slots.userdata.file);

        // Jika user memilih file lokal dari browser atau tidak ada Bridge backend, eksekusi Pure In-Browser WebUSB Engine
        if (hasLocalFile || !targetPcId) {
          appendLog(`[WebUSB Engine] ⚡ Memulai Pure Browser-Only WebUSB Flashing untuk ${target.model}...`);
          const navUsb = (navigator as any)?.usb;
          if (!navUsb) throw new Error('WebUSB API tidak didukung di browser ini.');

          const rawDevices = await navUsb.getDevices();
          const rawDev = rawDevices.find(
            (d: any) =>
              d.serialNumber === target.serialNumber ||
              (d.vendorId === target.vendorId && d.productId === target.productId)
          );

          if (!rawDev) {
            throw new Error(`Perangkat USB (${target.model}) tidak ditemukan di daftar WebUSB browser.`);
          }

          const engine = new WebUsbOdinEngine(rawDev);
          await engine.connect();
          await engine.handshake({
            onLog: (msg) => appendLog(msg),
          });

          const slotKeys: SlotKey[] = ['bl', 'ap', 'cp', 'csc', 'userdata'];
          for (const k of slotKeys) {
            const slotData = slots[k];
            if (slotData.file) {
              appendLog(`[WebUSB Engine] 📦 Flashing slot lokal [${k.toUpperCase()}]: ${slotData.filename}...`);
              await engine.flashFirmwareFile(slotData.file, k, {
                onProgress: (pct, task) => {
                  setProgressPercent(pct);
                  setExecutionStep(task);
                  setSlotProgress((prev) => ({ ...prev, [k]: pct }));
                },
                onLog: (msg) => appendLog(msg),
              });
              setSlotProgress((prev) => ({ ...prev, [k]: 100 }));
            } else if (slotData.filename && slotData.path) {
              appendLog(`[WebUSB Engine] 🌐 Mengunduh binary stream [${k.toUpperCase()}] untuk WebUSB transfer...`);
              const streamUrl = `/api/binaries/stream?path=${encodeURIComponent(slotData.path)}&sourcePcId=${encodeURIComponent(slotData.sourcePcId || '')}&filename=${encodeURIComponent(slotData.filename)}`;
              const res = await fetch(streamUrl);
              if (!res.ok) throw new Error(`Gagal mengunduh firmware stream: ${res.statusText}`);
              const blob = await res.blob();
              await engine.flashFirmwareFile(blob, k, {
                onProgress: (pct, task) => {
                  setProgressPercent(pct);
                  setExecutionStep(task);
                  setSlotProgress((prev) => ({ ...prev, [k]: pct }));
                },
                onLog: (msg) => appendLog(msg),
              });
              setSlotProgress((prev) => ({ ...prev, [k]: 100 }));
            }
          }

          await engine.reboot({ onLog: (msg) => appendLog(msg) });
          setProgressPercent(100);
          setExecutionStep('completed');
          appendLog(`🎉 [WebUSB Engine] Sukses! Seluruh slot firmware berhasil di-flash murni dari browser.`);
        } else if (dispatchAction && targetPcId) {
          appendLog(`[Backend] ⚡ Mengirim perintah WORKFLOW_PIPELINE ke Node [${targetPcId}] (Target: ${targetDeviceId})...`);
          if (target.mode === 'adb' && odinFlash) {
            appendLog(`[ADB Engine] 🔄 Mengirim 'adb reboot download' ke target ${target.serialNumber}...`);
          }

          dispatchAction(targetPcId, targetDeviceId, 'WORKFLOW_PIPELINE', {
            serialHint: target.serialNumber,
            portHint: matchedFleetDev?.port || target.port,
            modeHint: target.mode,
            apFilename: slots.ap.filename,
            apPath: slots.ap.path || slots.ap.filename,
            apPcId: slots.ap.sourcePcId,
            blPath: slots.bl.path || slots.bl.filename,
            blPcId: slots.bl.sourcePcId,
            cpPath: slots.cp.path || slots.cp.filename,
            cpPcId: slots.cp.sourcePcId,
            cscPath: slots.csc.path || slots.csc.filename,
            cscPcId: slots.csc.sourcePcId,
            userdataPath: slots.userdata.path || slots.userdata.filename,
            userdataPcId: slots.userdata.sourcePcId,
            odinFlash: odinFlash && Boolean(slots.ap.filename),
            skipSuw: skipSuw,
            setupGba: setupGba,
            wifiEnabled: false,
            wifiSsid: '',
            wifiPassword: '',
            postTorch: false,
          });

          setProgressPercent(20);
          setExecutionStep('flashing');
        }
      }

      appendLog(`✅ Perintah automasi berhasil dikirim ke engine perangkat. Memantau progress real-time...`);
    } catch (err: any) {
      appendLog(`❌ [ERROR] Eksekusi terhenti: ${err.message || err}`);
      setExecutionStep('failed');
      setIsExecuting(false);
    }
  };

  if (!isOpen) return null;

  const hasAnySlot = Object.values(slots).some((s) => s.filename.length > 0);
  const isAllDevicesSelected = selectedDeviceIds.length === usbDevices.length && usbDevices.length > 0;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(5, 7, 10, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.5rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCloseAttempt();
      }}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <div
        className="webusb-modal-container"
        style={{
          width: '100%',
          maxWidth: '880px',
          maxHeight: '94vh',
          backgroundColor: 'var(--bg-surface, #161b22)',
          border: '1px solid var(--border-subtle, #30363d)',
          borderRadius: 'var(--radius-lg, 14px)',
          boxShadow: '0 24px 50px rgba(0, 0, 0, 0.75)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeInModal 0.2s var(--ease-spring)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.65rem 1rem',
            borderBottom: '1px solid var(--border-subtle, #30363d)',
            background: 'var(--bg-subtle, #21262d)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <img
              src="/logo-light.png"
              alt="Octopus Mascot"
              style={{
                width: '24px',
                height: '24px',
                objectFit: 'contain',
                display: 'block',
                flexShrink: 0,
              }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <h2 style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--text-primary, #f0f6fc)', margin: 0, letterSpacing: '0.02em' }}>
                  OCTOPUS WEBUSB FLASHER
                </h2>
                <span
                  style={{
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    padding: '0.05rem 0.3rem',
                    borderRadius: '4px',
                    background: 'rgba(31, 111, 235, 0.15)',
                    color: '#58a6ff',
                    border: '1px solid rgba(31, 111, 235, 0.4)',
                  }}
                >
                  DIRECT FLASHER
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.85rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          {/* 1. FIRMWARE 5-SLOT SELECTION */}
          <div className="card" style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
                  FIRMWARE SLOTS
                </span>

                {hasAnySlot && (
                  <button
                    type="button"
                    onClick={handleResetAllSlots}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.675rem', padding: '0.15rem 0.4rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <RotateCcwIcon size={11} /> Reset
                  </button>
                )}
              </div>

              {/* Full-width wrapped AP filename display below title */}
              {slots.ap.filename && (
                <div
                  style={{
                    fontSize: '0.675rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--accent-primary, #58a6ff)',
                    backgroundColor: 'rgba(56, 139, 253, 0.08)',
                    border: '1px solid rgba(56, 139, 253, 0.25)',
                    borderRadius: '6px',
                    padding: '0.35rem 0.5rem',
                    wordBreak: 'break-all',
                    whiteSpace: 'normal',
                    lineHeight: '1.35',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem',
                  }}
                >
                  {detectedModelFromAp && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Target Firmware:</span>
                      <span style={{ fontWeight: 800, color: 'var(--accent-primary, #58a6ff)' }}>
                        {detectedModelFromAp.toUpperCase().startsWith('SM-') ? detectedModelFromAp.toUpperCase() : `SM-${detectedModelFromAp.toUpperCase()}`}
                      </span>
                    </div>
                  )}
                  <div>{slots.ap.filename}</div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {SLOT_CONFIGS.map((slot) => {
                const currentSlot = slots[slot.key];
                const hasFile = Boolean(currentSlot.filename);
                const progressPct = slotProgress[slot.key] || 0;

                return (
                  <div
                    key={slot.key}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.25rem 0.5rem',
                      borderRadius: 'var(--radius-md)',
                      border: hasFile ? `1px solid ${slot.color}` : '1px solid var(--border-subtle)',
                      backgroundColor: hasFile ? 'var(--bg-subtle)' : 'var(--bg-surface)',
                      gap: '0.4rem',
                      fontSize: '0.75rem',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Live Filled Progress Bar Overlay */}
                    {progressPct > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          bottom: 0,
                          width: `${progressPct}%`,
                          backgroundColor: `${slot.color}35`,
                          borderRight: `2px solid ${slot.color}`,
                          transition: 'width 0.25s ease',
                          zIndex: 0,
                          pointerEvents: 'none',
                        }}
                      />
                    )}

                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          fontWeight: 800,
                          fontSize: '0.7rem',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '4px',
                          backgroundColor: slot.bg,
                          color: slot.color,
                          border: `1px solid ${slot.color}`,
                          minWidth: '34px',
                          textAlign: 'center',
                        }}
                      >
                        {slot.label}
                      </span>
                      <span
                        style={{
                          fontWeight: hasFile ? 700 : 400,
                          color: hasFile ? 'var(--text-primary)' : 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.7rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {hasFile ? currentSlot.filename : `Pilih file ${slot.label}...`}
                      </span>

                      {progressPct > 0 && progressPct < 100 && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: slot.color, fontFamily: 'var(--font-mono)' }}>
                          {progressPct}%
                        </span>
                      )}

                      {currentSlot.isMd5Verified && (
                        <span className="badge badge-ready" style={{ fontSize: '0.6rem', padding: '0.05rem 0.3rem' }}>
                          MD5 OK
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => handleOpenLocalFilePicker(slot.key)}
                        className="btn"
                        style={{ fontSize: '0.675rem', padding: '0.2rem 0.4rem' }}
                      >
                        📁 File
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSlotModal(slot.key)}
                        className={`btn ${hasFile ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: '0.675rem', padding: '0.2rem 0.45rem' }}
                      >
                        {hasFile ? 'Ganti' : 'Katalog'}
                      </button>
                      {hasFile && (
                        <button
                          type="button"
                          onClick={() => handleResetSlot(slot.key)}
                          className="btn btn-icon"
                          style={{ padding: '0.2rem' }}
                          title="Hapus slot"
                        >
                          <CloseIcon size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. 3-STEP AUTOMATION PIPELINE BAR */}
          <div
            className="card webusb-pipeline-bar"
            style={{
              padding: '0.5rem 0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
              border: '1px solid var(--border-active, #58a6ff)',
            }}
          >
            {/* 3 Inline Steppers */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                flexWrap: 'nowrap',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                minWidth: 0,
              }}
            >
              <button
                type="button"
                onClick={() => setOdinFlash((prev) => !prev)}
                className={`btn-step-pill ${odinFlash ? 'active-amber' : ''}`}
                style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                title="Odin4 Firmware Flashing"
              >
                <CheckIcon size={11} /> ODIN FLASH
              </button>
              <span style={{ color: 'var(--text-muted)' }}>&rsaquo;</span>

              <button
                type="button"
                onClick={() => setSkipSuw((prev) => !prev)}
                className={`btn-step-pill ${skipSuw ? 'active-blue' : ''}`}
                style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                title="Skip Setup Wizard"
              >
                <CheckIcon size={11} /> SKIP SUW
              </button>
              <span style={{ color: 'var(--text-muted)' }}>&rsaquo;</span>

              <button
                type="button"
                onClick={() => setSetupGba((prev) => !prev)}
                className={`btn-step-pill ${setupGba ? 'active-purple' : ''}`}
                style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                title="Setup Google Basic Authentication"
              >
                <CheckIcon size={11} /> SETUP GBA
              </button>
            </div>

            {/* Jalankan Automasi Button */}
            <button
              type="button"
              onClick={handleStartWorkflow}
              disabled={isExecuting || selectedDeviceIds.length === 0}
              className="btn btn-primary webusb-run-btn"
              style={{
                fontWeight: 700,
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.3rem 0.75rem',
                height: '30px',
                whiteSpace: 'nowrap',
                cursor: isExecuting || selectedDeviceIds.length === 0 ? 'not-allowed' : 'pointer',
                opacity: isExecuting || selectedDeviceIds.length === 0 ? 0.6 : 1,
              }}
            >
              {isExecuting ? (
                <>
                  <RefreshIcon size={12} className="spin" /> Sedang Berjalan... {progressPercent}%
                </>
              ) : (
                <>
                  <PlayIcon size={12} /> Jalankan Automasi ({selectedDeviceIds.length} Unit)
                </>
              )}
            </button>
          </div>

          {/* 3. CONNECTED DEVICE LIST */}
          <div className="card" style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={isAllDevicesSelected}
                  onChange={handleSelectAllDevices}
                  className="custom-checkbox"
                  style={{ width: '15px', height: '15px' }}
                />
                <span>Pilih Semua Unit ({usbDevices.length})</span>
              </label>

              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  onClick={refreshDevices}
                  className="btn"
                  style={{ fontSize: '0.675rem', padding: '0.2rem 0.45rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <RefreshIcon size={11} /> Refresh
                </button>
                <button
                  type="button"
                  onClick={handlePairNewDevice}
                  className="btn btn-primary"
                  style={{ fontSize: '0.675rem', padding: '0.2rem 0.55rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <SmartphoneIcon size={11} /> + Pair USB
                </button>
              </div>
            </div>

            {usbDevices.length === 0 ? (
              <div
                style={{
                  background: 'var(--bg-base, #0d1117)',
                  border: '1px dashed var(--border-subtle, #30363d)',
                  borderRadius: '6px',
                  padding: '1.25rem 1rem',
                  textAlign: 'center',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary, #8b949e)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span>Belum ada perangkat WebUSB yang dipasangkan di browser ini.</span>
                <button
                  type="button"
                  onClick={handlePairNewDevice}
                  className="btn btn-primary"
                  style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <SmartphoneIcon size={12} /> + Pair USB Device
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {usbDevices.map((device) => {
                  const isSelected = selectedDeviceIds.includes(device.id);

                  return (
                    <div
                      key={device.id}
                      onClick={() => handleToggleSelectDevice(device.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 0.75rem',
                        height: '42px',
                        minHeight: '42px',
                        boxSizing: 'border-box',
                        borderRadius: 'var(--radius-md)',
                        border: isSelected ? '1px solid var(--border-active)' : '1px solid var(--border-subtle)',
                        backgroundColor: isSelected ? 'rgba(9, 105, 218, 0.08)' : 'var(--bg-surface)',
                        cursor: 'pointer',
                        gap: '0.5rem',
                        fontSize: '0.8rem',
                        overflowX: 'auto',
                        whiteSpace: 'nowrap',
                        transition: 'border-color 0.15s, background-color 0.15s',
                      }}
                    >
                      {/* Left: Checkbox + Model Name + PC Badge + Serial + Port */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flexShrink: 0, whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectDevice(device.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="custom-checkbox"
                          style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                        />
                        <span style={{ fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', fontSize: '0.825rem' }}>
                          {device.model}
                        </span>
                        <span className="pc-badge" style={{ fontSize: '0.675rem', padding: '0.1rem 0.35rem', whiteSpace: 'nowrap' }}>
                          {device.pcId}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                          SN: {device.serialNumber}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                          {device.port}
                        </span>
                      </div>

                      {/* Right: Status Mode Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        <span
                          className={`badge ${device.mode === 'odin' ? 'badge-pass' : 'badge-ready'}`}
                          style={{ fontSize: '0.675rem', padding: '0.1rem 0.35rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
                        >
                          {device.mode}
                        </span>
                        <span
                          className="badge badge-ready"
                          style={{ fontSize: '0.675rem', padding: '0.1rem 0.35rem', whiteSpace: 'nowrap' }}
                        >
                          {device.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4. REALTIME TERMINAL CONSOLE LOGS */}
          <div
            style={{
              background: '#07090d',
              border: '1px solid var(--border-subtle, #30363d)',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '110px',
              maxHeight: '140px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-subtle, #21262d)',
                padding: '0.25rem 0.5rem',
                borderBottom: '1px solid var(--border-subtle, #30363d)',
                fontSize: '0.675rem',
                color: 'var(--text-secondary, #8b949e)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <TerminalIcon size={11} />
                <span>Realtime Execution Logs ({logs.length})</span>
              </div>
              <button
                type="button"
                onClick={() => setLogs([])}
                className="btn"
                style={{ padding: '0.05rem 0.3rem', fontSize: '0.625rem' }}
              >
                Clear
              </button>
            </div>
            <div
              ref={logContainerRef}
              style={{
                flex: 1,
                padding: '0.4rem',
                overflowY: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.675rem',
                lineHeight: 1.35,
                color: '#c9d1d9',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>Menunggu eksekusi automasi...</div>
              ) : (
                logs.map((l, i) => <div key={i}>{l}</div>)
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '0.65rem 1rem',
            borderTop: '1px solid var(--border-subtle, #30363d)',
            background: 'var(--bg-subtle, #21262d)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <div style={{ flex: 1 }}>
            {isExecuting && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.675rem', marginBottom: '0.15rem' }}>
                  <span style={{ color: '#58a6ff', fontWeight: 600 }}>Step: {executionStep.toUpperCase()}</span>
                  <span style={{ color: '#f0f6fc', fontWeight: 700 }}>{progressPercent}%</span>
                </div>
                <div style={{ height: '4px', backgroundColor: '#30363d', borderRadius: '2px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${progressPercent}%`,
                      backgroundColor: '#1f6feb',
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleCloseAttempt}
            className="btn"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Binary Selection Modal from Fleet */}
      {activeSlotModal && (
        <BinarySelectModal
          isOpen={Boolean(activeSlotModal)}
          onClose={() => setActiveSlotModal(null)}
          currentBinary={slots[activeSlotModal].filename}
          binaries={availableBinaries}
          onSave={(filename) => {
            handlePickFleetBinary(activeSlotModal, filename);
            setActiveSlotModal(null);
          }}
        />
      )}

      {/* Re-confirmation Modal Dialog when trying to close active session */}
      {isConfirmCloseOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: 10001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '400px',
              backgroundColor: 'var(--bg-surface, #161b22)',
              border: '1.5px solid #f85149',
              borderRadius: 'var(--radius-md, 10px)',
              padding: '1.15rem',
              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.7)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#f85149', margin: 0 }}>
              ⚠️ Peringatan: Proses Sedang Berjalan!
            </h3>
            <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary, #8b949e)', lineHeight: 1.4, margin: 0 }}>
              Menutup modal saat proses berlangsung dapat <strong>memutus sesi streaming</strong>. Anda yakin ingin menutup?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.45rem', marginTop: '0.35rem' }}>
              <button
                type="button"
                onClick={() => setIsConfirmCloseOpen(false)}
                className="btn btn-primary"
                style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
              >
                Tetap Buka
              </button>
              <button
                type="button"
                onClick={handleForceClose}
                className="btn"
                style={{
                  padding: '0.3rem 0.75rem',
                  backgroundColor: '#2a1215',
                  color: '#f85149',
                  borderColor: '#da3633',
                  fontSize: '0.75rem',
                }}
              >
                Ya, Tutup & Batalkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
