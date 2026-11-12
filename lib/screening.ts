/**
 * POST /api/studies/:id/screen, as a pure function.
 *
 * Runs the matcher over every patient and returns the study's new match list:
 * - flagged patients get a match (possible_match / needs_checking) with evidence;
 * - matches a doctor already confirmed or rejected are never overwritten;
 * - unreviewed matches that no longer apply are dropped.
 */
import { matchPatient } from "./study-matcher";
import type { Patient, StudyMatch } from "./types";

export function screenPatients(
  studyId: string,
  patients: Patient[],
  existing: StudyMatch[],
  today: Date,
): StudyMatch[] {
  const byPatient = new Map(
    existing.filter((m) => m.studyId === studyId).map((m) => [m.patientId, m]),
  );
  const result: StudyMatch[] = [];

  for (const p of patients) {
    const prev = byPatient.get(p.id);
    if (prev && (prev.status === "confirmed" || prev.status === "rejected")) {
      result.push(prev);
      continue;
    }
    const out = matchPatient({ dateOfBirth: p.dateOfBirth, conditions: p.diagnoses }, today);
    if (out.status === "no_match") continue;
    result.push({
      id: prev?.id ?? `m-${studyId}-${p.id}`,
      patientId: p.id,
      studyId,
      status: out.status,
      evidence: out.evidence,
      reason: out.reason,
      missingInfo: out.missingInfo,
      reviewedBy: null,
      contactStatus: "not_contacted",
      consent: "unknown",
    });
  }

  return [...existing.filter((m) => m.studyId !== studyId), ...result];
}
