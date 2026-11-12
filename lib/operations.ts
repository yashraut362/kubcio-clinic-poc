/**
 * The two PATCH endpoints, as pure functions:
 *   PATCH /api/visits/:id   -> applyVisitOp
 *   PATCH /api/matches/:id  -> applyMatchOp
 *
 * Each checks the operation against the acting role and the record's current
 * state, and returns the updated record or an error. The role selector is a
 * demo mechanism, so the API must run these same checks server-side.
 */
import type { Consent, ContactStatus, Role, StudyMatch, Visit, Vitals } from "./types";

type DoctorInput = {
  doctorNotes: string;
  followUp: { needed: boolean; weeks: number | null };
  testOrdered: boolean;
};

export type VisitOp =
  | { type: "start_nurse" }
  | { type: "save_vitals"; vitals: Vitals }
  | { type: "send_to_doctor"; vitals: Vitals }
  | ({ type: "save_doctor" } & DoctorInput)
  | ({ type: "send_to_checkout" } & DoctorInput)
  | ({ type: "back_to_nurse" } & DoctorInput)
  | { type: "set_follow_up_booked"; booked: boolean }
  | { type: "complete_checkout" };

export type MatchOp =
  | { type: "review"; decision: "confirmed" | "rejected" }
  | { type: "record_contact"; contactStatus: Exclude<ContactStatus, "not_contacted">; consent: Consent };

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): Result<never> => ({ ok: false, error });
const ok = <T>(value: T): Result<T> => ({ ok: true, value });

/** Which role may run each visit operation, and from which stage. */
const VISIT_RULES: Record<VisitOp["type"], { role: Role; stage: Visit["stage"] }> = {
  start_nurse: { role: "nurse", stage: "checked_in" },
  save_vitals: { role: "nurse", stage: "with_nurse" },
  send_to_doctor: { role: "nurse", stage: "with_nurse" },
  save_doctor: { role: "doctor", stage: "with_doctor" },
  send_to_checkout: { role: "doctor", stage: "with_doctor" },
  back_to_nurse: { role: "doctor", stage: "with_doctor" },
  set_follow_up_booked: { role: "reception", stage: "checkout" },
  complete_checkout: { role: "reception", stage: "checkout" },
};

export const followUpBlocksCheckout = (v: Visit) => v.followUp.needed && !v.followUp.booked;

function applyDoctor(v: Visit, input: DoctorInput): Visit {
  return {
    ...v,
    doctorNotes: input.doctorNotes.trim(),
    followUp: {
      needed: input.followUp.needed,
      weeks: input.followUp.needed ? input.followUp.weeks : null,
      booked: input.followUp.needed ? v.followUp.booked : false,
    },
    testOrdered: input.testOrdered,
  };
}

export function applyVisitOp(role: Role, v: Visit, op: VisitOp): Result<Visit> {
  const rule = VISIT_RULES[op.type];
  if (role !== rule.role) return fail(`Only the ${rule.role} can do this.`);
  if (v.stage !== rule.stage) return fail("This patient has moved on to another stage.");

  switch (op.type) {
    case "start_nurse":
      return ok({ ...v, stage: "with_nurse" });
    case "save_vitals":
      return ok({ ...v, vitals: op.vitals });
    case "send_to_doctor":
      return ok({ ...v, vitals: op.vitals, stage: "with_doctor" });
    case "save_doctor":
      return ok(applyDoctor(v, op));
    case "send_to_checkout":
      if (op.followUp.needed && !op.followUp.weeks) return fail("Choose when the follow-up is needed.");
      return ok({ ...applyDoctor(v, op), stage: "checkout" });
    case "back_to_nurse":
      return ok({ ...applyDoctor(v, op), stage: "with_nurse" });
    case "set_follow_up_booked":
      if (!v.followUp.needed) return fail("No follow-up was requested.");
      return ok({ ...v, followUp: { ...v.followUp, booked: op.booked } });
    case "complete_checkout":
      if (followUpBlocksCheckout(v)) return fail("Book the follow-up before finishing checkout.");
      return ok({ ...v, stage: "done" });
  }
}

export function applyMatchOp(role: Role, m: StudyMatch, op: MatchOp): Result<StudyMatch> {
  switch (op.type) {
    case "review":
      if (role !== "doctor") return fail("Only a doctor can review a study match.");
      if (m.status !== "possible_match" && m.status !== "needs_checking") {
        return fail("This match has already been reviewed.");
      }
      return ok({ ...m, status: op.decision, reviewedBy: role });

    case "record_contact":
      if (role !== "reception") return fail("Only reception records calls.");
      if (m.status !== "confirmed") return fail("Only doctor-confirmed matches can be called.");
      // Consent can only come from a conversation: not reaching someone never changes it.
      if (op.contactStatus === "not_reached") {
        return ok({ ...m, contactStatus: m.contactStatus === "reached" ? "reached" : "not_reached" });
      }
      if (op.consent === "unknown") return fail("Record what the patient said about the study.");
      return ok({ ...m, contactStatus: "reached", consent: op.consent });
  }
}
