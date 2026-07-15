import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAttemptDetail, reviewAttempt } from '../../shared/api/attempt';
import { Layout, Spinner, Button } from '../../shared/components';
import type { Attempt, Incident, ReviewOutcome } from '../../shared/types/attempt';

export function ReviewPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<(Attempt & { incidents: Incident[], identitySnapshotUrl: string | null }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      if (!attemptId) return;
      try {
        const data = await getAttemptDetail(attemptId);
        setAttempt(data);
        if (data.reviewNotes) setReviewNotes(data.reviewNotes);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [attemptId]);

  if (loading) return <Spinner label="Loading Attempt Details..." />;
  if (error || !attempt) return <div style={{ padding: 'var(--space-2xl)', color: 'var(--color-danger)' }}>{error || 'Not found'}</div>;

  const handleReview = async (outcome: ReviewOutcome) => {
    if (!attemptId) return;
    try {
      setSubmitting(true);
      await reviewAttempt(attemptId, outcome, undefined, reviewNotes);
      navigate('/teacher');
    } catch (err: any) {
      alert(`Review failed: ${err.message}`);
      setSubmitting(false);
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
          <div>
            <span className="dashboard-header__badge">{attempt.status.toUpperCase()}</span>
          </div>
        </div>
      }
    >
      <div className="dashboard-content" style={{ display: 'flex', gap: 'var(--space-2xl)' }}>
        <div style={{ flex: 1 }}>
          <div className="dashboard-card">
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)' }}>Student Identity</h2>
            <div style={{ marginTop: 'var(--space-md)', fontSize: 'var(--font-size-sm)' }}>
              <p><strong>Student ID:</strong> {attempt.studentUserId}</p>
              <p><strong>Status:</strong> {attempt.status}</p>
              <p><strong>Review Status:</strong> {attempt.needsReview ? 'Needs Review' : (attempt.reviewOutcome || 'Reviewed')}</p>
            </div>
            {attempt.identitySnapshotUrl ? (
              <div style={{ marginTop: 'var(--space-lg)' }}>
                <img src={attempt.identitySnapshotUrl} alt="Student Identity" style={{ maxWidth: '100%', borderRadius: '4px' }} />
              </div>
            ) : (
              <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-xl)', background: 'var(--color-bg)', textAlign: 'center', color: 'var(--color-ink-muted)' }}>
                No identity snapshot available
              </div>
            )}
          </div>

          <div className="dashboard-card" style={{ marginTop: 'var(--space-lg)' }}>
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)' }}>Review Decision</h2>
            <div style={{ marginTop: 'var(--space-md)' }}>
              <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>Review Notes</label>
              <textarea 
                value={reviewNotes} 
                onChange={(e) => setReviewNotes(e.target.value)}
                style={{ width: '100%', height: '100px', padding: 'var(--space-sm)', borderRadius: '4px', border: '1px solid var(--color-border)', fontFamily: 'inherit' }}
                placeholder="Enter any notes..."
              />
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
                variant="primary" 
                onClick={() => handleReview('upheld')}
                disabled={submitting}
                style={{ background: 'var(--color-danger)' }}
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
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div className="dashboard-card" style={{ padding: 0 }}>
            <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0 }}>Incidents ({attempt.incidents.length})</h2>
            </div>
            {attempt.incidents.length === 0 ? (
              <div style={{ padding: 'var(--space-2xl) var(--space-lg)', textAlign: 'center', color: 'var(--color-ink-muted)' }}>
                <p>No incidents reported.</p>
              </div>
            ) : (
              attempt.incidents.map((incident) => (
                <div key={incident._id} style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
                    <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{incident.flagType.replace('_', ' ')}</span>
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-ink-muted)' }}>{new Date(incident.occurredAt).toLocaleTimeString()}</span>
                  </div>
                  <div>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 600, background: incident.severity === 'hard' ? '#fee2e2' : '#fef3c7', color: incident.severity === 'hard' ? '#991b1b' : '#92400e', textTransform: 'uppercase' }}>
                      {incident.severity}
                    </span>
                  </div>
                  {incident.snapshotUrl && (
                    <div style={{ marginTop: 'var(--space-md)' }}>
                      <img src={incident.snapshotUrl} alt="Incident Snapshot" style={{ maxWidth: '100%', borderRadius: '4px' }} />
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
