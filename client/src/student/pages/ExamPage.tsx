/**
 * ExamPage.tsx
 *
 * The main exam-taking page. Orchestrates:
 * - Webcam access
 * - Detection engine lifecycle (via useDetectionWorker)
 * - Debounce logic (via useViolationAggregator)
 * - Tab-switch guard (via useVisibilityGuard)
 * - Strike counter & overlay state
 * - Quiz question rendering and answer tracking
 *
 * Renders the quiz questions on the left and a compact webcam feed on the right.
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
import { reportIncident, submitAttempt, fetchQuizForStudent, fetchAttemptStatus, uploadPreviewFrame } from '../../shared/api/attempt';
import type { StudentQuiz } from '../../shared/api/attempt';
import type { Answer } from '../../shared/types/attempt';
import { captureSnapshot } from '../lib/snapshot';

type ExamStatus = 'loading' | 'active' | 'warning' | 'terminated' | 'submitted';

interface ExamPageProps {
  attemptId: string;
  resourceLinkId: string;
}

export function ExamPage({ attemptId, resourceLinkId }: ExamPageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<ExamStatus>('loading');
  const [strikes, setStrikes] = useState(0);
  const [lastFlag, setLastFlag] = useState<string>('');
  const [terminationReason, setTerminationReason] = useState<string>('strikes');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Quiz state
  const [quiz, setQuiz] = useState<StudentQuiz | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Timer — uses quiz.attemptDurationMinutes when available, else 60 minutes
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [videoDimensions, setVideoDimensions] = useState({ width: 640, height: 480 });

  // Pause & Preview state (teacher-initiated, polled from status endpoint)
  const [isPaused, setIsPaused] = useState(false);
  const [isPreviewActive, setIsPreviewActive] = useState(false);

  // ── Fetch quiz questions ──────────────────────────────────────────
  useEffect(() => {
    fetchQuizForStudent(resourceLinkId)
      .then(data => {
        setQuiz(data);
        const durationSec = (data.attemptDurationMinutes ?? 60) * 60;
        setTimeLeft(durationSec);
      })
      .catch(err => {
        console.error('Failed to load quiz:', err);
        setQuizError('Failed to load quiz questions. Please refresh and try again.');
      });
  }, [resourceLinkId]);

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
      if (isPaused) return; // Don't process violations while paused
      setLastFlag(flag);
      if (flag === 'identity_mismatch') {
        // Continuous identity consistency check: log-only policy, runs silently in background
        report(flag, 'soft');
      } else if (status !== 'warning' && status !== 'terminated') {
        setStatus('warning');
        report(flag, 'soft');
      }
    },
    [status, report, isPaused],
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
    hasFace,
    error: workerError,
    setVideo,
    captureBaseline,
    start: startDetection,
    stop: stopDetection,
  } = useDetectionWorker({
    onDetections: processDetections,
  });

  // Tab-switch guard (Hard) — disabled while paused
  useVisibilityGuard({
    enabled: !isPaused && (status === 'active' || status === 'warning'),
    debounceMs: 0,
    onHidden: useCallback(() => {
      setLastFlag('tab_switch');
      setStatus('warning');
      report('tab_switch', 'hard');
    }, [report]),
  });

  // Presence loss guard (Hard) — disabled while paused
  usePresenceLossGuard({
    hasFace,
    enabled: !isPaused && status === 'active',
    onCameraLost: useCallback(() => {
      setLastFlag('camera_lost');
      setStatus('warning');
      report('camera_lost', 'hard');
    }, [report])
  });

  // Multiple people guard (Hard) — disabled while paused
  useMultiplePersonGuard({
    detections,
    enabled: !isPaused && status === 'active',
    onMultiplePeople: useCallback(() => {
      setLastFlag('multiple_people');
      setStatus('warning');
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

  // ── Halt/resume detection during pause ─────────────────────────────
  useEffect(() => {
    if (status !== 'active' && status !== 'warning') return;
    if (isPaused) {
      stopDetection();
    } else {
      startDetection();
    }
  }, [isPaused, status, stopDetection, startDetection]);

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

  // ── Start detection once engine + camera + quiz are all ready ─────
  useEffect(() => {
    if (workerReady && cameraReady && quiz && status === 'loading') {
      setStatus('active');
      startDetection();
      captureBaseline();
    }
  }, [workerReady, cameraReady, quiz, status, startDetection, captureBaseline]);

  // ── Timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'active' && status !== 'warning') return;
    if (timeLeft === null) return;
    if (isPaused) return; // Freeze timer while paused

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
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
  }, [status, report, timeLeft, isPaused]);

  // ── Status Polling (pause & preview) ──────────────────────────────
  useEffect(() => {
    if (status !== 'active' && status !== 'warning') return;

    const pollInterval = setInterval(async () => {
      try {
        const statusData = await fetchAttemptStatus(attemptId);
        setIsPaused(statusData.pausedByTeacher);
        setIsPreviewActive(statusData.previewActive);
      } catch (err) {
        console.error('Status poll failed:', err);
      }
    }, 7000); // Poll every 7 seconds

    return () => clearInterval(pollInterval);
  }, [attemptId, status]);

  // ── Preview Frame Upload ──────────────────────────────────────────
  useEffect(() => {
    if (!isPreviewActive || !videoRef.current) return;

    const frameInterval = setInterval(() => {
      if (videoRef.current) {
        const frame = captureSnapshot(videoRef.current);
        if (frame) {
          uploadPreviewFrame(attemptId, frame).catch(() => {});
        }
      }
    }, 1500); // Post frame every 1.5 seconds

    return () => clearInterval(frameInterval);
  }, [isPreviewActive, attemptId]);

  // ── Answer selection ──────────────────────────────────────────────
  const selectAnswer = (questionId: string, optionId: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: optionId }));
  };

  // ── Submit Attempt ────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!quiz) return;

    const answerList: Answer[] = Object.entries(answers).map(([questionId, selectedOptionId]) => ({
      questionId,
      selectedOptionId,
    }));

    try {
      await submitAttempt(attemptId, answerList);
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

  if (quizError) {
    return (
      <Layout header={<div className="exam-header"><h1>Error</h1></div>}>
        <div style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--color-danger)' }}>
          <h2>{quizError}</h2>
        </div>
      </Layout>
    );
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const currentQuestion = quiz?.questions[currentQuestionIndex];
  const totalQuestions = quiz?.questions.length ?? 0;
  const answeredCount = Object.keys(answers).length;

  return (
    <Layout
      header={
        status !== 'loading' ? (
          <div className="exam-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <h1 className="exam-header__title" style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-lg)', flex: '0 0 auto', marginRight: 'var(--space-2xl)' }}>
                {quiz?.title || 'Exam Session'}
              </h1>
              <div style={{ minWidth: '400px' }}>
                <StatusRail 
                  status={status === 'warning' ? 'warning' : 'active'}
                  progress={timeLeft !== null ? (timeLeft / ((quiz?.attemptDurationMinutes ?? 60) * 60)) * 100 : 100}
                  label={timeLeft !== null ? formatTime(timeLeft) : '--:--'}
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-sm)', color: 'var(--color-ink-muted)' }}>
                {answeredCount}/{totalQuestions} answered
              </span>
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
        style={status === 'loading' ? { opacity: 0, position: 'absolute', zIndex: -1 } : undefined}
      >
        {/* ── Quiz Questions Panel ── */}
        <div className="exam-page__quiz-panel">
          {currentQuestion && (
            <div className="exam-page__question-card">
              {/* Question navigation */}
              <div className="exam-page__question-nav">
                <span className="exam-page__question-counter">
                  Question {currentQuestionIndex + 1} of {totalQuestions}
                </span>
                <span className="exam-page__question-score">
                  {currentQuestion.score} {currentQuestion.score === 1 ? 'point' : 'points'}
                </span>
              </div>

              {/* Question text */}
              <div className="exam-page__question-text">
                {currentQuestion.text}
              </div>

              {/* Options */}
              <div className="exam-page__options">
                {currentQuestion.options.map((opt, i) => {
                  const isSelected = answers[currentQuestion.id] === opt.id;
                  const optionLetter = String.fromCharCode(65 + i); // A, B, C, D...
                  return (
                    <button
                      key={opt.id}
                      className={`exam-page__option ${isSelected ? 'exam-page__option--selected' : ''}`}
                      onClick={() => selectAnswer(currentQuestion.id, opt.id)}
                      type="button"
                    >
                      <span className="exam-page__option-letter">{optionLetter}</span>
                      <span className="exam-page__option-text">{opt.text}</span>
                    </button>
                  );
                })}
              </div>

              {/* Prev / Next buttons */}
              <div className="exam-page__question-controls">
                <Button
                  variant="ghost"
                  disabled={currentQuestionIndex === 0}
                  onClick={() => setCurrentQuestionIndex(i => i - 1)}
                >
                  ← Previous
                </Button>
                <Button
                  variant="ghost"
                  disabled={currentQuestionIndex >= totalQuestions - 1}
                  onClick={() => setCurrentQuestionIndex(i => i + 1)}
                >
                  Next →
                </Button>
              </div>
            </div>
          )}

          {/* Question palette / jump */}
          <div className="exam-page__question-palette">
            {quiz?.questions.map((q, i) => {
              const isAnswered = !!answers[q.id];
              const isCurrent = i === currentQuestionIndex;
              return (
                <button
                  key={q.id}
                  type="button"
                  className={`exam-page__palette-btn ${isCurrent ? 'exam-page__palette-btn--current' : ''} ${isAnswered ? 'exam-page__palette-btn--answered' : ''}`}
                  onClick={() => setCurrentQuestionIndex(i)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Webcam & Detection Sidebar ── */}
        <div className="exam-page__sidebar">
          {/* Hide the video container from the student while preserving functionality */}
          <div className="exam-page__video-container" style={{ opacity: 0, position: 'absolute', pointerEvents: 'none', zIndex: -1 }}>
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
      </div>

      {status === 'warning' && (
        <WarningOverlay
          flag={lastFlag}
          strikes={strikes}
          onAcknowledge={handleAcknowledge}
        />
      )}

      {/* ── Pause Overlay ── */}
      {isPaused && (status === 'active' || status === 'warning') && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            textAlign: 'center',
            padding: 'var(--space-2xl)',
            maxWidth: '500px',
          }}>
            <div style={{ fontSize: '48px', marginBottom: 'var(--space-lg)' }}>⏸️</div>
            <h2 style={{ color: '#fff', fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-md)' }}>
              Exam Paused
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 'var(--font-size-md)', lineHeight: 1.6 }}>
              Your instructor has paused your exam — please wait.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-lg)' }}>
              Your timer is frozen and will resume when the instructor continues the exam.
            </p>
          </div>
        </div>
      )}

      {/* ── Preview Disclosure ── */}
      {isPreviewActive && !isPaused && (status === 'active' || status === 'warning') && (
        <div style={{
          position: 'fixed',
          bottom: 'var(--space-lg)',
          right: 'var(--space-lg)',
          padding: 'var(--space-sm) var(--space-md)',
          background: 'rgba(59, 130, 246, 0.15)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: 'var(--radius-md)',
          color: '#60a5fa',
          fontSize: 'var(--font-size-sm)',
          fontWeight: 500,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-xs)',
        }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#60a5fa', animation: 'pulse 2s infinite' }} />
          Your instructor is currently viewing your feed
        </div>
      )}
    </Layout>
  );
}
