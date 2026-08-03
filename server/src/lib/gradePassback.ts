import { Attempt } from '../models/Attempt.js';
import { Quiz } from '../models/Quiz.js';
import ltiPkg from 'ltijs';

const { Provider: lti } = ltiPkg;

/**
 * Helper to rewrite public platform URLs (e.g., http://localhost:8000)
 * to internal container URLs (e.g., http://webserver) when running inside Docker.
 */
function getInternalLineItemUrl(lineItemUrl: string): string {
  if (!lineItemUrl) return lineItemUrl;
  try {
    const platformUrl = process.env.PLATFORM_URL;
    const tokenEndpoint = process.env.PLATFORM_TOKEN_ENDPOINT;
    if (platformUrl && tokenEndpoint) {
      const publicOrigin = new URL(platformUrl).origin;
      const internalOrigin = new URL(tokenEndpoint).origin;
      if (publicOrigin !== internalOrigin && lineItemUrl.startsWith(publicOrigin)) {
        return lineItemUrl.replace(publicOrigin, internalOrigin);
      }
    }
  } catch (err) {
    console.error('[gradePassback] URL rewrite error:', err);
  }
  return lineItemUrl;
}

/**
 * Perform the AGS passback portion only (does not set finalScore).
 * Used by both finalizeAttemptScore and retryPassback.
 *
 * Reconstructs a minimal IdToken from attempt.ltiContext and calls
 * lti.Grade.submitScore. On success sets gradePassedBack = true.
 * On failure logs the error without re-throwing.
 */
export async function doPassback(attempt: InstanceType<typeof Attempt>): Promise<void> {
  if (!attempt.ltiContext) {
    console.warn(`[gradePassback] ltiContext is null for attempt ${attempt._id} — skipping AGS call`);
    return;
  }

  if (!attempt.ltiContext.lineItemUrl) {
    console.warn(`[gradePassback] lineItemUrl is missing for attempt ${attempt._id} — skipping AGS call`);
    return;
  }

  if (!attempt.ltiContext.clientId) {
    console.warn(`[gradePassback] clientId is missing for attempt ${attempt._id} — skipping AGS call`);
    return;
  }

  if (attempt.finalScore === null || attempt.finalScore === undefined) {
    console.warn(`[gradePassback] finalScore is null for attempt ${attempt._id} — skipping AGS call`);
    return;
  }

  // Load quiz to compute scoreMaximum
  const quiz = await Quiz.findOne({ resourceLinkId: attempt.quizId });
  if (!quiz) {
    console.error(`[gradePassback] Quiz not found for attempt ${attempt._id} (quizId: ${attempt.quizId})`);
    return;
  }

  const scoreMaximum = quiz.questions.reduce((sum, q) => sum + q.score, 0);

  const lineItemUrl = getInternalLineItemUrl(attempt.ltiContext.lineItemUrl!);

  // Reconstruct minimal IdToken from stored ltiContext.
  // Grade.submitScore internally calls getPlatform(iss, clientId) —
  // BOTH fields are required or the lookup returns null and throws.
  const token = {
    iss: attempt.ltiContext.platformUrl!,
    clientId: attempt.ltiContext.clientId!,
    user: attempt.ltiContext.ltiUserId!,
    platformContext: {
      roles: [] as string[],
      endpoint: {
        lineitem: lineItemUrl,
      },
    },
  };

  const gradeObj = {
    userId: attempt.ltiContext.ltiUserId!,
    scoreGiven: attempt.finalScore,
    scoreMaximum,
    activityProgress: 'Completed',
    gradingProgress: 'FullyGraded',
  };

  try {
    await lti.Grade.submitScore(token, lineItemUrl, gradeObj);
    attempt.gradePassedBack = true;
    await attempt.save();
  } catch (err) {
    console.error(`[gradePassback] AGS submitScore failed for attempt ${attempt._id}:`, err);
    // Do NOT re-throw — passback failure is non-fatal
  }
}

/**
 * Single source of truth for score finalization + AGS passback.
 * Used by both submitAttempt (auto-finalize) and reviewAttempt (teacher decision).
 *
 * 1. Sets attempt.finalScore = score and saves.
 * 2. Attempts AGS passback via doPassback (non-fatal on failure).
 */
export async function finalizeAttemptScore(attemptId: string, score: number): Promise<void> {
  const attempt = await Attempt.findById(attemptId);
  if (!attempt) {
    console.error(`[gradePassback] Attempt not found: ${attemptId}`);
    return;
  }

  // Persist the score locally first
  attempt.finalScore = score;
  await attempt.save();

  // Attempt AGS passback (non-fatal)
  await doPassback(attempt);
}
