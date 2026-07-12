/**
 * Dashboard.tsx
 *
 * Teacher dashboard.
 * Designed as a dense, confident control surface for monitoring sessions.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout, StatusRail, Spinner, Button } from '../../shared/components';
import { createOrGetDraftQuiz, getQuizAttempts } from '../../shared/api/quiz';

export function Dashboard() {
  const [quiz, setQuiz] = useState<any>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const q = await createOrGetDraftQuiz();
        setQuiz(q);
        const att = await getQuizAttempts(q.resourceLinkId);
        setAttempts(att);
        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) return <Spinner label="Loading Dashboard..." />;
  if (error) return <div className="dashboard-content"><p style={{color: 'var(--color-danger)'}}>{error}</p></div>;

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
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0, flex: '0 0 120px' }}>Session ID</h2>
            <div style={{ flex: 1, paddingLeft: 'var(--space-md)' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0 }}>Status Track</h2>
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
            attempts.map((session, i) => (
              <div 
                key={session.id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: 'var(--space-md) var(--space-lg)', 
                  borderBottom: i < attempts.length - 1 ? '1px solid var(--color-border)' : 'none'
                }}
              >
                <div style={{ flex: '0 0 120px', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                  {session.id}
                </div>
                <div style={{ flex: 1, paddingLeft: 'var(--space-md)', paddingRight: 'var(--space-xl)' }}>
                  <StatusRail 
                    status={session.status} 
                    progress={session.progress} 
                    label={session.label} 
                  />
                </div>
                <div style={{ flex: '0 0 100px', textAlign: 'right' }}>
                  <Button variant="ghost" size="sm" style={{ fontFamily: 'var(--font-sans)' }}>Review</Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
