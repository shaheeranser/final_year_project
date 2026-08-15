import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout, StatusRail, Spinner, Button } from '../../shared/components';
import { createOrGetDraftQuiz } from '../../shared/api/quiz';
import { listAttempts, approveAttemptApi, bulkApproveApi, pauseAttemptApi, resumeAttemptApi } from '../../shared/api/attempt';
import type { Attempt } from '../../shared/types/attempt';

export function Dashboard() {
  const [quiz, setQuiz] = useState<any>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{ approved: string[]; skipped: { id: string; reason: string }[] } | null>(null);

  const navigate = useNavigate();

  const refreshAttempts = async (resourceLinkId: string) => {
    try {
      const att = await listAttempts(resourceLinkId);
      setAttempts(att);
    } catch (err) {
      console.error('Failed to refresh attempts', err);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        const q = await createOrGetDraftQuiz();
        setQuiz(q);
        if (q.resourceLinkId) {
          await refreshAttempts(q.resourceLinkId);
        }
        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Listen to SSE feed for real-time updates
  useEffect(() => {
    if (!quiz?.resourceLinkId) return;

    const ltik = sessionStorage.getItem('ltik');
    const es = new EventSource(`/api/quizzes/${quiz.resourceLinkId}/live-updates?ltik=${ltik}`, { withCredentials: true });

    const handleRefresh = async () => {
      await refreshAttempts(quiz.resourceLinkId);
    };

    es.addEventListener('attempt_created', handleRefresh);
    es.addEventListener('attempt_updated', handleRefresh);
    es.addEventListener('incident_reported', handleRefresh);

    return () => {
      es.close();
    };
  }, [quiz?.resourceLinkId]);

  if (loading) return <Spinner label="Loading Dashboard..." />;
  if (error) return <div className="dashboard-content"><p style={{color: 'var(--color-danger)'}}>{error}</p></div>;

  // ── Three-state classification ────────────────────────────────────
  const getAttemptState = (att: Attempt): 'awaiting_approval' | 'awaiting_review' | 'resolved' | 'active' | 'not_started' => {
    if (att.status === 'not_started') return 'not_started';
    if (att.status === 'in_progress') return 'active';
    // Finished states
    if (att.finalScore !== null) return 'resolved';
    if (att.needsReview) return 'awaiting_review';
    if (att.reviewOutcome !== null) return 'resolved';
    return 'awaiting_approval';
  };

  const getStatusConfig = (att: Attempt) => {
    const state = getAttemptState(att);
    switch (state) {
      case 'not_started': return { s: 'neutral' as const, p: 0, l: 'Not Started', badge: null };
      case 'active':
        if (att.pausedByTeacher) return { s: 'warning' as const, p: 50, l: 'Paused', badge: '⏸ PAUSED' };
        return { s: 'active' as const, p: 50, l: 'In Progress', badge: null };
      case 'awaiting_approval': return { s: 'active' as const, p: 100, l: 'Awaiting Approval', badge: '✓ CLEAN' };
      case 'awaiting_review': return { s: 'warning' as const, p: 100, l: 'Awaiting Review', badge: '⚠ FLAGGED' };
      case 'resolved':
        if (att.reviewOutcome === 'upheld') return { s: 'terminated' as const, p: 100, l: 'Upheld', badge: null };
        if (att.reviewOutcome === 'retest_granted') return { s: 'warning' as const, p: 100, l: 'Retest Granted', badge: null };
        return { s: 'active' as const, p: 100, l: 'Resolved', badge: null };
    }
  };

  const isResolved = (att: Attempt) => getAttemptState(att) === 'resolved';
  const hasPassbackFailure = (att: Attempt) => att.finalScore !== null && att.gradePassedBack === false;
  const isAwaitingApproval = (att: Attempt) => getAttemptState(att) === 'awaiting_approval';

  const awaitingApprovalAttempts = attempts.filter(isAwaitingApproval);

  // ── Action handlers ─────────────────────────────────────────────
  const handleApprove = async (attemptId: string) => {
    try {
      await approveAttemptApi(attemptId);
      if (quiz?.resourceLinkId) await refreshAttempts(quiz.resourceLinkId);
    } catch (err: any) {
      alert(`Approve failed: ${err.message}`);
    }
  };

  const handleBulkApprove = async () => {
    if (!quiz?.resourceLinkId) return;
    try {
      const result = await bulkApproveApi(quiz.resourceLinkId, 'all');
      setBulkResult(result);
      await refreshAttempts(quiz.resourceLinkId);
    } catch (err: any) {
      alert(`Bulk approve failed: ${err.message}`);
    }
  };

  const handlePause = async (attemptId: string) => {
    try {
      await pauseAttemptApi(attemptId);
      if (quiz?.resourceLinkId) await refreshAttempts(quiz.resourceLinkId);
    } catch (err: any) {
      alert(`Pause failed: ${err.message}`);
    }
  };

  const handleResume = async (attemptId: string) => {
    try {
      await resumeAttemptApi(attemptId);
      if (quiz?.resourceLinkId) await refreshAttempts(quiz.resourceLinkId);
    } catch (err: any) {
      alert(`Resume failed: ${err.message}`);
    }
  };



  return (
    <Layout
      header={
        <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="dashboard-header__title" style={{ fontFamily: 'var(--font-serif)', display: 'inline-block', marginRight: 'var(--space-sm)' }}>{quiz?.title || 'Session Monitoring'}</h1>
            {quiz && <span className="dashboard-header__badge">{quiz.status.toUpperCase()}</span>}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            {quiz?.resourceLinkId && (
              <Button variant="ghost" onClick={() => navigate(`/teacher/live/${quiz.resourceLinkId}`)}>
                🔴 Live Monitor
              </Button>
            )}
            <Link to="/teacher/quiz-builder" className="btn btn--primary">
              Create/Edit Quiz
            </Link>
          </div>
        </div>
      }
    >
      {/* Bulk Result Modal */}
      {bulkResult && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div className="dashboard-card" style={{ maxWidth: '480px', padding: 'var(--space-2xl)' }}>
            <h2 style={{ fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-md)' }}>Bulk Approve Results</h2>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-success)', fontWeight: 600 }}>
              ✓ {bulkResult.approved.length} approved
            </p>
            {bulkResult.skipped.length > 0 && (
              <div style={{ marginTop: 'var(--space-sm)' }}>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-alert)', fontWeight: 600 }}>
                  ⚠ {bulkResult.skipped.length} skipped:
                </p>
                {bulkResult.skipped.map(s => (
                  <p key={s.id} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-ink-muted)', marginLeft: 'var(--space-md)' }}>
                    {s.id.slice(-8)}: {s.reason}
                  </p>
                ))}
              </div>
            )}
            <div style={{ marginTop: 'var(--space-lg)', textAlign: 'right' }}>
              <Button variant="primary" onClick={() => setBulkResult(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-content">
        {/* Bulk approve toolbar */}
        {awaitingApprovalAttempts.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: 'var(--space-sm) var(--space-lg)',
            marginBottom: 'var(--space-md)',
            background: 'rgba(46, 125, 91, 0.08)',
            border: '1px solid rgba(46, 125, 91, 0.2)',
            borderRadius: 'var(--radius-md)',
          }}>
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
              {awaitingApprovalAttempts.length} clean attempt{awaitingApprovalAttempts.length !== 1 ? 's' : ''} awaiting approval
            </span>
            <Button variant="primary" size="sm" onClick={handleBulkApprove}>
              Approve All Clean
            </Button>
          </div>
        )}

        <div className="dashboard-card" style={{ padding: '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0, flex: '0 0 200px' }}>Student</h2>
            <div style={{ flex: 1, paddingLeft: 'var(--space-md)' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0 }}>Status Track</h2>
            </div>
            <div style={{ flex: '0 0 80px', textAlign: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0 }}>Strikes</h2>
            </div>
            <div style={{ flex: '0 0 80px', textAlign: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0 }}>Incidents</h2>
            </div>
            <div style={{ flex: '0 0 80px', textAlign: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0 }}>Score</h2>
            </div>
            <div style={{ flex: '0 0 180px', textAlign: 'right' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0 }}>Actions</h2>
            </div>
          </div>
          
          {attempts.length === 0 ? (
            <div style={{ padding: 'var(--space-2xl) var(--space-lg)', textAlign: 'center', color: 'var(--color-ink-muted)' }}>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)' }}>No student attempts yet for this quiz.</p>
            </div>
          ) : (
            attempts.map((att, i) => {
              const cfg = getStatusConfig(att);
              const resolved = isResolved(att);
              const passbackFailed = hasPassbackFailure(att);
              const awaitingApprovalState = isAwaitingApproval(att);
              const state = getAttemptState(att);

              // State badge colors
              let badgeBg = 'transparent';
              let badgeColor = 'var(--color-ink-muted)';
              if (state === 'awaiting_approval') { badgeBg = 'rgba(46, 125, 91, 0.12)'; badgeColor = 'var(--color-success)'; }
              else if (state === 'awaiting_review') { badgeBg = 'rgba(179, 73, 43, 0.12)'; badgeColor = 'var(--color-alert)'; }

              return (
                <div 
                  key={att._id} 
                  data-urgency-tier={resolved ? 'finalized' : 'active'}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: 'var(--space-md) var(--space-lg)', 
                    borderBottom: i < attempts.length - 1 ? '1px solid var(--color-border)' : 'none',
                    opacity: resolved ? 0.55 : 1,
                    transition: 'opacity var(--transition-base)',
                  }}
                >
                  <div style={{ flex: '0 0 200px', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 'var(--font-size-sm)', wordBreak: 'break-all' }}>
                    <div style={{ fontWeight: 600 }}>{att.studentName || `Student #${att.studentUserId}`}</div>
                    <div style={{ fontSize: '10px', color: 'var(--color-ink-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                      {att._id.slice(-8)}
                      {passbackFailed && (
                        <span
                          data-testid="passback-failure-indicator"
                          title="Grade passback failed — retry from review page"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '18px',
                            height: '18px',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--color-alert)',
                            color: '#fff',
                            fontSize: '11px',
                            fontWeight: 700,
                            flexShrink: 0,
                            cursor: 'help',
                          }}
                        >
                          !
                        </span>
                      )}
                      {cfg.badge && (
                        <span style={{
                          display: 'inline-block',
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '9px',
                          fontWeight: 700,
                          background: badgeBg,
                          color: badgeColor,
                          whiteSpace: 'nowrap',
                        }}>
                          {cfg.badge}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ flex: 1, paddingLeft: 'var(--space-md)', paddingRight: 'var(--space-xl)' }}>
                    <StatusRail 
                      status={cfg.s} 
                      progress={cfg.p} 
                      label={cfg.l} 
                    />
                  </div>
                  <div style={{ flex: '0 0 80px', textAlign: 'center', fontWeight: 'bold', color: att.strikeCount ? 'var(--color-alert)' : 'inherit' }}>
                    {att.strikeCount || 0}
                  </div>
                  <div style={{ flex: '0 0 80px', textAlign: 'center', fontWeight: 'bold', color: att.incidentCount ? 'var(--color-alert)' : 'inherit' }}>
                    {att.incidentCount || 0}
                  </div>
                  <div style={{ flex: '0 0 80px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {att.finalScore !== null ? att.finalScore : (att.computedScore !== null ? <span style={{ color: 'var(--color-ink-muted)' }}>{att.computedScore}*</span> : '—')}
                  </div>
                  <div style={{ flex: '0 0 180px', textAlign: 'right', display: 'flex', gap: 'var(--space-xs)', justifyContent: 'flex-end' }}>
                    {/* Pause/Resume for active attempts */}
                    {att.status === 'in_progress' && (
                      att.pausedByTeacher ? (
                        <Button variant="ghost" size="sm" onClick={() => handleResume(att._id)}>Resume</Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => handlePause(att._id)}>Pause</Button>
                      )
                    )}
                    {/* Approve for clean awaiting-approval attempts */}
                    {awaitingApprovalState && (
                      <Button 
                        variant="primary" 
                        size="sm"
                        style={{ background: 'var(--color-success)' }}
                        onClick={() => handleApprove(att._id)}
                      >
                        Approve
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      style={{ fontFamily: 'var(--font-sans)' }}
                      onClick={() => navigate(`/teacher/review/${att._id}`)}
                    >
                      Review
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
}

