/**
 * Frontend data model. Mirrors the 4 MongoDB collections in the LLD:
 * Patient, Visit, Study, StudyMatch. Embedded objects stay embedded.
 * (Dates are ISO strings on the client; they become Date in Mongo.)
 */

export type Role = "reception" | "nurse" | "doctor";

export interface Patient {
  id: string;
  name: string;
  /** Unique: one patient per phone number (unique index in Mongo). */
  phone: string;
  /** ISO "YYYY-MM-DD", or null when not recorded. */
  dateOfBirth: string | null;
  diagnoses: string[];
  medications: string[];
  allergies: string[];
}

export type VisitStage = "checked_in" | "with_nurse" | "with_doctor" | "checkout" | "done";

export interface Vitals {
  bloodPressure: string;
  weightKg: number | null;
  temperatureC: number | null;
  notes: string;
}

export interface Visit {
  id: string;
  patientId: string;
  reason: string;
  stage: VisitStage;
  vitals: Vitals | null;
  doctorNotes: string;
  followUp: { needed: boolean; weeks: number | null; booked: boolean };
  testOrdered: boolean;
  checkedInAt: string;
}

export interface Study {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

/** Matcher output plus the doctor's decision, in one field. */
export type MatchStatus = "possible_match" | "needs_checking" | "confirmed" | "rejected";

/** Whether reception got hold of the patient. Separate from consent on purpose. */
export type ContactStatus = "not_contacted" | "not_reached" | "reached";

/** Only ever set by reception after speaking to the patient; never inferred. */
export type Consent = "unknown" | "undecided" | "consented" | "declined";

export interface StudyMatch {
  id: string;
  patientId: string;
  studyId: string;
  status: MatchStatus;
  /** Condition text the matcher found, e.g. "Type 2 diabetes". */
  evidence: string;
  /** Plain-language explanation from the matcher. */
  reason: string;
  missingInfo: string[];
  /** Role that confirmed/rejected the match, e.g. "doctor". */
  reviewedBy: Role | null;
  contactStatus: ContactStatus;
  consent: Consent;
}

export interface ClinicState {
  role: Role;
  patients: Patient[];
  visits: Visit[];
  studies: Study[];
  matches: StudyMatch[];
}
