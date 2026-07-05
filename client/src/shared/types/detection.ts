/**
 * Raw detection result from a model (coco-ssd or FaceLandmarker).
 * Produced inside the Web Worker, consumed by the main thread.
 */
export interface Detection {
  /** e.g. "cell phone", "book", "laptop", "head_pose", "eye_gaze" */
  label: string;
  /** Confidence score 0-1 (from coco-ssd) or 1.0 for pose/gaze flags */
  confidence: number;
  /** Bounding box in pixel coordinates (only for object detections) */
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * A confirmed violation after debounce logic has passed.
 * Created by the useViolationAggregator hook.
 */
export interface Violation {
  /** The flag string that caused this violation, e.g. "cell phone", "head_pose", "eye_gaze" */
  flag: string;
  /** ISO timestamp when the violation was confirmed */
  timestamp: string;
  /** Which strike number this violation corresponds to (1-based) */
  strikeNumber: number;
}

/**
 * An incident record suitable for backend persistence.
 * Aggregates one or more violations into a reportable event.
 */
export interface Incident {
  /** Unique identifier (generated client-side, e.g. crypto.randomUUID()) */
  id: string;
  /** Student/session identifier (placeholder until auth is wired up) */
  studentId: string;
  /** Exam session identifier */
  examId: string;
  /** All violations that occurred during this session */
  violations: Violation[];
  /** Whether the exam was terminated */
  terminated: boolean;
  /** Reason for termination, if applicable */
  terminationReason?: 'strikes' | 'tab_switch';
  /** ISO timestamp when the exam session started */
  startedAt: string;
  /** ISO timestamp when the exam session ended (terminated or submitted) */
  endedAt?: string;
}

// ── Worker message protocol ──────────────────────────────────────────

/** Messages the main thread sends to the detection worker */
export type WorkerInMessage =
  | { type: 'INIT'; wasmPath: string }
  | { type: 'DETECT'; imageData: ImageData; timestamp: number }
  | { type: 'STOP' };

/** Messages the detection worker sends back to the main thread */
export type WorkerOutMessage =
  | { type: 'INIT_PROGRESS'; stage: string; progress: number }
  | { type: 'READY' }
  | { type: 'DETECTIONS'; detections: Detection[]; timestamp: number }
  | { type: 'ERROR'; error: string };
