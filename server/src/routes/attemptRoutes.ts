import { Router } from 'express';
import {
  getEligibility,
  createAttempt,
  startAttempt,
  reportIncident,
  submitAttempt
} from '../controllers/attemptController.js';
import {
  listAttempts,
  getAttemptDetail,
  reviewAttempt,
  liveUpdates
} from '../controllers/reviewController.js';
import {
  pauseAttempt,
  resumeAttempt,
  getAttemptStatus
} from '../controllers/pauseController.js';
import {
  getLiveStatus,
  startPreview,
  stopPreview,
  uploadPreviewFrame,
  getLatestPreview,
  setQuizOverride
} from '../controllers/dashboardController.js';
import { retryPassback } from '../controllers/retryPassbackController.js';
import { approveAttempt, bulkApprove } from '../controllers/approvalController.js';
import { getQuizForStudent } from '../controllers/quizController.js';
import { requireTeacher } from '../middleware/auth.js';

const router = Router();

// Student-facing routes
router.get('/quizzes/:resourceLinkId/eligibility', getEligibility);
router.get('/quizzes/:resourceLinkId/student', getQuizForStudent);
router.post('/attempts', createAttempt);
router.post('/attempts/:attemptId/start', startAttempt);
router.post('/attempts/:attemptId/incidents', reportIncident);
router.post('/attempts/:attemptId/submit', submitAttempt);
router.get('/attempts/:attemptId/status', getAttemptStatus);
router.post('/attempts/:attemptId/preview/frame', uploadPreviewFrame);

// Teacher-facing routes
router.get('/quizzes/:resourceLinkId/attempts', requireTeacher, listAttempts);
router.get('/quizzes/:resourceLinkId/live-updates', requireTeacher, liveUpdates);
router.get('/quizzes/:resourceLinkId/live-status', requireTeacher, getLiveStatus);
router.post('/quizzes/:resourceLinkId/override', requireTeacher, setQuizOverride);
router.post('/quizzes/:resourceLinkId/bulk-approve', requireTeacher, bulkApprove);
router.get('/attempts/:attemptId', requireTeacher, getAttemptDetail);
router.post('/attempts/:attemptId/review', requireTeacher, reviewAttempt);
router.post('/attempts/:attemptId/retry-passback', retryPassback);
router.post('/attempts/:attemptId/approve', requireTeacher, approveAttempt);
router.post('/attempts/:attemptId/pause', requireTeacher, pauseAttempt);
router.post('/attempts/:attemptId/resume', requireTeacher, resumeAttempt);
router.post('/attempts/:attemptId/preview/start', requireTeacher, startPreview);
router.post('/attempts/:attemptId/preview/stop', requireTeacher, stopPreview);
router.get('/attempts/:attemptId/preview/latest', requireTeacher, getLatestPreview);

export default router;

