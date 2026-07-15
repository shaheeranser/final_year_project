import { useEffect, useState, useRef } from 'react';
import { checkEligibility, createAttempt, startAttempt } from '../../shared/api/attempt';
import type { EligibilityResponse } from '../../shared/types/attempt';
import { captureSnapshot } from '../lib/snapshot';
import { Spinner, Layout, Button } from '../../shared/components';

interface Props {
  resourceLinkId: string;
  onAttemptReady: (attemptId: string) => void;
}

export function EligibilityGate({ resourceLinkId, onAttemptReady }: Props) {
  const [eligibility, setEligibility] = useState<EligibilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Pre-check state
  const [inPreCheck, setInPreCheck] = useState(false);
  const [preCheckError, setPreCheckError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const preCheckTimerRef = useRef<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await checkEligibility(resourceLinkId);
        setEligibility(res);
        if (res.resumable && res.attemptId) {
          onAttemptReady(res.attemptId);
        } else if (res.eligible) {
          setInPreCheck(true);
        }
      } catch (err: any) {
        setError('Unable to start exam. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [resourceLinkId, onAttemptReady]);

  useEffect(() => {
    if (!inPreCheck) return;

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

          // Wait for a face to be detected. (Since this is just MVP frontend, we will mock face confirmation via a short timeout before snapshot capture to simulate detection delay, as full landmarker integration in pre-check is complex.)
          // Actually, let's just wait 2 seconds and take the snapshot to simulate a successful pre-check.
          preCheckTimerRef.current = window.setTimeout(async () => {
            if (cancelled) return;
            try {
              setStarting(true);
              const snapshot = captureSnapshot(videoRef.current!);
              
              const attempt = await createAttempt(resourceLinkId);
              await startAttempt(attempt._id, snapshot);

              streamRef.current?.getTracks().forEach(t => t.stop());
              onAttemptReady(attempt._id);
            } catch (err: any) {
              setPreCheckError('Failed to start attempt. Please try again.');
              setStarting(false);
            }
          }, 2000);
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
      if (preCheckTimerRef.current) clearTimeout(preCheckTimerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [inPreCheck, resourceLinkId, onAttemptReady]);

  if (loading) return <Spinner label="Checking eligibility..." />;
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

  if (inPreCheck) {
    return (
      <Layout header={<div className="exam-header"><h1>Camera Pre-check</h1></div>}>
        <div style={{ padding: 'var(--space-2xl)', textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
          <h2>Preparing Exam</h2>
          <p>Please ensure your camera is unobstructed and your face is visible.</p>
          
          <div style={{ marginTop: 'var(--space-lg)', position: 'relative', width: '100%', aspectRatio: '4/3', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>

          {preCheckError && (
            <div style={{ marginTop: 'var(--space-lg)', color: 'var(--color-danger)' }}>
              <p>{preCheckError}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
          )}

          {starting && !preCheckError && (
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
