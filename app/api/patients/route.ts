import type { NextRequest } from "next/server";
import {
  ApiError,
  createPatientSchema,
  escapeRegex,
  getRole,
  parseBody,
  patientSummary,
  phoneDigitsRegex,
  requireRole,
  route,
  toApi,
} from "@/lib/api";
import { PatientModel } from "@/lib/models";
import type { Patient } from "@/lib/types";

/**
 * GET /api/patients?q=
 * Search by name (contains, case-insensitive) or phone digits (3+ digits).
 * Returns contact details only; clinical data comes with a visit.
 */
export const GET = route(async (req: NextRequest) => {
  getRole(req);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const digits = q.replace(/\D/g, "");

  const or: Record<string, unknown>[] = [];
  if (q) or.push({ name: { $regex: escapeRegex(q), $options: "i" } });
  if (digits.length >= 3) or.push({ phone: { $regex: phoneDigitsRegex(digits, false) } });

  const docs = await PatientModel.find(or.length ? { $or: or } : {}).sort({ name: 1 }).limit(50);
  return Response.json({ patients: docs.map((d) => patientSummary(toApi<Patient>(d))) });
});

/**
 * POST /api/patients  (reception)
 * Body: { name, phone, dateOfBirth?: "YYYY-MM-DD" | null }
 */
export const POST = route(async (req: NextRequest) => {
  requireRole(req, "reception");
  const { name, phone, dateOfBirth } = await parseBody(req, createPatientSchema);

  // The unique index catches exact duplicates; this also catches "07700900123" vs "07700 900123".
  const digits = phone.replace(/\D/g, "");
  if (digits && (await PatientModel.exists({ phone: { $regex: phoneDigitsRegex(digits, true) } }))) {
    throw new ApiError(409, "A patient with this phone number already exists.");
  }

  const doc = await PatientModel.create({ name, phone, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null });
  return Response.json({ patient: toApi<Patient>(doc) }, { status: 201 });
});
