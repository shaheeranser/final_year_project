/**
 * LiveDashboard.tsx
 *
 * Teacher live monitoring dashboard showing:
 * - Live counters (in-progress/completed/paused)
 * - Recent incidents feed
 * - On-demand preview panel
 * - Manual open/close override
 * - Pause/resume controls per attempt
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout, Spinner, Button } from '../../shared/components';
import {
  fetchLiveStatus,
  listAttempts,
  startPreviewApi,
  stopPreviewApi,
  getLatestPreviewApi,
  pauseAttemptApi,
  resumeAttemptApi,
  setQuizOverrideApi,
} from '../../shared/api/attempt';
import type { LiveStatusResponse, } from '../../shared/api/attempt';
import type { Attempt } from '../../shared/types/attempt';

export function LiveDashboard() {
  const { resourceLinkId } = useParams<{ resourceLinkId: string }>();
  const navigate = useNavigate();

  const [liveStatus, setLiveStatus] = useState<LiveStatusResponse | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Preview state
  const [previewAttemptId, setPreviewAttemptId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [previewMaxMs, setPreviewMaxMs] = useState(120000);
  const [previewElapsed, setPreviewElapsed] = useState(0);
  const previewPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Override confirmation
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // ── Fetch live data ─────────────────────────────────────────────────
  const refreshData = useCallback(async () => {
    if (!resourceLinkId) return;
    try {
      const [status, atts] = await Promise.all([
        fetchLiveStatus(resourceLinkId),
        listAttempts(resourceLinkId),
      ]);
      setLiveStatus(status);
      setAttempts(atts);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [resourceLinkId]);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // ── Preview handlers ─────────────────────────────────────────────
  const handleStartPreview = async (attemptId: string) => {
    try {
      // Stop any existing preview first
      if (previewPollRef.current) clearInterval(previewPollRef.current);
      if (previewCountdownRef.current) clearInterval(previewCountdownRef.current);
      previewPollRef.current = null;
      previewCountdownRef.current = null;

      const result = await startPreviewApi(attemptId);
      setPreviewMaxMs(result.maxDurationMs);
      setPreviewElapsed(0);
      setPreviewUrl(null);
      // Setting this last triggers the useEffect that starts polling
      setPreviewAttemptId(attemptId);
    } catch (err: any) {
      alert(`Failed to start preview: ${err.message}`);
    }
  };

  const handleStopPreview = useCallback(async () => {
    if (previewPollRef.current) clearInterval(previewPollRef.current);
    if (previewCountdownRef.current) clearInterval(previewCountdownRef.current);
    previewPollRef.current = null;
    previewCountdownRef.current = null;

    const idToStop = previewAttemptId;
    setPreviewAttemptId(null);
    setPreviewUrl(null);
    setPreviewElapsed(0);

    if (idToStop) {
      try { await stopPreviewApi(idToStop); } catch { /* best effort */ }
    }
  }, [previewAttemptId]);

  // Start/stop polling when previewAttemptId changes
  useEffect(() => {
    if (!previewAttemptId) return;

    // Start polling for frames
    const pollId = setInterval(async () => {
      try {
        const data = await getLatestPreviewApi(previewAttemptId);
        if (data.previewActive && data.url) {
          setPreviewUrl(data.url);
        } else {
          // Preview expired server-side, clean up
          clearInterval(pollId);
          clearInterval(countdownId);
          previewPollRef.current = null;
          previewCountdownRef.current = null;
          setPreviewAttemptId(null);
          setPreviewUrl(null);
          setPreviewElapsed(0);
        }
      } catch { /* ignore poll errors */ }
    }, 2000);
    previewPollRef.current = pollId;

    // Start countdown timer
    const countdownId = setInterval(() => {
      setPreviewElapsed(prev => prev + 1000);
    }, 1000);
    previewCountdownRef.current = countdownId;

    return () => {
      clearInterval(pollId);
      clearInterval(countdownId);
      previewPollRef.current = null;
      previewCountdownRef.current = null;
    };
  }, [previewAttemptId]);

  // Cleanup on unmount only (empty deps)
  useEffect(() => {
    return () => {
      if (previewPollRef.current) clearInterval(previewPollRef.current);
      if (previewCountdownRef.current) clearInterval(previewCountdownRef.current);
    };
  }, []);

  // ── Pause/Resume handlers ─────────────────────────────────────────
  const handlePause = async (attemptId: string) => {
    try {
      await pauseAttemptApi(attemptId);
      await refreshData();
    } catch (err: any) {
      alert(`Failed to pause: ${err.message}`);
    }
  };

  const handleResume = async (attemptId: string) => {
    try {
      await resumeAttemptApi(attemptId);
      await refreshData();
    } catch (err: any) {
      alert(`Failed to resume: ${err.message}`);
    }
  };

  // ── Override handlers ─────────────────────────────────────────────
  const handleOverride = async (override: 'forced_open' | 'forced_closed' | 'none') => {
    if (!resourceLinkId) return;
    try {
      await setQuizOverrideApi(resourceLinkId, override);
      setShowCloseConfirm(false);
      await refreshData();
    } catch (err: any) {
      alert(`Failed to set override: ${err.message}`);
    }
  };

  if (loading) return <Spinner label="Loading Live Dashboard..." />;
  if (error) return <div style={{ padding: 'var(--space-2xl)', color: 'var(--color-danger)' }}>{error}</div>;

  const inProgressAttempts = attempts.filter(a => a.status === 'in_progress');

  const formatCountdown = (remainingMs: number) => {
    const s = Math.max(0, Math.ceil(remainingMs / 1000));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <Layout
      header={
        <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Button variant="ghost" onClick={() => navigate('/teacher')} style={{ marginRight: 'var(--space-md)' }}>&larr; Back</Button>
            <h1 className="dashboard-header__title" style={{ fontFamily: 'var(--font-serif)', display: 'inline-block' }}>Live Monitor</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            {/* Manual Override Controls */}
            {liveStatus?.manualOverride === 'forced_open' && (
              <span style={{ padding: '4px 12px', borderRadius: 'var(--radius-full)', background: 'rgba(46, 125, 91, 0.15)', color: 'var(--color-success)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
                🟢 Forced Open
              </span>
            )}
            {liveStatus?.manualOverride === 'forced_closed' && (
              <span style={{ padding: '4px 12px', borderRadius: 'var(--radius-full)', background: 'rgba(179, 73, 43, 0.15)', color: 'var(--color-alert)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
                🔴 Forced Closed
              </span>
            )}
            {liveStatus?.manualOverride !== 'forced_open' && (
              <Button variant="ghost" onClick={() => handleOverride('forced_open')} size="sm">Open Now</Button>
            )}
            {liveStatus?.manualOverride !== 'forced_closed' && (
              <Button variant="danger" onClick={() => setShowCloseConfirm(true)} size="sm">Close Now</Button>
            )}
            {liveStatus?.manualOverride !== 'none' && (
              <Button variant="ghost" onClick={() => handleOverride('none')} size="sm">Reset Override</Button>
            )}
          </div>
        </div>
      }
    >
      {/* Close Confirmation Dialog */}
      {showCloseConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div className="dashboard-card" style={{ maxWidth: '480px', padding: 'var(--space-2xl)' }}>
            <h2 style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-alert)', marginBottom: 'var(--space-md)' }}>⚠ Close Quiz Now?</h2>
            <p style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-lg)', lineHeight: 1.6 }}>
              This will <strong>immediately end every in-progress attempt</strong> for every student.
              This action is <strong>irreversible</strong>. All unsubmitted work will be force-terminated.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setShowCloseConfirm(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => handleOverride('forced_closed')}>Yes, Close Now</Button>
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-content">
        {/* ── Live Counters ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
          {[
            { label: 'Total Enrolled', value: liveStatus?.totalEnrolled ?? 0, color: 'var(--color-ink)' },
            { label: 'In Progress', value: liveStatus?.inProgressCount ?? 0, color: 'var(--color-success)' },
            { label: 'Completed', value: liveStatus?.completedCount ?? 0, color: 'var(--color-ink-muted)' },
            { label: 'Paused', value: liveStatus?.pausedCount ?? 0, color: 'var(--color-alert)' },
          ].map(item => (
            <div key={item.label} className="dashboard-card" style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: item.color }}>{item.value}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-ink-muted)', marginTop: 'var(--space-xs)' }}>{item.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-xl)', flexWrap: 'wrap' }}>
          {/* ── In-Progress Attempts with Pause/Preview ── */}
          <div style={{ flex: 1, minWidth: '320px' }}>
            <div className="dashboard-card" style={{ padding: 0 }}>
              <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0 }}>
                  Active Attempts ({inProgressAttempts.length})
                </h2>
              </div>
              {inProgressAttempts.length === 0 ? (
                <div style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--color-ink-muted)' }}>
                  No attempts currently in progress.
                </div>
              ) : (
                inProgressAttempts.map(att => (
                  <div key={att._id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--color-border)'
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{att.studentName || `Student #${att.studentUserId}`}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-ink-muted)', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginTop: '2px' }}>
                        {att._id.slice(-8)}
                        {att.pausedByTeacher && (
                          <span style={{
                            padding: '2px 8px', borderRadius: 'var(--radius-full)',
                            background: 'rgba(179, 73, 43, 0.15)', color: 'var(--color-alert)',
                            fontSize: '10px', fontWeight: 700, textTransform: 'uppercase'
                          }}>
                            Paused
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                      {att.pausedByTeacher ? (
                        <Button variant="ghost" size="sm" onClick={() => handleResume(att._id)}>Resume</Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => handlePause(att._id)}>Pause</Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleStartPreview(att._id)}
                        disabled={previewAttemptId === att._id}>
                        Preview
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* ── Preview Panel ── */}
            {previewAttemptId && (
              <div className="dashboard-card" style={{ marginTop: 'var(--space-md)', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
                    <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>Live Preview</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-sm)', color: 'var(--color-ink-muted)' }}>
                      {formatCountdown(previewMaxMs - previewElapsed)} remaining
                    </span>
                    {/* Progress bar */}
                    <div style={{ width: '80px', height: '4px', background: 'var(--color-border)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.max(0, 100 - (previewElapsed / previewMaxMs) * 100)}%`,
                        height: '100%', background: 'var(--color-success)', transition: 'width 1s linear'
                      }} />
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleStopPreview}>Close</Button>
                  </div>
                </div>
                {previewUrl ? (
                  <img
                    src={`${previewUrl}&_t=${Date.now()}`}
                    alt="Student preview"
                    style={{ width: '100%', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--color-ink-muted)', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
                    Waiting for first frame...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Recent Incidents Feed ── */}
          <div style={{ flex: 1, minWidth: '320px' }}>
            <div className="dashboard-card" style={{ padding: 0 }}>
              <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0 }}>
                  Recent Incidents
                </h2>
              </div>
              {(!liveStatus?.recentIncidents || liveStatus.recentIncidents.length === 0) ? (
                <div style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--color-ink-muted)' }}>
                  No incidents reported yet.
                </div>
              ) : (() => {
                // Group incidents by attemptId
                const grouped: Record<string, { studentName: string; studentUserId: string; incidents: typeof liveStatus.recentIncidents }> = {};
                for (const inc of liveStatus.recentIncidents) {
                  const key = inc.attemptId;
                  if (!grouped[key]) {
                    grouped[key] = {
                      studentName: (inc as any).studentName || `Student #${inc.studentUserId}`,
                      studentUserId: inc.studentUserId,
                      incidents: [],
                    };
                  }
                  grouped[key].incidents.push(inc);
                }
                return Object.entries(grouped).map(([attemptId, group]) => (
                  <div key={attemptId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{
                      padding: 'var(--space-sm) var(--space-lg)',
                      background: 'rgba(0,0,0,0.03)',
                      fontWeight: 600,
                      fontSize: 'var(--font-size-sm)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <span>{group.studentName}</span>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        color: 'var(--color-ink-muted)',
                      }}>
                        {group.incidents.length} incident{group.incidents.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {group.incidents.map(inc => (
                      <div
                        key={inc._id}
                        style={{
                          padding: 'var(--space-xs) var(--space-lg) var(--space-xs) calc(var(--space-lg) + var(--space-md))',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                        onClick={() => handleStartPreview(inc.attemptId)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                          <span style={{ fontWeight: 500, fontSize: 'var(--font-size-sm)', textTransform: 'capitalize' }}>
                            {inc.flagType.replace('_', ' ')}
                          </span>
                          <span style={{
                            display: 'inline-block',
                            padding: '1px 6px', borderRadius: 'var(--radius-full)', fontSize: '10px', fontWeight: 600,
                            background: inc.severity === 'hard' ? 'rgba(179, 73, 43, 0.15)' : 'rgba(179, 146, 43, 0.15)',
                            color: inc.severity === 'hard' ? 'var(--color-alert)' : 'var(--color-ink-muted)',
                            textTransform: 'uppercase'
                          }}>
                            {inc.severity}
                          </span>
                        </div>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-ink-muted)' }}>
                          {new Date(inc.occurredAt).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
