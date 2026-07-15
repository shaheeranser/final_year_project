import type { Request, Response } from 'express';
import { Attempt } from '../models/Attempt.js';
import { Incident } from '../models/Incident.js';
import { getPresignedUrl } from '../lib/minio.js';

// 4.1 Implement listAttempts
export const listAttempts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { resourceLinkId } = req.params;
    
    // Auth role check should be done by requireTeacher middleware.
    // If we reach here, we assume the caller is authorized.

    const attempts = await Attempt.find({ quizId: resourceLinkId }).lean();
    
    const summaries = await Promise.all(attempts.map(async (attempt: any) => {
      const incidentCount = await Incident.countDocuments({ attemptId: attempt._id });
      return {
        _id: attempt._id,
        studentUserId: attempt.studentUserId,
        status: attempt.status,
        strikeCount: attempt.strikeCount,
        needsReview: attempt.needsReview,
        reviewOutcome: attempt.reviewOutcome,
        finalScore: attempt.finalScore,
        createdAt: attempt.createdAt,
        incidentCount
      };
    }));

    res.status(200).json(summaries);
  } catch (error) {
    console.error('listAttempts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 4.2 Implement getAttemptDetail
export const getAttemptDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { attemptId } = req.params;

    const attempt = await Attempt.findById(attemptId).lean() as any;
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found' });
      return;
    }

    const incidents = await Incident.find({ attemptId }).lean();
    
    const incidentsWithUrls = await Promise.all(incidents.map(async (incident: any) => {
      if (incident.snapshotKey) {
        const url = await getPresignedUrl(incident.snapshotKey, 3600); // at least 60s
        return { ...incident, snapshotUrl: url };
      }
      return incident;
    }));

    let identitySnapshotUrl = null;
    if (attempt.identitySnapshotKey) {
      identitySnapshotUrl = await getPresignedUrl(attempt.identitySnapshotKey, 3600);
    }

    res.status(200).json({
      ...attempt,
      identitySnapshotUrl,
      incidents: incidentsWithUrls
    });

  } catch (error) {
    console.error('getAttemptDetail error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 4.3 Implement reviewAttempt
export const reviewAttempt = async (req: Request, res: Response): Promise<void> => {
  try {
    const { attemptId } = req.params;
    const { outcome, finalScore, reviewNotes } = req.body;
    const reviewedByUserId = res.locals.token?.user;

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found' });
      return;
    }

    attempt.reviewOutcome = outcome;
    attempt.reviewedByUserId = reviewedByUserId;
    attempt.reviewedAt = new Date();
    attempt.reviewNotes = reviewNotes || null;
    attempt.needsReview = false;

    if (outcome === 'dismissed') {
      attempt.finalScore = finalScore !== undefined ? finalScore : 0;
    } else if (outcome === 'upheld') {
      attempt.finalScore = finalScore !== undefined ? finalScore : 0;
    } else if (outcome === 'retest_granted') {
      attempt.finalScore = null;
    }

    await attempt.save();
    res.status(200).json(attempt);

  } catch (error) {
    console.error('reviewAttempt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 4.4 SSE feed for live updates
import { addClient, removeClient } from '../lib/sse.js';

export const liveUpdates = (req: Request, res: Response): void => {
  const resourceLinkId = req.params.resourceLinkId as string;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = addClient(resourceLinkId, res);

  // Send an initial heartbeat
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

  req.on('close', () => {
    removeClient(resourceLinkId, clientId);
  });
};
