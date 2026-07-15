import mongoose, { Schema, Document } from 'mongoose';

export interface IAttempt extends Document {
  quizId: string;
  studentUserId: string;
  status: 'not_started' | 'in_progress' | 'terminated' | 'completed';
  terminationReason: 'strikes' | 'camera_lost' | 'tab_switch' | 'time_expired' | 'manual' | string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  strikeCount: number;
  answers: { questionId: string; selectedOptionId: string }[];
  identitySnapshotKey: string | null;
  needsReview: boolean;
  reviewOutcome: 'upheld' | 'dismissed' | 'retest_granted' | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  finalScore: number | null;
  gradePassedBack: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AnswerSchema = new Schema({
  questionId: { type: String, required: true },
  selectedOptionId: { type: String, required: true },
}, { _id: false });

const AttemptSchema = new Schema<IAttempt>({
  quizId: { type: String, required: true, index: true },
  studentUserId: { type: String, required: true },
  status: { type: String, enum: ['not_started', 'in_progress', 'terminated', 'completed'], default: 'not_started' },
  terminationReason: { type: String, default: null },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  strikeCount: { type: Number, default: 0 },
  answers: { type: [AnswerSchema], default: [] },
  identitySnapshotKey: { type: String, default: null },
  needsReview: { type: Boolean, default: false },
  reviewOutcome: { type: String, enum: ['upheld', 'dismissed', 'retest_granted', null], default: null },
  reviewedByUserId: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  reviewNotes: { type: String, default: null },
  finalScore: { type: Number, default: null },
  gradePassedBack: { type: Boolean, default: false },
}, { timestamps: true });

AttemptSchema.index({ quizId: 1, studentUserId: 1 });

export const Attempt = mongoose.model<IAttempt>('Attempt', AttemptSchema);
