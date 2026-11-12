/**
 * Shared helpers for the route handlers: DB connection, role checks,
 * error-to-HTTP mapping, request body parsing and role-based redaction.
 *
 * Roles come from the `x-staff-role` header (the UI's "Viewing as" selector).
 * That is a demo mechanism, not authentication, but every handler still
 * enforces which role may do what on the server.
 */
import mongoose from "mongoose";
import { connection } from "next/server";
import { connectDB } from "./db";
import type { MatchOp, VisitOp } from "./operations";
import type { Consent, Patient, Role, StudyMatch, Vitals } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const ROLES: Role[] = ["reception", "nurse", "doctor"];

export function getRole(req: Request): Role {
  const role = req.headers.get("x-staff-role");
  if (role && (ROLES as string[]).includes(role)) return role as Role;
  throw new ApiError(401, "Send the x-staff-role header: reception, nurse or doctor.");
}

export function requireRole(req: Request, ...allowed: Role[]): Role {
  const role = getRole(req);
  if (!allowed.includes(role)) throw new ApiError(403, `Only ${allowed.join(" or ")} can do this.`);
  return role;
}

/**
 * Wraps a route handler: waits for a request (no prerendering of DB reads),
 * connects to Mongo, and turns thrown errors into JSON error responses.
 */
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    // Outside the try: during prerendering Next rejects this on purpose to stop,
    // and that signal must reach Next instead of becoming a 500.
    await connection();
    try {
      await connectDB();
      return await handler(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) return Response.json({ error: err.message }, { status: err.status });
  if (err instanceof mongoose.Error.CastError) {
    return Response.json({ error: `Invalid ${err.path}.` }, { status: 400 });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return Response.json({ error: err.message }, { status: 422 });
  }
  if (typeof err === "object" && err && "code" in err && err.code === 11000) {
    return Response.json({ error: "That record already exists." }, { status: 409 });
  }
  console.error("[api] unexpected error:", err);
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {
    // fall through
  }
  throw new ApiError(400, "Request body must be a JSON object.");
}

export function assertObjectId(id: string, what = "id") {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, `Invalid ${what}.`);
}

/** Matches a phone ignoring spaces/dashes, e.g. "07700900123" finds "07700 900123". */
export function phoneDigitsRegex(digits: string, exact: boolean): RegExp {
  const body = digits.split("").join("\\D*");
  return new RegExp(exact ? `^\\D*${body}\\D*$` : body);
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- Body parsing ----------

const bad = (msg: string): never => {
  throw new ApiError(422, msg);
};
const str = (v: unknown, field: string): string => (typeof v === "string" ? v : bad(`${field} must be a string.`));
const bool = (v: unknown, field: string): boolean =>
  typeof v === "boolean" ? v : bad(`${field} must be true or false.`);
const numOrNull = (v: unknown, field: string): number | null =>
  v === null || v === undefined
    ? null
    : typeof v === "number" && Number.isFinite(v)
      ? v
      : bad(`${field} must be a number or null.`);
const obj = (v: unknown, field: string): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : bad(`${field} is required.`);

function parseVitals(v: unknown): Vitals {
  const o = obj(v, "vitals");
  return {
    bloodPressure: str(o.bloodPressure ?? "", "vitals.bloodPressure").trim(),
    weightKg: numOrNull(o.weightKg, "vitals.weightKg"),
    temperatureC: numOrNull(o.temperatureC, "vitals.temperatureC"),
    notes: str(o.notes ?? "", "vitals.notes").trim(),
  };
}

function parseDoctor(b: Record<string, unknown>) {
  const followUp = obj(b.followUp, "followUp");
  return {
    doctorNotes: str(b.doctorNotes ?? "", "doctorNotes"),
    followUp: { needed: bool(followUp.needed, "followUp.needed"), weeks: numOrNull(followUp.weeks, "followUp.weeks") },
    testOrdered: bool(b.testOrdered, "testOrdered"),
  };
}

/** PATCH /api/visits/:id body. */
export function parseVisitOp(b: Record<string, unknown>): VisitOp {
  switch (b.type) {
    case "start_nurse":
    case "complete_checkout":
      return { type: b.type };
    case "save_vitals":
    case "send_to_doctor":
      return { type: b.type, vitals: parseVitals(b.vitals) };
    case "save_doctor":
    case "send_to_checkout":
    case "back_to_nurse":
      return { type: b.type, ...parseDoctor(b) };
    case "set_follow_up_booked":
      return { type: b.type, booked: bool(b.booked, "booked") };
    default:
      return bad(
        "type must be one of: start_nurse, save_vitals, send_to_doctor, save_doctor, send_to_checkout, back_to_nurse, set_follow_up_booked, complete_checkout.",
      );
  }
}

const CONSENTS: Consent[] = ["unknown", "undecided", "consented", "declined"];

/** PATCH /api/matches/:id body. */
export function parseMatchOp(b: Record<string, unknown>): MatchOp {
  switch (b.type) {
    case "review":
      if (b.decision !== "confirmed" && b.decision !== "rejected") bad("decision must be confirmed or rejected.");
      return { type: "review", decision: b.decision as "confirmed" | "rejected" };
    case "record_contact": {
      if (b.contactStatus !== "reached" && b.contactStatus !== "not_reached") {
        bad("contactStatus must be reached or not_reached.");
      }
      const consent = (b.consent ?? "unknown") as Consent;
      if (!CONSENTS.includes(consent)) bad(`consent must be one of: ${CONSENTS.join(", ")}.`);
      return { type: "record_contact", contactStatus: b.contactStatus as "reached" | "not_reached", consent };
    }
    default:
      return bad("type must be review or record_contact.");
  }
}

// ---------- Role-based shaping of responses ----------

/** Contact details only: what every role needs to identify a patient. */
export const patientSummary = (p: Patient) => ({
  id: p.id,
  name: p.name,
  phone: p.phone,
  dateOfBirth: p.dateOfBirth,
});

/**
 * The study flag a role may see on a visit: doctors see unreviewed flags,
 * everyone else only sees a match once a doctor confirmed it.
 */
export function studyFlagFor(role: Role, match: StudyMatch | undefined) {
  if (!match || match.status === "rejected") return null;
  if (match.status === "confirmed") return { id: match.id, status: match.status };
  if (role !== "doctor") return null;
  return {
    id: match.id,
    status: match.status,
    evidence: match.evidence,
    reason: match.reason,
    missingInfo: match.missingInfo,
  };
}
