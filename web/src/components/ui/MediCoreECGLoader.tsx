import React from 'react';

interface MediCoreECGLoaderProps {
  width?: number;
  height?: number;
  strokeWidth?: number;
  lineColor?: string;
  showGrid?: boolean;
  className?: string;
  label?: string;
}

/**
 * MediCore ECG Universal Loading System (Web SVG Implementation)
 * Renders a medical-monitor-inspired P-Q-R-S-T heartbeat waveform in MediCore Blue (#0878D1)
 * with reduced-motion accessibility support.
 */
export const MediCoreECGLoader: React.FC<MediCoreECGLoaderProps> = ({
  width = 180,
  height = 48,
  strokeWidth = 2.6,
  lineColor = '#0878D1',
  showGrid = true,
  className = '',
  label = 'Loading',
}) => {
  const ecgPath =
    'M 0 24 L 32 24 C 38 17 44 17 50 24 L 63 24 L 68 32 L 79 4 L 90 40 L 101 24 L 112 24 C 122 13 136 13 148 24 L 180 24';

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 180 48"
      fill="none"
      role="status"
      aria-label={label}
      className={`overflow-visible ${className}`}
    >
      {showGrid && (
        <g stroke="#123B63" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="3 5">
          <line x1="0" y1="12" x2="180" y2="12" />
          <line x1="0" y1="24" x2="180" y2="24" />
          <line x1="0" y1="36" x2="180" y2="36" />
        </g>
      )}

      {/* Faint reference cardiac cycle baseline */}
      <path
        d={ecgPath}
        stroke={lineColor}
        strokeOpacity="0.18"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Animated ECG sweep trace */}
      <path
        d={ecgPath}
        stroke={lineColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="medicore-ecg-trace"
      />
    </svg>
  );
};

export const MediCorePageLoader: React.FC<{
  message?: string;
  className?: string;
}> = ({ message = 'Loading clinical workspace...', className = '' }) => (
  <div
    className={`w-full py-12 px-4 flex flex-col items-center justify-center gap-3 text-center ${className}`}
    role="status"
    aria-live="polite"
  >
    <MediCoreECGLoader width={190} height={50} label={message} />
    <p className="text-xs font-semibold text-[#123B63] tracking-wide">{message}</p>
  </div>
);

export const MediCoreInlineLoader: React.FC<{
  message?: string;
  className?: string;
}> = ({ message = 'Synchronizing hospital data...', className = '' }) => (
  <div
    className={`inline-flex items-center gap-2.5 px-3 py-1.5 ${className}`}
    role="status"
    aria-live="polite"
  >
    <MediCoreECGLoader width={88} height={24} strokeWidth={2.2} showGrid={false} label={message} />
    <span className="text-xs font-medium text-[#0878D1]">{message}</span>
  </div>
);

export const MediCoreButtonLoader: React.FC<{
  label?: string;
  lineColor?: string;
}> = ({ label = 'Processing...', lineColor = '#FFFFFF' }) => (
  <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
    <MediCoreECGLoader
      width={56}
      height={18}
      strokeWidth={2.2}
      lineColor={lineColor}
      showGrid={false}
      label={label}
    />
    <span>{label}</span>
  </span>
);
