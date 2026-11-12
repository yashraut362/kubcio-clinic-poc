// Run with: npm run test  (uses Node's built-in test runner + TypeScript stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import { ageOn, matchPatient, type MatchInput } from "./study-matcher.ts";

const TODAY = new Date(2026, 10, 12); // 12 Nov 2026
const ADULT_DOB = "1970-05-01";

const run = (conditions: string[], dateOfBirth: string | null = ADULT_DOB) =>
  matchPatient({ conditions, dateOfBirth } satisfies MatchInput, TODAY);

test("rule 1: no mention of diabetes is no match", () => {
  const out = run(["Hypertension", "Asthma"]);
  assert.equal(out.status, "no_match");
  assert.equal(out.evidence, "");
});

test("rule 1: missing DOB alone never makes a patient need checking", () => {
  assert.equal(run(["Asthma"], null).status, "no_match");
  assert.equal(run([], null).status, "no_match");
});

test("rule 2: prediabetes (any spelling) never counts as diabetes", () => {
  for (const c of ["Prediabetes", "pre-diabetes", "Pre diabetes", "PREDIABETIC"]) {
    assert.equal(run([c]).status, "no_match", c);
  }
});

test("rule 2: family history, negation and insipidus are no match", () => {
  assert.equal(run(["Family history of diabetes"]).status, "no_match");
  assert.equal(run(["FHx diabetes (mother)"]).status, "no_match");
  assert.equal(run(["No diabetes"]).status, "no_match");
  assert.equal(run(["Denies known diabetes"]).status, "no_match");
  assert.equal(run(["Diabetes insipidus"]).status, "no_match");
  assert.match(run(["Prediabetes"]).reason, /prediabetes/);
});

test("rule 2 does not hide a real diagnosis recorded alongside", () => {
  const out = run(["Family history of diabetes", "Type 2 diabetes"]);
  assert.equal(out.status, "possible_match");
  assert.equal(out.evidence, "Type 2 diabetes");
});

test("rule 3: under 18 is no match, 18 on the day is allowed", () => {
  assert.equal(run(["Type 1 diabetes"], "2010-01-01").status, "no_match");
  assert.equal(run(["Type 1 diabetes"], "2008-11-13").status, "no_match"); // 17, birthday tomorrow
  assert.equal(run(["Type 1 diabetes"], "2008-11-12").status, "possible_match"); // 18 today
});

test("rule 4: missing or invalid DOB with diabetes needs checking", () => {
  for (const dob of [null, "", "12/03/1970", "1970-13-40"]) {
    const out = run(["T2DM"], dob);
    assert.equal(out.status, "needs_checking", String(dob));
    assert.match(out.reason, /age is unknown/);
  }
});

test("rule 5: uncertain or gestational diabetes needs checking", () => {
  for (const c of [
    "Suspected diabetes",
    "Possible type 2 diabetes",
    "Borderline diabetes",
    "Gestational diabetes (2021)",
    "?diabetes",
    "Query T2DM",
  ]) {
    assert.equal(run([c]).status, "needs_checking", c);
  }
});

test("rule 5 takes precedence over a documented diagnosis", () => {
  const out = run(["Type 2 diabetes", "Gestational diabetes 2019"]);
  assert.equal(out.status, "needs_checking");
  assert.equal(out.evidence, "Gestational diabetes 2019");
});

test("rule 6: documented diabetes is a possible match with evidence", () => {
  for (const c of [
    "Diabetes",
    "Type 1 diabetes",
    "type 2 diabetes mellitus",
    "T1DM",
    "t2dm",
    "DM2",
    "TYPE 2 DIABETES",
  ]) {
    const out = run([c, "Hypertension"]);
    assert.equal(out.status, "possible_match", c);
    assert.equal(out.evidence, c);
  }
});

test("whole-word only: DM inside another word does not match", () => {
  assert.equal(run(["ADM2 deficiency"]).status, "no_match");
  assert.equal(run(["Admission note"]).status, "no_match");
  assert.equal(run(["DM2x"]).status, "no_match");
});

test("diabetes mentioned without a clear diagnosis needs checking", () => {
  assert.equal(run(["Diabetic retinopathy"]).status, "needs_checking");
});

test("results never say eligible", () => {
  const all = [
    run(["Type 2 diabetes"]),
    run(["Suspected diabetes"]),
    run(["Asthma"]),
    run(["T2DM"], null),
  ];
  for (const out of all) {
    assert.ok(["no_match", "needs_checking", "possible_match"].includes(out.status));
    assert.doesNotMatch(out.reason, /eligib/i);
  }
});

test("ageOn handles birthdays correctly", () => {
  assert.equal(ageOn("2000-11-12", TODAY), 26);
  assert.equal(ageOn("2000-11-13", TODAY), 25);
  assert.equal(ageOn(null, TODAY), null);
});
