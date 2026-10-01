import React from 'react';
import { FileCodeIcon, CheckIcon, CloseIcon, RefreshIcon, AlertCircleIcon, ArrowRightIcon } from './Icons';
import { BinaryTransferProgress } from '../hooks/useFleetWebSocket';

interface BinaryTransferToastProps {
  transfers: BinaryTransferProgress[];
  onDismiss: (targetPcId: string, filename: string) => void;
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
}) => {
  if (!transfers || transfers.length === 0) return null;

  return (
    <aside
      className="binary-toast-container"
      aria-live="polite"
      aria-label="Notifikasi Transfer Firmware"
    >
      {transfers.map((item) => {
        const isTransferring = item.status === 'transferring';
        const isCompleted = item.status === 'completed';
        const isFailed = item.status === 'failed';

        return (
          <div
            key={`${item.targetPcId}-${item.filename}`}
            className={`binary-toast-card ${item.status}`}
            role="status"
          >
            {/* Header: Title & Close */}
            <div className="binary-toast-header">
              <div className="binary-toast-title-row">
                <div className="binary-toast-icon-wrapper">
                  {isTransferring && (
                    <RefreshIcon size={14} className="binary-toast-spin text-primary" />
                  )}
                  {isCompleted && (
                    <CheckIcon size={14} className="text-ready" />
                  )}
                  {isFailed && (
                    <AlertCircleIcon size={14} className="text-fail" />
                  )}
                </div>
                <div className="binary-toast-title">
                  {isTransferring && 'Menyalin Firmware'}
                  {isCompleted && 'Firmware Siap'}
                  {isFailed && 'Gagal Menyalin'}
                </div>
              </div>

              <button
                type="button"
                className="binary-toast-close-btn"
                onClick={() => onDismiss(item.targetPcId, item.filename)}
                aria-label="Tutup notifikasi"
                title="Tutup notifikasi"
              >
                <CloseIcon size={14} />
              </button>
            </div>

            {/* Route & Filename */}
            <div className="binary-toast-body">
              <div className="binary-toast-route">
                <span className="binary-toast-node">{item.sourcePcId || 'Hub'}</span>
                <ArrowRightIcon size={11} className="binary-toast-route-arrow" />
                <span className="binary-toast-node target">{item.targetPcId}</span>
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

              {/* Status & Stats info */}
              <div className="binary-toast-footer">
                <span className="binary-toast-pct">
                  {item.progressPct}%
                </span>

                {item.speedMb && isTransferring && (
                  <span className="binary-toast-stat">
                    {item.speedMb} MB/s
                  </span>
                )}

                {item.totalBytes > 0 && (
                  <span className="binary-toast-stat bytes">
                    {formatBytes(item.downloadedBytes)} / {formatBytes(item.totalBytes)}
                  </span>
                )}

                {isFailed && item.error && (
                  <span className="binary-toast-error-text" title={item.error}>
                    {item.error}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </aside>
  );
};
