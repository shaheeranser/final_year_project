/**
 * ExamPage.tsx
 *
 * The main exam-taking page. Orchestrates:
 * - Webcam access
 * - Detection engine lifecycle (via useDetectionWorker)
 * - Debounce logic (via useViolationAggregator)
 * - Tab-switch guard (via useVisibilityGuard)
 * - Strike counter & overlay state
 *
 * Renders the video feed, detection canvas, and overlays.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Layout, Spinner, StatusRail, Button } from '../../shared/components';
import { DetectionCanvas } from '../components/DetectionCanvas';
import { useDetectionWorker } from '../hooks/useDetectionWorker';
import { useViolationAggregator } from '../hooks/useViolationAggregator';
import { useVisibilityGuard } from '../hooks/useVisibilityGuard';
import { usePresenceLossGuard } from '../hooks/usePresenceLossGuard';
import { useMultiplePersonGuard } from '../hooks/useMultiplePersonGuard';
import { WarningOverlay } from './WarningOverlay';
import { TerminatedScreen } from './TerminatedScreen';
import { reportIncident, submitAttempt } from '../../shared/api/attempt';
import { captureSnapshot } from '../lib/snapshot';

type ExamStatus = 'loading' | 'active' | 'warning' | 'terminated' | 'submitted';

export function ExamPage({ attemptId }: { attemptId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<ExamStatus>('loading');
  const [strikes, setStrikes] = useState(0);
  const [lastFlag, setLastFlag] = useState<string>('');
  const [terminationReason, setTerminationReason] = useState<string>('strikes');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Fake timer for demonstration purposes (60 minutes)
  const [timeLeft, setTimeLeft] = useState(3600);
  const [videoDimensions, setVideoDimensions] = useState({ width: 640, height: 480 });

  // ── Incident Reporting ────────────────────────────────────────────
  const report = useCallback(
    async (flagType: string, severity: 'soft' | 'hard') => {
      let snapshot = null;
      if (videoRef.current) {
        snapshot = captureSnapshot(videoRef.current);
      }
      try {
        const attempt = await reportIncident(attemptId, {
          flagType,
          severity,
          occurredAt: new Date().toISOString(),
          snapshotImage: snapshot || undefined,
        });
        
        if (attempt.status === 'terminated') {
          setTerminationReason(attempt.terminationReason || flagType);
          setStatus('terminated');
        } else {
          setStrikes(attempt.strikeCount);
        }
      } catch (err) {
        console.error('Failed to report incident', err);
      }
    },
    [attemptId],
  );

  // ── Violation callback (Soft) ──────────────────────────────────────
  const handleViolation = useCallback(
    (flag: string) => {
      setLastFlag(flag);
      if (status !== 'warning' && status !== 'terminated') {
        setStatus('warning');
        report(flag, 'soft');
      }
    },
    [status, report],
  );

  // ── Hooks ─────────────────────────────────────────────────────────
  const { processDetections, reset: resetAggregator } = useViolationAggregator({
    onViolation: handleViolation,
  });

  const {
    ready: workerReady,
    loadingStage,
    loadingProgress,
    detections,
    error: workerError,
    setVideo,
    start: startDetection,
    stop: stopDetection,
  } = useDetectionWorker({
    onDetections: processDetections,
  });

  // Tab-switch guard (Hard)
  useVisibilityGuard({
    enabled: status === 'active' || status === 'warning',
    onHidden: useCallback(() => {
      setTerminationReason('tab_switch');
      setStatus('terminated');
      report('tab_switch', 'hard');
    }, [report]),
  });

  // Presence loss guard (Hard)
  usePresenceLossGuard({
    detections,
    enabled: status === 'active',
    onCameraLost: useCallback(() => {
      setTerminationReason('camera_lost');
      setStatus('terminated');
      report('camera_lost', 'hard');
    }, [report])
  });

  // Multiple people guard (Hard)
  useMultiplePersonGuard({
    detections,
    enabled: status === 'active',
    onMultiplePeople: useCallback(() => {
      setTerminationReason('multiple_people');
      setStatus('terminated');
      report('multiple_people', 'hard');
    }, [report])
  });


  // ── Stop detection on termination or submission ────────────────────
  useEffect(() => {
    if (status === 'terminated' || status === 'submitted') {
      stopDetection();
      resetAggregator();
      // Stop webcam stream
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }
  }, [status, stopDetection, resetAggregator]);

  // ── Request webcam ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        setCameraReady(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();

          const { videoWidth, videoHeight } = videoRef.current;
          if (videoWidth && videoHeight) {
            setVideoDimensions({ width: videoWidth, height: videoHeight });
          }
          setVideo(videoRef.current);
        }
      } catch (err) {
        if (!cancelled) {
          setCameraError(
            err instanceof Error ? err.message : 'Failed to access webcam',
          );
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [setVideo]);

  // ── Start detection once engine + camera are both ready ───────────
  useEffect(() => {
    if (workerReady && cameraReady && status === 'loading') {
      setStatus('active');
      startDetection();
    }
  }, [workerReady, cameraReady, status, startDetection]);

  // ── Fake Timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'active' && status !== 'warning') return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setStatus('terminated');
          setTerminationReason('time_expired');
          report('time_expired', 'hard');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status, report]);

  // ── Submit Attempt ────────────────────────────────────────────────
  const handleSubmit = async () => {
    try {
      await submitAttempt(attemptId, []); // empty answers for demo
      setStatus('submitted');
    } catch (err) {
      console.error('Failed to submit attempt', err);
      alert('Failed to submit exam');
    }
  };

  // ── Warning acknowledgement ───────────────────────────────────────
  const handleAcknowledge = useCallback(() => {
    setStatus('active');
  }, []);

  // ── Render ────────────────────────────────────────────────────────

  if (status === 'terminated') {
    return <TerminatedScreen reason={terminationReason} />;
  }

  if (status === 'submitted') {
    return (
      <Layout header={<div className="exam-header"><h1>Exam Submitted</h1></div>}>
        <div style={{ padding: 'var(--space-2xl)', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--color-success)' }}>Exam submitted successfully!</h2>
          <p>Your attempt has been recorded.</p>
        </div>
      </Layout>
    );
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <Layout
      header={
        status !== 'loading' ? (
          <div className="exam-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <h1 className="exam-header__title" style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-lg)', flex: '0 0 auto', marginRight: 'var(--space-2xl)' }}>Exam Session</h1>
              <div style={{ minWidth: '400px' }}>
                <StatusRail 
                  status={status === 'warning' ? 'warning' : 'active'}
                  progress={(timeLeft / 3600) * 100}
                  label={formatTime(timeLeft)}
                />
              </div>
            </div>
            <div>
              <Button onClick={handleSubmit} variant="primary">Submit Exam</Button>
            </div>
          </div>
        ) : undefined
      }
    >
      {status === 'loading' && (
        <div className="exam-loading">
          <Spinner
            label={
              cameraError
                ? `Camera error: ${cameraError}`
                : workerError
                  ? `Error: ${workerError}`
                  : loadingStage
            }
          />
          {!cameraError && !workerError && (
            <div className="exam-loading__progress">
              <div
                className="exam-loading__progress-bar"
                style={{ width: `${Math.round(loadingProgress * 100)}%` }}
              />
            </div>
          )}
          {cameraError && (
            <p className="exam-loading__error">
              Please allow camera access to proceed with the exam.
            </p>
          )}
        </div>
      )}

      <div
        className="exam-page"
        style={status === 'loading' ? { visibility: 'hidden', position: 'absolute', width: 0, height: 0, overflow: 'hidden' } : undefined}
      >
        <div className="exam-page__video-container">
          <video
            ref={videoRef}
            className="exam-page__video"
            playsInline
            muted
          />
          <DetectionCanvas
            detections={detections}
            width={videoDimensions.width}
            height={videoDimensions.height}
          />
        </div>

        <div className="exam-page__info">
          <div className="exam-page__strikes">
            <span>Strikes:</span>
            <span className={`exam-page__strike-count ${strikes > 0 ? 'exam-page__strike-count--danger' : ''}`}>
              {strikes} / 2
            </span>
          </div>
          <div className="exam-page__active-flags">
            {detections.length > 0 ? (
              detections.map((d, i) => (
                <span key={`${d.label}-${i}`} className="exam-page__flag-badge">
                  {d.label.replace('_', ' ')}
                </span>
              ))
            ) : (
              <span className="exam-page__no-flags">No issues detected</span>
            )}
          </div>
        </div>
      </div>

      {status === 'warning' && (
        <WarningOverlay
          flag={lastFlag}
          strikes={strikes}
          onAcknowledge={handleAcknowledge}
        />
      )}
    </Layout>
  );
}

