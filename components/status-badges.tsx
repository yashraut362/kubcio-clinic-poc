import { CalendarClock, FlaskConical, Phone, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONSENT_LABEL, CONTACT_LABEL } from "@/lib/format";
import type { Consent, ContactStatus, Role, StudyMatch } from "@/lib/types";

const base =
  "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap [&>svg]:size-3";

export const TONE = {
  neutral: "border-border bg-muted text-muted-foreground",
  blue: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  amber: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  violet: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200",
  green: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  red: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200",
} as const;

export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: keyof typeof TONE;
  className?: string;
  children: React.ReactNode;
}) {
  return <span className={cn(base, TONE[tone], className)}>{children}</span>;
}

/**
 * Study flag on a visit card / panel.
 * Doctors see unreviewed flags; everyone else only sees a flag once a doctor confirmed it.
 */
export function studyFlag(match: StudyMatch | undefined, role: Role) {
  if (!match || match.status === "rejected") return null;
  if (match.status === "confirmed") return { label: "Study: doctor-confirmed", tone: "violet" as const };
  if (role !== "doctor") return null;
  return match.status === "needs_checking"
    ? { label: "Study: needs checking", tone: "amber" as const }
    : { label: "Study: possible match", tone: "blue" as const };
}

export function StudyFlagPill({ match, role }: { match: StudyMatch | undefined; role: Role }) {
  const flag = studyFlag(match, role);
  if (!flag) return null;
  return (
    <Pill tone={flag.tone}>
      <FlaskConical aria-hidden />
      {flag.label}
    </Pill>
  );
}

export function MatchStatusPill({ match }: { match: StudyMatch }) {
  switch (match.status) {
    case "needs_checking":
      return <Pill tone="amber">Needs checking</Pill>;
    case "possible_match":
      return <Pill tone="blue">Possible match</Pill>;
    case "confirmed":
      return <Pill tone="violet">Doctor-confirmed</Pill>;
    case "rejected":
      return <Pill tone="neutral">Rejected</Pill>;
  }
}

export function FollowUpPill({ weeks }: { weeks: number | null }) {
  return (
    <Pill tone="amber">
      <CalendarClock aria-hidden />
      Follow-up to book{weeks ? ` (${weeks} wk)` : ""}
    </Pill>
  );
}

export function ContactPill({ status }: { status: ContactStatus }) {
  const Icon = status === "reached" ? Phone : PhoneOff;
  const tone = status === "reached" ? "green" : status === "not_reached" ? "amber" : "neutral";
  return (
    <Pill tone={tone}>
      <Icon aria-hidden />
      {CONTACT_LABEL[status]}
    </Pill>
  );
}

export function ConsentPill({ consent }: { consent: Consent }) {
  const tone =
    consent === "consented" ? "green" : consent === "declined" ? "red" : consent === "undecided" ? "amber" : "neutral";
  return <Pill tone={tone}>Consent: {CONSENT_LABEL[consent]}</Pill>;
}
