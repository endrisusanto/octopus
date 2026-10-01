import React, { useState } from 'react';
import {
  FileCodeIcon,
  CheckIcon,
  CloseIcon,
  RefreshIcon,
  AlertCircleIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PauseIcon,
  PlayIcon,
  StopIcon,
} from './Icons';
import { BinaryTransferProgress } from '../hooks/useFleetWebSocket';
import { CancelTransferModal } from './CancelTransferModal';

interface BinaryTransferToastProps {
  transfers: BinaryTransferProgress[];
  onDismiss: (targetPcId: string, filename: string) => void;
  onControl?: (action: 'pause' | 'resume' | 'cancel', targetPcId: string, filename: string, sourcePcId?: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export const BinaryTransferToast: React.FC<BinaryTransferToastProps> = ({
  transfers,
  onDismiss,
  onControl,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<BinaryTransferProgress | null>(null);

  if (!transfers || transfers.length === 0) return null;

  const activeTransfers = transfers.filter((t) => t.status === 'transferring');
  const pausedTransfers = transfers.filter((t) => t.status === 'paused');
  const failedTransfers = transfers.filter((t) => t.status === 'failed');
  const cancelledTransfers = transfers.filter((t) => t.status === 'cancelled');
  const completedTransfers = transfers.filter((t) => t.status === 'completed');

  const hasActive = activeTransfers.length > 0;
  const hasPaused = pausedTransfers.length > 0;
  const hasFailed = failedTransfers.length > 0;

  // Calculate aggregate progress percentage across transfers
  const aggregatePct = (() => {
    if (transfers.length === 0) return 0;
    const sum = transfers.reduce((acc, cur) => acc + cur.progressPct, 0);
    return Math.round(sum / transfers.length);
  })();

  const accordionStatusClass = hasActive
    ? 'is-transferring'
    : hasPaused
    ? 'is-paused'
    : hasFailed
    ? 'is-failed'
    : 'is-completed';

  return (
    <>
      <aside
        className="binary-toast-container"
        aria-live="polite"
        aria-label="Panel Transfer Firmware"
      >
      <div className={`binary-toast-accordion ${accordionStatusClass}`}>
        {/* Accordion Summary Header (Always Visible - No Close Button) */}
        <div
          className="binary-toast-accordion-header"
          onClick={() => setIsExpanded((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsExpanded((prev) => !prev);
            }
          }}
          aria-expanded={isExpanded}
        >
          <div className="binary-toast-summary-left">
            <div className="binary-toast-icon-wrapper">
              {hasActive ? (
                <RefreshIcon size={14} className="binary-toast-spin text-primary" />
              ) : hasPaused ? (
                <PauseIcon size={14} className="text-warning" />
              ) : hasFailed ? (
                <AlertCircleIcon size={14} className="text-fail" />
              ) : (
                <CheckIcon size={14} className="text-ready" />
              )}
            </div>
            <div className="binary-toast-summary-text">
              <span className="binary-toast-summary-title">Transfer Firmware</span>
              <span className="binary-toast-summary-badge">
                {hasActive
                  ? `${activeTransfers.length} proses (${aggregatePct}%)`
                  : hasPaused
                  ? `${pausedTransfers.length} dijeda`
                  : hasFailed
                  ? `${failedTransfers.length} gagal`
                  : cancelledTransfers.length > 0
                  ? `${cancelledTransfers.length} dibatalkan`
                  : `${completedTransfers.length} selesai`}
              </span>
            </div>
          </div>

          <div className="binary-toast-summary-actions">
            <button
              type="button"
              className="binary-toast-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
              title={isExpanded ? 'Sembunyikan detail (Compact)' : 'Tampilkan detail'}
              aria-label={isExpanded ? 'Sembunyikan detail' : 'Tampilkan detail'}
            >
              {isExpanded ? <ChevronDownIcon size={15} /> : <ChevronUpIcon size={15} />}
            </button>
          </div>
        </div>

        {/* Compact Mini Progress Line when collapsed */}
        {!isExpanded && (hasActive || hasPaused) && (
          <div className="binary-toast-mini-track">
            <div
              className={`binary-toast-mini-bar ${hasPaused ? 'is-paused' : ''}`}
              style={{ width: `${aggregatePct}%` }}
            />
          </div>
        )}

        {/* Accordion Detail Content Panel */}
        {isExpanded && (
          <div className="binary-toast-accordion-body">
            {transfers.map((item) => {
              const isItemTransferring = item.status === 'transferring';
              const isItemPaused = item.status === 'paused';
              const isItemCompleted = item.status === 'completed';
              const isItemFailed = item.status === 'failed';
              const isItemCancelled = item.status === 'cancelled';

              return (
                <div
                  key={`${item.targetPcId}-${item.filename}`}
                  className={`binary-toast-item ${item.status}`}
                >
                  <div className="binary-toast-item-header">
                    <div className="binary-toast-route">
                      <span className="binary-toast-node">{item.sourcePcId || 'Hub'}</span>
                      <ArrowRightIcon size={10} className="binary-toast-route-arrow" />
                      <span className="binary-toast-node target">{item.targetPcId}</span>
                    </div>

                    <div className="binary-toast-item-status-row">
                      <span className="binary-toast-item-pct">
                        {isItemPaused ? `Jeda ${item.progressPct}%` : isItemCancelled ? 'Batal' : `${item.progressPct}%`}
                      </span>

                      {/* Control Action Buttons: Pause, Resume, Cancel, Dismiss */}
                      <div className="binary-toast-ctrl-btns" onClick={(e) => e.stopPropagation()}>
                        {isItemTransferring && onControl && (
                          <>
                            <button
                              type="button"
                              className="binary-toast-ctrl-btn pause"
                              onClick={() => onControl('pause', item.targetPcId, item.filename, item.sourcePcId)}
                              title="Jeda transfer firmware ini"
                              aria-label="Jeda transfer"
                            >
                              <PauseIcon size={11} />
                            </button>
                            <button
                              type="button"
                              className="binary-toast-ctrl-btn cancel"
                              onClick={() => setCancelTarget(item)}
                              title="Batalkan transfer firmware ini"
                              aria-label="Batalkan transfer"
                            >
                              <StopIcon size={11} />
                            </button>
                          </>
                        )}

                        {isItemPaused && onControl && (
                          <>
                            <button
                              type="button"
                              className="binary-toast-ctrl-btn resume"
                              onClick={() => onControl('resume', item.targetPcId, item.filename, item.sourcePcId)}
                              title="Lanjutkan transfer firmware"
                              aria-label="Lanjutkan transfer"
                            >
                              <PlayIcon size={11} />
                            </button>
                            <button
                              type="button"
                              className="binary-toast-ctrl-btn cancel"
                              onClick={() => setCancelTarget(item)}
                              title="Batalkan transfer firmware"
                              aria-label="Batalkan transfer"
                            >
                              <StopIcon size={11} />
                            </button>
                          </>
                        )}

                        {(isItemFailed || isItemCancelled) && onControl && (
                          <button
                            type="button"
                            className="binary-toast-ctrl-btn retry"
                            onClick={() => onControl('resume', item.targetPcId, item.filename, item.sourcePcId)}
                            title="Ulangi / coba lagi transfer firmware"
                            aria-label="Ulangi transfer"
                          >
                            <RefreshIcon size={11} />
                          </button>
                        )}

                        {(isItemCompleted || isItemFailed || isItemCancelled || isItemPaused) && (
                          <button
                            type="button"
                            className="binary-toast-item-close"
                            onClick={() => onDismiss(item.targetPcId, item.filename)}
                            title="Tutup notifikasi item ini"
                            aria-label="Tutup item"
                          >
                            <CloseIcon size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="binary-toast-filename" title={item.filename}>
                    <FileCodeIcon size={12} className="binary-toast-file-icon" />
                    <span className="binary-toast-filename-text">{item.filename}</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="binary-toast-progress-track">
                    <div
                      className={`binary-toast-progress-bar ${item.status}`}
                      style={{ width: `${Math.min(100, Math.max(0, item.progressPct))}%` }}
                    />
                  </div>

                  {/* Metrics Footer */}
                  <div className="binary-toast-footer">
                    {item.speedMb && isItemTransferring && (
                      <span className="binary-toast-stat">{item.speedMb} MB/s</span>
                    )}

                    {item.totalBytes > 0 && (
                      <span className="binary-toast-stat bytes">
                        {formatBytes(item.downloadedBytes)} / {formatBytes(item.totalBytes)}
                      </span>
                    )}

                    {isItemPaused && (
                      <span className="text-warning" style={{ fontWeight: 600, fontSize: '0.72rem' }}>
                        Transfer dijeda
                      </span>
                    )}

                    {isItemCancelled && (
                      <span className="text-muted" style={{ fontWeight: 600, fontSize: '0.72rem' }}>
                        Dibatalkan
                      </span>
                    )}

                    {isItemFailed && item.error && (
                      <span className="binary-toast-error-text" title={item.error}>
                        {item.error}
                      </span>
                    )}

                    {isItemCompleted && (
                      <span className="text-ready" style={{ fontWeight: 600, fontSize: '0.72rem' }}>
                        Siap digunakan
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>

    {cancelTarget && (
      <CancelTransferModal
        isOpen={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget && onControl) {
            onControl('cancel', cancelTarget.targetPcId, cancelTarget.filename, cancelTarget.sourcePcId);
          }
          setCancelTarget(null);
        }}
        filename={cancelTarget.filename}
        sourcePcId={cancelTarget.sourcePcId}
        targetPcId={cancelTarget.targetPcId}
      />
    )}
    </>
  );
};
