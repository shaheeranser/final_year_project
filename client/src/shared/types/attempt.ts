export type AttemptStatus = 'not_started' | 'in_progress' | 'terminated' | 'completed';
export type TerminationReason = 'strikes' | 'camera_lost' | 'tab_switch' | 'multiple_people' | 'time_expired' | 'manual' | null;
export type ReviewOutcome = 'upheld' | 'dismissed' | 'retest_granted' | null;
export type Severity = 'soft' | 'hard';

export interface Answer {
  questionId: string;
  selectedOptionId: string;
}

export interface Attempt {
  _id: string;
  quizId: string;
  studentUserId: string;
  status: AttemptStatus;
  terminationReason: TerminationReason | string;
  startedAt: string | null;
  endedAt: string | null;
  strikeCount: number;
  answers: Answer[];
  identitySnapshotKey: string | null;
  needsReview: boolean;
  reviewOutcome: ReviewOutcome;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  finalScore: number | null;
  gradePassedBack: boolean;
  createdAt: string;
  updatedAt: string;
  incidentCount?: number; // Added by review summary API
}

export interface Incident {
  _id: string;
  attemptId: string;
  flagType: string;
  severity: Severity;
  occurredAt: string;
  snapshotKey: string | null;
  snapshotUrl?: string; // Appended by review detail API
  createdAt: string;
}

export interface EligibilityResponse {
  eligible: boolean;
  reason?: 'NOT_PUBLISHED' | 'OUTSIDE_WINDOW' | 'NOT_ENROLLED' | 'ALREADY_COMPLETED';
  resumable?: boolean;
  attemptId?: string;
  canStartNew?: boolean;
}

export interface IncidentPayload {
  flagType: string;
  severity: Severity;
  occurredAt: string;
  snapshotImage?: string; // base64
}
