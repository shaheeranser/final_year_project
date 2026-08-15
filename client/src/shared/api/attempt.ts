import type { Attempt, EligibilityResponse, IncidentPayload, Answer, Incident, ReviewOutcome } from '../types/attempt';

const getHeaders = () => {
  const ltik = sessionStorage.getItem('ltik');
  return {
    'Content-Type': 'application/json',
    ...(ltik ? { Authorization: `Bearer ${ltik}` } : {})
  };
};

export const checkEligibility = async (resourceLinkId: string): Promise<EligibilityResponse> => {
  const res = await fetch(`/api/quizzes/${resourceLinkId}/eligibility`, {
    headers: getHeaders()
  });
  if (!res.ok) throw new Error(`Eligibility check failed: ${res.statusText}`);
  return res.json();
};

export interface StudentQuiz {
  resourceLinkId: string;
  title: string;
  description: string;
  attemptDurationMinutes: number | null;
  questions: {
    id: string;
    text: string;
    options: { id: string; text: string }[];
    score: number;
  }[];
}

export const fetchQuizForStudent = async (resourceLinkId: string): Promise<StudentQuiz> => {
  const res = await fetch(`/api/quizzes/${resourceLinkId}/student`, {
    headers: getHeaders()
  });
  if (!res.ok) throw new Error(`Fetch quiz for student failed: ${res.statusText}`);
  return res.json();
};

export const createAttempt = async (quizId: string): Promise<Attempt> => {
  const res = await fetch(`/api/attempts`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ quizId })
  });
  if (!res.ok) throw new Error(`Create attempt failed: ${res.statusText}`);
  return res.json();
};

export const startAttempt = async (attemptId: string, snapshotBase64: string | null): Promise<Attempt> => {
  const res = await fetch(`/api/attempts/${attemptId}/start`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ snapshotImage: snapshotBase64 })
  });
  if (!res.ok) throw new Error(`Start attempt failed: ${res.statusText}`);
  return res.json();
};

export const reportIncident = async (attemptId: string, payload: IncidentPayload): Promise<Attempt> => {
  const res = await fetch(`/api/attempts/${attemptId}/incidents`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Report incident failed: ${res.statusText}`);
  return res.json();
};

export const submitAttempt = async (
  attemptId: string, 
  answers: Answer[], 
  submissionType: 'manual' | 'timeout' | 'tab_closed' = 'manual'
): Promise<Attempt> => {
  const res = await fetch(`/api/attempts/${attemptId}/submit`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ answers, submissionType })
  });
  if (!res.ok) throw new Error(`Submit attempt failed: ${res.statusText}`);
  return res.json();
};

export const listAttempts = async (resourceLinkId: string): Promise<Attempt[]> => {
  const res = await fetch(`/api/quizzes/${resourceLinkId}/attempts`, {
    headers: getHeaders()
  });
  if (!res.ok) throw new Error(`List attempts failed: ${res.statusText}`);
  return res.json();
};

export const getAttemptDetail = async (attemptId: string): Promise<Attempt & { incidents: Incident[], identitySnapshotUrl: string | null }> => {
  const res = await fetch(`/api/attempts/${attemptId}`, {
    headers: getHeaders()
  });
  if (!res.ok) throw new Error(`Get attempt detail failed: ${res.statusText}`);
  return res.json();
};

export const reviewAttempt = async (
  attemptId: string, 
  outcome: ReviewOutcome, 
  reviewNotes?: string
): Promise<Attempt> => {
  const res = await fetch(`/api/attempts/${attemptId}/review`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ outcome, reviewNotes })
  });
  if (!res.ok) throw new Error(`Review attempt failed: ${res.statusText}`);
  return res.json();
};

export const retryPassback = async (attemptId: string): Promise<Attempt> => {
  const res = await fetch(`/api/attempts/${attemptId}/retry-passback`, {
    method: 'POST',
    headers: getHeaders()
  });
  if (!res.ok) throw new Error(`Retry passback failed: ${res.statusText}`);
  return res.json();
};

// ── Pause / Resume ──────────────────────────────────────────────────
export const fetchAttemptStatus = async (attemptId: string): Promise<{ status: string; pausedByTeacher: boolean; previewActive: boolean }> => {
  const res = await fetch(`/api/attempts/${attemptId}/status`, {
    headers: getHeaders()
  });
  if (!res.ok) throw new Error(`Status check failed: ${res.statusText}`);
  return res.json();
};

export const pauseAttemptApi = async (attemptId: string, note?: string): Promise<Attempt> => {
  const res = await fetch(`/api/attempts/${attemptId}/pause`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ note })
  });
  if (!res.ok) throw new Error(`Pause attempt failed: ${res.statusText}`);
  return res.json();
};

export const resumeAttemptApi = async (attemptId: string): Promise<Attempt> => {
  const res = await fetch(`/api/attempts/${attemptId}/resume`, {
    method: 'POST',
    headers: getHeaders()
  });
  if (!res.ok) throw new Error(`Resume attempt failed: ${res.statusText}`);
  return res.json();
};

// ── Preview ─────────────────────────────────────────────────────────
export const startPreviewApi = async (attemptId: string): Promise<{ previewActive: boolean; previewStartedAt: string; maxDurationMs: number }> => {
  const res = await fetch(`/api/attempts/${attemptId}/preview/start`, {
    method: 'POST',
    headers: getHeaders()
  });
  if (!res.ok) throw new Error(`Start preview failed: ${res.statusText}`);
  return res.json();
};

export const stopPreviewApi = async (attemptId: string): Promise<{ previewActive: boolean }> => {
  const res = await fetch(`/api/attempts/${attemptId}/preview/stop`, {
    method: 'POST',
    headers: getHeaders()
  });
  if (!res.ok) throw new Error(`Stop preview failed: ${res.statusText}`);
  return res.json();
};

export const uploadPreviewFrame = async (attemptId: string, frameBase64: string): Promise<void> => {
  await fetch(`/api/attempts/${attemptId}/preview/frame`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ frameImage: frameBase64 })
  });
};

export const getLatestPreviewApi = async (attemptId: string): Promise<{ previewActive: boolean; url: string | null; previewStartedAt?: string; maxDurationMs?: number }> => {
  const res = await fetch(`/api/attempts/${attemptId}/preview/latest`, {
    headers: getHeaders()
  });
  if (!res.ok) throw new Error(`Get latest preview failed: ${res.statusText}`);
  return res.json();
};

// ── Live Dashboard ──────────────────────────────────────────────────
export interface LiveStatusResponse {
  totalEnrolled: number;
  inProgressCount: number;
  completedCount: number;
  pausedCount: number;
  manualOverride: 'none' | 'forced_open' | 'forced_closed';
  recentIncidents: {
    _id: string;
    attemptId: string;
    studentUserId: string;
    flagType: string;
    severity: 'soft' | 'hard';
    occurredAt: string;
    createdAt: string;
  }[];
}

export const fetchLiveStatus = async (resourceLinkId: string): Promise<LiveStatusResponse> => {
  const res = await fetch(`/api/quizzes/${resourceLinkId}/live-status`, {
    headers: getHeaders()
  });
  if (!res.ok) throw new Error(`Live status failed: ${res.statusText}`);
  return res.json();
};

// ── Quiz Override ───────────────────────────────────────────────────
export const setQuizOverrideApi = async (resourceLinkId: string, override: 'forced_open' | 'forced_closed' | 'none'): Promise<{ manualOverride: string }> => {
  const res = await fetch(`/api/quizzes/${resourceLinkId}/override`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ override })
  });
  if (!res.ok) throw new Error(`Set override failed: ${res.statusText}`);
  return res.json();
};

// ── Approval ────────────────────────────────────────────────────────
export const approveAttemptApi = async (attemptId: string): Promise<Attempt> => {
  const res = await fetch(`/api/attempts/${attemptId}/approve`, {
    method: 'POST',
    headers: getHeaders()
  });
  if (!res.ok) throw new Error(`Approve attempt failed: ${res.statusText}`);
  return res.json();
};

export const bulkApproveApi = async (resourceLinkId: string, attemptIds: string[] | 'all'): Promise<{ approved: string[]; skipped: { id: string; reason: string }[] }> => {
  const res = await fetch(`/api/quizzes/${resourceLinkId}/bulk-approve`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ attemptIds })
  });
  if (!res.ok) throw new Error(`Bulk approve failed: ${res.statusText}`);
  return res.json();
};

