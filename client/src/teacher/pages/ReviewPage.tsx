import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAttemptDetail, reviewAttempt, retryPassback } from '../../shared/api/attempt';
import { fetchQuiz } from '../../shared/api/quiz';
import type { Quiz } from '../../shared/api/quiz';
import { Layout, Spinner, Button } from '../../shared/components';
import type { Attempt, Incident, ReviewOutcome } from '../../shared/types/attempt';

export function ReviewPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<(Attempt & { incidents: Incident[], identitySnapshotUrl: string | null }) | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewNotesError, setReviewNotesError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    async function load() {
      if (!attemptId) return;
      try {
        const data = await getAttemptDetail(attemptId);
        setAttempt(data);
        if (data.reviewNotes) setReviewNotes(data.reviewNotes);
        // Load quiz data for answer review
        try {
          const quizData = await fetchQuiz(data.quizId);
          setQuiz(quizData);
        } catch {
          // Quiz fetch is best-effort for answer display
          console.warn('Could not load quiz data for answer review');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [attemptId]);

  // Listen to SSE feed for real-time updates for this attempt
  useEffect(() => {
    if (!attempt?.quizId) return;

    const ltik = sessionStorage.getItem('ltik');
    const es = new EventSource(`/api/quizzes/${attempt.quizId}/live-updates?ltik=${ltik}`, { withCredentials: true });

    const refreshData = async (e: MessageEvent) => {
      try {
        if (!attemptId) return;
        const payload = JSON.parse(e.data);
        // Only refresh if the event is for this attempt
        const updatedAttemptId = payload.attempt ? payload.attempt._id : payload._id;
        if (updatedAttemptId === attemptId) {
          const data = await getAttemptDetail(attemptId);
          setAttempt(data);
        }
      } catch (err) {
        console.error('Failed to refresh attempt data', err);
      }
    };

    es.addEventListener('attempt_updated', refreshData);
    es.addEventListener('incident_reported', refreshData);

    return () => {
      es.close();
    };
  }, [attempt?.quizId, attemptId]);

  if (loading) return <Spinner label="Loading Attempt Details..." />;
  if (error || !attempt) return <div style={{ padding: 'var(--space-2xl)', color: 'var(--color-danger)' }}>{error || 'Not found'}</div>;

  // Determine view mode
  const isAlreadyReviewed = attempt.reviewOutcome !== null;
  const isAutoFinalized = attempt.status === 'completed' && !attempt.needsReview && !isAlreadyReviewed;
  const canReview = attempt.needsReview && !isAlreadyReviewed;
  const hasPassbackFailure = attempt.finalScore !== null && attempt.gradePassedBack === false;

  // Sort incidents chronologically
  const sortedIncidents = [...attempt.incidents].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );

  const handleReview = async (outcome: ReviewOutcome) => {
    if (!attemptId) return;

    // Validate reviewNotes for upheld/dismissed
    if (outcome === 'upheld' || outcome === 'dismissed') {
      if (!reviewNotes.trim()) {
        setReviewNotesError('Review notes are required for this action.');
        return;
      }
    }
    setReviewNotesError(null);

    try {
      setSubmitting(true);
      await reviewAttempt(attemptId, outcome, reviewNotes || undefined);
      // Refresh attempt data to show updated state
      const data = await getAttemptDetail(attemptId);
      setAttempt(data);
      setSubmitting(false);
    } catch (err: any) {
      alert(`Review failed: ${err.message}`);
      setSubmitting(false);
    }
  };

  const handleRetryPassback = async () => {
    if (!attemptId) return;
    try {
      setRetrying(true);
      const updated = await retryPassback(attemptId);
      // Update attempt with the returned data — merge with current state to preserve incidents/urls
      setAttempt(prev => prev ? { ...prev, ...updated } : prev);
    } catch (err: any) {
      alert(`Retry passback failed: ${err.message}`);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Layout
      header={
        <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Button variant="ghost" onClick={() => navigate('/teacher')} style={{ marginRight: 'var(--space-md)' }}>&larr; Back</Button>
            <h1 className="dashboard-header__title" style={{ fontFamily: 'var(--font-serif)', display: 'inline-block' }}>Attempt Review</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <span className="dashboard-header__badge">{attempt.status.toUpperCase()}</span>
            {hasPassbackFailure && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-xs)',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-alert)',
                  color: '#fff',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                }}
              >
                ⚠ Grade Passback Failed
              </span>
            )}
          </div>
        </div>
      }
    >
      <div className="dashboard-content" style={{ display: 'flex', gap: 'var(--space-2xl)', flexWrap: 'wrap' }}>
        {/* Left Column — Identity, Answers, Review Decision */}
        <div style={{ flex: 1, minWidth: '320px' }}>
          {/* Student Identity Card */}
          <div className="dashboard-card">
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)' }}>Student Identity</h2>
            <div style={{ marginTop: 'var(--space-md)', fontSize: 'var(--font-size-sm)' }}>
              <p><strong>Student ID:</strong> {attempt.studentUserId}</p>
              <p><strong>Status:</strong> {attempt.status}</p>
              <p><strong>Strike Count:</strong> {attempt.strikeCount}</p>
              {attempt.terminationReason && (
                <p><strong>Termination Reason:</strong> {attempt.terminationReason}</p>
              )}
              <p><strong>Review Status:</strong> {
                isAlreadyReviewed 
                  ? attempt.reviewOutcome 
                  : (attempt.needsReview ? 'Needs Review' : 'Auto-finalized')
              }</p>
              {attempt.finalScore !== null && (
                <p><strong>Final Score:</strong> {attempt.finalScore}</p>
              )}
            </div>
            {attempt.identitySnapshotUrl ? (
              <div style={{ marginTop: 'var(--space-lg)' }}>
                <img src={attempt.identitySnapshotUrl} alt="Student Identity" crossOrigin="anonymous" style={{ maxWidth: '100%', borderRadius: 'var(--radius-sm)' }} />
              </div>
            ) : (
              <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-xl)', background: 'var(--color-bg)', textAlign: 'center', color: 'var(--color-ink-muted)', borderRadius: 'var(--radius-sm)' }}>
                No identity snapshot available
              </div>
            )}
          </div>

          {/* Answers Review Card — show when attempt is completed with answers */}
          {attempt.status === 'completed' && attempt.answers && attempt.answers.length > 0 && quiz && (
            <div className="dashboard-card" style={{ marginTop: 'var(--space-lg)' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)' }}>Submitted Answers</h2>
              <div style={{ marginTop: 'var(--space-md)' }}>
                {quiz.questions.map((question, qi) => {
                  const studentAnswer = attempt.answers.find(a => a.questionId === question.id);
                  const isCorrect = studentAnswer?.selectedOptionId === question.correctOptionId;
                  return (
                    <div 
                      key={question.id} 
                      style={{ 
                        padding: 'var(--space-md)', 
                        borderBottom: qi < quiz.questions.length - 1 ? '1px solid var(--color-border)' : 'none' 
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-sm)' }}>
                        Q{qi + 1}. {question.text} <span style={{ color: 'var(--color-ink-muted)', fontWeight: 400 }}>({question.score} pts)</span>
                      </div>
                      <div style={{ fontSize: 'var(--font-size-sm)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                        {question.options.map(opt => {
                          const isStudentChoice = studentAnswer?.selectedOptionId === opt.id;
                          const isCorrectOption = question.correctOptionId === opt.id;
                          let bg = 'transparent';
                          let border = '1px solid var(--color-border)';
                          if (isCorrectOption) {
                            bg = 'rgba(46, 125, 91, 0.1)';
                            border = '1px solid var(--color-success)';
                          }
                          if (isStudentChoice && !isCorrectOption) {
                            bg = 'rgba(179, 73, 43, 0.1)';
                            border = '1px solid var(--color-alert)';
                          }
                          return (
                            <div 
                              key={opt.id} 
                              style={{ 
                                padding: 'var(--space-xs) var(--space-sm)', 
                                borderRadius: 'var(--radius-sm)', 
                                background: bg, 
                                border,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-sm)',
                              }}
                            >
                              <span>{opt.text}</span>
                              {isStudentChoice && <span style={{ fontWeight: 600, fontSize: '11px' }}>← Student</span>}
                              {isCorrectOption && <span style={{ fontWeight: 600, fontSize: '11px', color: 'var(--color-success)' }}>✓ Correct</span>}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ marginTop: 'var(--space-xs)', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: isCorrect ? 'var(--color-success)' : 'var(--color-alert)' }}>
                        {studentAnswer ? (isCorrect ? '✓ Correct' : '✗ Incorrect') : '— Not answered'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Review Decision Card */}
          <div className="dashboard-card" style={{ marginTop: 'var(--space-lg)' }}>
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)' }}>Review Decision</h2>

            {/* Read-only mode: already reviewed */}
            {isAlreadyReviewed && (
              <div style={{ marginTop: 'var(--space-md)', fontSize: 'var(--font-size-sm)' }}>
                <p><strong>Outcome:</strong> <span style={{ textTransform: 'capitalize' }}>{attempt.reviewOutcome?.replace('_', ' ')}</span></p>
                {attempt.reviewNotes && (
                  <div style={{ marginTop: 'var(--space-sm)' }}>
                    <strong>Notes:</strong>
                    <p style={{ marginTop: 'var(--space-xs)', padding: 'var(--space-sm)', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', whiteSpace: 'pre-wrap' }}>
                      {attempt.reviewNotes}
                    </p>
                  </div>
                )}
                {attempt.reviewedAt && (
                  <p style={{ marginTop: 'var(--space-sm)', color: 'var(--color-ink-muted)' }}>
                    <strong>Reviewed at:</strong> {new Date(attempt.reviewedAt).toLocaleString()}
                  </p>
                )}
                {attempt.finalScore !== null && (
                  <p style={{ marginTop: 'var(--space-sm)' }}><strong>Final Score:</strong> {attempt.finalScore}</p>
                )}
              </div>
            )}

            {/* Read-only mode: auto-finalized clean attempt */}
            {isAutoFinalized && (
              <div style={{ marginTop: 'var(--space-md)', fontSize: 'var(--font-size-sm)' }}>
                <p style={{ color: 'var(--color-ink-muted)' }}>This attempt was auto-finalized with no review needed.</p>
                {attempt.finalScore !== null && (
                  <p style={{ marginTop: 'var(--space-sm)', fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>
                    Final Score: {attempt.finalScore}
                  </p>
                )}
              </div>
            )}

            {/* Active review mode */}
            {canReview && (
              <>
                <div style={{ marginTop: 'var(--space-md)' }}>
                  <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>Review Notes</label>
                  <textarea 
                    value={reviewNotes} 
                    onChange={(e) => {
                      setReviewNotes(e.target.value);
                      if (reviewNotesError) setReviewNotesError(null);
                    }}
                    style={{ 
                      width: '100%', 
                      height: '100px', 
                      padding: 'var(--space-sm)', 
                      borderRadius: 'var(--radius-sm)', 
                      border: reviewNotesError ? '1px solid var(--color-alert)' : '1px solid var(--color-border)', 
                      fontFamily: 'inherit',
                      background: 'var(--color-surface)',
                      color: 'var(--color-ink)',
                    }}
                    placeholder="Enter review notes (required for Uphold/Dismiss)..."
                  />
                  {reviewNotesError && (
                    <p style={{ color: 'var(--color-alert)', fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-xs)' }}>
                      {reviewNotesError}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-lg)' }}>
                  <Button 
                    variant="primary" 
                    onClick={() => handleReview('dismissed')}
                    disabled={submitting}
                    style={{ background: 'var(--color-success)' }}
                  >
                    Dismiss Violations
                  </Button>
                  <Button 
                    variant="danger" 
                    onClick={() => handleReview('upheld')}
                    disabled={submitting}
                  >
                    Uphold Violations
                  </Button>
                  <Button 
                    variant="ghost" 
                    onClick={() => handleReview('retest_granted')}
                    disabled={submitting}
                  >
                    Grant Retest
                  </Button>
                </div>
              </>
            )}

            {/* Retry Passback button */}
            {hasPassbackFailure && (
              <div style={{ 
                marginTop: 'var(--space-lg)', 
                padding: 'var(--space-md)', 
                background: 'rgba(179, 73, 43, 0.08)', 
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-alert)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--color-alert)', margin: 0 }}>
                      ⚠ Grade passback to Moodle failed
                    </p>
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-ink-muted)', margin: 'var(--space-xs) 0 0' }}>
                      The score was saved locally but could not be sent to the gradebook.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={handleRetryPassback}
                    disabled={retrying}
                    style={{ flexShrink: 0 }}
                  >
                    {retrying ? 'Retrying...' : 'Retry Passback'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column — Incident Timeline */}
        <div style={{ flex: 1, minWidth: '320px' }}>
          <div className="dashboard-card" style={{ padding: 0 }}>
            <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0 }}>Incidents ({attempt.incidents.length})</h2>
            </div>
            {sortedIncidents.length === 0 ? (
              <div style={{ padding: 'var(--space-2xl) var(--space-lg)', textAlign: 'center', color: 'var(--color-ink-muted)' }}>
                <p>No incidents reported.</p>
              </div>
            ) : (
              sortedIncidents.map((incident) => (
                <div key={incident._id} style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
                    <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{incident.flagType.replace('_', ' ')}</span>
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-ink-muted)' }}>{new Date(incident.occurredAt).toLocaleTimeString()}</span>
                  </div>
                  <div>
                    <span style={{ 
                      display: 'inline-block', 
                      padding: '2px 8px', 
                      borderRadius: 'var(--radius-full)', 
                      fontSize: '10px', 
                      fontWeight: 600, 
                      background: incident.severity === 'hard' ? 'rgba(179, 73, 43, 0.15)' : 'rgba(179, 146, 43, 0.15)', 
                      color: incident.severity === 'hard' ? 'var(--color-alert)' : 'var(--color-ink-muted)', 
                      textTransform: 'uppercase' 
                    }}>
                      {incident.severity}
                    </span>
                  </div>
                  {incident.snapshotUrl && (
                    <div style={{ marginTop: 'var(--space-md)' }}>
                      <img src={incident.snapshotUrl} alt="Incident Snapshot" crossOrigin="anonymous" style={{ maxWidth: '100%', borderRadius: 'var(--radius-sm)' }} />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
