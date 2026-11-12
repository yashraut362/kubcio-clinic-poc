"use client";

import { useState } from "react";
import Link from "next/link";
import { FlaskConical, UserPlus } from "lucide-react";
import { useClinic } from "@/lib/clinic-store";
import { PageSkeleton } from "@/components/app-shell";
import {
  ROLE_LABEL,
  STAGES,
  formatTime,
  followUpToBook,
  matchFor,
  patientOf,
  todaysVisits,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ClinicState, Role, Visit } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { FollowUpPill, Pill, StudyFlagPill } from "@/components/status-badges";
import { VisitPanel } from "./visit-panel";

const ROLE_HINT: Record<Role, string> = {
  reception: "You check patients in from Patients, and finish checkout here.",
  nurse: "Pick up patients from Checked in, record vitals, then send them to the doctor.",
  doctor: "Patients the nurse has sent are in With doctor.",
};

export function VisitsBoard() {
  const clinic = useClinic();
  const [openId, setOpenId] = useState<string | null>(null);

  if (!clinic) return <PageSkeleton />;

  const visits = todaysVisits(clinic).sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt));
  const open = visits.find((v) => v.id === openId) ?? null;
  const today = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today&apos;s visits</h1>
          <p className="text-sm text-muted-foreground">
            {today} · {ROLE_LABEL[clinic.role]}: {ROLE_HINT[clinic.role]}
          </p>
        </div>
        {clinic.role === "reception" && (
          <Link href="/patients" className={buttonVariants({ size: "sm" })}>
            <UserPlus aria-hidden />
            Check in a patient
          </Link>
        )}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="grid min-w-[1100px] grid-cols-5 gap-3">
          {STAGES.map((stage) => {
            const cards = visits.filter((v) => v.stage === stage.id);
            const yours = stage.owner === clinic.role;
            return (
              <section
                key={stage.id}
                aria-labelledby={`col-${stage.id}`}
                className={cn(
                  "flex min-h-[420px] flex-col rounded-xl border bg-muted/40",
                  yours && "border-foreground/25 bg-muted/80",
                )}
              >
                <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
                  <h2 id={`col-${stage.id}`} className="text-sm font-medium">
                    {stage.label}
                    <span className="ml-1.5 text-muted-foreground tabular-nums">{cards.length}</span>
                  </h2>
                  {yours && <Pill tone="neutral">Your step</Pill>}
                </header>
                <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
                  {cards.map((v) => (
                    <li key={v.id}>
                      <VisitCard
                        clinic={clinic}
                        visit={v}
                        selected={v.id === openId}
                        onOpen={() => setOpenId(v.id)}
                      />
                    </li>
                  ))}
                  {cards.length === 0 && (
                    <li className="px-2 py-6 text-center text-xs text-muted-foreground">No patients</li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <VisitPanel clinic={clinic} visit={open} onClose={() => setOpenId(null)} />
    </div>
  );
}

function VisitCard({
  clinic,
  visit,
  selected,
  onOpen,
}: {
  clinic: ClinicState;
  visit: Visit;
  selected: boolean;
  onOpen: () => void;
}) {
  const patient = patientOf(clinic, visit.patientId);
  const match = matchFor(clinic, patient.id);
  const showFollowUp = followUpToBook(visit);
  const testOrdered = visit.testOrdered && visit.stage !== "done";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full rounded-lg border bg-card p-3 text-left shadow-xs transition hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        selected && "border-foreground/50",
        visit.stage === "done" && "opacity-70",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{patient.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatTime(visit.checkedInAt)}
        </span>
      </div>
      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{visit.reason}</p>
      {(showFollowUp || testOrdered || match) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {showFollowUp && <FollowUpPill weeks={visit.followUp.weeks} />}
          {testOrdered && (
            <Pill tone="neutral">
              <FlaskConical aria-hidden />
              Test ordered
            </Pill>
          )}
          <StudyFlagPill match={match} role={clinic.role} />
        </div>
      )}
    </button>
  );
}
