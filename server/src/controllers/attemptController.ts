import type { Request, Response } from 'express';
import { Quiz } from '../models/Quiz.js';
import { Attempt } from '../models/Attempt.js';
import { Incident } from '../models/Incident.js';
import { uploadSnapshot } from '../lib/minio.js';
import { SOFT_VIOLATION_STRIKE_LIMIT } from '../lib/proctoring.js';
import { broadcastToQuiz } from '../lib/sse.js';
import { finalizeAttemptScore } from '../lib/gradePassback.js';

// 3.1 Implement getEligibility
export const getEligibility = async (req: Request, res: Response): Promise<void> => {
  try {
    const { resourceLinkId } = req.params;
    const studentUserId = res.locals.token?.user;

    if (!studentUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const quiz = await Quiz.findOne({ resourceLinkId });
    if (!quiz) {
      res.status(404).json({ error: 'Quiz not found' });
      return;
    }

    if (quiz.status !== 'published') {
      res.status(200).json({ eligible: false, reason: 'NOT_PUBLISHED' });
      return;
    }

    const now = new Date();
    if ((quiz.startAt && now < quiz.startAt) || (quiz.endAt && now > quiz.endAt)) {
      res.status(200).json({ eligible: false, reason: 'OUTSIDE_WINDOW' });
      return;
    }

    if (quiz.studentAccess.mode === 'allowlist' && !quiz.studentAccess.allowedStudentIds.includes(studentUserId)) {
      res.status(200).json({ eligible: false, reason: 'NOT_ENROLLED' });
      return;
    }

    const attempts = await Attempt.find({ quizId: resourceLinkId, studentUserId });
    const inProgressAttempt = attempts.find((a: any) => a.status === 'in_progress');
    if (inProgressAttempt) {
      res.status(200).json({ eligible: true, resumable: true, attemptId: inProgressAttempt._id });
      return;
    }

    const completedOrTerminatedAttempts = attempts.filter((a: any) => a.status === 'completed' || a.status === 'terminated');
    
    if (completedOrTerminatedAttempts.length > 0) {
       const mostRecent = completedOrTerminatedAttempts.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())[0];
       
       if (mostRecent.reviewOutcome !== 'retest_granted') {
         res.status(200).json({ eligible: false, reason: 'ALREADY_COMPLETED' });
         return;
       } else {
         res.status(200).json({ eligible: true, canStartNew: true });
         return;
       }
    }

    res.status(200).json({ eligible: true, resumable: false });
  } catch (error) {
    console.error('getEligibility error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 3.3 Implement createAttempt
export const createAttempt = async (req: Request, res: Response): Promise<void> => {
  try {
    const { quizId } = req.body;
    const studentUserId = res.locals.token?.user;

    if (!studentUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const quiz = await Quiz.findOne({ resourceLinkId: quizId });
    if (!quiz) {
      res.status(404).json({ error: 'Quiz not found' });
      return;
    }

    if (quiz.status !== 'published') { res.status(403).json({ error: 'NOT_PUBLISHED' }); return; }
    const now = new Date();
    if ((quiz.startAt && now < quiz.startAt) || (quiz.endAt && now > quiz.endAt)) { res.status(403).json({ error: 'OUTSIDE_WINDOW' }); return; }
    if (quiz.studentAccess.mode === 'allowlist' && !quiz.studentAccess.allowedStudentIds.includes(studentUserId)) { res.status(403).json({ error: 'NOT_ENROLLED' }); return; }

    const attempts = await Attempt.find({ quizId, studentUserId });
    const inProgressAttempt = attempts.find((a: any) => a.status === 'in_progress');
    if (inProgressAttempt) {
      res.status(200).json(inProgressAttempt);
      return;
    }

    const notStartedAttempt = attempts.find((a: any) => a.status === 'not_started');
    if (notStartedAttempt) {
      res.status(200).json(notStartedAttempt);
      return;
    }

    const completedOrTerminatedAttempts = attempts.filter((a: any) => a.status === 'completed' || a.status === 'terminated');
    if (completedOrTerminatedAttempts.length > 0) {
       const mostRecent = completedOrTerminatedAttempts.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())[0];
       if (mostRecent.reviewOutcome !== 'retest_granted') {
         res.status(403).json({ error: 'ALREADY_COMPLETED' });
         return;
       }
    }

    // Extract ltiContext from the LTI IdToken if present
    const token = res.locals.token as any;
    let ltiContext = null;
    if (token) {
      ltiContext = {
        platformUrl: token.iss ?? null,
        clientId: token.clientId ?? null,          // set by ltijs after platform lookup
        deploymentId: token.deploymentId ?? null,
        lineItemUrl: token.platformContext?.endpoint?.lineitem ?? null,
        ltiUserId: token.user ?? null,
      };
    }

    const newAttempt = new Attempt({
      quizId,
      studentUserId,
      ltiContext,
    });
    await newAttempt.save();

    // Lock the quiz for editing once the first student attempt is created
    if (!quiz.lockedForEditing) {
      quiz.lockedForEditing = true;
      await quiz.save();
    }

    broadcastToQuiz(quizId, 'attempt_created', newAttempt);

    res.status(201).json(newAttempt);

  } catch (error) {
    console.error('createAttempt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 3.4 Implement startAttempt
export const startAttempt = async (req: Request, res: Response): Promise<void> => {
  try {
    const { attemptId } = req.params;
    const { snapshotImage } = req.body;
    const studentUserId = res.locals.token?.user;

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found' });
      return;
    }
    if (attempt.studentUserId !== studentUserId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (attempt.status !== 'not_started') {
      res.status(409).json({ error: 'Attempt cannot be started', currentStatus: attempt.status });
      return;
    }

    let identitySnapshotKey = null;
    if (snapshotImage) {
      const base64Data = snapshotImage.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      const key = `attempts/${attemptId}/identity.jpg`;
      identitySnapshotKey = await uploadSnapshot(key, buffer, 'image/jpeg');
    }

    attempt.status = 'in_progress';
    attempt.startedAt = new Date();
    attempt.identitySnapshotKey = identitySnapshotKey;
    await attempt.save();

    broadcastToQuiz(attempt.quizId, 'attempt_updated', attempt);

    res.status(200).json(attempt);

  } catch (error) {
    console.error('startAttempt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 3.5 Implement reportIncident
export const reportIncident = async (req: Request, res: Response): Promise<void> => {
  try {
    const { attemptId } = req.params;
    const { flagType, severity, occurredAt, snapshotImage } = req.body;
    const studentUserId = res.locals.token?.user;

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) { res.status(404).json({ error: 'Attempt not found' }); return; }
    if (attempt.studentUserId !== studentUserId) { res.status(403).json({ error: 'Forbidden' }); return; }
    if (attempt.status === 'completed' || attempt.status === 'terminated') {
      res.status(409).json({ error: 'Attempt is already finished', currentStatus: attempt.status }); return;
    }
    if (attempt.status !== 'in_progress') {
      res.status(409).json({ error: 'Attempt is not in progress', currentStatus: attempt.status }); return;
    }

    const incident = new Incident({
      attemptId,
      flagType,
      severity,
      occurredAt: new Date(occurredAt)
    });

    if (snapshotImage) {
      const base64Data = snapshotImage.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      const key = `attempts/${attemptId}/incidents/${incident._id}.jpg`;
      incident.snapshotKey = await uploadSnapshot(key, buffer, 'image/jpeg');
    }

    await incident.save();

    attempt.needsReview = true;

    if (severity === 'soft') {
      attempt.strikeCount += 1;
      if (attempt.strikeCount >= SOFT_VIOLATION_STRIKE_LIMIT) {
        attempt.status = 'terminated';
        attempt.terminationReason = 'strikes';
        attempt.endedAt = new Date();
      }
    } else if (severity === 'hard') {
      attempt.status = 'terminated';
      attempt.terminationReason = flagType;
      attempt.endedAt = new Date();
    }

    await attempt.save();

    broadcastToQuiz(attempt.quizId, 'incident_reported', { attempt, incident });

    res.status(200).json(attempt);
  } catch (error) {
    console.error('reportIncident error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 3.8 Implement submitAttempt
export const submitAttempt = async (req: Request, res: Response): Promise<void> => {
  try {
    const { attemptId } = req.params;
    const { answers } = req.body;
    const studentUserId = res.locals.token?.user;

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) { res.status(404).json({ error: 'Attempt not found' }); return; }
    if (attempt.studentUserId !== studentUserId) { res.status(403).json({ error: 'Forbidden' }); return; }
    if (attempt.status !== 'in_progress') {
      res.status(409).json({ error: 'Attempt is not in progress', currentStatus: attempt.status }); return;
    }

    attempt.status = 'completed';
    attempt.endedAt = new Date();
    attempt.answers = answers || [];

    await attempt.save();

    if (!attempt.needsReview) {
      // Compute score and attempt AGS passback via the shared finalize function
      try {
        const quiz = await Quiz.findOne({ resourceLinkId: attempt.quizId });
        if (quiz) {
          let score = 0;
          for (const answer of attempt.answers) {
            const question = quiz.questions.find((q: any) => q.id === answer.questionId);
            if (question && question.correctOptionId === answer.selectedOptionId) {
              score += question.score;
            }
          }
          await finalizeAttemptScore(attempt._id.toString(), score);
        }
      } catch (err) {
        console.error('Score computation failed:', err);
      }
    }

    // Re-fetch the attempt to pick up any changes from finalizeAttemptScore
    const updatedAttempt = await Attempt.findById(attemptId) || attempt;
    
    broadcastToQuiz(updatedAttempt.quizId, 'attempt_updated', updatedAttempt);
    
    res.status(200).json(updatedAttempt);
  } catch (error) {
    console.error('submitAttempt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
