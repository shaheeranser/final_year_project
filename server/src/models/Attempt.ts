import mongoose, { Schema, Document } from 'mongoose';

export interface ILtiContext {
  platformUrl: string | null;
  clientId: string | null;
  deploymentId: string | null;
  lineItemUrl: string | null;
  ltiUserId: string | null;
}

export interface IPauseLogEntry {
  pausedAt: Date;
  resumedAt: Date | null;
  pausedByUserId: string;
  note: string | null;
}

export interface IAttempt extends Document {
  quizId: string;
  studentUserId: string;
  status: 'not_started' | 'in_progress' | 'terminated' | 'completed';
  terminationReason: 'strikes' | 'camera_lost' | 'tab_switch' | 'time_expired' | 'manually_closed' | 'manual' | string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  strikeCount: number;
  answers: { questionId: string; selectedOptionId: string }[];
  identitySnapshotKey: string | null;
  pausedByTeacher: boolean;
  pauseLog: IPauseLogEntry[];
  previewActive: boolean;
  previewRequestedByUserId: string | null;
  previewStartedAt: Date | null;
  computedScore: number | null;
  needsReview: boolean;
  reviewOutcome: 'upheld' | 'dismissed' | 'retest_granted' | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  finalScore: number | null;
  gradePassedBack: boolean;
  ltiContext: ILtiContext | null;
  createdAt: Date;
  updatedAt: Date;
}

const AnswerSchema = new Schema({
  questionId: { type: String, required: true },
  selectedOptionId: { type: String, required: true },
}, { _id: false });

const LtiContextSchema = new Schema({
  platformUrl: { type: String, default: null },
  clientId: { type: String, default: null },
  deploymentId: { type: String, default: null },
  lineItemUrl: { type: String, default: null },
  ltiUserId: { type: String, default: null },
}, { _id: false });

const PauseLogEntrySchema = new Schema({
  pausedAt: { type: Date, required: true },
  resumedAt: { type: Date, default: null },
  pausedByUserId: { type: String, required: true },
  note: { type: String, default: null },
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
  pausedByTeacher: { type: Boolean, default: false },
  pauseLog: { type: [PauseLogEntrySchema], default: [] },
  previewActive: { type: Boolean, default: false },
  previewRequestedByUserId: { type: String, default: null },
  previewStartedAt: { type: Date, default: null },
  computedScore: { type: Number, default: null },
  needsReview: { type: Boolean, default: false },
  reviewOutcome: { type: String, enum: ['upheld', 'dismissed', 'retest_granted', null], default: null },
  reviewedByUserId: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  reviewNotes: { type: String, default: null },
  finalScore: { type: Number, default: null },
  gradePassedBack: { type: Boolean, default: false },
  ltiContext: { type: LtiContextSchema, default: null },
}, { timestamps: true });

AttemptSchema.index({ quizId: 1, studentUserId: 1 });

export const Attempt = mongoose.model<IAttempt>('Attempt', AttemptSchema);
