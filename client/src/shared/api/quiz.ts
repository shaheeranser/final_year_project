// API client for quiz management

export interface Option {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  text: string;
  options: Option[];
  correctOptionId: string;
  score: number;
}

export interface Quiz {
  _id: string;
  resourceLinkId: string;
  contextId: string;
  createdByUserId: string;
  title: string;
  description: string;
  status: 'draft' | 'published';
  startAt?: string; // ISO date string
  endAt?: string; // ISO date string
  attemptDurationMinutes?: number | null;
  studentAccess: {
    mode: 'enrollment' | 'allowlist';
    allowedStudentIds: string[];
  };
  questions: Question[];
  lockedForEditing: boolean;
  publishedAt?: string | null;
}

const getHeaders = () => {
  const ltik = sessionStorage.getItem('ltik');
  return {
    'Content-Type': 'application/json',
    ...(ltik ? { Authorization: `Bearer ${ltik}` } : {})
  };
};

export const createOrGetDraftQuiz = async (): Promise<Quiz> => {
  const res = await fetch('/api/quizzes', {
    method: 'POST',
    headers: getHeaders()
  });
  if (!res.ok) throw new Error('Failed to create/get draft quiz');
  return res.json();
};

export const fetchQuiz = async (resourceLinkId: string): Promise<Quiz> => {
  const res = await fetch(`/api/quizzes/${resourceLinkId}`, {
    headers: getHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch quiz');
  return res.json();
};

export const updateQuiz = async (resourceLinkId: string, updates: Partial<Quiz>): Promise<Quiz> => {
  const res = await fetch(`/api/quizzes/${resourceLinkId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates)
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.error || 'Failed to update quiz');
  }
  return res.json();
};

export const addQuestion = async (resourceLinkId: string, question: Partial<Question>): Promise<Quiz> => {
  const res = await fetch(`/api/quizzes/${resourceLinkId}/questions`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(question)
  });
  if (!res.ok) throw new Error('Failed to add question');
  return res.json();
};

export const updateQuestion = async (
  resourceLinkId: string,
  questionId: string,
  updates: Partial<Question>
): Promise<Quiz> => {
  const res = await fetch(`/api/quizzes/${resourceLinkId}/questions/${questionId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates)
  });
  if (!res.ok) throw new Error('Failed to update question');
  return res.json();
};

export const deleteQuestion = async (resourceLinkId: string, questionId: string): Promise<Quiz> => {
  const res = await fetch(`/api/quizzes/${resourceLinkId}/questions/${questionId}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  if (!res.ok) throw new Error('Failed to delete question');
  return res.json();
};

export const publishQuiz = async (resourceLinkId: string): Promise<Quiz> => {
  const res = await fetch(`/api/quizzes/${resourceLinkId}/publish`, {
    method: 'POST',
    headers: getHeaders()
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw { message: 'Failed to publish quiz', details: err?.details };
  }
  return res.json();
};

export const getQuizAttempts = async (resourceLinkId: string): Promise<any[]> => {
  const res = await fetch(`/api/quizzes/${resourceLinkId}/attempts`, {
    headers: getHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch attempts');
  return res.json();
};
