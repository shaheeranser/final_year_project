/**
 * detection.worker.ts
 *
 * Pure detection-engine module — all ML model loading and inference
 * logic lives here, completely decoupled from React/JSX.
 *
 * Architecture note: this was originally designed to run inside a Web
 * Worker, but TF.js (WebGL backend) and MediaPipe's WASM runtime both
 * require DOM access (canvas, WebGL context) that isn't available in
 * workers. The module is imported on the main thread by useDetectionWorker
 * and runs at throttled rates (1 fps object detection, 4 fps face
 * landmarks) so UI impact is negligible.
 *
 * Keeping this as a standalone module means:
 *   - Detection logic is testable without mounting any React component
 *   - All thresholds, model params, and analysis are in one place
 *   - A future migration to Web Worker + OffscreenCanvas + WASM backend
 *     only requires changing the call-site in useDetectionWorker
 */

import type { Detection } from '../../shared/types/detection';

// ── Constants ────────────────────────────────────────────────────────

/** Object classes we flag */
const FLAGGED_OBJECTS = new Set(['cell phone', 'book', 'laptop']);

/** Pose thresholds (degrees) */
const YAW_THRESHOLD = 25;
const PITCH_THRESHOLD = 20;

/** Iris deviation threshold (normalised to eye width, 0-1 range) */
const IRIS_DEVIATION_THRESHOLD = 0.28;

// ── Pure helpers (exported for unit testing) ─────────────────────────

/**
 * Extract yaw and pitch from a 4×4 column-major transformation matrix
 * returned by FaceLandmarker.
 *
 * Column-major rotation sub-matrix indices:
 *   R00=m[0]  R01=m[4]  R02=m[8]
 *   R10=m[1]  R11=m[5]  R12=m[9]
 *   R20=m[2]  R21=m[6]  R22=m[10]
 */
export function yawPitchFromMatrix(data: number[]): {
  yaw: number;
  pitch: number;
} {
  const pitch = Math.asin(-data[2]) * (180 / Math.PI);
  const yaw = Math.atan2(data[1], data[0]) * (180 / Math.PI);
  return { yaw, pitch };
}

/**
 * Compute normalised iris deviation from eye-corner center.
 * Returns 0 (centered) to ~1 (at the corner).
 *
 * MediaPipe 478-landmark layout:
 *   Left  eye corners: 33 (lateral), 133 (medial) — iris center: 468
 *   Right eye corners: 362 (lateral), 263 (medial) — iris center: 473
 */
export function computeIrisDeviation(
  landmarks: { x: number; y: number; z: number }[],
): number {
  if (landmarks.length < 478) return 0;

  const measure = (
    outer: { x: number; y: number },
    inner: { x: number; y: number },
    iris: { x: number; y: number },
  ) => {
    const cx = (outer.x + inner.x) / 2;
    const cy = (outer.y + inner.y) / 2;
    const w = Math.abs(outer.x - inner.x);
    if (w === 0) return 0;
    const dx = Math.abs(iris.x - cx) / w;
    const dy = Math.abs(iris.y - cy) / w;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const left = measure(landmarks[33], landmarks[133], landmarks[468]);
  const right = measure(landmarks[362], landmarks[263], landmarks[473]);
  return (left + right) / 2;
}

// ── Detection Engine ─────────────────────────────────────────────────

export interface DetectionEngine {
  /** Load all ML models. Calls onProgress during loading. */
  init(onProgress: (stage: string, progress: number) => void): Promise<void>;
  /** Run all detection models on a single video frame. */
  detect(video: HTMLVideoElement): Promise<Detection[]>;
  /** Tear down models and release resources. */
  stop(): void;
}

export function createDetectionEngine(): DetectionEngine {
  let cocoModel: import('@tensorflow-models/coco-ssd').ObjectDetection | null = null;
  let faceLandmarker: import('@mediapipe/tasks-vision').FaceLandmarker | null = null;
  let stopped = false;

  return {
    async init(onProgress) {
      try {
        // 1. TensorFlow.js + coco-ssd
        onProgress('Loading TensorFlow.js…', 0.1);
        const tf = await import('@tensorflow/tfjs');
        await tf.ready();

        onProgress('Loading object detection model…', 0.3);
        const cocoSsd = await import('@tensorflow-models/coco-ssd');
        cocoModel = await cocoSsd.load();

        // 2. MediaPipe FaceLandmarker
        onProgress('Loading face landmark model…', 0.6);
        const { FaceLandmarker, FilesetResolver } = await import(
          '@mediapipe/tasks-vision'
        );

        const filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
        );

        faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFacialTransformationMatrixes: true,
        });

        onProgress('Ready', 1.0);
      } catch (err) {
        throw new Error(
          `Model init failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },

    async detect(video: HTMLVideoElement): Promise<Detection[]> {
      if (stopped) return [];
      const detections: Detection[] = [];

      // ── coco-ssd (object detection) ────────────────────────────
      if (cocoModel) {
        try {
          const predictions = await cocoModel.detect(video);
          for (const pred of predictions) {
            if (FLAGGED_OBJECTS.has(pred.class)) {
              detections.push({
                label: pred.class,
                confidence: pred.score,
                bbox: {
                  x: pred.bbox[0],
                  y: pred.bbox[1],
                  width: pred.bbox[2],
                  height: pred.bbox[3],
                },
              });
            }
          }
        } catch {
          // Silently skip frame on transient errors
        }
      }

      // ── FaceLandmarker (pose + iris) ───────────────────────────
      if (faceLandmarker) {
        try {
          const result = faceLandmarker.detectForVideo(video, performance.now());

          if (result.faceLandmarks && result.faceLandmarks.length > 0) {
            const landmarks = result.faceLandmarks[0];

            // Head pose from transformation matrix
            if (
              result.facialTransformationMatrixes &&
              result.facialTransformationMatrixes.length > 0
            ) {
              const matrix = result.facialTransformationMatrixes[0];
              const { yaw, pitch } = yawPitchFromMatrix(matrix.data);

              if (
                Math.abs(yaw) > YAW_THRESHOLD ||
                Math.abs(pitch) > PITCH_THRESHOLD
              ) {
                detections.push({ label: 'head_pose', confidence: 1.0 });
              }
            }

            // Iris / eye-gaze deviation
            const irisDev = computeIrisDeviation(landmarks);
            if (irisDev > IRIS_DEVIATION_THRESHOLD) {
              detections.push({ label: 'eye_gaze', confidence: 1.0 });
            }
          }
        } catch {
          // Silently skip frame on transient errors
        }
      }

      return detections;
    },

    stop() {
      stopped = true;
      cocoModel = null;
      if (faceLandmarker) {
        faceLandmarker.close();
        faceLandmarker = null;
      }
    },
  };
}
