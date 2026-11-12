/**
 * Diabetes study matcher.
 *
 * Reads a patient's free-text conditions and date of birth and returns one of
 * three results with a plain-language reason and the text it based that on.
 * It never decides eligibility: a "possible_match" still needs a doctor to
 * check it, and a match is never consent.
 *
 * Rules (first applicable wins):
 *   1. No mention of diabetes in conditions            -> no_match
 *   2. Only prediabetes / family history / "no diabetes"
 *      / diabetes insipidus                            -> no_match
 *   3. Under 18                                        -> no_match
 *   4. Missing date of birth                           -> needs_checking ("age unknown")
 *   5. Suspected / possible / borderline / gestational -> needs_checking
 *   6. Diabetes, type 1/2, T1DM, T2DM, DM2             -> possible_match
 *   (fallback) diabetes mentioned but wording unclear  -> needs_checking
 *
 * Matching is whole-word and case-insensitive, so "prediabetes" never counts as
 * "diabetes" and "DM2" inside another word (e.g. "ADM2") is ignored.
 *
 * This file has no imports so it can be unit-tested with plain `node --test`
 * and reused unchanged by the backend later.
 */

export type MatchStatus = "no_match" | "needs_checking" | "possible_match";

export interface MatchInput {
  /** ISO date "YYYY-MM-DD", or null when not recorded. */
  dateOfBirth: string | null;
  /** Free-text conditions / diagnoses, one entry per item. */
  conditions: string[];
}

export interface MatchOutcome {
  status: MatchStatus;
  /** One plain-language sentence explaining the result. */
  reason: string;
  /** The condition text the result is based on (verbatim, "; "-separated). */
  evidence: string;
  /** Information that has to be checked before the match can be trusted. */
  missingInfo: string[];
}

export const STUDY_MIN_AGE = 18;

// Whole-word helper: the term may not be glued to letters or digits on either side.
const word = (pattern: string) =>
  new RegExp(`(?<![A-Za-z0-9])(?:${pattern})(?![A-Za-z0-9])`, "i");
const wordGlobal = (pattern: string) =>
  new RegExp(`(?<![A-Za-z0-9])(?:${pattern})(?![A-Za-z0-9])`, "gi");

/** Anything that talks about diabetes at all (used by rules 1 and 2). */
const MENTION = word("pre[-\\s]?diabet(?:es|ic)|diabet(?:es|ic)|t1dm|t2dm|dm2");

/** Phrases that mention diabetes but are NOT a diabetes diagnosis (rule 2). */
const EXCLUDED_PHRASES: { label: string; pattern: RegExp }[] = [
  { label: "prediabetes", pattern: wordGlobal("pre[-\\s]?diabet(?:es|ic)") },
  {
    label: "family history",
    pattern: wordGlobal("(?:family history|fhx?)(?:\\s+of)?[^;,.()]*"),
  },
  {
    label: '"no diabetes"',
    pattern: wordGlobal(
      "(?:no|denies|without|negative for)\\s+(?:known\\s+)?(?:history\\s+of\\s+)?diabet(?:es|ic)",
    ),
  },
  { label: "diabetes insipidus", pattern: wordGlobal("diabetes\\s+insipidus") },
];

/** Wording that makes a diagnosis uncertain (rule 5). "?" counts too, e.g. "?diabetes". */
const UNCERTAIN = word(
  "suspected|suspect|possible|possibly|probable|borderline|gestational|query",
);

/** A clearly documented diabetes diagnosis (rule 6). */
const DEFINITE = word("diabetes|t1dm|t2dm|dm2");

function stripExcluded(text: string): { rest: string; hits: string[] } {
  let rest = text;
  const hits: string[] = [];
  for (const { label, pattern } of EXCLUDED_PHRASES) {
    if (pattern.test(rest)) hits.push(label);
    pattern.lastIndex = 0;
    rest = rest.replace(pattern, " ");
  }
  return { rest, hits };
}

/** Whole years between dateOfBirth and today, or null if the date is unusable. */
export function ageOn(dateOfBirth: string | null, today: Date): number | null {
  if (!dateOfBirth) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let age = today.getFullYear() - y;
  const beforeBirthday =
    today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

function list(items: string[]): string {
  const quoted = items.map((t) => `"${t}"`);
  if (quoted.length <= 1) return quoted.join("");
  return `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
}

export function matchPatient(input: MatchInput, today: Date): MatchOutcome {
  const conditions = input.conditions.map((c) => c.trim()).filter(Boolean);

  // Rule 1: nothing about diabetes at all.
  const mentions = conditions.filter((c) => MENTION.test(c));
  if (mentions.length === 0) {
    return {
      status: "no_match",
      reason: "No diabetes is recorded in the patient's conditions.",
      evidence: "",
      missingInfo: [],
    };
  }

  // Rule 2: every mention is prediabetes, family history, a negation or insipidus.
  const excludedKinds = new Set<string>();
  const relevant = mentions.filter((c) => {
    const { rest, hits } = stripExcluded(c);
    hits.forEach((h) => excludedKinds.add(h));
    return MENTION.test(rest);
  });
  if (relevant.length === 0) {
    return {
      status: "no_match",
      reason: `Only ${[...excludedKinds].join(" / ")} is recorded, which is not a documented diabetes diagnosis.`,
      evidence: mentions.join("; "),
      missingInfo: [],
    };
  }

  // Rule 3: known to be under 18.
  const age = ageOn(input.dateOfBirth, today);
  if (age !== null && age < STUDY_MIN_AGE) {
    return {
      status: "no_match",
      reason: `Patient is ${age}, under the study's minimum age of ${STUDY_MIN_AGE}.`,
      evidence: relevant.join("; "),
      missingInfo: [],
    };
  }

  // Rule 4: age unknown.
  if (age === null) {
    return {
      status: "needs_checking",
      reason: `Diabetes is recorded (${list(relevant)}), but age is unknown because the date of birth is missing.`,
      evidence: relevant.join("; "),
      missingInfo: ["Date of birth (age unknown)"],
    };
  }

  // Rule 5: the diagnosis itself is uncertain. Takes precedence over rule 6.
  const uncertain = relevant.filter((c) => {
    const { rest } = stripExcluded(c);
    return UNCERTAIN.test(rest) || rest.includes("?");
  });
  if (uncertain.length > 0) {
    return {
      status: "needs_checking",
      reason: `Diabetes is recorded as uncertain or pregnancy-related (${list(uncertain)}), so the diagnosis needs confirming.`,
      evidence: uncertain.join("; "),
      missingInfo: ["Confirmed diabetes diagnosis"],
    };
  }

  // Rule 6: documented diagnosis.
  const definite = relevant.filter((c) => DEFINITE.test(stripExcluded(c).rest));
  if (definite.length > 0) {
    return {
      status: "possible_match",
      reason: `Adult (age ${age}) with diabetes documented in conditions: ${list(definite)}.`,
      evidence: definite.join("; "),
      missingInfo: [],
    };
  }

  // Fallback: talks about diabetes (e.g. "diabetic retinopathy") without stating the diagnosis.
  return {
    status: "needs_checking",
    reason: `Conditions mention diabetes (${list(relevant)}) but don't clearly state a diagnosis.`,
    evidence: relevant.join("; "),
    missingInfo: ["Confirmed diabetes diagnosis"],
  };
}
