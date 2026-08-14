import type { Request, Response } from 'express';
import { Attempt } from '../models/Attempt.js';
import { Quiz } from '../models/Quiz.js';
import { Incident } from '../models/Incident.js';
import { uploadSnapshot, getPresignedUrl } from '../lib/minio.js';
import { broadcastToQuiz } from '../lib/sse.js';
import { PREVIEW_MAX_DURATION_MS, isPreviewEffectivelyActive } from './pauseController.js';

// GET /api/quizzes/:resourceLinkId/live-status
export const getLiveStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { resourceLinkId } = req.params;
    const teacherUserId = res.locals.token?.user;

    if (!teacherUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const quiz = await Quiz.findOne({ resourceLinkId });
    if (!quiz) { res.status(404).json({ error: 'Quiz not found' }); return; }
    if (quiz.createdByUserId !== teacherUserId) { res.status(403).json({ error: 'Forbidden' }); return; }

    const attempts = await Attempt.find({ quizId: resourceLinkId }).lean();

    const inProgressCount = attempts.filter(a => a.status === 'in_progress' && !a.pausedByTeacher).length;
    const completedCount = attempts.filter(a => a.status === 'completed' || a.status === 'terminated').length;
    const pausedCount = attempts.filter(a => a.status === 'in_progress' && a.pausedByTeacher).length;
    const totalEnrolled = attempts.length; // best-effort

    // Get recent incidents (last ~20, newest first) across all attempts for this quiz
    const attemptIds = attempts.map(a => a._id.toString());
    const recentIncidents = await Incident.find({ attemptId: { $in: attemptIds } })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    // Enrich with student identity
    const attemptMap = new Map(attempts.map(a => [a._id.toString(), a]));
    const enrichedIncidents = recentIncidents.map(inc => {
      const att = attemptMap.get(inc.attemptId.toString());
      return {
        ...inc,
        studentUserId: att?.studentUserId ?? 'unknown',
        attemptId: inc.attemptId,
      };
    });

    res.status(200).json({
      totalEnrolled,
      inProgressCount,
      completedCount,
      pausedCount,
      manualOverride: quiz.manualOverride,
      recentIncidents: enrichedIncidents,
    });
  } catch (error) {
    console.error('getLiveStatus error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/attempts/:attemptId/preview/start
export const startPreview = async (req: Request, res: Response): Promise<void> => {
  try {
    const { attemptId } = req.params;
    const teacherUserId = res.locals.token?.user;

    if (!teacherUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) { res.status(404).json({ error: 'Attempt not found' }); return; }

    const quiz = await Quiz.findOne({ resourceLinkId: attempt.quizId });
    if (!quiz || quiz.createdByUserId !== teacherUserId) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }

    if (attempt.status !== 'in_progress') {
      res.status(400).json({ error: 'Attempt is not in progress' }); return;
    }

    attempt.previewActive = true;
    attempt.previewRequestedByUserId = teacherUserId;
    attempt.previewStartedAt = new Date();
    await attempt.save();

    res.status(200).json({
      previewActive: true,
      previewStartedAt: attempt.previewStartedAt,
      maxDurationMs: PREVIEW_MAX_DURATION_MS,
    });
  } catch (error) {
    console.error('startPreview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/attempts/:attemptId/preview/stop
export const stopPreview = async (req: Request, res: Response): Promise<void> => {
  try {
    const { attemptId } = req.params;
    const teacherUserId = res.locals.token?.user;

    if (!teacherUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) { res.status(404).json({ error: 'Attempt not found' }); return; }

    const quiz = await Quiz.findOne({ resourceLinkId: attempt.quizId });
    if (!quiz || quiz.createdByUserId !== teacherUserId) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }

    attempt.previewActive = false;
    await attempt.save();

    res.status(200).json({ previewActive: false });
  } catch (error) {
    console.error('stopPreview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/attempts/:attemptId/preview/frame
export const uploadPreviewFrame = async (req: Request, res: Response): Promise<void> => {
  try {
    const { attemptId } = req.params;
    const { frameImage } = req.body;
    const studentUserId = res.locals.token?.user;

    if (!studentUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) { res.status(404).json({ error: 'Attempt not found' }); return; }
    if (attempt.studentUserId !== studentUserId) { res.status(403).json({ error: 'Forbidden' }); return; }

    if (!isPreviewEffectivelyActive(attempt)) {
      res.status(400).json({ error: 'No active preview for this attempt' }); return;
    }

    if (!frameImage) {
      res.status(400).json({ error: 'Missing frameImage' }); return;
    }

    const base64Data = frameImage.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    // Fixed key — overwrites each time, no accumulation
    const key = `attempts/${attemptId}/preview-latest.jpg`;
    await uploadSnapshot(key, buffer, 'image/jpeg');

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('uploadPreviewFrame error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/attempts/:attemptId/preview/latest
export const getLatestPreview = async (req: Request, res: Response): Promise<void> => {
  try {
    const { attemptId } = req.params;
    const teacherUserId = res.locals.token?.user;

    if (!teacherUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) { res.status(404).json({ error: 'Attempt not found' }); return; }

    const quiz = await Quiz.findOne({ resourceLinkId: attempt.quizId });
    if (!quiz || quiz.createdByUserId !== teacherUserId) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }

    if (!isPreviewEffectivelyActive(attempt)) {
      res.status(200).json({ previewActive: false, url: null });
      return;
    }

    const key = `attempts/${attemptId}/preview-latest.jpg`;
    const url = await getPresignedUrl(key, 60);

    res.status(200).json({
      previewActive: true,
      url,
      previewStartedAt: attempt.previewStartedAt,
      maxDurationMs: PREVIEW_MAX_DURATION_MS,
    });
  } catch (error) {
    console.error('getLatestPreview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/quizzes/:resourceLinkId/override
export const setQuizOverride = async (req: Request, res: Response): Promise<void> => {
  try {
    const resourceLinkId = req.params.resourceLinkId as string;
    const { override } = req.body;
    const teacherUserId = res.locals.token?.user;

    if (!teacherUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    if (!['forced_open', 'forced_closed', 'none'].includes(override)) {
      res.status(400).json({ error: 'Invalid override value. Must be "forced_open", "forced_closed", or "none".' });
      return;
    }

    const quiz = await Quiz.findOne({ resourceLinkId });
    if (!quiz) { res.status(404).json({ error: 'Quiz not found' }); return; }
    if (quiz.createdByUserId !== teacherUserId) { res.status(403).json({ error: 'Forbidden' }); return; }

    quiz.manualOverride = override;
    await quiz.save();

    // If forced_closed, force-finalize every currently in_progress attempt
    if (override === 'forced_closed') {
      const inProgressAttempts = await Attempt.find({ quizId: resourceLinkId, status: 'in_progress' });

      for (const attempt of inProgressAttempts) {
        attempt.status = 'terminated';
        attempt.terminationReason = 'manually_closed';
        attempt.endedAt = new Date();
        attempt.pausedByTeacher = false; // clear any pause state

        // Compute score before terminating
        let score = 0;
        try {
          for (const answer of attempt.answers) {
            const question = quiz.questions.find((q: any) => q.id === answer.questionId);
            if (question && question.correctOptionId === answer.selectedOptionId) {
              score += question.score;
            }
          }
        } catch { /* scoring best-effort */ }
        attempt.computedScore = score;

        await attempt.save();
        broadcastToQuiz(resourceLinkId, 'attempt_updated', attempt);
      }
    }

    res.status(200).json({ manualOverride: quiz.manualOverride });
  } catch (error) {
    console.error('setQuizOverride error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
