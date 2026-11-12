/**
 * Synthetic seed data for POST /api/dev/seed. These are fictional people, not real patients.
 * Phone numbers use the UK range reserved for drama/fiction (07700 900xxx).
 *
 * Built relative to "today" so the board always shows today's visits. IDs are
 * readable keys (e.g. "p-maria"); the seed route maps them to ObjectIds.
 */
import { screenPatients } from "./study-matcher";
import type { Patient, Study, StudyMatch, Visit } from "./types";

const DIABETES_STUDY_ID = "study-diabetes";

function yearsAgo(today: Date, years: number): string {
  return `${today.getFullYear() - years}-03-15`;
}

function at(today: Date, daysAgo: number, hh: number, mm: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

const noFollowUp = { needed: false, weeks: null, booked: false };

function visit(v: Partial<Visit> & Pick<Visit, "id" | "patientId" | "reason" | "stage" | "checkedInAt">): Visit {
  return { vitals: null, doctorNotes: "", followUp: noFollowUp, testOrdered: false, ...v };
}

export function createSeedData(today: Date): {
  patients: Patient[];
  visits: Visit[];
  studies: Study[];
  matches: StudyMatch[];
} {
  const patients: Patient[] = [
    {
      id: "p-maria",
      name: "Maria Lopez",
      phone: "07700 900123",
      dateOfBirth: "1968-04-12",
      diagnoses: ["Type 2 diabetes mellitus (2015)", "Hypertension"],
      medications: ["Metformin 500 mg twice daily", "Ramipril 5 mg once daily"],
      allergies: ["Penicillin (rash)"],
    },
    {
      id: "p-james",
      name: "James Carter",
      phone: "07700 900456",
      dateOfBirth: "1985-09-03",
      diagnoses: ["Asthma"],
      medications: ["Salbutamol inhaler as needed"],
      allergies: [],
    },
    {
      id: "p-aisha",
      name: "Aisha Rahman",
      phone: "07700 900789",
      dateOfBirth: "1979-01-22",
      diagnoses: ["Prediabetes (HbA1c borderline)", "Hypothyroidism"],
      medications: ["Levothyroxine 50 mcg once daily"],
      allergies: [],
    },
    {
      id: "p-tom",
      name: "Tom Novak",
      phone: "07700 900321",
      dateOfBirth: null,
      diagnoses: ["T2DM"],
      medications: ["Metformin 1 g twice daily"],
      allergies: ["Ibuprofen"],
    },
    {
      id: "p-grace",
      name: "Grace Kim",
      phone: "07700 900654",
      dateOfBirth: "1992-06-30",
      diagnoses: ["Suspected diabetes, awaiting HbA1c"],
      medications: [],
      allergies: [],
    },
    {
      id: "p-leo",
      name: "Leo Fischer",
      phone: "07700 900987",
      dateOfBirth: yearsAgo(today, 15),
      diagnoses: ["Type 1 diabetes"],
      medications: ["Insulin glargine", "Insulin aspart with meals"],
      allergies: [],
    },
    {
      id: "p-hannah",
      name: "Hannah Brooks",
      phone: "07700 900135",
      dateOfBirth: "1990-11-08",
      diagnoses: ["Family history of diabetes", "Migraine"],
      medications: ["Sumatriptan 50 mg as needed"],
      allergies: ["Codeine"],
    },
    {
      id: "p-daniel",
      name: "Daniel Okafor",
      phone: "07700 900246",
      dateOfBirth: "1958-02-14",
      diagnoses: ["DM2", "Chronic kidney disease stage 3"],
      medications: ["Gliclazide 80 mg twice daily", "Atorvastatin 20 mg"],
      allergies: ["Sulfa drugs"],
    },
    {
      id: "p-priya",
      name: "Priya Shah",
      phone: "07700 900357",
      dateOfBirth: "1987-03-19",
      diagnoses: ["Gestational diabetes (2021)", "Iron-deficiency anaemia"],
      medications: ["Ferrous sulfate 200 mg"],
      allergies: [],
    },
    {
      id: "p-ewa",
      name: "Ewa Kowalska",
      phone: "07700 900468",
      dateOfBirth: "1975-07-07",
      diagnoses: ["Diabetes insipidus"],
      medications: ["Desmopressin"],
      allergies: [],
    },
    {
      id: "p-robert",
      name: "Robert Hughes",
      phone: "07700 900579",
      dateOfBirth: "1962-10-01",
      diagnoses: ["Type 2 diabetes", "Osteoarthritis (knees)"],
      medications: ["Metformin 500 mg twice daily", "Paracetamol as needed"],
      allergies: [],
    },
  ];

  const visits: Visit[] = [
    // --- Today, one or more per column ---
    visit({ id: "v-james", patientId: "p-james", reason: "Wheezing and cough for 3 days", stage: "checked_in", checkedInAt: at(today, 0, 9, 40) }),
    visit({ id: "v-priya", patientId: "p-priya", reason: "Feeling dizzy when standing up", stage: "checked_in", checkedInAt: at(today, 0, 9, 52) }),
    visit({ id: "v-grace", patientId: "p-grace", reason: "Tiredness, discuss blood test", stage: "with_nurse", checkedInAt: at(today, 0, 9, 20) }),
    visit({
      id: "v-maria",
      patientId: "p-maria",
      reason: "Blood sugar readings higher than usual",
      stage: "with_doctor",
      checkedInAt: at(today, 0, 8, 55),
      vitals: {
        bloodPressure: "142/88",
        weightKg: 82,
        temperatureC: 36.8,
        notes: "Reports increased thirst for 2 weeks. Home readings 9-11 mmol/L. Feet checked, no sores.",
      },
    }),
    visit({
      id: "v-daniel",
      patientId: "p-daniel",
      reason: "Kidney function review",
      stage: "checkout",
      checkedInAt: at(today, 0, 8, 30),
      vitals: { bloodPressure: "136/82", weightKg: 91, temperatureC: 36.6, notes: "Mild ankle swelling both sides." },
      doctorNotes: "eGFR stable. Ankle oedema mild. Repeat HbA1c and kidney bloods, review in 2 weeks.",
      followUp: { needed: true, weeks: 2, booked: false },
      testOrdered: true,
    }),
    visit({
      id: "v-hannah",
      patientId: "p-hannah",
      reason: "Migraine medication review",
      stage: "done",
      checkedInAt: at(today, 0, 8, 10),
      vitals: { bloodPressure: "118/76", weightKg: 64, temperatureC: 36.5, notes: "" },
      doctorNotes: "Migraines well controlled. Continue sumatriptan.",
    }),
    // --- Past visits (give the nurse previous vitals to compare) ---
    pastVisit("v-maria-old", "p-maria", at(today, 92, 10, 0), "Diabetes check", "138/86", 84, 36.7),
    pastVisit("v-maria-old2", "p-maria", at(today, 190, 11, 15), "Annual review", "135/85", 85, 36.6),
    pastVisit("v-daniel-old", "p-daniel", at(today, 44, 14, 20), "Blood pressure check", "144/90", 92, 36.7),
    pastVisit("v-grace-old", "p-grace", at(today, 360, 9, 30), "Sore throat", "112/70", 58, 37.4),
  ];

  // Same code path as the "Run screening" button.
  const matches = screenPatients(DIABETES_STUDY_ID, patients, [], today);

  // Pre-seed some decisions so every state shows up in the demo.
  const seed = (patientId: string, patch: Partial<StudyMatch>) => {
    const m = matches.find((x) => x.patientId === patientId);
    if (m) Object.assign(m, patch);
  };
  seed("p-daniel", { status: "confirmed", reviewedBy: "doctor" });
  seed("p-robert", { status: "confirmed", reviewedBy: "doctor", contactStatus: "reached", consent: "consented" });

  return {
    patients,
    visits,
    studies: [
      {
        id: DIABETES_STUDY_ID,
        name: "Adults with diabetes",
        description:
          "Adults (18+) with a documented diagnosis of diabetes. Prediabetes or a family history alone does not count.",
        active: true,
      },
    ],
    matches,
  };
}

function pastVisit(
  id: string,
  patientId: string,
  checkedInAt: string,
  reason: string,
  bloodPressure: string,
  weightKg: number,
  temperatureC: number,
): Visit {
  return visit({
    id,
    patientId,
    reason,
    stage: "done",
    checkedInAt,
    vitals: { bloodPressure, weightKg, temperatureC, notes: "" },
  });
}
