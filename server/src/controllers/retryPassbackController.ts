import type { Request, Response } from 'express';
import { Attempt } from '../models/Attempt.js';
import { doPassback } from '../lib/gradePassback.js';

/**
 * POST /api/attempts/:attemptId/retry-passback
 *
 * Re-invokes AGS grade passback for an attempt where it previously failed.
 * Only eligible when finalScore is set and gradePassedBack is false.
 */
export const retryPassback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { attemptId } = req.params;

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found' });
      return;
    }

    if (attempt.finalScore === null || attempt.finalScore === undefined) {
      res.status(400).json({ error: 'Cannot retry passback: finalScore is not set' });
      return;
    }

    if (attempt.gradePassedBack === true) {
      res.status(400).json({ error: 'Cannot retry passback: grade has already been passed back' });
      return;
    }

    await doPassback(attempt);

    // Re-fetch to return updated state
    const updatedAttempt = await Attempt.findById(attemptId) || attempt;
    res.status(200).json(updatedAttempt);

  } catch (error) {
    console.error('retryPassback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
