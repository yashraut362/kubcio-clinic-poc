import type { NextRequest } from "next/server";
import { ApiError, assertObjectId, requireRole, route } from "@/lib/api";
import { MATCH_STATUSES, PatientModel, StudyMatchModel, StudyModel } from "@/lib/models";
import { ageOn } from "@/lib/study-matcher";
import type { Patient, StudyMatch } from "@/lib/types";

/**
 * GET /api/studies/:id/matches?status=
 * - doctor: every candidate with evidence, reason and missing info (review queue);
 * - reception: doctor-confirmed matches only, with phone and contact/consent
 *   state (call list). No clinical evidence.
 */
export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/studies/[id]/matches">) => {
  const role = requireRole(req, "doctor", "reception");
  const { id } = await ctx.params;
  assertObjectId(id);
  if (!(await StudyModel.exists({ _id: id }))) throw new ApiError(404, "Study not found.");

  const status = req.nextUrl.searchParams.get("status");
  if (status && !(MATCH_STATUSES as readonly string[]).includes(status)) {
    throw new ApiError(422, `status must be one of: ${MATCH_STATUSES.join(", ")}.`);
  }
  if (role === "reception" && status && status !== "confirmed") {
    throw new ApiError(403, "Reception only sees doctor-confirmed matches.");
  }

  const filter: Record<string, unknown> = { studyId: id };
  if (role === "reception") filter.status = "confirmed";
  else if (status) filter.status = status;

  const docs = await StudyMatchModel.find(filter);
  const patients = await PatientModel.find({ _id: { $in: docs.map((d) => d.patientId) } });
  const byId = new Map(patients.map((p) => [String(p._id), p.toJSON() as unknown as Patient]));
  const today = new Date();

  // Response shape differs by role, so type the list loosely.
  const matches = docs.flatMap((doc): Record<string, unknown>[] => {
    const m = doc.toJSON() as unknown as StudyMatch;
    const p = byId.get(m.patientId);
    if (!p) return [];
    if (role === "reception") {
      return [{
        id: m.id,
        status: m.status,
        contactStatus: m.contactStatus,
        consent: m.consent,
        patient: { id: p.id, name: p.name, phone: p.phone },
      }];
    }
    return [{ ...m, patient: { id: p.id, name: p.name, age: ageOn(p.dateOfBirth, today) } }];
  });

  return Response.json({ matches });
});
