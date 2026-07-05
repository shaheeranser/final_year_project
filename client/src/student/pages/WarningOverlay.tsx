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
        <div className="warning-overlay__icon">⚠️</div>
        <h2 className="warning-overlay__title">Warning</h2>
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
