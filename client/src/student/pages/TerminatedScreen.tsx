/**
 * TerminatedScreen.tsx
 *
 * Shown when the exam is terminated — either by 2 strikes or by a tab switch.
 * No further actions are available; the student must contact their proctor.
 */

interface TerminatedScreenProps {
  /** Reason the exam was terminated */
  reason: 'strikes' | 'tab_switch';
}

export function TerminatedScreen({ reason }: TerminatedScreenProps) {
  const isTabSwitch = reason === 'tab_switch';

  return (
    <div className="terminated-screen">
      <div className="terminated-screen__card">
        <div className="terminated-screen__icon">🚫</div>
        <h1 className="terminated-screen__title">Exam Terminated</h1>
        <p className="terminated-screen__reason">
          {isTabSwitch
            ? 'You switched away from the exam tab. This is not permitted during an active exam session.'
            : 'You have exceeded the maximum number of allowed warnings. Your exam session has been terminated.'}
        </p>
        <div className="terminated-screen__divider" />
        <p className="terminated-screen__instructions">
          Please contact your exam proctor or instructor for further assistance.
        </p>
        <p className="terminated-screen__meta">
          Terminated at:{' '}
          <strong>{new Date().toLocaleTimeString()}</strong>
        </p>
      </div>
    </div>
  );
}
