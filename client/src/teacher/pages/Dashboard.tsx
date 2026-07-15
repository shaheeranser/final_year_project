import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout, StatusRail, Spinner, Button } from '../../shared/components';
import { createOrGetDraftQuiz } from '../../shared/api/quiz';
import { listAttempts } from '../../shared/api/attempt';
import type { Attempt } from '../../shared/types/attempt';

export function Dashboard() {
  const [quiz, setQuiz] = useState<any>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadData() {
      try {
        const q = await createOrGetDraftQuiz();
        setQuiz(q);
        if (q.resourceLinkId) {
          const att = await listAttempts(q.resourceLinkId);
          setAttempts(att);
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

    const refreshAttempts = async () => {
      try {
        const att = await listAttempts(quiz.resourceLinkId);
        setAttempts(att);
      } catch (err) {
        console.error('Failed to refresh attempts', err);
      }
    };

    es.addEventListener('attempt_created', refreshAttempts);
    es.addEventListener('attempt_updated', refreshAttempts);
    es.addEventListener('incident_reported', refreshAttempts);

    return () => {
      es.close();
    };
  }, [quiz?.resourceLinkId]);

  if (loading) return <Spinner label="Loading Dashboard..." />;
  if (error) return <div className="dashboard-content"><p style={{color: 'var(--color-danger)'}}>{error}</p></div>;

  const getStatusConfig = (att: Attempt) => {
    if (att.status === 'not_started') return { s: 'pending', p: 0, l: 'Not Started' };
    if (att.status === 'in_progress') return { s: 'active', p: 50, l: 'In Progress' };
    if (att.status === 'completed') {
      if (att.needsReview) return { s: 'warning', p: 100, l: 'Needs Review' };
      if (att.reviewOutcome === 'upheld') return { s: 'error', p: 100, l: 'Violation Upheld' };
      if (att.reviewOutcome === 'retest_granted') return { s: 'warning', p: 100, l: 'Retest Granted' };
      return { s: 'success', p: 100, l: 'Completed' };
    }
    if (att.status === 'terminated') {
      if (att.needsReview) return { s: 'warning', p: 100, l: 'Terminated (Needs Review)' };
      if (att.reviewOutcome === 'dismissed') return { s: 'success', p: 100, l: 'Terminated (Dismissed)' };
      if (att.reviewOutcome === 'retest_granted') return { s: 'warning', p: 100, l: 'Retest Granted' };
      return { s: 'error', p: 100, l: `Terminated (${att.terminationReason})` };
    }
    return { s: 'pending', p: 0, l: att.status };
  };

  return (
    <Layout
      header={
        <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="dashboard-header__title" style={{ fontFamily: 'var(--font-serif)', display: 'inline-block', marginRight: 'var(--space-sm)' }}>{quiz?.title || 'Session Monitoring'}</h1>
            {quiz && <span className="dashboard-header__badge">{quiz.status.toUpperCase()}</span>}
          </div>
          <div>
            <Link to="/teacher/quiz-builder" className="btn btn--primary">
              Create/Edit Quiz
            </Link>
          </div>
        </div>
      }
    >
      <div className="dashboard-content">
        <div className="dashboard-card" style={{ padding: '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0, flex: '0 0 200px' }}>Student / Attempt ID</h2>
            <div style={{ flex: 1, paddingLeft: 'var(--space-md)' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0 }}>Status Track</h2>
            </div>
            <div style={{ flex: '0 0 100px', textAlign: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0 }}>Incidents</h2>
            </div>
            <div style={{ flex: '0 0 100px', textAlign: 'right' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0 }}>Actions</h2>
            </div>
          </div>
          
          {attempts.length === 0 ? (
            <div style={{ padding: 'var(--space-2xl) var(--space-lg)', textAlign: 'center', color: 'var(--color-ink-muted)' }}>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)' }}>No student attempts yet for this quiz.</p>
            </div>
          ) : (
            attempts.map((att, i) => {
              const cfg = getStatusConfig(att) as any;
              return (
                <div 
                  key={att._id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: 'var(--space-md) var(--space-lg)', 
                    borderBottom: i < attempts.length - 1 ? '1px solid var(--color-border)' : 'none'
                  }}
                >
                  <div style={{ flex: '0 0 200px', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--font-size-sm)', wordBreak: 'break-all' }}>
                    <div style={{ fontSize: '10px', color: 'var(--color-ink-muted)', marginBottom: '4px' }}>{att.studentUserId}</div>
                    {att._id}
                  </div>
                  <div style={{ flex: 1, paddingLeft: 'var(--space-md)', paddingRight: 'var(--space-xl)' }}>
                    <StatusRail 
                      status={cfg.s} 
                      progress={cfg.p} 
                      label={cfg.l} 
                    />
                  </div>
                  <div style={{ flex: '0 0 100px', textAlign: 'center', fontWeight: 'bold', color: att.incidentCount ? 'var(--color-danger)' : 'inherit' }}>
                    {att.incidentCount || 0}
                  </div>
                  <div style={{ flex: '0 0 100px', textAlign: 'right' }}>
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
