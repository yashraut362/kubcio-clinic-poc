// Business rules behind PATCH /api/visits/:id and PATCH /api/matches/:id.
// Run with: npm run test:unit
import { describe, expect, test } from "vitest";
import {
  ApiError,
  applyMatchOp,
  applyVisitOp,
  matchOpSchema,
  visitOpSchema,
  type MatchOp,
  type VisitOp,
} from "./operations";
import type { Role, StudyMatch, Visit, VisitStage } from "./types";

const visit = (stage: VisitStage, patch: Partial<Visit> = {}): Visit => ({
  id: "v1",
  patientId: "p1",
  reason: "Check-up",
  stage,
  vitals: null,
  doctorNotes: "",
  followUp: { needed: false, weeks: null, booked: false },
  testOrdered: false,
  checkedInAt: "2026-11-12T09:00:00.000Z",
  ...patch,
});

const match = (status: StudyMatch["status"], patch: Partial<StudyMatch> = {}): StudyMatch => ({
  id: "m1",
  patientId: "p1",
  studyId: "s1",
  status,
  evidence: "Type 2 diabetes",
  reason: "",
  missingInfo: [],
  reviewedBy: null,
  contactStatus: "not_contacted",
  consent: "unknown",
  ...patch,
});

const vitals = { bloodPressure: "120/80", weightKg: 70, temperatureC: 36.6, notes: "" };
const doctor = (followUp: { needed: boolean; weeks: number | null }, testOrdered = false) => ({
  doctorNotes: "Notes",
  followUp,
  testOrdered,
});

/** Asserts the call throws an ApiError with the given HTTP status. */
function expectApiError(fn: () => unknown, status: number) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(status);
    return;
  }
  throw new Error(`Expected ApiError ${status}, but nothing was thrown`);
}

describe("visit handoff: the right role moves each stage forward", () => {
  const happyPath: [Role, VisitStage, VisitOp, VisitStage][] = [
    ["nurse", "checked_in", { type: "start_nurse" }, "with_nurse"],
    ["nurse", "with_nurse", { type: "send_to_doctor", vitals }, "with_doctor"],
    ["doctor", "with_doctor", { type: "send_to_checkout", ...doctor({ needed: false, weeks: null }) }, "checkout"],
    ["doctor", "with_doctor", { type: "back_to_nurse", ...doctor({ needed: false, weeks: null }) }, "with_nurse"],
    ["reception", "checkout", { type: "complete_checkout" }, "done"],
  ];

  test.each(happyPath)("%s: %s --%j--> %s", (role, from, op, to) => {
    expect(applyVisitOp(role, visit(from), op).stage).toBe(to);
  });

  test("save operations keep the stage", () => {
    expect(applyVisitOp("nurse", visit("with_nurse"), { type: "save_vitals", vitals }).stage).toBe("with_nurse");
    const saved = applyVisitOp("doctor", visit("with_doctor"), { type: "save_doctor", ...doctor({ needed: false, weeks: null }) });
    expect(saved.stage).toBe("with_doctor");
    expect(saved.doctorNotes).toBe("Notes");
  });

  test("the nurse's vitals are stored when sending to the doctor", () => {
    expect(applyVisitOp("nurse", visit("with_nurse"), { type: "send_to_doctor", vitals }).vitals).toEqual(vitals);
  });
});

describe("visit handoff: wrong role or wrong stage is rejected", () => {
  test.each<[Role, VisitStage, VisitOp]>([
    ["doctor", "checked_in", { type: "start_nurse" }],
    ["reception", "with_nurse", { type: "send_to_doctor", vitals }],
    ["nurse", "with_doctor", { type: "send_to_checkout", ...doctor({ needed: false, weeks: null }) }],
    ["doctor", "checkout", { type: "complete_checkout" }],
  ])("%s cannot run it (403)", (role, stage, op) => {
    expectApiError(() => applyVisitOp(role, visit(stage), op), 403);
  });

  test.each<[Role, VisitStage, VisitOp]>([
    ["nurse", "checked_in", { type: "send_to_doctor", vitals }],
    ["doctor", "with_nurse", { type: "send_to_checkout", ...doctor({ needed: false, weeks: null }) }],
    ["reception", "with_doctor", { type: "complete_checkout" }],
    ["nurse", "done", { type: "save_vitals", vitals }],
  ])("%s at the wrong stage (%s) is a conflict (409)", (role, stage, op) => {
    expectApiError(() => applyVisitOp(role, visit(stage), op), 409);
  });
});

describe("follow-up and checkout", () => {
  test("a follow-up needs a time frame before checkout (422)", () => {
    expectApiError(
      () => applyVisitOp("doctor", visit("with_doctor"), { type: "send_to_checkout", ...doctor({ needed: true, weeks: null }) }),
      422,
    );
  });

  test("checkout is blocked until the follow-up is booked", () => {
    const atCheckout = visit("checkout", { followUp: { needed: true, weeks: 2, booked: false } });
    expectApiError(() => applyVisitOp("reception", atCheckout, { type: "complete_checkout" }), 409);

    const booked = applyVisitOp("reception", atCheckout, { type: "set_follow_up_booked", booked: true });
    expect(booked.followUp.booked).toBe(true);
    expect(applyVisitOp("reception", booked, { type: "complete_checkout" }).stage).toBe("done");
  });

  test("cannot book a follow-up the doctor didn't ask for", () => {
    expectApiError(() => applyVisitOp("reception", visit("checkout"), { type: "set_follow_up_booked", booked: true }), 409);
  });

  test("removing the follow-up clears its weeks and booked flag", () => {
    const withFollowUp = visit("with_doctor", { followUp: { needed: true, weeks: 2, booked: true } });
    const out = applyVisitOp("doctor", withFollowUp, { type: "save_doctor", ...doctor({ needed: false, weeks: 2 }) });
    expect(out.followUp).toEqual({ needed: false, weeks: null, booked: false });
  });
});

describe("study match: doctor review", () => {
  test.each(["possible_match", "needs_checking"] as const)("a doctor can confirm a %s", (status) => {
    const out = applyMatchOp("doctor", match(status), { type: "review", decision: "confirmed" });
    expect(out.status).toBe("confirmed");
    expect(out.reviewedBy).toBe("doctor");
  });

  test("confirming a match does not set consent or contact", () => {
    const out = applyMatchOp("doctor", match("possible_match"), { type: "review", decision: "confirmed" });
    expect(out.consent).toBe("unknown");
    expect(out.contactStatus).toBe("not_contacted");
  });

  test.each<Role>(["nurse", "reception"])("%s cannot review (403)", (role) => {
    expectApiError(() => applyMatchOp(role, match("possible_match"), { type: "review", decision: "confirmed" }), 403);
  });

  test.each(["confirmed", "rejected"] as const)("a %s match cannot be reviewed again (409)", (status) => {
    expectApiError(() => applyMatchOp("doctor", match(status), { type: "review", decision: "rejected" }), 409);
  });
});

describe("study match: contact and consent are separate", () => {
  const reachedConsented: MatchOp = { type: "record_contact", contactStatus: "reached", consent: "consented" };
  const notReached: MatchOp = { type: "record_contact", contactStatus: "not_reached", consent: "unknown" };

  test.each(["possible_match", "needs_checking", "rejected"] as const)(
    "reception cannot call a %s patient (409)",
    (status) => expectApiError(() => applyMatchOp("reception", match(status), reachedConsented), 409),
  );

  test("only reception records calls (403)", () => {
    expectApiError(() => applyMatchOp("doctor", match("confirmed"), reachedConsented), 403);
  });

  test("not reached never changes consent", () => {
    const out = applyMatchOp("reception", match("confirmed"), notReached);
    expect(out.contactStatus).toBe("not_reached");
    expect(out.consent).toBe("unknown");
  });

  test("reached requires an answer about the study (422)", () => {
    expectApiError(
      () => applyMatchOp("reception", match("confirmed"), { type: "record_contact", contactStatus: "reached", consent: "unknown" }),
      422,
    );
  });

  test.each(["consented", "declined", "undecided"] as const)("reached + %s is recorded as given", (consent) => {
    const out = applyMatchOp("reception", match("confirmed"), { type: "record_contact", contactStatus: "reached", consent });
    expect(out.contactStatus).toBe("reached");
    expect(out.consent).toBe(consent);
  });

  test("a later missed call doesn't undo reached or consent", () => {
    const reached = match("confirmed", { contactStatus: "reached", consent: "undecided" });
    const out = applyMatchOp("reception", reached, notReached);
    expect(out.contactStatus).toBe("reached");
    expect(out.consent).toBe("undecided");
  });
});

describe("request schemas", () => {
  test("vitals get defaults and trimming", () => {
    const op = visitOpSchema.parse({ type: "save_vitals", vitals: { bloodPressure: " 120/80 " } });
    expect(op).toEqual({
      type: "save_vitals",
      vitals: { bloodPressure: "120/80", weightKg: null, temperatureC: null, notes: "" },
    });
  });

  test.each([
    { type: "dance" },
    { type: "save_vitals", vitals: { weightKg: "heavy" } },
    { type: "send_to_checkout", doctorNotes: "", followUp: { needed: true, weeks: -1 }, testOrdered: false },
    { type: "set_follow_up_booked" },
  ])("rejects bad visit operation %j", (body) => {
    expect(visitOpSchema.safeParse(body).success).toBe(false);
  });

  test("consent defaults to unknown; bad values are rejected", () => {
    expect(matchOpSchema.parse({ type: "record_contact", contactStatus: "not_reached" })).toEqual({
      type: "record_contact",
      contactStatus: "not_reached",
      consent: "unknown",
    });
    expect(matchOpSchema.safeParse({ type: "review", decision: "maybe" }).success).toBe(false);
    expect(matchOpSchema.safeParse({ type: "record_contact", contactStatus: "reached", consent: "yes" }).success).toBe(false);
  });
});
