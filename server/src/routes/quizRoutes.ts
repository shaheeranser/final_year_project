import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { IdToken } from 'ltijs';
import {
  createOrGetDraftQuiz,
  getQuiz,
  updateQuiz,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  publishQuiz,
  getQuizAttempts
} from '../controllers/quizController.js';

const router = Router();

// Middleware to enforce teacher role
const requireTeacher = (_req: Request, res: Response, next: NextFunction) => {
  const token = res.locals.token as IdToken | undefined;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const roles = token.platformContext?.roles ?? [];
  const isTeacher = roles.some(
    (r) => r.includes('#Instructor') || r.includes('#Teacher')
  );

  if (!isTeacher) {
    return res.status(403).json({ error: 'Forbidden: Teacher role required' });
  }

  next();
};

router.use(requireTeacher);

// POST /api/quizzes
router.post('/', createOrGetDraftQuiz);

// GET /api/quizzes/:resourceLinkId
router.get('/:resourceLinkId', getQuiz);

// PUT /api/quizzes/:resourceLinkId
router.put('/:resourceLinkId', updateQuiz);

// POST /api/quizzes/:resourceLinkId/questions
router.post('/:resourceLinkId/questions', addQuestion);

// PUT /api/quizzes/:resourceLinkId/questions/:questionId
router.put('/:resourceLinkId/questions/:questionId', updateQuestion);

// DELETE /api/quizzes/:resourceLinkId/questions/:questionId
router.delete('/:resourceLinkId/questions/:questionId', deleteQuestion);

// POST /api/quizzes/:resourceLinkId/publish
router.post('/:resourceLinkId/publish', publishQuiz);

// GET /api/quizzes/:resourceLinkId/attempts
router.get('/:resourceLinkId/attempts', getQuizAttempts);

export default router;
