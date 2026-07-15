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

// Teacher-facing routes
router.get('/quizzes/:resourceLinkId/attempts', requireTeacher, listAttempts);
router.get('/quizzes/:resourceLinkId/live-updates', requireTeacher, liveUpdates);
router.get('/attempts/:attemptId', requireTeacher, getAttemptDetail);
router.post('/attempts/:attemptId/review', requireTeacher, reviewAttempt);

export default router;
