/**
 * Request bodies and business rules for the two PATCH endpoints:
 *   PATCH /api/visits/:id   -> visitOpSchema  + applyVisitOp
 *   PATCH /api/matches/:id  -> matchOpSchema  + applyMatchOp
 *
 * The zod schemas are the single definition of each operation; the TypeScript
 * types are inferred from them. The apply functions check the operation
 * against the acting role and the record's current state, and throw an
 * ApiError (403 wrong role, 409 wrong state, 422 bad input) when it's not allowed.
 *
 * The role selector is a demo mechanism, so the API runs these checks
 * server-side. The UI only imports the types from here.
 */
import { z } from "zod";
import { followUpToBook } from "./format";
import type { Role, StudyMatch, Visit } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------- Schemas ----------

const vitals = z.object({
  bloodPressure: z.string().trim().default(""),
  weightKg: z.number().nullable().default(null),
  temperatureC: z.number().nullable().default(null),
  notes: z.string().trim().default(""),
});

const doctorInput = {
  doctorNotes: z.string().trim().default(""),
  followUp: z.object({ needed: z.boolean(), weeks: z.number().int().positive().nullable().default(null) }),
  testOrdered: z.boolean(),
};

export const visitOpSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start_nurse") }),
  z.object({ type: z.literal("save_vitals"), vitals }),
  z.object({ type: z.literal("send_to_doctor"), vitals }),
  z.object({ type: z.literal("save_doctor"), ...doctorInput }),
  z.object({ type: z.literal("send_to_checkout"), ...doctorInput }),
  z.object({ type: z.literal("back_to_nurse"), ...doctorInput }),
  z.object({ type: z.literal("set_follow_up_booked"), booked: z.boolean() }),
  z.object({ type: z.literal("complete_checkout") }),
]);

export const matchOpSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("review"), decision: z.enum(["confirmed", "rejected"]) }),
  z.object({
    type: z.literal("record_contact"),
    contactStatus: z.enum(["reached", "not_reached"]),
    consent: z.enum(["unknown", "undecided", "consented", "declined"]).default("unknown"),
  }),
]);

export type VisitOp = z.infer<typeof visitOpSchema>;
export type MatchOp = z.infer<typeof matchOpSchema>;
type DoctorInput = Omit<Extract<VisitOp, { type: "save_doctor" }>, "type">;

// ---------- Rules ----------

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

function applyDoctor(v: Visit, input: DoctorInput): Visit {
  return {
    ...v,
    doctorNotes: input.doctorNotes,
    followUp: {
      needed: input.followUp.needed,
      weeks: input.followUp.needed ? input.followUp.weeks : null,
      booked: input.followUp.needed ? v.followUp.booked : false,
    },
    testOrdered: input.testOrdered,
  };
}

export function applyVisitOp(role: Role, v: Visit, op: VisitOp): Visit {
  const rule = VISIT_RULES[op.type];
  if (role !== rule.role) throw new ApiError(403, `Only the ${rule.role} can do this.`);
  if (v.stage !== rule.stage) throw new ApiError(409, "This patient has moved on to another stage.");

  switch (op.type) {
    case "start_nurse":
      return { ...v, stage: "with_nurse" };
    case "save_vitals":
      return { ...v, vitals: op.vitals };
    case "send_to_doctor":
      return { ...v, vitals: op.vitals, stage: "with_doctor" };
    case "save_doctor":
      return applyDoctor(v, op);
    case "send_to_checkout":
      if (op.followUp.needed && !op.followUp.weeks) throw new ApiError(422, "Choose when the follow-up is needed.");
      return { ...applyDoctor(v, op), stage: "checkout" };
    case "back_to_nurse":
      return { ...applyDoctor(v, op), stage: "with_nurse" };
    case "set_follow_up_booked":
      if (!v.followUp.needed) throw new ApiError(409, "No follow-up was requested.");
      return { ...v, followUp: { ...v.followUp, booked: op.booked } };
    case "complete_checkout":
      if (followUpToBook(v)) throw new ApiError(409, "Book the follow-up before finishing checkout.");
      return { ...v, stage: "done" };
  }
}

export function applyMatchOp(role: Role, m: StudyMatch, op: MatchOp): StudyMatch {
  switch (op.type) {
    case "review":
      if (role !== "doctor") throw new ApiError(403, "Only a doctor can review a study match.");
      if (m.status !== "possible_match" && m.status !== "needs_checking") {
        throw new ApiError(409, "This match has already been reviewed.");
      }
      return { ...m, status: op.decision, reviewedBy: role };

    case "record_contact":
      if (role !== "reception") throw new ApiError(403, "Only reception records calls.");
      if (m.status !== "confirmed") throw new ApiError(409, "Only doctor-confirmed matches can be called.");
      // Consent can only come from a conversation: not reaching someone never changes it.
      if (op.contactStatus === "not_reached") {
        return { ...m, contactStatus: m.contactStatus === "reached" ? "reached" : "not_reached" };
      }
      if (op.consent === "unknown") throw new ApiError(422, "Record what the patient said about the study.");
      return { ...m, contactStatus: "reached", consent: op.consent };
  }
}
