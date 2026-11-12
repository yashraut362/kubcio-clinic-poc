"use client";

import { useState } from "react";
import Link from "next/link";
import { FlaskConical, UserPlus } from "lucide-react";
import { useBoard } from "@/lib/queries";
import { useRole } from "@/lib/role";
import { PageSkeleton } from "@/components/app-shell";
import { ROLE_LABEL, STAGES, followUpToBook, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BoardVisit } from "@/lib/types";
import type { Role } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FollowUpPill, Pill, QueryError, StudyFlagPill } from "@/components/status-badges";
import { VisitPanel } from "./visit-panel";

const ROLE_HINT: Record<Role, string> = {
  reception: "You check patients in from Patients, and finish checkout here.",
  nurse: "Pick up patients from Checked in, record vitals, then send them to the doctor.",
  doctor: "Patients the nurse has sent are in With doctor.",
};

export function VisitsBoard() {
  const role = useRole();
  const board = useBoard();
  const [openId, setOpenId] = useState<string | null>(null);

  if (!role) return <PageSkeleton />;

  const today = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today&apos;s visits</h1>
          <p className="text-sm text-muted-foreground">
            {today} · {ROLE_LABEL[role]}: {ROLE_HINT[role]}
          </p>
        </div>
        {role === "reception" && (
          <Link href="/patients" className={buttonVariants({ size: "sm" })}>
            <UserPlus aria-hidden />
            Check in a patient
          </Link>
        )}
      </div>

      {board.isError && <QueryError error={board.error} onRetry={() => board.refetch()} />}

      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="grid min-w-[1100px] grid-cols-5 gap-3">
          {STAGES.map((stage) => {
            const cards = (board.data ?? []).filter((v) => v.stage === stage.id);
            const yours = stage.owner === role;
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
                    {board.data && (
                      <span className="ml-1.5 text-muted-foreground tabular-nums">{cards.length}</span>
                    )}
                  </h2>
                  {yours && <Pill tone="neutral">Your step</Pill>}
                </header>
                <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
                  {board.isPending && (
                    <li>
                      <Skeleton className="h-20 w-full" />
                    </li>
                  )}
                  {cards.map((v) => (
                    <li key={v.id}>
                      <VisitCard visit={v} selected={v.id === openId} onOpen={() => setOpenId(v.id)} />
                    </li>
                  ))}
                  {board.data && cards.length === 0 && (
                    <li className="px-2 py-6 text-center text-xs text-muted-foreground">No patients</li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <VisitPanel visitId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function VisitCard({
  visit,
  selected,
  onOpen,
}: {
  visit: BoardVisit;
  selected: boolean;
  onOpen: () => void;
}) {
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
        <span className="font-medium">{visit.patient?.name ?? "Unknown patient"}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatTime(visit.checkedInAt)}
        </span>
      </div>
      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{visit.reason}</p>
      {(showFollowUp || testOrdered || visit.studyFlag) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {showFollowUp && <FollowUpPill weeks={visit.followUp.weeks} />}
          {testOrdered && (
            <Pill tone="neutral">
              <FlaskConical aria-hidden />
              Test ordered
            </Pill>
          )}
          <StudyFlagPill flag={visit.studyFlag} />
        </div>
      )}
    </button>
  );
}
