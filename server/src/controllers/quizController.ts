import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import type { IdToken } from 'ltijs';
import { Quiz } from '../models/Quiz.js';

// Helpers to extract contextual data
export const getContextData = (res: Response) => {
  const token = res.locals.token as IdToken;
  const resourceLinkId = token.platformContext?.resource?.id;
  const contextId = token.platformContext?.contextId ?? (token.platformContext as any)?.context?.id ?? 'unknown-context';
  const createdByUserId = token.user;

  return { resourceLinkId, contextId, createdByUserId };
};

export const createOrGetDraftQuiz = async (_req: Request, res: Response) => {
  try {
    const { resourceLinkId, contextId, createdByUserId } = getContextData(res);
    
    if (!resourceLinkId) {
      return res.status(400).json({ error: 'Missing resourceLinkId in LTI launch' });
    }

    let quiz = await Quiz.findOne({ resourceLinkId });
    
    if (!quiz) {
      quiz = new Quiz({
        resourceLinkId,
        contextId,
        createdByUserId,
        status: 'draft'
      });
      await quiz.save();
    }
    
    res.json(quiz);
  } catch (error) {
    console.error('Error in createOrGetDraftQuiz:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getQuiz = async (req: Request, res: Response) => {
  try {
    const { resourceLinkId } = req.params;
    const quiz = await Quiz.findOne({ resourceLinkId });
    
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    res.json(quiz);
  } catch (error) {
    console.error('Error in getQuiz:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateQuiz = async (req: Request, res: Response) => {
  try {
    const { resourceLinkId } = req.params;
    const quiz = await Quiz.findOne({ resourceLinkId });
    
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    if (quiz.lockedForEditing) {
      return res.status(400).json({ error: 'Quiz is locked for editing' });
    }

    const updates = req.body;
    
    // Only allow specific fields to be updated
    if (updates.title !== undefined) quiz.title = updates.title;
    if (updates.description !== undefined) quiz.description = updates.description;
    if (updates.startAt !== undefined) quiz.startAt = updates.startAt;
    if (updates.endAt !== undefined) quiz.endAt = updates.endAt;
    if (updates.attemptDurationMinutes !== undefined) quiz.attemptDurationMinutes = updates.attemptDurationMinutes;
    if (updates.studentAccess !== undefined) quiz.studentAccess = updates.studentAccess;
    if (updates.questions !== undefined) {
      quiz.questions = updates.questions;
      quiz.markModified('questions');
    }

    await quiz.save();
    res.json(quiz);
  } catch (error) {
    console.error('Error in updateQuiz:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const addQuestion = async (req: Request, res: Response) => {
  try {
    const { resourceLinkId } = req.params;
    const quiz = await Quiz.findOne({ resourceLinkId });
    
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    if (quiz.lockedForEditing) return res.status(400).json({ error: 'Quiz is locked for editing' });

    const newQuestion = {
      id: crypto.randomUUID(),
      text: req.body.text || '',
      options: req.body.options?.map((opt: any) => ({
        id: crypto.randomUUID(),
        text: opt.text || ''
      })) || [],
      correctOptionId: req.body.correctOptionId || '',
      score: req.body.score !== undefined ? req.body.score : 1
    };

    quiz.questions.push(newQuestion);
    await quiz.save();
    
    res.status(201).json(quiz);
  } catch (error) {
    console.error('Error in addQuestion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateQuestion = async (req: Request, res: Response) => {
  try {
    const { resourceLinkId, questionId } = req.params;
    const quiz = await Quiz.findOne({ resourceLinkId });
    
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    if (quiz.lockedForEditing) return res.status(400).json({ error: 'Quiz is locked for editing' });

    const questionIndex = quiz.questions.findIndex((q) => q.id === questionId);
    if (questionIndex === -1) return res.status(404).json({ error: 'Question not found' });

    const updates = req.body;
    
    if (updates.text !== undefined) quiz.questions[questionIndex].text = updates.text;
    if (updates.score !== undefined) quiz.questions[questionIndex].score = updates.score;
    if (updates.correctOptionId !== undefined) quiz.questions[questionIndex].correctOptionId = updates.correctOptionId;
    
    if (updates.options !== undefined) {
      // Create new UUIDs for any option missing an ID, otherwise keep existing
      quiz.questions[questionIndex].options = updates.options.map((opt: any) => ({
        id: opt.id || crypto.randomUUID(),
        text: opt.text || ''
      }));
    }

    // Force mongoose to recognize array updates if needed
    quiz.markModified('questions');
    await quiz.save();
    
    res.json(quiz);
  } catch (error) {
    console.error('Error in updateQuestion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteQuestion = async (req: Request, res: Response) => {
  try {
    const { resourceLinkId, questionId } = req.params;
    const quiz = await Quiz.findOne({ resourceLinkId });
    
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    if (quiz.lockedForEditing) return res.status(400).json({ error: 'Quiz is locked for editing' });

    const initialLength = quiz.questions.length;
    quiz.questions = quiz.questions.filter(q => q.id !== questionId);
    
    if (quiz.questions.length === initialLength) {
      return res.status(404).json({ error: 'Question not found' });
    }

    await quiz.save();
    res.json(quiz);
  } catch (error) {
    console.error('Error in deleteQuestion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const publishQuiz = async (req: Request, res: Response) => {
  try {
    const { resourceLinkId } = req.params;
    const quiz = await Quiz.findOne({ resourceLinkId });
    
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const errors: string[] = [];

    // Validation 1: At least one question exists
    if (!quiz.questions || quiz.questions.length === 0) {
      errors.push('Quiz must have at least one question.');
    }

    // Validation 2: startAt is before endAt
    if (quiz.startAt && quiz.endAt) {
      if (new Date(quiz.startAt) >= new Date(quiz.endAt)) {
        errors.push('Start time must be before end time.');
      }
    } else if (quiz.startAt || quiz.endAt) {
        errors.push('Both start time and end time must be provided, or neither.');
    }

    // Validation 3: Every question has a valid correctOptionId
    quiz.questions.forEach((q, i) => {
      const qNum = i + 1;
      if (!q.text.trim()) {
        errors.push(`Question ${qNum} is missing text.`);
      }
      if (!q.options || q.options.length < 2) {
        errors.push(`Question ${qNum} must have at least 2 options.`);
      }
      const optionIds = q.options.map(o => o.id);
      if (!q.correctOptionId || !optionIds.includes(q.correctOptionId)) {
        errors.push(`Question ${qNum} must have a valid correct option selected.`);
      }
      q.options.forEach((o, j) => {
        if (!o.text.trim()) {
            errors.push(`Option ${j + 1} of Question ${qNum} is missing text.`);
        }
      });
    });

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    quiz.status = 'published';
    quiz.publishedAt = new Date();
    await quiz.save();

    res.json(quiz);
  } catch (error) {
    console.error('Error in publishQuiz:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

