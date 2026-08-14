import type { Request, Response } from 'express';
import { Attempt } from '../models/Attempt.js';
import { Quiz } from '../models/Quiz.js';
import { broadcastToQuiz } from '../lib/sse.js';

/** Preview auto-expiry duration (ms). Exported so dashboard controller can reuse. */
export const PREVIEW_MAX_DURATION_MS = 120_000; // 2 minutes

/**
 * Compute the total accumulated paused duration (in ms) from an attempt's pauseLog.
 * Includes the currently-open pause entry (using `now` as the resumedAt).
 */
export function getAccumulatedPauseDuration(attempt: InstanceType<typeof Attempt>): number {
  let total = 0;
  for (const entry of attempt.pauseLog) {
    const start = new Date(entry.pausedAt).getTime();
    const end = entry.resumedAt ? new Date(entry.resumedAt).getTime() : Date.now();
    total += end - start;
  }
  return total;
}

/**
 * Check whether the preview is effectively active (considering auto-expiry).
 */
export function isPreviewEffectivelyActive(attempt: InstanceType<typeof Attempt>): boolean {
  if (!attempt.previewActive) return false;
  if (!attempt.previewStartedAt) return false;
  const elapsed = Date.now() - new Date(attempt.previewStartedAt).getTime();
  return elapsed < PREVIEW_MAX_DURATION_MS;
}

/**
 * Verify teacher owns the quiz that this attempt belongs to.
 * Returns the quiz if ownership is confirmed, or null if not.
 */
async function verifyTeacherOwnsQuiz(attempt: InstanceType<typeof Attempt>, teacherUserId: string) {
  const quiz = await Quiz.findOne({ resourceLinkId: attempt.quizId });
  if (!quiz) return null;
  if (quiz.createdByUserId !== teacherUserId) return null;
  return quiz;
}

// POST /api/attempts/:attemptId/pause
export const pauseAttempt = async (req: Request, res: Response): Promise<void> => {
  try {
    const { attemptId } = req.params;
    const { note } = req.body || {};
    const teacherUserId = res.locals.token?.user;

    if (!teacherUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) { res.status(404).json({ error: 'Attempt not found' }); return; }

    const quiz = await verifyTeacherOwnsQuiz(attempt, teacherUserId);
    if (!quiz) { res.status(403).json({ error: 'Forbidden: you do not own this quiz' }); return; }

    if (attempt.status !== 'in_progress') {
      res.status(400).json({ error: 'Attempt is not in progress', currentStatus: attempt.status });
      return;
    }

    if (attempt.pausedByTeacher) {
      res.status(400).json({ error: 'Attempt is already paused' });
      return;
    }

    attempt.pausedByTeacher = true;
    attempt.pauseLog.push({
      pausedAt: new Date(),
      resumedAt: null,
      pausedByUserId: teacherUserId,
      note: note || null,
    });

    await attempt.save();
    broadcastToQuiz(attempt.quizId, 'attempt_updated', attempt);

    res.status(200).json(attempt);
  } catch (error) {
    console.error('pauseAttempt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/attempts/:attemptId/resume
export const resumeAttempt = async (req: Request, res: Response): Promise<void> => {
  try {
    const { attemptId } = req.params;
    const teacherUserId = res.locals.token?.user;

    if (!teacherUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) { res.status(404).json({ error: 'Attempt not found' }); return; }

    const quiz = await verifyTeacherOwnsQuiz(attempt, teacherUserId);
    if (!quiz) { res.status(403).json({ error: 'Forbidden: you do not own this quiz' }); return; }

    if (!attempt.pausedByTeacher) {
      res.status(400).json({ error: 'Attempt is not currently paused' });
      return;
    }

    attempt.pausedByTeacher = false;

    // Close the most recent open pauseLog entry
    const openEntry = [...attempt.pauseLog].reverse().find(e => e.resumedAt === null);
    if (openEntry) {
      openEntry.resumedAt = new Date();
      attempt.markModified('pauseLog');
    }

    await attempt.save();
    broadcastToQuiz(attempt.quizId, 'attempt_updated', attempt);

    res.status(200).json(attempt);
  } catch (error) {
    console.error('resumeAttempt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/attempts/:attemptId/status
export const getAttemptStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { attemptId } = req.params;
    const studentUserId = res.locals.token?.user;

    if (!studentUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) { res.status(404).json({ error: 'Attempt not found' }); return; }

    if (attempt.studentUserId !== studentUserId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    res.status(200).json({
      status: attempt.status,
      pausedByTeacher: attempt.pausedByTeacher,
      previewActive: isPreviewEffectivelyActive(attempt),
    });
  } catch (error) {
    console.error('getAttemptStatus error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
