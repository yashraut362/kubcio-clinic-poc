import type { NextRequest } from "next/server";
import {
  ApiError,
  assertObjectId,
  getRole,
  patientSummary,
  readJson,
  requireRole,
  route,
  studyFlagFor,
} from "@/lib/api";
import { PatientModel, StudyMatchModel, VisitModel } from "@/lib/models";
import type { Patient, StudyMatch, Visit } from "@/lib/types";

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { $gte: start, $lt: end };
}

/**
 * GET /api/visits  (any role)
 * Today's Kanban board. Each card has the patient's contact details, follow-up
 * and test flags, and the study flag the current role is allowed to see.
 * Vitals and notes are left out; they come with GET /api/visits/:id.
 */
export const GET = route(async (req: NextRequest) => {
  const role = getRole(req);
  const visits = await VisitModel.find({ checkedInAt: todayRange() }).sort({ checkedInAt: 1 });
  const patientIds = [...new Set(visits.map((v) => String(v.patientId)))];

  const [patients, matches] = await Promise.all([
    PatientModel.find({ _id: { $in: patientIds } }),
    StudyMatchModel.find({ patientId: { $in: patientIds } }),
  ]);
  const patientById = new Map(patients.map((p) => [String(p._id), p.toJSON() as unknown as Patient]));
  const matchByPatient = new Map(
    matches.map((m) => [String(m.patientId), m.toJSON() as unknown as StudyMatch]),
  );

  return Response.json({
    visits: visits.map((doc) => {
      const v = doc.toJSON() as unknown as Visit;
      const patient = patientById.get(v.patientId);
      return {
        id: v.id,
        patientId: v.patientId,
        reason: v.reason,
        stage: v.stage,
        followUp: v.followUp,
        testOrdered: v.testOrdered,
        checkedInAt: v.checkedInAt,
        patient: patient ? patientSummary(patient) : null,
        studyFlag: studyFlagFor(role, matchByPatient.get(v.patientId)),
      };
    }),
  });
});

/**
 * POST /api/visits  (reception) — check a patient in.
 * Body: { patientId, reason }
 */
export const POST = route(async (req: NextRequest) => {
  requireRole(req, "reception");
  const body = await readJson(req);

  const patientId = typeof body.patientId === "string" ? body.patientId : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  assertObjectId(patientId, "patientId");
  if (!reason) throw new ApiError(422, "reason is required.");

  if (!(await PatientModel.exists({ _id: patientId }))) throw new ApiError(404, "Patient not found.");
  const open = await VisitModel.exists({ patientId, checkedInAt: todayRange(), stage: { $ne: "done" } });
  if (open) throw new ApiError(409, "This patient is already checked in today.");

  const visit = await VisitModel.create({ patientId, reason, stage: "checked_in", checkedInAt: new Date() });
  return Response.json({ visit: visit.toJSON() }, { status: 201 });
});
