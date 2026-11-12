/**
 * Shared helpers for the route handlers: DB connection, role checks,
 * request validation, error-to-HTTP mapping and role-based response shaping.
 *
 * Roles come from the `x-staff-role` header (the UI's "Viewing as" selector).
 * That is a demo mechanism, not authentication, but every handler still
 * enforces which role may do what on the server.
 */
import mongoose from "mongoose";
import { connection } from "next/server";
import { z } from "zod";
import { connectDB } from "./db";
import { ApiError } from "./operations";
import type { Patient, Role, StudyMatch } from "./types";

export { ApiError };

// ---------- Roles ----------

const roleSchema = z.enum(["reception", "nurse", "doctor"]);

export function getRole(req: Request): Role {
  const role = roleSchema.safeParse(req.headers.get("x-staff-role"));
  if (!role.success) throw new ApiError(401, "Send the x-staff-role header: reception, nurse or doctor.");
  return role.data;
}

export function requireRole(req: Request, ...allowed: Role[]): Role {
  const role = getRole(req);
  if (!allowed.includes(role)) throw new ApiError(403, `Only ${allowed.join(" or ")} can do this.`);
  return role;
}

// ---------- Handler wrapper ----------

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
  const json = (status: number, error: string) => Response.json({ error }, { status });
  if (err instanceof ApiError) return json(err.status, err.message);
  if (err instanceof mongoose.Error.CastError) return json(400, `Invalid ${err.path}.`);
  if (err instanceof mongoose.Error.ValidationError) return json(422, err.message);
  if (typeof err === "object" && err && "code" in err && err.code === 11000) {
    return json(409, "That record already exists.");
  }
  console.error("[api] unexpected error:", err);
  return json(500, "Something went wrong.");
}

// ---------- Request parsing ----------

/** Reads the JSON body and validates it; failures become 400 (not JSON) or 422 (invalid). */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const body = await req.json().catch(() => {
    throw new ApiError(400, "Request body must be JSON.");
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.length ? `${issue.path.join(".")}: ` : "";
    throw new ApiError(422, `${where}${issue.message}`);
  }
  return parsed.data;
}

export function assertObjectId(id: string, what = "id") {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, `Invalid ${what}.`);
}

const objectId = z.string().refine((s) => mongoose.isValidObjectId(s), "Invalid id.");

/** POST /api/patients */
export const createPatientSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  phone: z.string().trim().min(1, "Phone is required."),
  dateOfBirth: z.iso.date("Use YYYY-MM-DD.").nullable().default(null),
});

/** POST /api/visits */
export const checkInSchema = z.object({
  patientId: objectId,
  reason: z.string().trim().min(1, "Reason is required."),
});

// ---------- Mongo helpers ----------

/** A Mongoose document as the API/client shape in lib/types.ts (see the toJSON options in models.ts). */
export const toApi = <T>(doc: { toJSON(): unknown }): T => doc.toJSON() as T;

/** Matches a phone ignoring spaces/dashes, e.g. "07700900123" finds "07700 900123". */
export function phoneDigitsRegex(digits: string, exact: boolean): RegExp {
  const body = digits.split("").join("\\D*");
  return new RegExp(exact ? `^\\D*${body}\\D*$` : body);
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- Role-based shaping of responses ----------

/** Contact details only: what every role needs to identify a patient. */
export const patientSummary = ({ id, name, phone, dateOfBirth }: Patient) => ({ id, name, phone, dateOfBirth });

/**
 * The study flag a role may see on a visit: doctors see unreviewed flags,
 * everyone else only sees a match once a doctor confirmed it.
 */
export function studyFlagFor(role: Role, match: StudyMatch | undefined) {
  if (!match || match.status === "rejected") return null;
  if (match.status === "confirmed") return { id: match.id, status: match.status };
  if (role !== "doctor") return null;
  const { id, status, evidence, reason, missingInfo } = match;
  return { id, status, evidence, reason, missingInfo };
}
