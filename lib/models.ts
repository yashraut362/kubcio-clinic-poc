/**
 * Mongoose models for the 4 collections in the LLD.
 *
 * Every model serialises with `toJSON()` to the same shape as `lib/types.ts`:
 * `_id` becomes `id`, ObjectIds become strings, and Patient.dateOfBirth
 * becomes "YYYY-MM-DD". That lets the shared pure functions (matcher,
 * screening, operations) run unchanged on API data.
 *
 * Document types are declared explicitly rather than inferred with
 * InferSchemaType: inference over these schemas exhausts tsc's memory.
 */
import mongoose, { Schema, model, type Model, type Types } from "mongoose";
import type { ContactStatus, Consent, MatchStatus, Role, VisitStage } from "./types";

export const VISIT_STAGES: VisitStage[] = ["checked_in", "with_nurse", "with_doctor", "checkout", "done"];
export const MATCH_STATUSES: MatchStatus[] = ["possible_match", "needs_checking", "confirmed", "rejected"];
const ROLES: Role[] = ["reception", "nurse", "doctor"];
const CONTACT_STATUSES: ContactStatus[] = ["not_contacted", "not_reached", "reached"];
const CONSENTS: Consent[] = ["unknown", "undecided", "consented", "declined"];

export interface PatientDoc {
  name: string;
  phone: string;
  dateOfBirth: Date | null;
  diagnoses: string[];
  medications: string[];
  allergies: string[];
}

export interface VisitDoc {
  patientId: Types.ObjectId;
  reason: string;
  stage: VisitStage;
  vitals: {
    bloodPressure: string;
    weightKg: number | null;
    temperatureC: number | null;
    notes: string;
  } | null;
  doctorNotes: string;
  followUp: { needed: boolean; weeks: number | null; booked: boolean };
  testOrdered: boolean;
  checkedInAt: Date;
}

export interface StudyDoc {
  name: string;
  description: string;
  active: boolean;
}

export interface StudyMatchDoc {
  patientId: Types.ObjectId;
  studyId: Types.ObjectId;
  status: MatchStatus;
  evidence: string;
  reason: string;
  missingInfo: string[];
  reviewedBy: Role | null;
  contactStatus: ContactStatus;
  consent: Consent;
}

type Json = Record<string, unknown>;

/** toJSON options shared by all models: `id` instead of `_id`, ObjectIds as strings. */
function apiJson(extra?: (ret: Json) => void) {
  return {
    virtuals: true,
    versionKey: false,
    flattenObjectIds: true,
    transform(_doc: unknown, ret: Json) {
      delete ret._id;
      extra?.(ret);
      return ret;
    },
  };
}

// ---------- Patient ----------

const patientSchema = new Schema<PatientDoc>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date, default: null },
    diagnoses: { type: [String], default: [] },
    medications: { type: [String], default: [] },
    allergies: { type: [String], default: [] },
  },
  {
    toJSON: apiJson((ret) => {
      ret.dateOfBirth = ret.dateOfBirth
        ? new Date(ret.dateOfBirth as string | Date).toISOString().slice(0, 10)
        : null;
    }),
  },
);
patientSchema.index({ phone: 1 }, { unique: true });

// ---------- Visit ----------

const vitalsSchema = new Schema(
  {
    bloodPressure: { type: String, default: "" },
    weightKg: { type: Number, default: null },
    temperatureC: { type: Number, default: null },
    notes: { type: String, default: "" },
  },
  { _id: false },
);

const visitSchema = new Schema<VisitDoc>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    reason: { type: String, required: true, trim: true },
    stage: { type: String, enum: VISIT_STAGES, default: "checked_in" },
    vitals: { type: vitalsSchema, default: null },
    doctorNotes: { type: String, default: "" },
    followUp: {
      needed: { type: Boolean, default: false },
      weeks: { type: Number, default: null },
      booked: { type: Boolean, default: false },
    },
    testOrdered: { type: Boolean, default: false },
    checkedInAt: { type: Date, default: Date.now },
  },
  { toJSON: apiJson() },
);
visitSchema.index({ checkedInAt: 1, stage: 1 });

// ---------- Study ----------

const studySchema = new Schema<StudyDoc>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { toJSON: apiJson() },
);

// ---------- StudyMatch ----------

const studyMatchSchema = new Schema<StudyMatchDoc>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    studyId: { type: Schema.Types.ObjectId, ref: "Study", required: true },
    status: { type: String, enum: MATCH_STATUSES, required: true },
    evidence: { type: String, default: "" },
    reason: { type: String, default: "" },
    missingInfo: { type: [String], default: [] },
    reviewedBy: { type: String, enum: [...ROLES, null], default: null },
    contactStatus: { type: String, enum: CONTACT_STATUSES, default: "not_contacted" },
    consent: { type: String, enum: CONSENTS, default: "unknown" },
  },
  { toJSON: apiJson() },
);
studyMatchSchema.index({ studyId: 1, patientId: 1 }, { unique: true });

// Reuse compiled models across hot reloads in dev.
function getModel<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) ?? model<T>(name, schema);
}

export const PatientModel = getModel<PatientDoc>("Patient", patientSchema);
export const VisitModel = getModel<VisitDoc>("Visit", visitSchema);
export const StudyModel = getModel<StudyDoc>("Study", studySchema);
export const StudyMatchModel = getModel<StudyMatchDoc>("StudyMatch", studyMatchSchema);
