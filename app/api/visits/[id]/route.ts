import type { NextRequest } from "next/server";
import {
  ApiError,
  assertObjectId,
  getRole,
  parseVisitOp,
  readJson,
  route,
  studyFlagFor,
} from "@/lib/api";
import { PatientModel, StudyMatchModel, VisitModel } from "@/lib/models";
import { applyVisitOp } from "@/lib/operations";
import type { Patient, Role, StudyMatch, Visit } from "@/lib/types";

/**
 * Role-based view of a visit:
 * - reception: contact details, reason, stage and the checkout to-do only;
 * - nurse/doctor: also vitals, doctor notes, clinical lists and previous vitals.
 */
function shapeForRole(role: Role, visit: Visit, patient: Patient, previousVitals: unknown[]) {
  if (role === "reception") {
    const { id, patientId, reason, stage, followUp, testOrdered, checkedInAt } = visit;
    const { name, phone, dateOfBirth } = patient;
    return {
      visit: { id, patientId, reason, stage, followUp, testOrdered, checkedInAt },
      patient: { id: patient.id, name, phone, dateOfBirth },
    };
  }
  return { visit, patient, previousVitals };
}

/** GET /api/visits/:id  (any role, response shaped by role) */
export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/visits/[id]">) => {
  const role = getRole(req);
  const { id } = await ctx.params;
  assertObjectId(id);

  const doc = await VisitModel.findById(id);
  if (!doc) throw new ApiError(404, "Visit not found.");
  const visit = doc.toJSON() as unknown as Visit;

  const [patientDoc, matchDoc, previous] = await Promise.all([
    PatientModel.findById(visit.patientId),
    StudyMatchModel.findOne({ patientId: visit.patientId }),
    VisitModel.find({ patientId: visit.patientId, _id: { $ne: id }, vitals: { $ne: null } })
      .sort({ checkedInAt: -1 })
      .limit(3),
  ]);
  if (!patientDoc) throw new ApiError(404, "Patient not found.");

  const previousVitals = previous.map((v) => ({ checkedInAt: v.checkedInAt, vitals: v.toJSON().vitals }));
  return Response.json({
    ...shapeForRole(role, visit, patientDoc.toJSON() as unknown as Patient, previousVitals),
    studyFlag: studyFlagFor(role, matchDoc?.toJSON() as unknown as StudyMatch | undefined),
  });
});

/**
 * PATCH /api/visits/:id
 * Body is one operation, e.g. { type: "send_to_doctor", vitals: {...} }.
 * The operation is checked against the caller's role and the visit's current
 * stage (see lib/operations.ts) before anything is written.
 */
export const PATCH = route(async (req: NextRequest, ctx: RouteContext<"/api/visits/[id]">) => {
  const role = getRole(req);
  const { id } = await ctx.params;
  assertObjectId(id);
  const op = parseVisitOp(await readJson(req));

  const doc = await VisitModel.findById(id);
  if (!doc) throw new ApiError(404, "Visit not found.");
  const current = doc.toJSON() as unknown as Visit;

  const res = applyVisitOp(role, current, op);
  if (!res.ok) throw new ApiError(res.status ?? 409, res.error);

  const { stage, vitals, doctorNotes, followUp, testOrdered } = res.value;
  // Only write if nobody moved the visit in the meantime.
  const updated = await VisitModel.findOneAndUpdate(
    { _id: id, stage: current.stage },
    { $set: { stage, vitals, doctorNotes, followUp, testOrdered } },
    { new: true, runValidators: true },
  );
  if (!updated) throw new ApiError(409, "This visit was just updated by someone else. Reload and try again.");

  return Response.json({ visit: updated.toJSON() });
});
