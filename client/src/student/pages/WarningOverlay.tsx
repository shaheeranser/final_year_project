/**
 * WarningOverlay.tsx
 *
 * Full-screen overlay shown on the 1st confirmed violation.
 * Displays what was detected and lets the student acknowledge.
 */

import { Button, Modal } from '../../shared/components';

interface WarningOverlayProps {
  /** The flag label that caused this warning */
  flag: string;
  /** Number of strikes so far */
  strikes: number;
  /** Callback when the student acknowledges the warning */
  onAcknowledge: () => void;
}

const FLAG_DESCRIPTIONS: Record<string, string> = {
  'cell phone': 'A cell phone was detected in the camera frame.',
  book: 'A book or notes were detected in the camera frame.',
  laptop: 'An additional laptop/screen was detected in the camera frame.',
  head_pose: 'You appear to be looking away from the screen.',
  eye_gaze: 'Unusual eye movement was detected.',
};

export function WarningOverlay({ flag, strikes, onAcknowledge }: WarningOverlayProps) {
  const description =
    FLAG_DESCRIPTIONS[flag] ?? `Suspicious activity detected: ${flag}`;

  return (
    <Modal open persistent>
      <div className="warning-overlay">
        <div className="warning-overlay__icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <h2 className="warning-overlay__title" style={{ fontFamily: 'var(--font-serif)' }}>Warning</h2>
        <p className="warning-overlay__description">{description}</p>
        <p className="warning-overlay__strikes">
          Strike <strong>{strikes}</strong> of <strong>2</strong>
        </p>
        <p className="warning-overlay__note">
          One more violation will terminate your exam session.
        </p>
        <Button variant="danger" onClick={onAcknowledge}>
          I Understand — Continue Exam
        </Button>
      </div>
    </Modal>
  );
}
