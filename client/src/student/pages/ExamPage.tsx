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
import { Layout, Spinner } from '../../shared/components';
import { DetectionCanvas } from '../components/DetectionCanvas';
import { useDetectionWorker } from '../hooks/useDetectionWorker';
import { useViolationAggregator } from '../hooks/useViolationAggregator';
import { useVisibilityGuard } from '../hooks/useVisibilityGuard';
import { WarningOverlay } from './WarningOverlay';
import { TerminatedScreen } from './TerminatedScreen';

type ExamStatus = 'loading' | 'active' | 'warning' | 'terminated';

export function ExamPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<ExamStatus>('loading');
  const [strikes, setStrikes] = useState(0);
  const [lastFlag, setLastFlag] = useState<string>('');
  const [terminationReason, setTerminationReason] = useState<'strikes' | 'tab_switch'>('strikes');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Video dimensions
  const [videoDimensions, setVideoDimensions] = useState({ width: 640, height: 480 });

  // ── Violation callback ────────────────────────────────────────────
  const handleViolation = useCallback(
    (flag: string) => {
      setStrikes((prev) => {
        const next = prev + 1;
        setLastFlag(flag);

        if (next >= 2) {
          setTerminationReason('strikes');
          setStatus('terminated');
        } else {
          setStatus('warning');
        }

        return next;
      });
    },
    [],
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

  // Tab-switch guard — terminate immediately
  useVisibilityGuard({
    enabled: status === 'active' || status === 'warning',
    onHidden: useCallback(() => {
      setTerminationReason('tab_switch');
      setStatus('terminated');
    }, []),
  });

  // ── Stop detection on termination ──────────────────────────────────
  useEffect(() => {
    if (status === 'terminated') {
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

          // Bind the video element to the detection engine
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

  // ── Warning acknowledgement ───────────────────────────────────────
  const handleAcknowledge = useCallback(() => {
    setStatus('active');
  }, []);

  // ── Render ────────────────────────────────────────────────────────

  // Terminated state — full takeover, no video needed
  if (status === 'terminated') {
    return <TerminatedScreen reason={terminationReason} />;
  }

  // The video element MUST always be mounted so that videoRef.current
  // is available when the camera useEffect runs (even during loading).
  return (
    <Layout
      header={
        status !== 'loading' ? (
          <div className="exam-header">
            <h1 className="exam-header__title">Exam Session</h1>
            <div className="exam-header__status">
              <span className="exam-header__dot exam-header__dot--active" />
              Monitoring Active
            </div>
          </div>
        ) : undefined
      }
    >
      {/* ── Loading overlay (on top of the hidden video) ─────────── */}
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

      {/* ── Video + detection canvas — always mounted so videoRef is stable.
           Hidden during loading with visibility:hidden (not display:none,
           which would make the video element have 0 dimensions). ───────── */}
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

