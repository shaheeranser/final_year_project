import type { Request, Response } from 'express';
import { Attempt } from '../models/Attempt.js';
import { Quiz } from '../models/Quiz.js';
import { finalizeAttemptScore } from '../lib/gradePassback.js';
import { broadcastToQuiz } from '../lib/sse.js';

// POST /api/attempts/:attemptId/approve
export const approveAttempt = async (req: Request, res: Response): Promise<void> => {
  try {
    const { attemptId } = req.params;
    const teacherUserId = res.locals.token?.user;

    if (!teacherUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) { res.status(404).json({ error: 'Attempt not found' }); return; }

    const quiz = await Quiz.findOne({ resourceLinkId: attempt.quizId });
    if (!quiz || quiz.createdByUserId !== teacherUserId) {
      res.status(403).json({ error: 'Forbidden: you do not own this quiz' }); return;
    }

    if (attempt.needsReview) {
      res.status(400).json({ 
        error: 'This attempt has incidents and needs individual review via the /review endpoint, not simple approval.' 
      });
      return;
    }

    if (attempt.finalScore !== null) {
      res.status(400).json({ error: 'Attempt is already finalized' });
      return;
    }

    const score = attempt.computedScore ?? 0;
    await finalizeAttemptScore(attempt._id.toString(), score);

    const updatedAttempt = await Attempt.findById(attemptId) || attempt;
    broadcastToQuiz(updatedAttempt.quizId, 'attempt_updated', updatedAttempt);

    res.status(200).json(updatedAttempt);
  } catch (error) {
    console.error('approveAttempt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/quizzes/:resourceLinkId/bulk-approve
export const bulkApprove = async (req: Request, res: Response): Promise<void> => {
  try {
    const resourceLinkId = req.params.resourceLinkId as string;
    const { attemptIds } = req.body; // string[] or "all"
    const teacherUserId = res.locals.token?.user;

    if (!teacherUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const quiz = await Quiz.findOne({ resourceLinkId });
    if (!quiz || quiz.createdByUserId !== teacherUserId) {
      res.status(403).json({ error: 'Forbidden: you do not own this quiz' }); return;
    }

    // Find eligible attempts
    let query: any = { quizId: resourceLinkId, needsReview: false, finalScore: null };
    if (attemptIds !== 'all' && Array.isArray(attemptIds)) {
      query._id = { $in: attemptIds };
    }

    const attempts = await Attempt.find(query);

    const approved: string[] = [];
    const skipped: { id: string; reason: string }[] = [];

    for (const attempt of attempts) {
      // Double-check: skip if needsReview is actually true (shouldn't happen due to query)
      if (attempt.needsReview) {
        skipped.push({ id: attempt._id.toString(), reason: 'Has incidents — needs individual review' });
        continue;
      }

      if (attempt.finalScore !== null) {
        skipped.push({ id: attempt._id.toString(), reason: 'Already finalized' });
        continue;
      }

      const score = attempt.computedScore ?? 0;
      try {
        await finalizeAttemptScore(attempt._id.toString(), score);
        approved.push(attempt._id.toString());

        const updated = await Attempt.findById(attempt._id);
        if (updated) {
          broadcastToQuiz(resourceLinkId, 'attempt_updated', updated);
        }
      } catch (err) {
        skipped.push({ id: attempt._id.toString(), reason: 'Finalization error' });
      }
    }

    res.status(200).json({ approved, skipped });
  } catch (error) {
    console.error('bulkApprove error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
