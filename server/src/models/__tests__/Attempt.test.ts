import { describe, it, expect } from 'vitest';
import { Attempt } from '../Attempt.js';

describe('Attempt Model', () => {
  it('should have correct default values when created', () => {
    const attempt = new Attempt({
      quizId: 'quiz-123',
      studentUserId: 'student-456'
    });

    expect(attempt.status).toBe('not_started');
    expect(attempt.strikeCount).toBe(0);
    expect(attempt.needsReview).toBe(false);
    expect(attempt.gradePassedBack).toBe(false);
    
    expect(attempt.terminationReason).toBeNull();
    expect(attempt.startedAt).toBeNull();
    expect(attempt.endedAt).toBeNull();
    expect(attempt.identitySnapshotKey).toBeNull();
    expect(attempt.reviewOutcome).toBeNull();
    expect(attempt.reviewedByUserId).toBeNull();
    expect(attempt.reviewedAt).toBeNull();
    expect(attempt.reviewNotes).toBeNull();
    expect(attempt.finalScore).toBeNull();
    expect(attempt.answers).toEqual([]);
  });
});
