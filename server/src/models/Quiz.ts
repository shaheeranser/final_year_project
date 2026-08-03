import mongoose, { Schema, Document } from 'mongoose';

export interface IOption {
  id: string;
  text: string;
}

export interface IQuestion {
  id: string;
  text: string;
  options: IOption[];
  correctOptionId: string;
  score: number;
}

export interface IQuiz extends Document {
  resourceLinkId: string;
  contextId: string;
  createdByUserId: string;
  title: string;
  description: string;
  status: 'draft' | 'published';
  startAt?: Date;
  endAt?: Date;
  attemptDurationMinutes?: number | null;
  studentAccess: {
    mode: 'enrollment' | 'allowlist';
    allowedStudentIds: string[];
  };
  questions: IQuestion[];
  lockedForEditing: boolean;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date | null;
}

const OptionSchema = new Schema<IOption>({
  id: { type: String, required: true },
  text: { type: String, default: '' },
}, { _id: false });

const QuestionSchema = new Schema<IQuestion>({
  id: { type: String, required: true },
  text: { type: String, default: '' },
  options: { type: [OptionSchema], default: [] },
  correctOptionId: { type: String, default: '' },
  score: { type: Number, default: 1 },
}, { _id: false });

const QuizSchema = new Schema<IQuiz>({
  resourceLinkId: { type: String, required: true, unique: true, index: true },
  contextId: { type: String, required: true },
  createdByUserId: { type: String, required: true },
  title: { type: String, default: 'Untitled Quiz' },
  description: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  startAt: { type: Date },
  endAt: { type: Date },
  attemptDurationMinutes: { type: Number, default: null },
  studentAccess: {
    mode: { type: String, enum: ['enrollment', 'allowlist'], default: 'enrollment' },
    allowedStudentIds: { type: [String], default: [] },
  },
  questions: { type: [QuestionSchema], default: [] },
  lockedForEditing: { type: Boolean, default: false },
  publishedAt: { type: Date, default: null },
}, { timestamps: true });

export const Quiz = mongoose.model<IQuiz>('Quiz', QuizSchema);
