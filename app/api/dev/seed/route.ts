import { Types } from "mongoose";
import { ApiError, route } from "@/lib/api";
import { createInitialState } from "@/lib/mock-data";
import { PatientModel, StudyMatchModel, StudyModel, VisitModel } from "@/lib/models";

/** Drops the client-side string id; Mongo assigns its own _id. */
function omitId<T extends { id: string }>(o: T): Omit<T, "id"> {
  const copy: Partial<T> = { ...o };
  delete copy.id;
  return copy as Omit<T, "id">;
}

/**
 * POST /api/dev/seed  (development only, not part of the LLD API)
 * Wipes the 4 collections and loads the same synthetic data the UI demo uses.
 * All people are fictional.
 */
export const POST = route(async () => {
  if (process.env.NODE_ENV === "production") throw new ApiError(404, "Not found.");

  const s = createInitialState(new Date());
  const patientIds = new Map(s.patients.map((p) => [p.id, new Types.ObjectId()]));
  const studyIds = new Map(s.studies.map((st) => [st.id, new Types.ObjectId()]));

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

  await PatientModel.insertMany(
    s.patients.map(({ id, dateOfBirth, ...p }) => ({
      _id: patientIds.get(id),
      ...p,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
    })),
  );
  await StudyModel.insertMany(s.studies.map(({ id, ...st }) => ({ _id: studyIds.get(id), ...st })));
  await VisitModel.insertMany(
    s.visits.map(({ patientId, checkedInAt, ...v }) => ({
      ...omitId(v),
      patientId: patientIds.get(patientId),
      checkedInAt: new Date(checkedInAt),
    })),
  );
  await StudyMatchModel.insertMany(
    s.matches.map(({ patientId, studyId, ...m }) => ({
      ...omitId(m),
      patientId: patientIds.get(patientId),
      studyId: studyIds.get(studyId),
    })),
  );

  return Response.json({
    patients: s.patients.length,
    visits: s.visits.length,
    studies: s.studies.length,
    matches: s.matches.length,
    studyId: String(studyIds.values().next().value),
  });
});
