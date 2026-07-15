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

export const submitAttempt = async (attemptId: string, answers: Answer[]): Promise<Attempt> => {
  const res = await fetch(`/api/attempts/${attemptId}/submit`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ answers })
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
  finalScore?: number, 
  reviewNotes?: string
): Promise<Attempt> => {
  const res = await fetch(`/api/attempts/${attemptId}/review`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ outcome, finalScore, reviewNotes })
  });
  if (!res.ok) throw new Error(`Review attempt failed: ${res.statusText}`);
  return res.json();
};
