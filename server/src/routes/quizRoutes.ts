import { Router } from 'express';

import {
  createOrGetDraftQuiz,
  getQuiz,
  updateQuiz,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  publishQuiz
} from '../controllers/quizController.js';
import { requireTeacher } from '../middleware/auth.js';

const router = Router();

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


export default router;
