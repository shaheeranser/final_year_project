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
import { TerminatedScreen } from './TerminatedScreen';
import { reportIncident, submitAttempt, fetchQuizForStudent, fetchAttemptStatus, uploadPreviewFrame } from '../../shared/api/attempt';
import type { StudentQuiz } from '../../shared/api/attempt';
import type { Answer } from '../../shared/types/attempt';
import { captureSnapshot, capturePreviewSnapshot } from '../lib/snapshot';

type ExamStatus = 'loading' | 'active' | 'warning' | 'terminated' | 'submitted';

interface ExamPageProps {
  attemptId: string;
  resourceLinkId: string;
}

export function ExamPage({ attemptId, resourceLinkId }: ExamPageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<ExamStatus>('loading');
  const [terminationReason, setTerminationReason] = useState<string>('time_expired');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Quiz state
  const [quiz, setQuiz] = useState<StudentQuiz | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answersRef = useRef<Record<string, string>>({});
  answersRef.current = answers;
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
        }
      } catch (err) {
        console.error('Failed to report incident', err);
      }
    },
    [attemptId],
  );

  const showToastForFlag = useCallback((flag: string) => {
    const messages: Record<string, string> = {
      'cell phone': 'Please keep phones away during the exam.',
      book: 'Please clear your workspace of unauthorized materials.',
      laptop: 'Please use only your primary screen.',
      head_pose: 'Please look towards the screen.',
      eye_gaze: 'Please keep your eyes on the screen.',
      tab_switch: 'Please do not leave the exam window.',
      camera_lost: 'Please adjust your camera to ensure you are visible.',
      multiple_people: 'Please ensure you are alone in the room.',
      identity_mismatch: 'Please ensure your face is clearly visible.',
    };
    setToastMessage(messages[flag] || 'Please follow exam rules.');
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // ── Violation callback (Soft) ──────────────────────────────────────
  const handleViolation = useCallback(
    (flag: string) => {
      if (isPaused) return; // Don't process violations while paused
      if (flag === 'identity_mismatch') {
        // Continuous identity consistency check: log-only policy, runs silently in background
        report(flag, 'soft');
      } else if (status !== 'terminated') {
        showToastForFlag(flag);
        report(flag, 'soft');
      }
    },
    [status, report, isPaused, showToastForFlag],
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
    enabled: !isPaused && status === 'active',
    debounceMs: 0,
    onHidden: useCallback(() => {
      showToastForFlag('tab_switch');
      report('tab_switch', 'hard');
    }, [report, showToastForFlag]),
  });

  // Presence loss guard (Hard) — disabled while paused
  usePresenceLossGuard({
    hasFace,
    enabled: !isPaused && status === 'active',
    onCameraLost: useCallback(() => {
      showToastForFlag('camera_lost');
      report('camera_lost', 'hard');
    }, [report, showToastForFlag])
  });

  // Multiple people guard (Hard) — disabled while paused
  useMultiplePersonGuard({
    detections,
    enabled: !isPaused && status === 'active',
    onMultiplePeople: useCallback(() => {
      showToastForFlag('multiple_people');
      report('multiple_people', 'hard');
    }, [report, showToastForFlag])
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
    if (status !== 'active') return;
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
    if (status !== 'active') return;
    if (timeLeft === null) return;
    if (isPaused) return; // Freeze timer while paused

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          handleSubmit('timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status, timeLeft, isPaused]);

  // ── Status Polling (pause & preview) ──────────────────────────────
  useEffect(() => {
    if (status !== 'active') return;

    const pollInterval = setInterval(async () => {
      try {
        const statusData = await fetchAttemptStatus(attemptId);
        setIsPaused(statusData.pausedByTeacher);
        setIsPreviewActive(statusData.previewActive);
      } catch (err) {
        console.error('Status poll failed:', err);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [attemptId, status]);

  // ── Preview Frame Upload (5 FPS live preview) ──────────────────────
  useEffect(() => {
    if (!isPreviewActive || !videoRef.current) return;

    const frameInterval = setInterval(() => {
      if (videoRef.current) {
        const frame = capturePreviewSnapshot(videoRef.current);
        if (frame) {
          uploadPreviewFrame(attemptId, frame).catch(() => {});
        }
      }
    }, 200); // 5 FPS (every 200ms)

    return () => clearInterval(frameInterval);
  }, [isPreviewActive, attemptId]);

  // ── Answer selection ──────────────────────────────────────────────
  const selectAnswer = (questionId: string, optionId: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: optionId }));
  };

  // ── Submit Attempt ────────────────────────────────────────────────
  const handleSubmit = useCallback(async (submissionType: 'manual' | 'timeout' | 'tab_closed' = 'manual') => {
    if (!quiz) return;

    const answerList: Answer[] = Object.entries(answersRef.current).map(([questionId, selectedOptionId]) => ({
      questionId,
      selectedOptionId,
    }));

    try {
      await submitAttempt(attemptId, answerList, submissionType);
      setStatus('submitted');
    } catch (err) {
      console.error('Failed to submit attempt', err);
      if (submissionType === 'manual') alert('Failed to submit exam');
    }
  }, [attemptId, quiz]);

  // ── Tab Close / Window Leave Auto-Submit ────────────────────────────
  useEffect(() => {
    if (status !== 'active') return;

    const handleTabClose = () => {
      const answerList: Answer[] = Object.entries(answersRef.current).map(([questionId, selectedOptionId]) => ({
        questionId,
        selectedOptionId,
      }));
      const ltik = sessionStorage.getItem('ltik');
      const payload = JSON.stringify({ answers: answerList, submissionType: 'tab_closed' });

      try {
        fetch(`/api/attempts/${attemptId}/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(ltik ? { Authorization: `Bearer ${ltik}` } : {})
          },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      } catch {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(`/api/attempts/${attemptId}/submit`, blob);
      }
    };

    window.addEventListener('beforeunload', handleTabClose);
    window.addEventListener('pagehide', handleTabClose);

    return () => {
      window.removeEventListener('beforeunload', handleTabClose);
      window.removeEventListener('pagehide', handleTabClose);
    };
  }, [attemptId, status]);

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
                  status="active"
                  progress={timeLeft !== null ? (timeLeft / ((quiz?.attemptDurationMinutes ?? 60) * 60)) * 100 : 100}
                  label={timeLeft !== null ? formatTime(timeLeft) : '--:--'}
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-sm)', color: 'var(--color-ink-muted)' }}>
                {answeredCount}/{totalQuestions} answered
              </span>
              <Button onClick={() => handleSubmit('manual')} variant="primary">Submit Exam</Button>
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
                {currentQuestionIndex === totalQuestions - 1 ? (
                  <Button
                    variant="primary"
                    onClick={() => handleSubmit('manual')}
                  >
                    Submit Exam
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => setCurrentQuestionIndex(i => i + 1)}
                  >
                    Next →
                  </Button>
                )}
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

        {/* ── Webcam & Detection (Hidden UI, active functionality) ── */}
        <div className="exam-page__sidebar" style={{ opacity: 0, position: 'absolute', pointerEvents: 'none', zIndex: -1, width: 0, height: 0, overflow: 'hidden' }}>
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
        </div>
      </div>

      {/* ── Toast Overlay ── */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: 'var(--space-2xl)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#fff',
          padding: '16px 32px',
          borderRadius: '100px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05) inset',
          fontWeight: 500,
          fontSize: '15px',
          zIndex: 9999,
          animation: 'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          {toastMessage}
        </div>
      )}

      {/* ── Pause Overlay ── */}
      {isPaused && status === 'active' && (
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
      {isPreviewActive && !isPaused && status === 'active' && (
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
