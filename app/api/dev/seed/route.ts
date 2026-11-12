import { Types } from "mongoose";
import { ApiError, route } from "@/lib/api";
import { PatientModel, StudyMatchModel, StudyModel, VisitModel } from "@/lib/models";
import { createSeedData } from "@/lib/seed-data";

/**
 * POST /api/dev/seed  (development only, not part of the LLD API)
 * Wipes the 4 collections and loads the synthetic demo data. All people are fictional.
 * Disabled in production unless ENABLE_DEV_SEED=true (used by the e2e test server,
 * which runs against a throwaway in-memory database).
 */
export const POST = route(async () => {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_SEED !== "true") {
    throw new ApiError(404, "Not found.");
  }

  const s = createSeedData(new Date());
  // Seed data uses readable keys ("p-maria"); give each one a stable ObjectId.
  // ISO date strings are cast to Date by Mongoose.
  const ids = new Map<string, Types.ObjectId>();
  const oid = (key: string) => ids.get(key) ?? ids.set(key, new Types.ObjectId()).get(key)!;

  await Promise.all([
    PatientModel.deleteMany({}),
    VisitModel.deleteMany({}),
    StudyModel.deleteMany({}),
    StudyMatchModel.deleteMany({}),
  ]);
  // Make sure the LLD indexes exist (phone unique, board, match uniqueness).
  await Promise.all([
    PatientModel.syncIndexes(),
    VisitModel.syncIndexes(),
    StudyModel.syncIndexes(),
    StudyMatchModel.syncIndexes(),
  ]);

  await PatientModel.insertMany(s.patients.map(({ id, ...p }) => ({ ...p, _id: oid(id) })));
  await StudyModel.insertMany(s.studies.map(({ id, ...st }) => ({ ...st, _id: oid(id) })));
  await VisitModel.insertMany(
    s.visits.map(({ id, patientId, ...v }) => ({ ...v, _id: oid(id), patientId: oid(patientId) })),
  );
  await StudyMatchModel.insertMany(
    s.matches.map(({ id, patientId, studyId, ...m }) => ({
      ...m,
      _id: oid(id),
      patientId: oid(patientId),
      studyId: oid(studyId),
    })),
  );

  return Response.json({
    patients: s.patients.length,
    visits: s.visits.length,
    studies: s.studies.length,
    matches: s.matches.length,
  });
});
