/**
 * TerminatedScreen.tsx
 *
 * Shown when the exam is terminated — either by 2 strikes or by a tab switch.
 * No further actions are available; the student must contact their proctor.
 */

interface TerminatedScreenProps {
  /** Reason the exam was terminated */
  reason: string;
}

export function TerminatedScreen({ reason }: TerminatedScreenProps) {
  const getReasonMessage = () => {
    if (reason === 'tab_switch') return 'You switched away from the exam tab. This is not permitted during an active exam session.';
    if (reason === 'camera_lost') return 'We lost connection to your camera or face visibility. This is not permitted.';
    if (reason === 'multiple_people') return 'Multiple people were detected in your camera feed. This is not permitted.';
    if (reason === 'time_expired') return 'Your exam time has expired.';
    return 'You have exceeded the maximum number of allowed warnings. Your exam session has been terminated.';
  };

  return (
    <div className="terminated-screen">
      <div className="terminated-screen__card">
        <div className="terminated-screen__icon">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h1 className="terminated-screen__title" style={{ fontFamily: 'var(--font-serif)' }}>Exam Terminated</h1>
        <p className="terminated-screen__reason">
          {getReasonMessage()}
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
