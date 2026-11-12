import type { NextRequest } from "next/server";
import {
  ApiError,
  checkInSchema,
  getRole,
  parseBody,
  patientSummary,
  requireRole,
  route,
  studyFlagFor,
  toApi,
} from "@/lib/api";
import { PatientModel, StudyMatchModel, VisitModel } from "@/lib/models";
import type { BoardVisit, Patient, StudyMatch, Visit } from "@/lib/types";

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
  const visits = (await VisitModel.find({ checkedInAt: todayRange() }).sort({ checkedInAt: 1 })).map(
    (d) => toApi<Visit>(d),
  );
  const patientIds = [...new Set(visits.map((v) => v.patientId))];

  const [patients, matches] = await Promise.all([
    PatientModel.find({ _id: { $in: patientIds } }),
    StudyMatchModel.find({ patientId: { $in: patientIds } }),
  ]);
  const patientById = new Map(patients.map((d) => toApi<Patient>(d)).map((p) => [p.id, p]));
  const matchByPatient = new Map(matches.map((d) => toApi<StudyMatch>(d)).map((m) => [m.patientId, m]));

  const board: BoardVisit[] = visits.map(({ id, patientId, reason, stage, followUp, testOrdered, checkedInAt }) => {
    const patient = patientById.get(patientId);
    return {
      id,
      patientId,
      reason,
      stage,
      followUp,
      testOrdered,
      checkedInAt,
      patient: patient ? patientSummary(patient) : null,
      studyFlag: studyFlagFor(role, matchByPatient.get(patientId)),
    };
  });
  return Response.json({ visits: board });
});

/**
 * POST /api/visits  (reception) — check a patient in.
 * Body: { patientId, reason }
 */
export const POST = route(async (req: NextRequest) => {
  requireRole(req, "reception");
  const { patientId, reason } = await parseBody(req, checkInSchema);

  if (!(await PatientModel.exists({ _id: patientId }))) throw new ApiError(404, "Patient not found.");
  const open = await VisitModel.exists({ patientId, checkedInAt: todayRange(), stage: { $ne: "done" } });
  if (open) throw new ApiError(409, "This patient is already checked in today.");

  const visit = await VisitModel.create({ patientId, reason, stage: "checked_in", checkedInAt: new Date() });
  return Response.json({ visit: toApi<Visit>(visit) }, { status: 201 });
});
