/**
 * API integration tests: real route handlers + real Mongoose models, against a
 * throwaway in-memory MongoDB that is reseeded before every test.
 * Run with: npm run test:api
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

// connection() only works inside a running Next server; everything else is real.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

import { POST as seed } from "@/app/api/dev/seed/route";
import { PATCH as patchMatch } from "@/app/api/matches/[id]/route";
import { GET as getPatients, POST as createPatient } from "@/app/api/patients/route";
import { GET as getMatches } from "@/app/api/studies/[id]/matches/route";
import { GET as getStudies } from "@/app/api/studies/route";
import { POST as screen } from "@/app/api/studies/[id]/screen/route";
import { GET as getVisit, PATCH as patchVisit } from "@/app/api/visits/[id]/route";
import { GET as getBoard, POST as checkIn } from "@/app/api/visits/route";

// ---------- harness ----------

type Ctx = { params: Promise<{ id: string }> };
type Handler = (req: NextRequest, ctx: Ctx) => Promise<Response>;
type Role = "reception" | "nurse" | "doctor";

/* eslint-disable @typescript-eslint/no-explicit-any -- response bodies are checked field by field */
async function call(
  handler: Handler,
  method: string,
  path: string,
  { role, body, raw, id }: { role?: Role; body?: unknown; raw?: string; id?: string } = {},
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (role) headers["x-staff-role"] = role;
  if (body !== undefined || raw !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest(new URL(path, "http://clinic.test"), {
    method,
    headers,
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const res = await handler(req, { params: Promise.resolve({ id: id ?? "" }) });
  return { status: res.status, json: await res.json() };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("clinic_test");
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(async () => {
  const r = await call(seed as Handler, "POST", "/api/dev/seed");
  expect(r.status).toBe(200);
});

const findPatient = async (q: string) =>
  (await call(getPatients as Handler, "GET", `/api/patients?q=${encodeURIComponent(q)}`, { role: "reception" })).json
    .patients[0];
const board = async (role: Role) => (await call(getBoard as Handler, "GET", "/api/visits", { role })).json.visits;
const visitOf = async (name: string, role: Role = "doctor") =>
  (await board(role)).find((v: { patient: { name: string } }) => v.patient.name === name);
const studyId = async () => (await call(getStudies as Handler, "GET", "/api/studies", { role: "doctor" })).json.studies[0].id;
const matches = async (role: Role) =>
  (await call(getMatches as Handler, "GET", "/api/studies/x/matches", { role, id: await studyId() })).json.matches;
const patch = (id: string, role: Role, body: unknown) =>
  call(patchVisit as Handler, "PATCH", `/api/visits/${id}`, { role, body, id });

// ---------- tests ----------

describe("roles are enforced on the server", () => {
  test("missing or unknown role header -> 401", async () => {
    expect((await call(getBoard as Handler, "GET", "/api/visits")).status).toBe(401);
    expect((await call(getBoard as Handler, "GET", "/api/visits", { role: "janitor" as Role })).status).toBe(401);
  });

  test("only reception creates patients and checks them in", async () => {
    const p = await findPatient("Novak");
    expect((await call(createPatient as Handler, "POST", "/api/patients", { role: "nurse", body: { name: "X", phone: "1" } })).status).toBe(403);
    expect((await call(checkIn as Handler, "POST", "/api/visits", { role: "doctor", body: { patientId: p.id, reason: "x" } })).status).toBe(403);
  });

  test("nurses can't see study matches; reception can't run screening", async () => {
    expect((await call(getMatches as Handler, "GET", "/x", { role: "nurse", id: await studyId() })).status).toBe(403);
    expect((await call(screen as Handler, "POST", "/x", { role: "reception", id: await studyId() })).status).toBe(403);
  });
});

describe("privacy: each role gets only what it needs", () => {
  test("patient search returns contact details only", async () => {
    const p = await findPatient("Lopez");
    expect(p).toEqual({ id: expect.any(String), name: "Maria Lopez", phone: "07700 900123", dateOfBirth: "1968-04-12" });
  });

  test("the board never includes vitals or notes", async () => {
    for (const v of await board("doctor")) {
      expect(v).not.toHaveProperty("vitals");
      expect(v).not.toHaveProperty("doctorNotes");
    }
  });

  test("reception sees only doctor-confirmed study flags; doctors see the evidence", async () => {
    const reception = await board("reception");
    expect(reception.every((v: { studyFlag: { status: string } | null }) => !v.studyFlag || v.studyFlag.status === "confirmed")).toBe(true);
    expect((await visitOf("Maria Lopez", "reception")).studyFlag).toBeNull();

    const maria = await visitOf("Maria Lopez", "doctor");
    expect(maria.studyFlag).toMatchObject({ status: "possible_match", evidence: "Type 2 diabetes mellitus (2015)" });
  });

  test("visit detail: reception gets no clinical data; doctor gets everything", async () => {
    const maria = await visitOf("Maria Lopez");
    const rec = (await call(getVisit as Handler, "GET", "/x", { role: "reception", id: maria.id })).json;
    expect(rec.visit).not.toHaveProperty("vitals");
    expect(rec.patient).not.toHaveProperty("diagnoses");
    expect(rec).not.toHaveProperty("previousVitals");

    const doc = (await call(getVisit as Handler, "GET", "/x", { role: "doctor", id: maria.id })).json;
    expect(doc.visit.vitals.bloodPressure).toBe("142/88");
    expect(doc.patient.allergies).toEqual(["Penicillin (rash)"]);
    expect(doc.previousVitals).toHaveLength(2);
  });

  test("reception's call list has phones but no clinical evidence", async () => {
    const list = await matches("reception");
    expect(list.map((m: { patient: { name: string } }) => m.patient.name).sort()).toEqual(["Daniel Okafor", "Robert Hughes"]);
    for (const m of list) {
      expect(m.status).toBe("confirmed");
      expect(m.patient.phone).toBeTruthy();
      expect(m).not.toHaveProperty("evidence");
    }
  });
});

describe("patients and check-in", () => {
  test("search by phone digits ignores spaces", async () => {
    expect((await findPatient("07700900456")).name).toBe("James Carter");
  });

  test("create a patient, then check them in", async () => {
    const created = await call(createPatient as Handler, "POST", "/api/patients", {
      role: "reception",
      body: { name: "Test Person", phone: "07700 900111", dateOfBirth: "1990-05-05" },
    });
    expect(created.status).toBe(201);
    expect(created.json.patient.dateOfBirth).toBe("1990-05-05");

    const visit = await call(checkIn as Handler, "POST", "/api/visits", {
      role: "reception",
      body: { patientId: created.json.patient.id, reason: "Headache" },
    });
    expect(visit.status).toBe(201);
    expect(visit.json.visit.stage).toBe("checked_in");
    expect(await visitOf("Test Person")).toBeTruthy();
  });

  test("duplicate phone (even with different spacing) -> 409", async () => {
    const r = await call(createPatient as Handler, "POST", "/api/patients", { role: "reception", body: { name: "Dup", phone: "07700900123" } });
    expect(r.status).toBe(409);
  });

  test("bad input -> 422 naming the field; bad JSON -> 400", async () => {
    const noName = await call(createPatient as Handler, "POST", "/api/patients", { role: "reception", body: { name: " ", phone: "1" } });
    expect(noName).toEqual({ status: 422, json: { error: "name: Name is required." } });
    const badDob = await call(createPatient as Handler, "POST", "/api/patients", { role: "reception", body: { name: "A", phone: "2", dateOfBirth: "12/03/1990" } });
    expect(badDob.status).toBe(422);
    const badJson = await call(createPatient as Handler, "POST", "/api/patients", { role: "reception", raw: "{oops" });
    expect(badJson.status).toBe(400);
  });

  test("checking in someone already here today -> 409; unknown patient -> 404", async () => {
    const james = await findPatient("James Carter");
    expect((await call(checkIn as Handler, "POST", "/api/visits", { role: "reception", body: { patientId: james.id, reason: "x" } })).status).toBe(409);
    const unknown = new mongoose.Types.ObjectId().toString();
    expect((await call(checkIn as Handler, "POST", "/api/visits", { role: "reception", body: { patientId: unknown, reason: "x" } })).status).toBe(404);
  });
});

describe("visit handoff", () => {
  test("check-in -> nurse -> doctor -> checkout -> done", async () => {
    const james = (await visitOf("James Carter")).id;

    expect((await patch(james, "nurse", { type: "start_nurse" })).json.visit.stage).toBe("with_nurse");
    const sent = await patch(james, "nurse", { type: "send_to_doctor", vitals: { bloodPressure: "130/85", weightKg: 80 } });
    expect(sent.json.visit).toMatchObject({ stage: "with_doctor", vitals: { bloodPressure: "130/85", weightKg: 80, temperatureC: null } });

    const toCheckout = await patch(james, "doctor", {
      type: "send_to_checkout",
      doctorNotes: "Review in 2 weeks.",
      followUp: { needed: true, weeks: 2 },
      testOrdered: true,
    });
    expect(toCheckout.json.visit).toMatchObject({ stage: "checkout", followUp: { needed: true, weeks: 2, booked: false } });

    expect((await patch(james, "reception", { type: "complete_checkout" })).status).toBe(409); // follow-up not booked
    expect((await patch(james, "reception", { type: "set_follow_up_booked", booked: true })).status).toBe(200);
    expect((await patch(james, "reception", { type: "complete_checkout" })).json.visit.stage).toBe("done");
  });

  test("wrong role -> 403, wrong stage -> 409, unknown op -> 422, unknown visit -> 404", async () => {
    const james = (await visitOf("James Carter")).id;
    expect((await patch(james, "doctor", { type: "start_nurse" })).status).toBe(403);
    expect((await patch(james, "nurse", { type: "send_to_doctor", vitals: {} })).status).toBe(409);
    expect((await patch(james, "nurse", { type: "dance" })).status).toBe(422);
    const unknown = new mongoose.Types.ObjectId().toString();
    expect((await patch(unknown, "nurse", { type: "start_nurse" })).status).toBe(404);
    expect((await patch("not-an-id", "nurse", { type: "start_nurse" })).status).toBe(400);
  });

  test("two staff acting at once: one wins, the other gets 409", async () => {
    const james = (await visitOf("James Carter")).id;
    const results = await Promise.all([
      patch(james, "nurse", { type: "start_nurse" }),
      patch(james, "nurse", { type: "start_nurse" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});

describe("study matching", () => {
  test("seeded matches have the expected statuses", async () => {
    const byName = Object.fromEntries(
      (await matches("doctor")).map((m: { patient: { name: string }; status: string }) => [m.patient.name, m.status]),
    );
    expect(byName).toEqual({
      "Maria Lopez": "possible_match",
      "Tom Novak": "needs_checking",
      "Grace Kim": "needs_checking",
      "Priya Shah": "needs_checking",
      "Daniel Okafor": "confirmed",
      "Robert Hughes": "confirmed",
    });
  });

  test("screening keeps reviewed matches and is safe to repeat", async () => {
    const id = await studyId();
    for (let i = 0; i < 2; i++) {
      const r = await call(screen as Handler, "POST", "/x", { role: "doctor", id });
      expect(r.json).toEqual({ screened: 11, awaitingReview: 4, reviewed: 2, removed: 0 });
    }
  });

  test("doctor confirms -> reception calls -> consent recorded only when given", async () => {
    const tom = (await matches("doctor")).find((m: { patient: { name: string } }) => m.patient.name === "Tom Novak");
    const pm = (role: Role, body: unknown) => call(patchMatch as Handler, "PATCH", "/x", { role, body, id: tom.id });

    expect((await pm("reception", { type: "record_contact", contactStatus: "reached", consent: "consented" })).status).toBe(409); // not confirmed yet
    expect((await pm("reception", { type: "review", decision: "confirmed" })).status).toBe(403);

    const confirmed = await pm("doctor", { type: "review", decision: "confirmed" });
    expect(confirmed.json.match).toMatchObject({ status: "confirmed", reviewedBy: "doctor", contactStatus: "not_contacted", consent: "unknown" });
    expect((await pm("doctor", { type: "review", decision: "rejected" })).status).toBe(409); // already reviewed

    const missed = await pm("reception", { type: "record_contact", contactStatus: "not_reached" });
    expect(missed.json.match).toMatchObject({ contactStatus: "not_reached", consent: "unknown" });
    expect((await pm("reception", { type: "record_contact", contactStatus: "reached", consent: "unknown" })).status).toBe(422);

    const consented = await pm("reception", { type: "record_contact", contactStatus: "reached", consent: "consented" });
    expect(consented.json.match).toMatchObject({ contactStatus: "reached", consent: "consented" });

    // A later missed call doesn't undo it, and the call list shows the result.
    await pm("reception", { type: "record_contact", contactStatus: "not_reached" });
    const onList = (await matches("reception")).find((m: { patient: { name: string } }) => m.patient.name === "Tom Novak");
    expect(onList).toMatchObject({ contactStatus: "reached", consent: "consented" });
  });
});
