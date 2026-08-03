import mongoose, { Schema, Document } from 'mongoose';

export interface IIncident extends Document {
  attemptId: string;
  flagType: string;
  severity: 'soft' | 'hard';
  occurredAt: Date;
  snapshotKey: string | null;
  createdAt: Date;
}

const IncidentSchema = new Schema<IIncident>({
  attemptId: { type: String, required: true, index: true },
  flagType: { type: String, required: true },
  severity: { type: String, enum: ['soft', 'hard'], required: true },
  occurredAt: { type: Date, required: true },
  snapshotKey: { type: String, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

export const Incident = mongoose.model<IIncident>('Incident', IncidentSchema);
