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

// ---------- API response shapes (see app/api/**). Several are trimmed by role. ----------

export type PatientSummary = Pick<Patient, "id" | "name" | "phone" | "dateOfBirth">;

/** Study flag on a visit. Doctors get the details; other roles only see confirmed flags. */
export type StudyFlag = {
  id: string;
  status: StudyMatch["status"];
  evidence?: string;
  reason?: string;
  missingInfo?: string[];
} | null;

type VisitCore = Pick<
  Visit,
  "id" | "patientId" | "reason" | "stage" | "followUp" | "testOrdered" | "checkedInAt"
>;

/** GET /api/visits */
export type BoardVisit = VisitCore & { patient: PatientSummary | null; studyFlag: StudyFlag };

/** GET /api/visits/:id — reception gets the core fields; nurse/doctor get everything. */
export type VisitDetail = {
  visit: VisitCore & Partial<Pick<Visit, "vitals" | "doctorNotes">>;
  patient: PatientSummary & Partial<Pick<Patient, "diagnoses" | "medications" | "allergies">>;
  previousVitals?: { checkedInAt: string; vitals: Vitals }[];
  studyFlag: StudyFlag;
};

/** GET /api/studies/:id/matches as a doctor. */
export type DoctorMatch = StudyMatch & { patient: { id: string; name: string; age: number | null } };

/** GET /api/studies/:id/matches as reception (confirmed only, no clinical evidence). */
export type ReceptionMatch = Pick<StudyMatch, "id" | "status" | "contactStatus" | "consent"> & {
  patient: { id: string; name: string; phone: string };
};

/** POST /api/studies/:id/screen */
export type ScreenResult = { screened: number; awaitingReview: number; reviewed: number; removed: number };
