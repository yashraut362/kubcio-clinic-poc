import type { NextRequest } from "next/server";
import { ApiError, assertObjectId, getRole, parseBody, patientSummary, route, studyFlagFor, toApi } from "@/lib/api";
import { PatientModel, StudyMatchModel, VisitModel } from "@/lib/models";
import { applyVisitOp, visitOpSchema } from "@/lib/operations";
import type { Patient, StudyMatch, Visit, VisitDetail } from "@/lib/types";

/**
 * GET /api/visits/:id  (any role, response shaped by role)
 * - reception: contact details, reason, stage and the checkout to-do only;
 * - nurse/doctor: also vitals, doctor notes, clinical lists and previous vitals.
 */
export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/visits/[id]">) => {
  const role = getRole(req);
  const { id } = await ctx.params;
  assertObjectId(id);

  const doc = await VisitModel.findById(id);
  if (!doc) throw new ApiError(404, "Visit not found.");
  const visit = toApi<Visit>(doc);

  const [patientDoc, matchDoc, previous] = await Promise.all([
    PatientModel.findById(visit.patientId),
    StudyMatchModel.findOne({ patientId: visit.patientId }),
    VisitModel.find({ patientId: visit.patientId, _id: { $ne: id }, vitals: { $ne: null } })
      .sort({ checkedInAt: -1 })
      .limit(3),
  ]);
  if (!patientDoc) throw new ApiError(404, "Patient not found.");
  const patient = toApi<Patient>(patientDoc);
  const studyFlag = studyFlagFor(role, matchDoc ? toApi<StudyMatch>(matchDoc) : undefined);

  if (role === "reception") {
    const { id: visitId, patientId, reason, stage, followUp, testOrdered, checkedInAt } = visit;
    const detail: VisitDetail = {
      visit: { id: visitId, patientId, reason, stage, followUp, testOrdered, checkedInAt },
      patient: patientSummary(patient),
      studyFlag,
    };
    return Response.json(detail);
  }

  const previousVitals = previous.map((d) => toApi<Visit>(d)).map((v) => ({ checkedInAt: v.checkedInAt, vitals: v.vitals! }));
  const detail: VisitDetail = { visit, patient, previousVitals, studyFlag };
  return Response.json(detail);
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
  const op = await parseBody(req, visitOpSchema);

  const doc = await VisitModel.findById(id);
  if (!doc) throw new ApiError(404, "Visit not found.");
  const current = toApi<Visit>(doc);
  const { stage, vitals, doctorNotes, followUp, testOrdered } = applyVisitOp(role, current, op);

  // Only write if nobody moved the visit in the meantime.
  const updated = await VisitModel.findOneAndUpdate(
    { _id: id, stage: current.stage },
    { $set: { stage, vitals, doctorNotes, followUp, testOrdered } },
    { new: true, runValidators: true },
  );
  if (!updated) throw new ApiError(409, "This visit was just updated by someone else. Reload and try again.");
  return Response.json({ visit: toApi<Visit>(updated) });
});
