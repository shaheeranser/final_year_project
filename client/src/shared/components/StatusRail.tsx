

type RailStatus = 'active' | 'warning' | 'terminated' | 'neutral';

interface StatusRailProps {
  status: RailStatus;
  progress?: number; // 0 to 100
  label?: string; // e.g., numeric time left, or textual status
}

export function StatusRail({ status, progress = 100, label }: StatusRailProps) {
  let railColorVar = 'var(--color-border)';
  if (status === 'active') railColorVar = 'var(--color-success)';
  else if (status === 'warning') railColorVar = 'var(--color-alert)';
  else if (status === 'terminated') railColorVar = 'var(--color-alert)';
  else if (status === 'neutral') railColorVar = 'var(--color-border-hover)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', width: '100%' }}>
      <div 
        style={{ 
          flex: 1, 
          height: '2px', 
          background: 'var(--color-border)', 
          position: 'relative',
          overflow: 'hidden'
        }}
        aria-hidden="true"
      >
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            background: railColorVar,
            width: `${Math.max(0, Math.min(100, progress))}%`,
            transition: 'width var(--transition-slow)'
          }}
        />
        {/* Tick marks for instrumentation feel */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundImage: 'linear-gradient(to right, transparent 99%, var(--color-bg) 100%)',
          backgroundSize: '10% 100%',
          opacity: 0.3
        }} />
      </div>
      
      {label && (
        <div style={{ 
          fontFamily: 'var(--font-mono)', 
          fontSize: 'var(--font-size-sm)',
          color: railColorVar,
          fontWeight: 600,
          whiteSpace: 'nowrap'
        }}>
          {label}
        </div>
      )}
    </div>
  );
}
