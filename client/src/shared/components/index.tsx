import type React from 'react';
import { ThemeToggle } from './ThemeToggle';

/* ── Button ─────────────────────────────────────────────────────────── */

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const base = 'btn';
  const cls = [base, `btn--${variant}`, `btn--${size}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

/* ── Modal ──────────────────────────────────────────────────────────── */

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  /** If true the backdrop click and ESC are disabled */
  persistent?: boolean;
}

export function Modal({ open, onClose, children, persistent = false }: ModalProps) {
  if (!open) return null;

  const handleBackdrop = () => {
    if (!persistent && onClose) onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* ── Layout ─────────────────────────────────────────────────────────── */

interface LayoutProps {
  children: React.ReactNode;
  header?: React.ReactNode;
}

export function Layout({ children, header }: LayoutProps) {
  return (
    <div className="layout">
      <header className="layout__header">
        <div style={{ flex: 1 }}>{header}</div>
        <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'var(--space-md)' }}>
          <ThemeToggle />
        </div>
      </header>
      <main className="layout__main">{children}</main>
    </div>
  );
}

/* ── Spinner ────────────────────────────────────────────────────────── */

interface SpinnerProps {
  label?: string;
}

export function Spinner({ label }: SpinnerProps) {
  return (
    <div className="spinner-wrapper">
      <div className="spinner" />
      {label && <p className="spinner-label">{label}</p>}
    </div>
  );
}

/* ── Exports for New Components ─────────────────────────────────────── */
export { ThemeProvider } from './ThemeProvider';
export { ThemeToggle } from './ThemeToggle';
export { StatusRail } from './StatusRail';
export { Input, TextArea, Radio, Checkbox } from './FormControls';
export { DateTimePicker } from './DateTimePicker';
