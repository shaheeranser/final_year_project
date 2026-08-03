import React, { useState, useEffect } from 'react';
import { Input } from './FormControls';

interface DateTimePickerProps {
  label: string;
  value?: string; // ISO date string
  onChange: (isoString: string | undefined) => void;
  disabled?: boolean;
}

export function DateTimePicker({ label, value, onChange, disabled }: DateTimePickerProps) {
  const toUtcIso = (date: string, h: string, m: string): string => {
    // Construct a Date from the local date + time the teacher entered,
    // then convert to UTC ISO — avoids the 'Z' trap that treats local
    // times as UTC.
    const local = new Date(`${date}T${h}:${m}:00`);
    return local.toISOString();
  };

  // Derive initial display values from the stored UTC ISO string
  const getLocalParts = (iso: string) => {
    const d = new Date(iso);
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      hours: String(d.getHours()).padStart(2, '0'),
      minutes: String(d.getMinutes()).padStart(2, '0'),
    };
  };

  const initialParts = value ? getLocalParts(value) : null;
  const initialDate = initialParts?.date ?? '';
  const initialTime = initialParts ? `${initialParts.hours}:${initialParts.minutes}` : '';

  const [dateStr, setDateStr] = useState(initialDate);
  const [hours, setHours] = useState(initialTime ? initialTime.split(':')[0] : '12');
  const [minutes, setMinutes] = useState(initialTime ? initialTime.split(':')[1] : '00');

  useEffect(() => {
    if (value) {
      // value is a UTC ISO string — convert to local time for display
      const d = new Date(value);
      const localYear = d.getFullYear();
      const localMonth = String(d.getMonth() + 1).padStart(2, '0');
      const localDay = String(d.getDate()).padStart(2, '0');
      const localHours = String(d.getHours()).padStart(2, '0');
      const localMinutes = String(d.getMinutes()).padStart(2, '0');
      setDateStr(`${localYear}-${localMonth}-${localDay}`);
      setHours(localHours);
      setMinutes(localMinutes);
    } else {
      setDateStr('');
    }
  }, [value]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setDateStr(newDate);
    if (!newDate) {
      onChange(undefined);
    } else {
      // Convert local date+time to UTC ISO string
      onChange(toUtcIso(newDate, hours, minutes));
    }
  };

  const handleTimeChange = (newHours: string, newMinutes: string) => {
    setHours(newHours);
    setMinutes(newMinutes);
    if (dateStr) {
      onChange(toUtcIso(dateStr, newHours, newMinutes));
    }
  };

  const pad = (n: number) => n.toString().padStart(2, '0');

  const incrementHours = () => {
    let h = parseInt(hours, 10);
    h = (h + 1) % 24;
    handleTimeChange(pad(h), minutes);
  };

  const decrementHours = () => {
    let h = parseInt(hours, 10);
    h = (h - 1 + 24) % 24;
    handleTimeChange(pad(h), minutes);
  };

  const incrementMinutes = () => {
    let m = parseInt(minutes, 10);
    let h = parseInt(hours, 10);
    m += 5;
    if (m >= 60) {
      m -= 60;
      h = (h + 1) % 24;
    }
    handleTimeChange(pad(h), pad(m));
  };

  const decrementMinutes = () => {
    let m = parseInt(minutes, 10);
    let h = parseInt(hours, 10);
    m -= 5;
    if (m < 0) {
      m += 60;
      h = (h - 1 + 24) % 24;
    }
    handleTimeChange(pad(h), pad(m));
  };

  const handleManualHours = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (val.length > 2) val = val.slice(-2);
    setHours(val);
  };

  const commitManualHours = () => {
    let h = parseInt(hours, 10);
    if (isNaN(h)) h = 0;
    if (h > 23) h = 23;
    handleTimeChange(pad(h), minutes);
  };

  const handleManualMinutes = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (val.length > 2) val = val.slice(-2);
    setMinutes(val);
  };

  const commitManualMinutes = () => {
    let m = parseInt(minutes, 10);
    if (isNaN(m)) m = 0;
    if (m > 59) m = 59;
    handleTimeChange(hours, pad(m));
  };

  return (
    <div style={{ marginBottom: 'var(--space-md)' }}>
      <label style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <Input 
            type="date" 
            value={dateStr}
            onChange={handleDateChange}
            disabled={disabled}
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>
        
        {dateStr && (
          <div style={{ 
            flex: '0 0 auto', 
            display: 'flex', 
            alignItems: 'center',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-xs) var(--space-sm)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-md)',
            opacity: disabled ? 0.6 : 1,
            pointerEvents: disabled ? 'none' : 'auto',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <button 
                type="button" 
                onClick={incrementHours} 
                className="time-stepper-btn"
                tabIndex={-1}
              >▲</button>
              <input 
                type="text" 
                value={hours}
                onChange={handleManualHours}
                onBlur={commitManualHours}
                className="time-stepper-input"
              />
              <button 
                type="button" 
                onClick={decrementHours} 
                className="time-stepper-btn"
                tabIndex={-1}
              >▼</button>
            </div>
            
            <span style={{ padding: '0 4px', fontWeight: 'bold', color: 'var(--color-ink-muted)' }}>:</span>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <button 
                type="button" 
                onClick={incrementMinutes} 
                className="time-stepper-btn"
                tabIndex={-1}
              >▲</button>
              <input 
                type="text" 
                value={minutes}
                onChange={handleManualMinutes}
                onBlur={commitManualMinutes}
                className="time-stepper-input"
              />
              <button 
                type="button" 
                onClick={decrementMinutes} 
                className="time-stepper-btn"
                tabIndex={-1}
              >▼</button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .time-stepper-btn {
          background: none;
          border: none;
          color: var(--color-ink-muted);
          cursor: pointer;
          font-size: 0.6rem;
          padding: 8px 12px;
          line-height: 1;
          border-radius: var(--radius-sm);
        }
        .time-stepper-btn:hover {
          color: var(--color-accent);
          background: var(--color-bg);
        }
        @media (max-width: 768px) {
          .time-stepper-btn {
            padding: 12px 16px;
            font-size: 0.8rem;
          }
        }
        .time-stepper-input {
          background: transparent;
          border: none;
          color: var(--color-ink);
          font-family: var(--font-mono);
          font-size: var(--font-size-md);
          width: 32px;
          text-align: center;
          padding: 0;
          outline: none;
        }
        .time-stepper-input:focus {
          color: var(--color-accent);
          background: var(--color-bg);
          border-radius: 4px;
        }
        
        /* Hide native date picker icon to keep it clean if desired, though native gives calendar popup */
        input[type="date"]::-webkit-calendar-picker-indicator {
          cursor: pointer;
          filter: var(--calendar-icon-filter, none);
        }
        [data-theme="dark"] {
          --calendar-icon-filter: invert(1);
        }
      `}</style>
    </div>
  );
}
