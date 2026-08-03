/**
 * useDetectionWorker.ts
 *
 * Owns the detection engine lifecycle. Loads models, captures frames at
 * throttled rates, runs inference, and delivers Detection[] results via
 * callback. No JSX — pure state + side effects.
 *
 * Inference runs on the main thread at 1 fps (object) and 4 fps (face)
 * using the engine from detection.worker.ts. A concurrency guard
 * prevents frames from piling up if inference takes longer than the
 * interval.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Detection } from '../../shared/types/detection';
import {
  createDetectionEngine,
  type DetectionEngine,
} from '../worker/detection.worker';

export interface DetectionWorkerState {
  /** Whether models are loaded and ready */
  ready: boolean;
  /** Human-readable loading status */
  loadingStage: string;
  /** 0-1 progress */
  loadingProgress: number;
  /** Latest detections */
  detections: Detection[];
  /** Is a face currently detected */
  hasFace: boolean;
  /** Last error, if any */
  error: string | null;
}

interface UseDetectionWorkerOptions {
  /** Called on every batch of detections */
  onDetections?: (detections: Detection[]) => void;
}

/** Frame capture intervals (ms) */
const OBJECT_DETECT_INTERVAL = 1000; // coco-ssd: 1 fps
const FACE_DETECT_INTERVAL = 250; // FaceLandmarker: 4 fps

export function useDetectionWorker(opts: UseDetectionWorkerOptions = {}) {
  const engineRef = useRef<DetectionEngine | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onDetectionsRef = useRef(opts.onDetections);
  onDetectionsRef.current = opts.onDetections;

  const detectingRef = useRef(false); // concurrency guard

  const [state, setState] = useState<DetectionWorkerState>({
    ready: false,
    loadingStage: 'Initializing…',
    loadingProgress: 0,
    detections: [],
    hasFace: false,
    error: null,
  });

  // ── Initialise engine on mount ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const engine = createDetectionEngine();
    engineRef.current = engine;

    engine
      .init((stage, progress) => {
        if (!cancelled) {
          setState((s) => ({ ...s, loadingStage: stage, loadingProgress: progress }));
        }
      })
      .then(() => {
        if (!cancelled) {
          setState((s) => ({ ...s, ready: true, loadingStage: 'Ready' }));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      });

    return () => {
      cancelled = true;
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  // ── Run detection on a video element ──────────────────────────────
  const runDetection = useCallback(async () => {
    const engine = engineRef.current;
    const video = videoRef.current;
    if (!engine || !video || video.readyState < 2 || detectingRef.current) return;

    detectingRef.current = true;
    try {
      const { detections, hasFace } = await engine.detect(video);
      setState((s) => ({ ...s, detections, hasFace }));
      onDetectionsRef.current?.(detections);
    } catch {
      // transient frame errors are silently ignored
    } finally {
      detectingRef.current = false;
    }
  }, []);

  // ── Set up interval timers when ready ─────────────────────────────
  const startTimersRef = useRef<(() => void) | null>(null);
  const stopTimersRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let objectTimer: ReturnType<typeof setInterval> | null = null;
    let faceTimer: ReturnType<typeof setInterval> | null = null;

    startTimersRef.current = () => {
      // Object detection at 1 fps
      objectTimer = setInterval(runDetection, OBJECT_DETECT_INTERVAL);
      // Face detection at 4 fps
      faceTimer = setInterval(runDetection, FACE_DETECT_INTERVAL);
    };

    stopTimersRef.current = () => {
      if (objectTimer) clearInterval(objectTimer);
      if (faceTimer) clearInterval(faceTimer);
      objectTimer = null;
      faceTimer = null;
    };

    return () => stopTimersRef.current?.();
  }, [runDetection]);

  // ── Public API ────────────────────────────────────────────────────

  /** Bind a video element for frame capture */
  const setVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
  }, []);

  /** Start detection loop */
  const start = useCallback(() => {
    startTimersRef.current?.();
  }, []);

  /** Stop detection and tear down engine */
  const stop = useCallback(() => {
    stopTimersRef.current?.();
    engineRef.current?.stop();
  }, []);

  return {
    ...state,
    setVideo,
    start,
    stop,
  };
}
