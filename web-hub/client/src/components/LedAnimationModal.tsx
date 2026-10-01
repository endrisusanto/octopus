import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CloseIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  CheckIcon,
  DotIcon,
  Volume2Icon,
  MatrixIcon,
  SlidersIcon,
  RainIcon,
  WaveHorizontalIcon,
  WaveVerticalIcon,
  DiagonalIcon,
  RippleIcon,
  CheckerboardIcon,
  SparkleStarIcon,
  SnakePathIcon,
  ZapIcon,
  PingPongIcon,
  CometIcon,
  CenterOutIcon,
  StrobeIcon,
  SpeakerChorusIcon,
  RepeatIcon,
  ShuffleIcon,
  ChatterIcon,
  SaveIcon,
  AutoAssignIcon,
  LightbulbIcon,
  TrashIcon,
  RotateCcwIcon,
  UploadAudioIcon,
  MusicIcon,
  SunIcon,
  SquareIcon,
} from './Icons';
import { DeviceItem } from '../hooks/useFlashKitSort';
import { RackCalibrationData, RackSlotMapping } from '../hooks/useFleetWebSocket';

interface LedAnimationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  devices: DeviceItem[];
  rackCalibration: RackCalibrationData | null;
  onSaveCalibration: (calib: RackCalibrationData) => void;
  onBlinkDevice: (serial: string) => void;
  onStartAnimation: (preset: string, isLoop: boolean, speed?: number, mode?: 'flash' | 'screen') => void;
  onStopAnimation: () => void;
  onPlaySound?: (pattern: 'single' | 'chorus' | 'sequential' | 'random' | 'chatter', targetIds?: string[]) => void;
  onStopSound?: () => void;
  customSoundName?: string | null;
  onUploadCustomSound?: (file: File) => Promise<void>;
  onResetCustomSound?: () => void;
}

interface PresetOption {
  id: string;
  name: string;
  desc: string;
  badge?: string;
  category: 'matrix' | 'classic';
  color: string;
}

const PRESETS: PresetOption[] = [
  // 2D Matrix Presets
  {
    id: 'matrix_showcase',
    name: 'Siklus Semua Pola (Demo)',
    desc: 'Menjalankan seluruh variasi pola 2D secara bergiliran.',
    badge: 'Matrix 6x3',
    category: 'matrix',
    color: '#f59e0b',
  },
  {
    id: 'matrix_rain',
    name: 'Aliran Vertikal (Code Rain)',
    desc: 'Cahaya bergerak mengalir ke bawah di setiap kolom.',
    badge: 'Populer',
    category: 'matrix',
    color: '#38bdf8',
  },
  {
    id: 'matrix_wave_h',
    name: 'Gelombang Horizontal',
    desc: 'Sapuan kolom bergerak bolak-balik dari kiri ke kanan.',
    category: 'matrix',
    color: '#34d399',
  },
  {
    id: 'matrix_wave_v',
    name: 'Gelombang Vertikal',
    desc: 'Sapuan baris bergerak dari atas ke bawah rak.',
    category: 'matrix',
    color: '#a78bfa',
  },
  {
    id: 'matrix_diagonal',
    name: 'Sapuan Diagonal',
    desc: 'Gelombang cahaya melintasi koordinat diagonal.',
    category: 'matrix',
    color: '#fb923c',
  },
  {
    id: 'matrix_ripple',
    name: 'Pusat Melingkar (Ripple)',
    desc: 'Penyebaran gelombang konsentris dari pusat rak ke arah luar.',
    category: 'matrix',
    color: '#f43f5e',
  },
  {
    id: 'matrix_checkerboard',
    name: 'Pola Papan Catur',
    desc: 'Kotak selang-seling berkedip bergantian.',
    category: 'matrix',
    color: '#94a3b8',
  },
  {
    id: 'matrix_sparkle',
    name: 'Kilau Acak (Sparkle)',
    desc: 'Kelap-kelip cahaya acak di seluruh slot aktif.',
    category: 'matrix',
    color: '#fbbf24',
  },
  {
    id: 'matrix_snake',
    name: 'Jalur Berkelok (Snake)',
    desc: 'Titik cahaya menyusuri seluruh 18 slot secara berkelok.',
    category: 'matrix',
    color: '#4ade80',
  },

  // Classic 1D Presets
  {
    id: 'chaser',
    name: 'Gelombang Berantai 1D',
    desc: 'Satu LED berjalan berurutan melintasi setiap perangkat.',
    category: 'classic',
    color: '#f59e0b',
  },
  {
    id: 'knight_rider',
    name: 'Bolak-Balik 1D (Knight Rider)',
    desc: 'Cahaya bergerak memantul dari ujung ke ujung.',
    category: 'classic',
    color: '#38bdf8',
  },
  {
    id: 'comet_wave',
    name: 'Ekor 3 LED (Comet)',
    desc: 'Jejak 3 titik cahaya bergerak mengalir bersamaan.',
    category: 'classic',
    color: '#c084fc',
  },
  {
    id: 'center_out',
    name: 'Pusat ke Tepi 1D',
    desc: 'Cahaya menyebar dari titik tengah ke kedua ujung.',
    category: 'classic',
    color: '#2dd4bf',
  },
  {
    id: 'strobe_all',
    name: 'Kedip Serentak (Strobe)',
    desc: 'Seluruh LED berkedip bersamaan dengan tempo cepat.',
    category: 'classic',
    color: '#f87171',
  },
];

const renderPresetIcon = (id: string, isSelected: boolean, size = 18) => {
  const preset = PRESETS.find((p) => p.id === id);
  const color = isSelected ? 'var(--accent-primary, #60a5fa)' : (preset?.color || '#f59e0b');
  switch (id) {
    case 'matrix_showcase':
      return <MatrixIcon size={size} style={{ color }} />;
    case 'matrix_rain':
      return <RainIcon size={size} style={{ color }} />;
    case 'matrix_wave_h':
      return <WaveHorizontalIcon size={size} style={{ color }} />;
    case 'matrix_wave_v':
      return <WaveVerticalIcon size={size} style={{ color }} />;
    case 'matrix_diagonal':
      return <DiagonalIcon size={size} style={{ color }} />;
    case 'matrix_ripple':
      return <RippleIcon size={size} style={{ color }} />;
    case 'matrix_checkerboard':
      return <CheckerboardIcon size={size} style={{ color }} />;
    case 'matrix_sparkle':
      return <SparkleStarIcon size={size} style={{ color }} />;
    case 'matrix_snake':
      return <SnakePathIcon size={size} style={{ color }} />;
    case 'chaser':
      return <ZapIcon size={size} style={{ color }} />;
    case 'knight_rider':
      return <PingPongIcon size={size} style={{ color }} />;
    case 'comet_wave':
      return <CometIcon size={size} style={{ color }} />;
    case 'center_out':
      return <CenterOutIcon size={size} style={{ color }} />;
    case 'strobe_all':
      return <StrobeIcon size={size} style={{ color }} />;
    default:
      return <MatrixIcon size={size} style={{ color }} />;
  }
};

const DEFAULT_LAYOUT = [
  [1, 1, 0, 1, 1, 0, 1, 1],
  [1, 1, 0, 1, 1, 0, 1, 1],
  [1, 1, 0, 1, 1, 0, 1, 1],
];

// --- 2D MATRIX LIVE SIMULATION PREVIEW CARD ---
interface MatrixPreviewCardProps {
  presetId: string;
  speed: number;
  slotsState: RackSlotMapping[];
}

const MatrixPreviewCard: React.FC<MatrixPreviewCardProps> = ({
  presetId,
  speed,
  slotsState,
}) => {
  const [tick, setTick] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Compute 3x8 matrix state for current tick and preset
  const gridState = useMemo(() => {
    const rows = 3;
    const cols = 8;
    const state: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
    const activeCols = [0, 1, 3, 4, 6, 7];
    const activeSlots: { r: number; c: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (const c of activeCols) {
        activeSlots.push({ r, c });
      }
    }

    const calcPattern = (pId: string, t: number) => {
      if (pId === 'matrix_rain') {
        for (const c of activeCols) {
          const dropR = (t + c * 2) % (rows + 2);
          if (dropR >= 0 && dropR < rows) {
            state[dropR][c] = true;
          }
        }
      } else if (pId === 'matrix_wave_h') {
        const cycleLen = activeCols.length * 2 - 2;
        const step = t % (cycleLen > 0 ? cycleLen : 1);
        const colIdx = step < activeCols.length ? step : cycleLen - step;
        const targetCol = activeCols[colIdx];
        for (let r = 0; r < rows; r++) {
          state[r][targetCol] = true;
        }
      } else if (pId === 'matrix_wave_v') {
        const cycleLen = rows * 2 - 2;
        const step = t % (cycleLen > 0 ? cycleLen : 1);
        const rowIdx = step < rows ? step : cycleLen - step;
        for (const c of activeCols) {
          state[rowIdx][c] = true;
        }
      } else if (pId === 'matrix_diagonal') {
        const maxD = rows - 1 + cols - 1;
        const cycleLen = maxD * 2;
        const step = t % (cycleLen > 0 ? cycleLen : 1);
        const d = step <= maxD ? step : cycleLen - step;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (r + c === d && DEFAULT_LAYOUT[r][c] === 1) {
              state[r][c] = true;
            }
          }
        }
      } else if (pId === 'matrix_ripple') {
        const ring = t % 5;
        const centerR = 1.0;
        const centerC = 3.5;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (DEFAULT_LAYOUT[r][c] === 1) {
              const dist = Math.hypot(r - centerR, c - centerC);
              if (dist >= ring - 0.8 && dist <= ring + 0.8) {
                state[r][c] = true;
              }
            }
          }
        }
      } else if (pId === 'matrix_checkerboard') {
        const phase = t % 2;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (DEFAULT_LAYOUT[r][c] === 1 && (r + c) % 2 === phase) {
              state[r][c] = true;
            }
          }
        }
      } else if (pId === 'matrix_sparkle') {
        for (let i = 0; i < 4; i++) {
          const slotIdx = (t * 7 + i * 5) % activeSlots.length;
          const s = activeSlots[slotIdx];
          state[s.r][s.c] = true;
        }
      } else if (pId === 'matrix_snake') {
        const snakePath: { r: number; c: number }[] = [];
        for (let r = 0; r < rows; r++) {
          const order = r % 2 === 0 ? activeCols : [...activeCols].reverse();
          for (const c of order) {
            snakePath.push({ r, c });
          }
        }
        const idx = t % snakePath.length;
        state[snakePath[idx].r][snakePath[idx].c] = true;
      } else if (pId === 'chaser') {
        const idx = t % activeSlots.length;
        state[activeSlots[idx].r][activeSlots[idx].c] = true;
      } else if (pId === 'knight_rider') {
        const cycleLen = activeSlots.length * 2 - 2;
        const step = t % (cycleLen > 0 ? cycleLen : 1);
        const idx = step < activeSlots.length ? step : cycleLen - step;
        state[activeSlots[idx].r][activeSlots[idx].c] = true;
      } else if (pId === 'comet_wave') {
        const len = activeSlots.length + 3;
        const step = t % len;
        for (let offset = 0; offset < 3; offset++) {
          const idx = step - offset;
          if (idx >= 0 && idx < activeSlots.length) {
            state[activeSlots[idx].r][activeSlots[idx].c] = true;
          }
        }
      } else if (pId === 'center_out') {
        const mid = Math.floor(activeSlots.length / 2);
        const cycle = mid * 2;
        const step = t % (cycle > 0 ? cycle : 1);
        const dist = step <= mid ? step : cycle - step;
        if (mid - dist >= 0) state[activeSlots[mid - dist].r][activeSlots[mid - dist].c] = true;
        if (mid + dist < activeSlots.length) state[activeSlots[mid + dist].r][activeSlots[mid + dist].c] = true;
      } else if (pId === 'strobe_all') {
        const isOn = t % 2 === 0;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (DEFAULT_LAYOUT[r][c] === 1) state[r][c] = isOn;
          }
        }
      } else {
        // matrix_showcase / all
        const subList = ['matrix_wave_h', 'matrix_rain', 'matrix_wave_v', 'matrix_diagonal', 'matrix_ripple', 'matrix_checkerboard', 'matrix_sparkle', 'matrix_snake'];
        const subIdx = Math.floor(t / 14) % subList.length;
        calcPattern(subList[subIdx], t);
      }
    };

    calcPattern(presetId, tick);
    return state;
  }, [tick, presetId]);

  // Tick timer
  useEffect(() => {
    if (isPaused) return;
    const intervalMs = Math.max(50, Math.round(speed * 1000));
    const timer = setInterval(() => {
      setTick((t) => (t + 1) % 10000);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [speed, isPaused, presetId]);

  // Count active LEDs
  const activeCount = useMemo(() => {
    let count = 0;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if (gridState[r][c]) count++;
      }
    }
    return count;
  }, [gridState]);

  const activePresetInfo = PRESETS.find((p) => p.id === presetId) || PRESETS[0];

  return (
    <div
      style={{
        backgroundColor: '#0a0f1d',
        borderRadius: 'var(--radius-lg, 12px)',
        border: '1.5px solid rgba(245, 158, 11, 0.35)',
        padding: '0.85rem 1rem',
        boxShadow: '0 8px 28px rgba(0, 0, 0, 0.5), inset 0 0 20px rgba(245, 158, 11, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      {/* Top Status Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {renderPresetIcon(activePresetInfo.id, true, 16)}
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary, #f8fafc)' }}>
            {activePresetInfo.name}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: 'var(--accent-warning, #f59e0b)',
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              padding: '0.15rem 0.5rem',
              borderRadius: '6px',
            }}
          >
            <DotIcon size={8} style={{ color: '#f59e0b' }} />
            <span>{activeCount}/18 LED Aktif</span>
          </span>

          <button
            type="button"
            onClick={() => setIsPaused(!isPaused)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '0.2rem 0.55rem',
              borderRadius: '5px',
              border: '1px solid var(--border-subtle, #334155)',
              backgroundColor: 'var(--bg-surface, #1e293b)',
              color: 'var(--text-secondary, #cbd5e1)',
              cursor: 'pointer',
            }}
          >
            {isPaused ? (
              <>
                <PlayIcon size={10} />
                <span>Putar</span>
              </>
            ) : (
              <>
                <PauseIcon size={10} />
                <span>Jeda</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 3x8 Circular LED Matrix Rack Visual Simulation */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.45rem',
          backgroundColor: '#060a14',
          padding: '0.65rem 0.5rem',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          width: '100%',
        }}
      >
        {[0, 1, 2].map((r) => (
          <div
            key={r}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '3px',
              width: '100%',
            }}
          >
            {/* Row Label */}
            <span
              style={{
                fontSize: '0.62rem',
                fontWeight: 800,
                color: 'var(--accent-primary, #60a5fa)',
                width: '20px',
                textAlign: 'center',
                userSelect: 'none',
                flexShrink: 0,
              }}
            >
              R{r + 1}
            </span>

            {/* 8 Columns */}
            {[0, 1, 2, 3, 4, 5, 6, 7].map((c) => {
              const isSlot = DEFAULT_LAYOUT[r][c] === 1;

              if (!isSlot) {
                // GAP Rail Divider
                return (
                  <div
                    key={c}
                    style={{
                      width: '6px',
                      height: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderLeft: '1px dashed rgba(255, 255, 255, 0.15)',
                      borderRight: '1px dashed rgba(255, 255, 255, 0.15)',
                      color: 'rgba(255, 255, 255, 0.2)',
                      fontSize: '0.5rem',
                      userSelect: 'none',
                      flexShrink: 0,
                    }}
                    title="Pemisah Rel Rak (GAP)"
                  />
                );
              }

              const isOn = gridState[r][c];
              const slotMapping = slotsState.find((s) => s.row === r && s.col === c);
              const serial = slotMapping?.serial || '';

              return (
                <div
                  key={c}
                  style={{
                    flex: '1 1 0%',
                    minWidth: 0,
                    maxWidth: '52px',
                    height: '38px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2px',
                    backgroundColor: isOn ? 'rgba(245, 158, 11, 0.1)' : 'rgba(15, 23, 42, 0.4)',
                    border: isOn ? '1px solid rgba(245, 158, 11, 0.55)' : '1px solid rgba(51, 65, 85, 0.4)',
                    borderRadius: '6px',
                    padding: '2px',
                    transition: 'all 0.12s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                  title={`Slot R${r + 1}-C${c + 1}${serial ? ` : ${serial}` : ' (Kosong)'}`}
                >
                  {/* Glowing LED Bulb */}
                  <div
                    style={{
                      width: '15px',
                      height: '15px',
                      borderRadius: '50%',
                      backgroundColor: isOn ? '#f59e0b' : '#1e293b',
                      backgroundImage: isOn
                        ? 'radial-gradient(circle, #fffbeb 10%, #f59e0b 60%, #b45309 100%)'
                        : 'radial-gradient(circle, #334155 10%, #0f172a 100%)',
                      boxShadow: isOn
                        ? '0 0 10px #f59e0b, 0 0 20px rgba(245, 158, 11, 0.8), inset 0 0 3px #fff'
                        : 'inset 0 1px 2px rgba(0, 0, 0, 0.8)',
                      border: isOn ? '1.5px solid #fef08a' : '1px solid #475569',
                      transition: 'all 0.12s cubic-bezier(0.4, 0, 0.2, 1)',
                      transform: isOn ? 'scale(1.08)' : 'scale(1)',
                    }}
                  />

                  {/* Micro coordinate label */}
                  <span
                    style={{
                      fontSize: '0.52rem',
                      fontWeight: 700,
                      color: isOn ? '#fef08a' : 'var(--text-muted, #64748b)',
                      letterSpacing: '-0.02em',
                      transition: 'color 0.12s ease',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                      lineHeight: 1,
                    }}
                  >
                    {c + 1}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export const LedAnimationModal: React.FC<LedAnimationModalProps> = ({
  isOpen,
  onClose,
  selectedCount,
  devices,
  rackCalibration,
  onSaveCalibration,
  onBlinkDevice,
  onStartAnimation,
  onStopAnimation,
  onPlaySound,
  onStopSound,
  customSoundName,
  onUploadCustomSound,
  onResetCustomSound,
}) => {
  const [activeTab, setActiveTab] = useState<'anim' | 'calibration'>('anim');
  const [selectedPreset, setSelectedPreset] = useState<string>('matrix_showcase');
  const [isLoop, setIsLoop] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(0.12);
  const [filterCategory, setFilterCategory] = useState<'all' | 'matrix' | 'classic'>('matrix');
  const [activeSoundPattern, setActiveSoundPattern] = useState<string | null>(null);
  const [animMode, setAnimMode] = useState<'flash' | 'screen'>(() => {
    return (localStorage.getItem('octopus_matrix_anim_mode') as 'flash' | 'screen') || 'flash';
  });

  const handleAnimModeChange = (mode: 'flash' | 'screen') => {
    setAnimMode(mode);
    localStorage.setItem('octopus_matrix_anim_mode', mode);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingSound, setIsUploadingSound] = useState(false);
  const [soundFeedbackMsg, setSoundFeedbackMsg] = useState<string | null>(null);

  const handleSoundFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      alert('Ukuran file audio maksimal 25 MB');
      return;
    }
    try {
      setIsUploadingSound(true);
      if (onUploadCustomSound) {
        await onUploadCustomSound(file);
      }
      setSoundFeedbackMsg(`Audio '${file.name}' siap digunakan.`);
      setTimeout(() => setSoundFeedbackMsg(null), 3500);
    } catch (err: any) {
      console.error(err);
      alert('Gagal mengunggah file audio: ' + (err?.message || 'Error'));
    } finally {
      setIsUploadingSound(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePlaySoundGimmick = (pattern: 'single' | 'chorus' | 'sequential' | 'random' | 'chatter') => {
    setActiveSoundPattern(pattern);
    onPlaySound?.(pattern);
    setTimeout(() => {
      setActiveSoundPattern((curr) => (curr === pattern ? null : curr));
    }, 2000);
  };

  const handleStopSound = () => {
    setActiveSoundPattern(null);
    onStopSound?.();
  };

  // Local Calibration State
  const [slotsState, setSlotsState] = useState<RackSlotMapping[]>([]);
  const [blinkingSerial, setBlinkingSerial] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState(false);

  // Sync calibration data when modal opens or calibration updates
  useEffect(() => {
    if (rackCalibration && rackCalibration.slots) {
      setSlotsState(rackCalibration.slots);
    } else {
      // Build default 18 slots
      const initialSlots: RackSlotMapping[] = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
          if (DEFAULT_LAYOUT[r][c] === 1) {
            initialSlots.push({ row: r, col: c, serial: '' });
          }
        }
      }
      setSlotsState(initialSlots);
    }
  }, [rackCalibration, isOpen]);

  if (!isOpen) return null;

  const handleStart = () => {
    onStartAnimation(selectedPreset, isLoop, speed, animMode);
    onClose();
  };

  const handleStop = () => {
    onStopAnimation();
    onClose();
  };

  const handleSlotChange = (row: number, col: number, serial: string) => {
    setSlotsState((prev) => {
      const existing = prev.filter((s) => !(s.row === row && s.col === col));
      return [...existing, { row, col, serial }];
    });
  };

  const handleBlinkSlot = (serial: string) => {
    if (!serial) return;
    setBlinkingSerial(serial);
    onBlinkDevice(serial);
    setTimeout(() => {
      setBlinkingSerial((curr) => (curr === serial ? null : curr));
    }, 1800);
  };

  const handleAutoAssign = () => {
    const availableSerials = devices
      .map((d) => d.serial || d.id)
      .filter((s) => Boolean(s) && !s.includes('unknown'));

    const newSlots: RackSlotMapping[] = [];
    let devIdx = 0;

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if (DEFAULT_LAYOUT[r][c] === 1) {
          const assigned = devIdx < availableSerials.length ? availableSerials[devIdx] : '';
          newSlots.push({ row: r, col: c, serial: assigned });
          devIdx++;
        }
      }
    }
    setSlotsState(newSlots);
  };

  const handleClearSlots = () => {
    const emptySlots: RackSlotMapping[] = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if (DEFAULT_LAYOUT[r][c] === 1) {
          emptySlots.push({ row: r, col: c, serial: '' });
        }
      }
    }
    setSlotsState(emptySlots);
  };

  const handleSaveCalibration = () => {
    const calibData: RackCalibrationData = {
      layout: DEFAULT_LAYOUT,
      rows: 3,
      cols: 8,
      slots: slotsState,
    };
    onSaveCalibration(calibData);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2200);
  };

  const filteredPresets = PRESETS.filter(
    (p) => filterCategory === 'all' || p.category === filterCategory
  );

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 100000 }}>
      <div
        className={`modal-card led-anim-modal-card ${activeTab === 'calibration' ? 'calibration-mode' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            paddingBottom: '0.65rem',
            borderBottom: '1px solid var(--border-subtle, #334155)',
            position: 'relative',
          }}
        >
          {/* Row 1: Title + Subtitle & Top Right Close Button */}
          <div
            className="led-header-top"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              gap: '0.55rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: activeTab === 'anim' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: activeTab === 'anim' ? 'var(--accent-warning, #f59e0b)' : 'var(--accent-primary, #60a5fa)',
                  flexShrink: 0,
                }}
              >
                {activeTab === 'anim' ? <MatrixIcon size={18} /> : <SlidersIcon size={18} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary, #f8fafc)', margin: 0 }}>
                  {activeTab === 'anim' ? 'Kontrol Pola & Matriks 2D' : 'Kalibrasi Slot Rak (6x3 Matriks)'}
                </h3>
                <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #94a3b8)', margin: 0, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeTab === 'anim'
                    ? selectedCount > 0
                      ? `Dijalankan pada ${selectedCount} perangkat terpilih`
                      : 'Dijalankan pada seluruh 18 slot rak fisik'
                    : 'Pemetaan 3 baris x 8 kolom (18 slot aktif)'}
                </p>
              </div>
            </div>

            {/* Dedicated Top-Right Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="btn btn-icon led-close-btn"
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle, #334155)',
                color: 'var(--text-secondary, #94a3b8)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              title="Tutup Modal"
            >
              <CloseIcon size={15} />
            </button>
          </div>

          {/* Row 2: Tab Navigation Switcher (Fullwidth Segmented Control) */}
          <div
            className="led-tab-container"
            style={{
              display: 'flex',
              width: '100%',
              backgroundColor: 'var(--bg-subtle, #0f172a)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle, #334155)',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('anim')}
              className="led-tab-btn"
              style={{
                flex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                padding: '0.35rem 0.5rem',
                fontSize: '0.76rem',
                fontWeight: 700,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeTab === 'anim' ? 'var(--accent-primary, #3b82f6)' : 'transparent',
                color: activeTab === 'anim' ? '#fff' : 'var(--text-secondary, #94a3b8)',
                transition: 'all 0.15s ease',
              }}
            >
              <MatrixIcon size={14} />
              <span>Pola Animasi</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('calibration')}
              className="led-tab-btn"
              style={{
                flex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                padding: '0.35rem 0.5rem',
                fontSize: '0.76rem',
                fontWeight: 700,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeTab === 'calibration' ? 'var(--accent-primary, #3b82f6)' : 'transparent',
                color: activeTab === 'calibration' ? '#fff' : 'var(--text-secondary, #94a3b8)',
                transition: 'all 0.15s ease',
              }}
            >
              <SlidersIcon size={14} />
              <span>Kalibrasi Slot</span>
            </button>
          </div>
        </div>

        {/* TAB 1: ANIMASI PRESET VIEW & LIVE PREVIEW CARD */}
        {activeTab === 'anim' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* LIVE SIMULATION PREVIEW CARD */}
            <MatrixPreviewCard
              presetId={selectedPreset}
              speed={speed}
              slotsState={slotsState}
            />

            {/* Category Filter Uniform Boxy Fullwidth Group */}
            <div className="led-category-bar">
              <button
                type="button"
                onClick={() => setFilterCategory('matrix')}
                className="led-category-btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  border: filterCategory === 'matrix' ? '1.5px solid var(--accent-primary, #3b82f6)' : '1px solid var(--border-subtle, #334155)',
                  backgroundColor: filterCategory === 'matrix' ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-subtle, #0f172a)',
                  color: filterCategory === 'matrix' ? 'var(--accent-primary, #60a5fa)' : 'var(--text-secondary, #94a3b8)',
                }}
              >
                <MatrixIcon size={13} />
                <span>Matriks 2D (6x3)</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterCategory('classic')}
                className="led-category-btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  border: filterCategory === 'classic' ? '1.5px solid var(--accent-primary, #3b82f6)' : '1px solid var(--border-subtle, #334155)',
                  backgroundColor: filterCategory === 'classic' ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-subtle, #0f172a)',
                  color: filterCategory === 'classic' ? 'var(--accent-primary, #60a5fa)' : 'var(--text-secondary, #94a3b8)',
                }}
              >
                <ZapIcon size={13} />
                <span>Klasik 1D</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterCategory('all')}
                className="led-category-btn"
                style={{
                  border: filterCategory === 'all' ? '1.5px solid var(--accent-primary, #3b82f6)' : '1px solid var(--border-subtle, #334155)',
                  backgroundColor: filterCategory === 'all' ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-subtle, #0f172a)',
                  color: filterCategory === 'all' ? 'var(--accent-primary, #60a5fa)' : 'var(--text-secondary, #94a3b8)',
                }}
              >
                Semua Pola
              </button>
            </div>

            {/* Presets List */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '0.45rem',
                maxHeight: '220px',
                overflowY: 'auto',
                paddingRight: '0.25rem',
              }}
            >
              {filteredPresets.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => setSelectedPreset(preset.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius-md, 8px)',
                      border: isSelected ? '1.5px solid var(--accent-primary, #3b82f6)' : '1px solid var(--border-subtle, #334155)',
                      backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-subtle, #1e293b)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {renderPresetIcon(preset.id, isSelected, 16)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              color: isSelected ? 'var(--accent-primary, #60a5fa)' : 'var(--text-primary, #f8fafc)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {preset.name}
                          </span>
                          {preset.badge && (
                            <span
                              style={{
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                padding: '0.08rem 0.3rem',
                                borderRadius: '4px',
                                backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.3)' : 'rgba(245, 158, 11, 0.15)',
                                color: isSelected ? '#93c5fd' : 'var(--accent-warning, #f59e0b)',
                                flexShrink: 0,
                              }}
                            >
                              {preset.badge}
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #94a3b8)', margin: 0, marginTop: '1px', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {preset.desc}
                        </p>
                      </div>
                    </div>

                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        border: isSelected ? '4px solid var(--accent-primary, #3b82f6)' : '2px solid var(--border-subtle, #64748b)',
                        backgroundColor: isSelected ? '#fff' : 'transparent',
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Loop, Speed & Output Mode Options */}
            <div className="led-anim-options-grid">
              {/* Output Mode Switch: Flash vs Screen Brightness */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-primary, #f8fafc)' }}>
                    {animMode === 'screen' ? (
                      <SunIcon size={13} style={{ color: '#f59e0b' }} />
                    ) : (
                      <DotIcon size={11} fill="#ef4444" />
                    )}
                    <span>Mode Output</span>
                  </span>
                  <span style={{ fontSize: '0.65rem', color: animMode === 'screen' ? '#f59e0b' : '#60a5fa', fontWeight: 700 }}>
                    {animMode === 'screen' ? 'Layar' : 'Flash'}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    backgroundColor: 'var(--bg-surface, #1e293b)',
                    padding: '2px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle, #334155)',
                    gap: '2px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleAnimModeChange('flash')}
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.3rem',
                      fontSize: '0.68rem',
                      padding: '0.28rem 0.35rem',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: animMode === 'flash' ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
                      color: animMode === 'flash' ? '#93c5fd' : 'var(--text-secondary, #94a3b8)',
                      cursor: 'pointer',
                      fontWeight: animMode === 'flash' ? 700 : 500,
                      transition: 'all 0.15s ease',
                    }}
                    title="Animasi menggunakan Lampu Flash Kamera"
                  >
                    <DotIcon size={8} fill={animMode === 'flash' ? '#ef4444' : 'currentColor'} />
                    <span>Flash LED</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAnimModeChange('screen')}
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.3rem',
                      fontSize: '0.68rem',
                      padding: '0.28rem 0.35rem',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: animMode === 'screen' ? 'rgba(245, 158, 11, 0.25)' : 'transparent',
                      color: animMode === 'screen' ? '#fbbf24' : 'var(--text-secondary, #94a3b8)',
                      cursor: 'pointer',
                      fontWeight: animMode === 'screen' ? 700 : 500,
                      transition: 'all 0.15s ease',
                    }}
                    title="Animasi menggunakan Kecerahan Layar (Screen Brightness)"
                  >
                    <SunIcon size={12} style={{ color: animMode === 'screen' ? '#f59e0b' : 'inherit' }} />
                    <span>Layar (Brightness)</span>
                  </button>
                </div>
              </div>

              {/* Loop Option */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={isLoop}
                  onChange={(e) => setIsLoop(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#3b82f6' }}
                />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <RepeatIcon size={13} style={{ color: '#60a5fa' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
                      Ulangi (Loop)
                    </span>
                  </div>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)', margin: 0 }}>
                    Berulang tanpa henti.
                  </p>
                </div>
              </label>

              {/* Speed Option (Range Slider) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', justifyContent: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', fontWeight: 700 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-primary, #f8fafc)' }}>
                    <ZapIcon size={12} style={{ color: '#f59e0b' }} />
                    <span>Kecepatan Animasi</span>
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #94a3b8)', fontWeight: 500 }}>
                      {Math.round(speed * 1000)}ms
                    </span>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        padding: '0.1rem 0.4rem',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        color: 'var(--accent-primary, #60a5fa)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                      }}
                    >
                      {speed.toFixed(2)}s
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <input
                    type="range"
                    min="0.04"
                    max="0.50"
                    step="0.01"
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    style={{
                      width: '100%',
                      accentColor: 'var(--accent-primary, #3b82f6)',
                      cursor: 'pointer',
                      height: '6px',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>
                    <span role="button" onClick={() => setSpeed(0.06)} style={{ cursor: 'pointer' }}>⚡ Cepat (0.06s)</span>
                    <span role="button" onClick={() => setSpeed(0.12)} style={{ cursor: 'pointer' }}>⚖️ Normal (0.12s)</span>
                    <span role="button" onClick={() => setSpeed(0.25)} style={{ cursor: 'pointer' }}>🐢 Santai (0.25s)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Audio Tweet (Sound FX) Section */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.55rem',
                backgroundColor: 'var(--bg-subtle, #0f172a)',
                padding: '0.75rem 0.85rem',
                borderRadius: 'var(--radius-md, 8px)',
                border: '1px solid var(--border-subtle, #334155)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Volume2Icon size={14} style={{ color: 'var(--accent-primary, #60a5fa)' }} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-primary, #f8fafc)' }}>
                    Pola Notifikasi Audio (Tweet)
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      padding: '0.12rem 0.4rem',
                      borderRadius: '4px',
                      backgroundColor: customSoundName ? 'rgba(56, 189, 248, 0.15)' : 'rgba(148, 163, 184, 0.12)',
                      color: customSoundName ? '#38bdf8' : 'var(--text-secondary, #94a3b8)',
                      border: `1px solid ${customSoundName ? 'rgba(56, 189, 248, 0.3)' : 'var(--border-subtle, #334155)'}`,
                      fontWeight: 700,
                    }}
                  >
                    {customSoundName ? 'Custom Sound' : 'Default Sound'}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary, #94a3b8)', fontWeight: 600 }}>
                    SoundPool Engine
                  </span>
                </div>
              </div>

              {/* Custom Sound Upload & Active Audio Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.45rem',
                  padding: '0.45rem 0.6rem',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-surface, #1e293b)',
                  border: '1px dashed var(--border-subtle, #334155)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0, flex: 1 }}>
                  <MusicIcon size={14} style={{ color: customSoundName ? '#38bdf8' : '#94a3b8', flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: customSoundName ? '#e2e8f0' : 'var(--text-secondary, #94a3b8)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={customSoundName || 'tweet.ogg (Default Sound)'}
                    >
                      {customSoundName || 'tweet.ogg (Default Sound)'}
                    </span>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted, #64748b)' }}>
                      Mendukung .ogg, .mp3, .wav (SoundPool ADB)
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.ogg,.mp3,.wav,.m4a"
                    style={{ display: 'none' }}
                    onChange={handleSoundFileChange}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingSound}
                    className="btn btn-sm"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.25rem 0.55rem',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      backgroundColor: 'var(--bg-subtle, #0f172a)',
                      border: '1px solid var(--border-subtle, #334155)',
                      color: 'var(--text-primary, #f8fafc)',
                      borderRadius: '5px',
                      cursor: isUploadingSound ? 'not-allowed' : 'pointer',
                    }}
                    title="Unggah audio kustom (.ogg, .mp3, .wav)"
                  >
                    <UploadAudioIcon size={12} />
                    <span>{isUploadingSound ? 'Mengunggah...' : customSoundName ? 'Ganti Suara' : 'Upload Suara'}</span>
                  </button>

                  {customSoundName && onResetCustomSound && (
                    <button
                      type="button"
                      onClick={onResetCustomSound}
                      className="btn btn-sm"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: 'var(--accent-red, #ef4444)',
                        borderRadius: '5px',
                        cursor: 'pointer',
                      }}
                      title="Reset ke suara bawaan (tweet.ogg)"
                    >
                      <RotateCcwIcon size={11} />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>

              {soundFeedbackMsg && (
                <div style={{ fontSize: '0.68rem', color: '#34d399', fontWeight: 600, paddingLeft: '0.2rem' }}>
                  {soundFeedbackMsg}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                  {[
                    { id: 'chorus', label: 'Chorus', desc: 'Serentak', icon: <SpeakerChorusIcon size={15} style={{ color: '#60a5fa' }} /> },
                    { id: 'sequential', label: 'Sequential', desc: 'Berurutan', icon: <RepeatIcon size={15} style={{ color: '#38bdf8' }} /> },
                    { id: 'random', label: 'Random', desc: 'Acak', icon: <ShuffleIcon size={15} style={{ color: '#a78bfa' }} /> },
                    { id: 'chatter', label: 'Bersautan', desc: 'Polifoni', icon: <ChatterIcon size={15} style={{ color: '#34d399' }} /> },
                  ].map((item) => {
                    const isPlaying = activeSoundPattern === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handlePlaySoundGimmick(item.id as any)}
                        className={`btn btn-sm ${isPlaying ? 'flash-loading-shimmer' : ''}`}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.2rem',
                          padding: '0.45rem 0.3rem',
                          borderRadius: '6px',
                          border: isPlaying ? '1px solid #3b82f6' : '1px solid var(--border-subtle, #334155)',
                          backgroundColor: isPlaying ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-surface, #1e293b)',
                          color: isPlaying ? '#93c5fd' : 'var(--text-primary, #f8fafc)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        title={`Putar Suara: ${item.label} (${item.desc})`}
                      >
                        {item.icon}
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{item.label}</span>
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary, #94a3b8)', whiteSpace: 'nowrap' }}>{item.desc}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Stop Audio Button */}
                <button
                  type="button"
                  onClick={handleStopSound}
                  className="btn btn-sm"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    padding: '0.38rem 0.75rem',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    color: '#f87171',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  title="Hentikan pemutaran audio di semua perangkat"
                >
                  <SquareIcon size={12} fill="#ef4444" />
                  <span>Hentikan Pemutaran Suara (Stop Audio)</span>
                </button>
              </div>
            </div>

            {/* Actions */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.65rem',
                paddingTop: '0.5rem',
                borderTop: '1px solid var(--border-subtle, #334155)',
              }}
            >
              <button
                type="button"
                onClick={handleStop}
                className="btn btn-sm"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.8rem',
                  padding: '0.45rem 0.85rem',
                  color: 'var(--accent-red, #ef4444)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-md, 6px)',
                  cursor: 'pointer',
                }}
              >
                <StopIcon size={13} />
                <span>Hentikan</span>
              </button>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-sm"
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.45rem 0.85rem',
                    backgroundColor: 'var(--bg-subtle, #334155)',
                    color: 'var(--text-secondary, #94a3b8)',
                    border: '1px solid var(--border-subtle, #475569)',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-md, 6px)',
                    cursor: 'pointer',
                  }}
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handleStart}
                  className="btn btn-sm btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.8rem',
                    padding: '0.45rem 1.15rem',
                    fontWeight: 700,
                    backgroundColor: 'var(--accent-primary, #3b82f6)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-md, 6px)',
                    boxShadow: '0 2px 10px rgba(59, 130, 246, 0.4)',
                    cursor: 'pointer',
                  }}
                >
                  <PlayIcon size={14} />
                  <span>Jalankan ke Rak Fisik</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: KALIBRASI POSISI RAK (6x3 GRID) */}
        {activeTab === 'calibration' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* Guide and Toolbar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md, 8px)',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.76rem', color: 'var(--text-secondary, #cbd5e1)', lineHeight: 1.4, flex: 1, minWidth: '240px' }}>
                <LightbulbIcon size={16} style={{ color: '#60a5fa', flexShrink: 0 }} />
                <span>
                  Gunakan tombol <strong>Tes</strong> pada tiap slot untuk menyalakan senter perangkat di rak, lalu tentukan nomor serial yang sesuai.
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleAutoAssign}
                  className="btn btn-sm"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontSize: '0.75rem',
                    padding: '0.35rem 0.65rem',
                    fontWeight: 700,
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: 'var(--accent-success, #10b981)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                  title="Otomatis isi slot kosong dengan perangkat terhubung"
                >
                  <AutoAssignIcon size={13} />
                  <span>Isi Otomatis</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearSlots}
                  className="btn btn-sm"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontSize: '0.75rem',
                    padding: '0.35rem 0.65rem',
                    fontWeight: 600,
                    backgroundColor: 'var(--bg-subtle, #334155)',
                    color: 'var(--text-secondary, #94a3b8)',
                    border: '1px solid var(--border-subtle, #475569)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                  title="Kosongkan seluruh pemetaan slot"
                >
                  <TrashIcon size={13} />
                  <span>Kosongkan Slot</span>
                </button>
              </div>
            </div>

            {/* Visual 3x8 Matrix Rack Layout */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
                backgroundColor: 'var(--bg-subtle, #0b1329)',
                padding: '0.85rem',
                borderRadius: 'var(--radius-lg, 10px)',
                border: '1.5px solid var(--border-subtle, #334155)',
                overflowX: 'auto',
                maxHeight: '420px',
                overflowY: 'auto',
              }}
            >
              {[0, 1, 2].map((r) => (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: '760px' }}>
                  {/* Row Index Badge */}
                  <div
                    style={{
                      width: '32px',
                      height: '76px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(59, 130, 246, 0.12)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '6px',
                      color: 'var(--accent-primary, #60a5fa)',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      flexShrink: 0,
                    }}
                  >
                    <span>R{r + 1}</span>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted, #94a3b8)' }}>Baris</span>
                  </div>

                  {/* 8 Columns matching 11011011 */}
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((c) => {
                    const isSlot = DEFAULT_LAYOUT[r][c] === 1;

                    if (!isSlot) {
                      // GAP Divider Column (Rail Spacer)
                      return (
                        <div
                          key={c}
                          style={{
                            width: '24px',
                            height: '76px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'rgba(255, 255, 255, 0.02)',
                            borderLeft: '1.5px dashed var(--border-subtle, #334155)',
                            borderRight: '1.5px dashed var(--border-subtle, #334155)',
                            color: 'var(--text-muted, #475569)',
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            userSelect: 'none',
                            flexShrink: 0,
                          }}
                          title="Pemisah Fisik Rel Rak (Gap)"
                        >
                          <span>G</span>
                          <span>A</span>
                          <span>P</span>
                        </div>
                      );
                    }

                    // Active Physical Slot
                    const slotMapping = slotsState.find((s) => s.row === r && s.col === c);
                    const currentSerial = slotMapping?.serial || '';
                    const matchedDev = devices.find(
                      (d) => d.serial === currentSerial || d.id === currentSerial
                    );
                    const isBlinking = blinkingSerial === currentSerial && currentSerial !== '';

                    // Filter out devices already assigned to other slots
                    const assignedInOtherSlots = new Set(
                      slotsState
                        .filter((s) => !(s.row === r && s.col === c) && Boolean(s.serial))
                        .map((s) => s.serial)
                    );
                    const availableDevicesForSlot = devices.filter((d) => {
                      const s = d.serial || d.id;
                      return s === currentSerial || !assignedInOtherSlots.has(s);
                    });

                    return (
                      <div
                        key={c}
                        style={{
                          flex: 1,
                          minWidth: '110px',
                          height: '76px',
                          backgroundColor: isBlinking
                            ? 'rgba(245, 158, 11, 0.25)'
                            : currentSerial
                            ? 'var(--bg-surface, #1e293b)'
                            : 'rgba(15, 23, 42, 0.6)',
                          border: isBlinking
                            ? '2px solid var(--accent-warning, #f59e0b)'
                            : currentSerial
                            ? '1.5px solid var(--border-subtle, #475569)'
                            : '1px dashed var(--border-subtle, #334155)',
                          borderRadius: '8px',
                          padding: '0.4rem 0.5rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          boxShadow: isBlinking ? '0 0 16px rgba(245, 158, 11, 0.5)' : 'none',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {/* Slot Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--accent-primary, #60a5fa)' }}>
                            R{r + 1}-C{c + 1}
                          </span>
                          {currentSerial && (
                            <button
                              type="button"
                              onClick={() => handleBlinkSlot(currentSerial)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                padding: '0.1rem 0.35rem',
                                borderRadius: '4px',
                                border: 'none',
                                backgroundColor: isBlinking ? 'var(--accent-warning, #f59e0b)' : 'rgba(245, 158, 11, 0.15)',
                                color: isBlinking ? '#000' : 'var(--accent-warning, #f59e0b)',
                                cursor: 'pointer',
                              }}
                              title="Tes senter perangkat ini"
                            >
                              <LightbulbIcon size={10} />
                              <span>Tes</span>
                            </button>
                          )}
                        </div>

                        {/* Device Selector Dropdown */}
                        <select
                          value={currentSerial}
                          onChange={(e) => handleSlotChange(r, c, e.target.value)}
                          style={{
                            width: '100%',
                            fontSize: '0.7rem',
                            fontWeight: currentSerial ? 700 : 400,
                            padding: '0.2rem 0.25rem',
                            borderRadius: '4px',
                            backgroundColor: 'var(--bg-subtle, #0f172a)',
                            color: currentSerial ? 'var(--text-primary, #f8fafc)' : 'var(--text-muted, #64748b)',
                            border: '1px solid var(--border-subtle, #334155)',
                            cursor: 'pointer',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <option value="">(Kosong)</option>
                          {currentSerial && !availableDevicesForSlot.some((d) => (d.serial || d.id) === currentSerial) && (
                            <option value={currentSerial}>{currentSerial} (Tersimpan)</option>
                          )}
                          {availableDevicesForSlot.map((d) => {
                            const devSerial = d.serial || d.id;
                            return (
                              <option key={devSerial} value={devSerial}>
                                {devSerial} ({d.model || 'Android'})
                              </option>
                            );
                          })}
                        </select>

                        {/* Model & Online Indicator */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: matchedDev ? 'var(--accent-success, #10b981)' : currentSerial ? 'var(--accent-red, #ef4444)' : 'var(--text-muted, #475569)',
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontSize: '0.62rem',
                              color: 'var(--text-secondary, #94a3b8)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {matchedDev ? matchedDev.model : currentSerial ? 'Offline' : 'Unassigned'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Calibration Footer & Save */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '0.5rem',
                borderTop: '1px solid var(--border-subtle, #334155)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #94a3b8)' }}>
                  Total Terpetakan: <strong>{slotsState.filter((s) => Boolean(s.serial)).length} / 18 Slot</strong>
                </span>
                {saveToast && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: 'var(--accent-success, #10b981)',
                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '4px',
                      animation: 'fadeIn 0.2s ease',
                    }}
                  >
                    <CheckIcon size={12} />
                    <span>Pemetaan berhasil disimpan</span>
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-sm"
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.45rem 0.85rem',
                    backgroundColor: 'var(--bg-subtle, #334155)',
                    color: 'var(--text-secondary, #94a3b8)',
                    border: '1px solid var(--border-subtle, #475569)',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-md, 6px)',
                    cursor: 'pointer',
                  }}
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handleSaveCalibration}
                  className="btn btn-sm btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.8rem',
                    padding: '0.45rem 1.15rem',
                    fontWeight: 700,
                    backgroundColor: 'var(--accent-success, #10b981)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-md, 6px)',
                    boxShadow: '0 2px 10px rgba(16, 185, 129, 0.4)',
                    cursor: 'pointer',
                  }}
                >
                  <SaveIcon size={14} />
                  <span>Simpan Pemetaan</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
