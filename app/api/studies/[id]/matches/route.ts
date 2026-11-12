import type { NextRequest } from "next/server";
import { ApiError, assertObjectId, requireRole, route, toApi } from "@/lib/api";
import { PatientModel, StudyMatchModel, StudyModel } from "@/lib/models";
import { ageOn } from "@/lib/study-matcher";
import type { DoctorMatch, Patient, ReceptionMatch, StudyMatch } from "@/lib/types";

/**
 * GET /api/studies/:id/matches
 * - doctor: every candidate with evidence, reason and missing info (review queue);
 * - reception: doctor-confirmed matches only, with phone and contact/consent
 *   state (call list). No clinical evidence.
 */
export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/studies/[id]/matches">) => {
  const role = requireRole(req, "doctor", "reception");
  const { id } = await ctx.params;
  assertObjectId(id);
  if (!(await StudyModel.exists({ _id: id }))) throw new ApiError(404, "Study not found.");

  const filter = role === "reception" ? { studyId: id, status: "confirmed" as const } : { studyId: id };
  const matches = (await StudyMatchModel.find(filter)).map((d) => toApi<StudyMatch>(d));
  const patients = await PatientModel.find({ _id: { $in: matches.map((m) => m.patientId) } });
  const byId = new Map(patients.map((d) => toApi<Patient>(d)).map((p) => [p.id, p]));
  const withPatient = matches.flatMap((m) => {
    const p = byId.get(m.patientId);
    return p ? [{ m, p }] : [];
  });

  if (role === "reception") {
    const list: ReceptionMatch[] = withPatient.map(({ m, p }) => ({
      id: m.id,
      status: m.status,
      contactStatus: m.contactStatus,
      consent: m.consent,
      patient: { id: p.id, name: p.name, phone: p.phone },
    }));
    return Response.json({ matches: list });
  }

  const today = new Date();
  const list: DoctorMatch[] = withPatient.map(({ m, p }) => ({
    ...m,
    patient: { id: p.id, name: p.name, age: ageOn(p.dateOfBirth, today) },
  }));
  return Response.json({ matches: list });
});
