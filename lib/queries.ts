"use client";

/**
 * TanStack Query hooks for every clinic endpoint.
 *
 * Query keys include the role because the API trims responses by role.
 * Mutations invalidate the lists they affect, so the board, call list and
 * review queue refresh after each handoff. The board also polls so staff see
 * each other's moves.
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { MatchOp, VisitOp } from "./operations";
import { useRole } from "./role";
import type {
  BoardVisit,
  Patient,
  PatientSummary,
  Role,
  ScreenResult,
  Study,
  StudyMatch,
  Visit,
  VisitDetail,
} from "./types";

// ---------- Fetch wrapper ----------

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Calls the clinic API with the selected role in `x-staff-role` and turns
 * `{ error }` responses into an ApiRequestError carrying that message.
 */
async function api<T>(
  path: string,
  { role, method = "GET", body }: { role: Role; method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      "x-staff-role": role,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiRequestError(res.status, data?.error ?? `Request failed (${res.status}).`);
  return data as T;
}

// ---------- Query keys (include the role: responses are trimmed per role) ----------

const queryKeys = {
  board: (role: Role | null) => ["visits", "board", role] as const,
  visit: (id: string | null, role: Role | null) => ["visits", "detail", id, role] as const,
  patients: (q: string, role: Role | null) => ["patients", q, role] as const,
  studies: (role: Role | null) => ["studies", role] as const,
  matches: (studyId: string | undefined, role: Role | null) => ["matches", studyId, role] as const,
};

// ---------- Queries ----------

/** GET /api/visits */
export function useBoard() {
  const role = useRole();
  return useQuery({
    queryKey: queryKeys.board(role),
    queryFn: () => api<{ visits: BoardVisit[] }>("/api/visits", { role: role! }).then((r) => r.visits),
    enabled: Boolean(role),
    refetchInterval: 15_000,
  });
}

/** GET /api/visits/:id */
export function useVisit(id: string | null) {
  const role = useRole();
  return useQuery({
    queryKey: queryKeys.visit(id, role),
    queryFn: () => api<VisitDetail>(`/api/visits/${id}`, { role: role! }),
    enabled: Boolean(role && id),
  });
}

/** GET /api/patients?q= */
export function usePatients(q: string) {
  const role = useRole();
  return useQuery({
    queryKey: queryKeys.patients(q, role),
    queryFn: () =>
      api<{ patients: PatientSummary[] }>(`/api/patients?q=${encodeURIComponent(q)}`, { role: role! }).then(
        (r) => r.patients,
      ),
    enabled: Boolean(role),
    placeholderData: keepPreviousData,
  });
}

/** GET /api/studies */
export function useStudies() {
  const role = useRole();
  return useQuery({
    queryKey: queryKeys.studies(role),
    queryFn: () => api<{ studies: Study[] }>("/api/studies", { role: role! }).then((r) => r.studies),
    enabled: Boolean(role),
    staleTime: 60_000,
  });
}

/** GET /api/studies/:id/matches — shape depends on role (DoctorMatch / ReceptionMatch). */
export function useMatches<T>(studyId: string | undefined) {
  const role = useRole();
  return useQuery({
    queryKey: queryKeys.matches(studyId, role),
    queryFn: () => api<{ matches: T[] }>(`/api/studies/${studyId}/matches`, { role: role! }).then((r) => r.matches),
    enabled: Boolean(studyId && (role === "doctor" || role === "reception")),
  });
}

// ---------- Mutations ----------

function useApiMutation<TVars, TData>(
  request: (vars: TVars, role: Role) => Promise<TData>,
  invalidate: QueryKey[],
  { toastErrors = true }: { toastErrors?: boolean } = {},
) {
  const role = useRole();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => request(vars, role ?? "reception"),
    onSuccess: () => Promise.all(invalidate.map((queryKey) => qc.invalidateQueries({ queryKey }))),
    onError: (err) => {
      if (toastErrors) toast.error(err.message);
    },
  });
}

/** POST /api/patients (errors shown inline in the form, not as a toast) */
export function useCreatePatient() {
  return useApiMutation(
    (body: { name: string; phone: string; dateOfBirth: string | null }, role) =>
      api<{ patient: Patient }>("/api/patients", { role, method: "POST", body }).then((r) => r.patient),
    [["patients"]],
    { toastErrors: false },
  );
}

/** POST /api/visits */
export function useCheckIn() {
  return useApiMutation(
    (body: { patientId: string; reason: string }, role) =>
      api<{ visit: Visit }>("/api/visits", { role, method: "POST", body }).then((r) => r.visit),
    [["visits"]],
  );
}

/** PATCH /api/visits/:id */
export function usePatchVisit() {
  return useApiMutation(
    ({ id, op }: { id: string; op: VisitOp }, role) =>
      api<{ visit: Visit }>(`/api/visits/${id}`, { role, method: "PATCH", body: op }).then((r) => r.visit),
    [["visits"]],
  );
}

/** POST /api/studies/:id/screen */
export function useRunScreening() {
  return useApiMutation(
    (studyId: string, role) => api<ScreenResult>(`/api/studies/${studyId}/screen`, { role, method: "POST" }),
    [["matches"], ["visits"]],
  );
}

/** PATCH /api/matches/:id */
export function usePatchMatch() {
  return useApiMutation(
    ({ id, op }: { id: string; op: MatchOp }, role) =>
      api<{ match: StudyMatch }>(`/api/matches/${id}`, { role, method: "PATCH", body: op }).then((r) => r.match),
    [["matches"], ["visits"]],
  );
}

/** POST /api/dev/seed: wipes and reloads the synthetic demo data */
export function useResetDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<unknown>("/api/dev/seed", { role: "reception", method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
    onError: (err) => toast.error(err.message),
  });
}
