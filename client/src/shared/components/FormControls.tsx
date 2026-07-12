import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, fullWidth = true, className = '', style, ...props }, ref) => {
    const baseStyle: React.CSSProperties = {
      padding: 'var(--space-sm) var(--space-md)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--color-surface)',
      color: 'var(--color-ink)',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--font-size-md)',
      transition: 'var(--transition-fast)',
      outline: 'none',
      width: fullWidth ? '100%' : 'auto',
      minHeight: '44px',
      ...style,
    };

    return (
      <div style={{ marginBottom: 'var(--space-sm)' }}>
        {label && (
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`custom-input ${className}`}
          style={baseStyle}
          {...props}
        />
        {error && <span style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-xs)' }}>{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export interface RadioProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ label, className = '', style, ...props }, ref) => {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer', minHeight: '44px', ...style }}>
        <input
          type="radio"
          ref={ref}
          className={`custom-radio ${className}`}
          style={{
            appearance: 'none',
            width: '1.25rem',
            height: '1.25rem',
            border: '2px solid var(--color-border)',
            borderRadius: '50%',
            display: 'grid',
            placeContent: 'center',
            margin: 0,
            cursor: 'pointer',
          }}
          {...props}
        />
        {label && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)' }}>{label}</span>}
        <style>{`
          .custom-radio::before {
            content: "";
            width: 0.65rem;
            height: 0.65rem;
            border-radius: 50%;
            transform: scale(0);
            transition: 120ms transform ease-in-out;
            box-shadow: inset 1em 1em var(--color-accent);
          }
          .custom-radio:checked {
            border-color: var(--color-accent);
          }
          .custom-radio:checked::before {
            transform: scale(1);
          }
          .custom-radio:focus-visible {
            box-shadow: var(--focus-ring);
          }
          .custom-input:focus {
            border-color: var(--color-accent);
            box-shadow: var(--focus-ring);
          }
        `}</style>
      </label>
    );
  }
);

Radio.displayName = 'Radio';

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, fullWidth = true, className = '', style, ...props }, ref) => {
    const baseStyle: React.CSSProperties = {
      padding: 'var(--space-sm) var(--space-md)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--color-surface)',
      color: 'var(--color-ink)',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--font-size-md)',
      transition: 'var(--transition-fast)',
      outline: 'none',
      width: fullWidth ? '100%' : 'auto',
      minHeight: '80px',
      resize: 'vertical',
      ...style,
    };

    return (
      <div style={{ marginBottom: 'var(--space-sm)' }}>
        {label && (
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`custom-input ${className}`}
          style={baseStyle}
          {...props}
        />
        {error && <span style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-xs)' }}>{error}</span>}
      </div>
    );
  }
);

TextArea.displayName = 'TextArea';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = '', style, ...props }, ref) => {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer', minHeight: '44px', ...style }}>
        <input
          type="checkbox"
          ref={ref}
          className={`custom-checkbox ${className}`}
          style={{
            appearance: 'none',
            width: '1.25rem',
            height: '1.25rem',
            border: '2px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            display: 'grid',
            placeContent: 'center',
            margin: 0,
            cursor: 'pointer',
          }}
          {...props}
        />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)' }}>{label}</span>
        <style>{`
          .custom-checkbox::before {
            content: "";
            width: 0.8rem;
            height: 0.8rem;
            transform: scale(0);
            transition: 120ms transform ease-in-out;
            background-color: var(--color-accent);
            clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
          }
          .custom-checkbox:checked {
            border-color: var(--color-accent);
          }
          .custom-checkbox:checked::before {
            transform: scale(1);
          }
          .custom-checkbox:focus-visible {
            box-shadow: var(--focus-ring);
          }
        `}</style>
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
