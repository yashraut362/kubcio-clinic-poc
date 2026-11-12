"use client";

/**
 * In-memory clinic store for the prototype (no backend yet).
 *
 * Each exported action stands in for one API endpoint from the LLD, and
 * returns `{ ok, error }` like the API would. Validation lives in
 * `operations.ts` so the real route handlers can reuse it.
 *
 * State is created lazily on the client because the demo data is built
 * relative to "now", and Cache Components does not allow reading the current
 * time during server prerendering. On the server the snapshot is `null`.
 * It is kept in sessionStorage so a reload doesn't wipe the demo.
 */
import { useSyncExternalStore } from "react";
import { createInitialState } from "./mock-data";
import { applyMatchOp, applyVisitOp, type MatchOp, type Result, type VisitOp } from "./operations";
import { screenPatients } from "./screening";
import type { ClinicState, Patient, Role, Visit } from "./types";

let state: ClinicState | null = null;
const listeners = new Set<() => void>();
const STORAGE_KEY = "clinic-poc-state-v2";

function load(): ClinicState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ClinicState) : null;
  } catch {
    return null;
  }
}

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode, quota): the demo still works in memory.
  }
}

function getSnapshot(): ClinicState {
  state ??= load() ?? createInitialState(new Date());
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(update: (s: ClinicState) => ClinicState) {
  state = update(getSnapshot());
  persist();
  listeners.forEach((l) => l());
}

/** Returns the clinic state, or null during server render / before hydration. */
export function useClinic(): ClinicState | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

const digitsOnly = (s: string) => s.replace(/\D/g, "");

// ---------- Actions (one per endpoint) ----------

export function setRole(role: Role) {
  setState((s) => ({ ...s, role }));
}

export function resetDemo() {
  const role = getSnapshot().role;
  setState(() => ({ ...createInitialState(new Date()), role }));
}

/** POST /api/patients */
export function createPatient(input: {
  name: string;
  phone: string;
  dateOfBirth: string | null;
}): Result<Patient> {
  const s = getSnapshot();
  if (s.role !== "reception") return { ok: false, error: "Only reception can add patients." };
  if (!input.name.trim() || !input.phone.trim()) return { ok: false, error: "Name and phone are required." };
  if (s.patients.some((p) => digitsOnly(p.phone) === digitsOnly(input.phone))) {
    return { ok: false, error: "A patient with this phone number already exists." };
  }
  const patient: Patient = {
    id: `p-${Date.now()}`,
    name: input.name.trim(),
    phone: input.phone.trim(),
    dateOfBirth: input.dateOfBirth || null,
    diagnoses: [],
    medications: [],
    allergies: [],
  };
  setState((st) => ({ ...st, patients: [...st.patients, patient] }));
  return { ok: true, value: patient };
}

/** POST /api/visits (check in) */
export function checkIn(patientId: string, reason: string): Result<Visit> {
  const s = getSnapshot();
  if (s.role !== "reception") return { ok: false, error: "Only reception can check patients in." };
  if (!reason.trim()) return { ok: false, error: "Enter a reason for the visit." };
  const visit: Visit = {
    id: `v-${Date.now()}`,
    patientId,
    reason: reason.trim(),
    stage: "checked_in",
    vitals: null,
    doctorNotes: "",
    followUp: { needed: false, weeks: null, booked: false },
    testOrdered: false,
    checkedInAt: new Date().toISOString(),
  };
  setState((st) => ({ ...st, visits: [...st.visits, visit] }));
  return { ok: true, value: visit };
}

/** PATCH /api/visits/:id */
export function patchVisit(visitId: string, op: VisitOp): Result<Visit> {
  const s = getSnapshot();
  const visit = s.visits.find((v) => v.id === visitId);
  if (!visit) return { ok: false, error: "Visit not found." };
  const res = applyVisitOp(s.role, visit, op);
  if (res.ok) {
    setState((st) => ({ ...st, visits: st.visits.map((v) => (v.id === visitId ? res.value : v)) }));
  }
  return res;
}

/** POST /api/studies/:id/screen */
export function runScreening(studyId: string): Result<number> {
  const s = getSnapshot();
  if (s.role !== "doctor") return { ok: false, error: "Only a doctor can run screening." };
  const matches = screenPatients(studyId, s.patients, s.matches, new Date());
  setState((st) => ({ ...st, matches }));
  const waiting = matches.filter(
    (m) => m.studyId === studyId && (m.status === "possible_match" || m.status === "needs_checking"),
  ).length;
  return { ok: true, value: waiting };
}

/** PATCH /api/matches/:id */
export function patchMatch(matchId: string, op: MatchOp) {
  const s = getSnapshot();
  const match = s.matches.find((m) => m.id === matchId);
  if (!match) return { ok: false as const, error: "Match not found." };
  const res = applyMatchOp(s.role, match, op);
  if (res.ok) {
    setState((st) => ({ ...st, matches: st.matches.map((m) => (m.id === matchId ? res.value : m)) }));
  }
  return res;
}
