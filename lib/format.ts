import { ageOn } from "./study-matcher";
import type { Consent, ContactStatus, MatchStatus, Role, Visit, VisitStage } from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  reception: "Reception",
  nurse: "Nurse",
  doctor: "Doctor",
};

export const STAGES: { id: VisitStage; label: string; owner: Role | null }[] = [
  { id: "checked_in", label: "Checked in", owner: "nurse" },
  { id: "with_nurse", label: "With nurse", owner: "nurse" },
  { id: "with_doctor", label: "With doctor", owner: "doctor" },
  { id: "checkout", label: "Checkout", owner: "reception" },
  { id: "done", label: "Done", owner: null },
];

export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.id, s.label])) as Record<
  VisitStage,
  string
>;

export const CONSENT_LABEL: Record<Consent, string> = {
  unknown: "Not asked yet",
  undecided: "Still deciding",
  consented: "Consented",
  declined: "Declined",
};

export const CONTACT_LABEL: Record<ContactStatus, string> = {
  not_contacted: "Not called yet",
  not_reached: "Not reached",
  reached: "Reached",
};

export function ageText(p: { dateOfBirth: string | null }): string {
  return ageLabel(ageOn(p.dateOfBirth, new Date()));
}

export const ageLabel = (age: number | null) => (age === null ? "Age unknown" : `${age} y`);

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

export const followUpToBook = (v: Pick<Visit, "followUp">) => v.followUp.needed && !v.followUp.booked;

export const awaitingReview = (m: { status: MatchStatus }) =>
  m.status === "possible_match" || m.status === "needs_checking";

/** Who still needs a call: not reached yet, or reached but hasn't decided. */
export const needsCall = (m: { status: MatchStatus; contactStatus: ContactStatus; consent: Consent }) =>
  m.status === "confirmed" && (m.contactStatus !== "reached" || m.consent === "undecided");

/** Digits-only phone, e.g. for tel: links. */
export const digits = (s: string) => s.replace(/\D/g, "");
