import { Types } from "mongoose";
import type { NextRequest } from "next/server";
import { ApiError, assertObjectId, requireRole, route } from "@/lib/api";
import { PatientModel, StudyMatchModel, StudyModel } from "@/lib/models";
import { screenPatients } from "@/lib/screening";
import type { Patient, StudyMatch } from "@/lib/types";

/**
 * POST /api/studies/:id/screen  (doctor)
 * Runs the matcher over all patients and stores the result:
 * - new or still-unreviewed candidates are upserted with fresh evidence;
 * - matches a doctor already confirmed/rejected are never touched;
 * - unreviewed matches that no longer apply are removed.
 */
export const POST = route(async (req: NextRequest, ctx: RouteContext<"/api/studies/[id]/screen">) => {
  requireRole(req, "doctor");
  const { id } = await ctx.params;
  assertObjectId(id);

  const study = await StudyModel.findById(id);
  if (!study) throw new ApiError(404, "Study not found.");
  if (!study.active) throw new ApiError(409, "This study is not active.");

  const [patients, existing] = await Promise.all([
    PatientModel.find(),
    StudyMatchModel.find({ studyId: id }),
  ]);
  const next = screenPatients(
    id,
    patients.map((p) => p.toJSON() as unknown as Patient),
    existing.map((m) => m.toJSON() as unknown as StudyMatch),
    new Date(),
  ).filter((m) => m.studyId === id);

  const unreviewed = next.filter((m) => m.status === "possible_match" || m.status === "needs_checking");
  const studyId = new Types.ObjectId(id);

  if (unreviewed.length) {
    await StudyMatchModel.bulkWrite(
      unreviewed.map((m) => ({
        updateOne: {
          filter: { studyId, patientId: new Types.ObjectId(m.patientId) },
          update: {
            $set: { status: m.status, evidence: m.evidence, reason: m.reason, missingInfo: m.missingInfo },
            $setOnInsert: { reviewedBy: null, contactStatus: "not_contacted", consent: "unknown" },
          },
          upsert: true,
        },
      })),
    );
  }
  const { deletedCount } = await StudyMatchModel.deleteMany({
    studyId,
    status: { $in: ["possible_match", "needs_checking"] },
    patientId: { $nin: unreviewed.map((m) => new Types.ObjectId(m.patientId)) },
  });

  return Response.json({
    screened: patients.length,
    awaitingReview: unreviewed.length,
    reviewed: next.length - unreviewed.length,
    removed: deletedCount,
  });
});
