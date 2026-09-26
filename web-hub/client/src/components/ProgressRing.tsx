import React from 'react';

interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  title?: string;
  showPercentSign?: boolean;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  progress,
  size = 34,
  strokeWidth = 3,
  color = 'var(--accent-green, #10b981)',
  title,
  showPercentSign = false,
}) => {
  const safeProgress = Math.min(Math.max(progress, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (safeProgress / 100) * circumference;

  return (
    <div
      title={title}
      style={{
        position: 'relative',
        width: `${size}px`,
        height: `${size}px`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        {/* Background Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress Arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          style={{ transition: 'stroke-dashoffset 0.25s linear' }}
        />
      </svg>
      {/* Center Percentage Value */}
      <span
        style={{
          position: 'absolute',
          fontSize: size <= 26 ? '0.54rem' : size <= 32 ? '0.62rem' : '0.68rem',
          fontWeight: 800,
          fontFamily: 'var(--font-mono)',
          color,
          lineHeight: 1,
          textAlign: 'center',
        }}
      >
        {safeProgress}{showPercentSign ? '%' : ''}
      </span>
    </div>
  );
};
