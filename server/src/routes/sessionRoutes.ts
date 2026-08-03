import { Router } from 'express';
import { getSessionMe } from '../controllers/sessionController.js';

const router = Router();

router.get('/me', getSessionMe);

export default router;
