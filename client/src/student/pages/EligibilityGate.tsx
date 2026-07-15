import { useEffect, useState, useRef, useMemo } from 'react';
import { checkEligibility, createAttempt, startAttempt } from '../../shared/api/attempt';
import type { EligibilityResponse } from '../../shared/types/attempt';
import { captureSnapshot } from '../lib/snapshot';
import { Spinner, Layout, Button } from '../../shared/components';
import { useDetectionWorker } from '../hooks/useDetectionWorker';

interface Props {
  resourceLinkId: string;
  onAttemptReady: (attemptId: string) => void;
}

export function EligibilityGate({ resourceLinkId, onAttemptReady }: Props) {
  const [eligibility, setEligibility] = useState<EligibilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'loading' | 'instructions' | 'precheck'>('loading');
  
  const [preCheckError, setPreCheckError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Engine ────────────────────────────────────────────────────────
  const {
    ready: workerReady,
    loadingStage,
    loadingProgress,
    detections,
    hasFace,
    error: workerError,
    setVideo,
    start: startDetection,
    stop: stopDetection,
  } = useDetectionWorker();

  // ── Check Eligibility ─────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const res = await checkEligibility(resourceLinkId);
        setEligibility(res);
        if (res.resumable && res.attemptId) {
          onAttemptReady(res.attemptId);
        } else if (res.eligible) {
          setStep('instructions');
        } else {
          setStep('instructions'); // Will render ineligible message
        }
      } catch (err: any) {
        setError('Unable to start exam. Please try again.');
        setStep('instructions');
      }
    }
    load();
  }, [resourceLinkId, onAttemptReady]);

  // ── Start Camera when in precheck ─────────────────────────────────
  useEffect(() => {
    if (step !== 'precheck') return;

    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setVideo(videoRef.current);
        }
      } catch (err) {
        if (!cancelled) {
          setPreCheckError('Camera permission denied. Please allow camera access and try again.');
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      stopDetection();
    };
  }, [step, setVideo, stopDetection]);

  // ── Start detection when worker and camera are ready ──────────────
  useEffect(() => {
    if (step === 'precheck' && workerReady) {
      startDetection();
    }
  }, [step, workerReady, startDetection]);

  // ── Camera Validation Logic ───────────────────────────────────────
  const { isCameraValid, validationMessage } = useMemo(() => {
    if (!workerReady) return { isCameraValid: false, validationMessage: 'Initializing AI Engine...' };

    const hasBlocked = detections.some(d => d.label === 'camera_blocked_or_dark');
    const hasGlare = detections.some(d => d.label === 'extreme_glare');
    const multiplePeople = detections.filter(d => d.label === 'face' || d.label === 'person').length > 1;

    if (hasBlocked) return { isCameraValid: false, validationMessage: 'Camera is blocked or too dark!' };
    if (hasGlare) return { isCameraValid: false, validationMessage: 'Extreme glare detected!' };
    if (multiplePeople) return { isCameraValid: false, validationMessage: 'Multiple people detected!' };
    if (!hasFace) return { isCameraValid: false, validationMessage: 'Looking for face...' };

    return { isCameraValid: true, validationMessage: 'Camera ready!' };
  }, [detections, hasFace, workerReady]);

  // ── Start Exam Handler ────────────────────────────────────────────
  const handleStartExam = async () => {
    if (!isCameraValid || !videoRef.current) return;
    try {
      setStarting(true);
      stopDetection(); // Stop AI
      const snapshot = captureSnapshot(videoRef.current);
      
      const attempt = await createAttempt(resourceLinkId);
      await startAttempt(attempt._id, snapshot);

      streamRef.current?.getTracks().forEach(t => t.stop());
      onAttemptReady(attempt._id);
    } catch (err: any) {
      setPreCheckError('Failed to start attempt. Please try again.');
      setStarting(false);
    }
  };

  // ── Render States ─────────────────────────────────────────────────
  if (step === 'loading') return <Spinner label="Checking eligibility..." />;
  
  if (error) return <div className="exam-error" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}><h3>{error}</h3></div>;

  if (eligibility && !eligibility.eligible) {
    let msg = 'You cannot take this exam.';
    if (eligibility.reason === 'NOT_PUBLISHED') msg = 'This exam is not yet available.';
    if (eligibility.reason === 'OUTSIDE_WINDOW') msg = 'This exam is not currently open.';
    if (eligibility.reason === 'NOT_ENROLLED') msg = 'You are not enrolled in this exam.';
    if (eligibility.reason === 'ALREADY_COMPLETED') msg = 'You have already completed this exam.';
    
    return (
      <Layout header={<div className="exam-header"><h1>Exam Status</h1></div>}>
        <div style={{ padding: 'var(--space-2xl)', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--color-danger)' }}>{msg}</h2>
        </div>
      </Layout>
    );
  }

  if (step === 'instructions') {
    return (
      <Layout header={<div className="exam-header"><h1>Exam Instructions</h1></div>}>
        <div style={{ padding: 'var(--space-2xl)', maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', marginBottom: 'var(--space-md)' }}>Please read carefully before starting</h2>
          <ul style={{ fontSize: 'var(--font-size-md)', lineHeight: 1.6, marginBottom: 'var(--space-xl)' }}>
            <li><strong>Do not switch tabs or windows.</strong> This will be flagged and may terminate your exam.</li>
            <li><strong>Ensure your face is always visible.</strong> The AI will continuously monitor your presence. If you leave the frame or cover the camera, the exam will be terminated immediately.</li>
            <li><strong>Stay well-lit.</strong> Ensure your room has adequate lighting without extreme glare.</li>
            <li><strong>No other people</strong> are allowed in the camera frame during the exam.</li>
          </ul>
          <div style={{ textAlign: 'center' }}>
            <Button variant="primary" size="lg" onClick={() => setStep('precheck')}>
              Proceed to Camera Test
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (step === 'precheck') {
    return (
      <Layout header={<div className="exam-header"><h1>Camera Pre-check</h1></div>}>
        <div style={{ padding: 'var(--space-2xl)', textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
          <h2>Preparing Exam</h2>
          <p>Please ensure your camera is unobstructed and your face is visible.</p>
          
          <div style={{ marginTop: 'var(--space-lg)', position: 'relative', width: '100%', aspectRatio: '4/3', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>

          {!workerReady && !workerError && (
            <div style={{ marginTop: 'var(--space-md)' }}>
              <Spinner label={`${loadingStage} ${Math.round(loadingProgress * 100)}%`} />
            </div>
          )}

          {workerError && (
            <div style={{ marginTop: 'var(--space-md)', color: 'var(--color-danger)' }}>
              <p>AI Engine failed to load: {workerError}</p>
            </div>
          )}

          {preCheckError && (
            <div style={{ marginTop: 'var(--space-lg)', color: 'var(--color-danger)' }}>
              <p>{preCheckError}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
          )}

          {!preCheckError && workerReady && !starting && (
            <div style={{ marginTop: 'var(--space-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-md)' }}>
              <div style={{ fontWeight: 600, color: isCameraValid ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {validationMessage}
              </div>
              <Button 
                variant="primary" 
                size="lg" 
                onClick={handleStartExam} 
                disabled={!isCameraValid}
              >
                Start Exam
              </Button>
            </div>
          )}

          {starting && (
            <div style={{ marginTop: 'var(--space-lg)' }}>
              <Spinner label="Starting attempt..." />
            </div>
          )}
        </div>
      </Layout>
    );
  }

  return null;
}
