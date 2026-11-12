"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Info, Phone, PhoneCall, RefreshCw, X } from "lucide-react";
import { useMatches, usePatchMatch, useRunScreening, useStudies } from "@/lib/queries";
import { useRole } from "@/lib/role";
import { PageSkeleton } from "@/components/app-shell";
import { CONSENT_LABEL, ROLE_LABEL, ageLabel, awaitingReview, digits, needsCall } from "@/lib/format";
import type { DoctorMatch, ReceptionMatch, Study } from "@/lib/types";
import type { Consent } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConsentPill, ContactPill, MatchStatusPill, QueryError } from "@/components/status-badges";

export function StudiesScreen() {
  const role = useRole();
  const studies = useStudies();

  if (!role || studies.isPending) return <PageSkeleton />;
  if (studies.isError) return <QueryError error={studies.error} onRetry={() => studies.refetch()} />;

  const study = studies.data.find((s) => s.active) ?? studies.data[0];
  if (!study) {
    return <Empty text="No studies yet. Use “Reset demo data” in the footer to load the example study." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Study: {study.name}</h1>
          <p className="text-sm text-muted-foreground">{study.description}</p>
        </div>
        {role === "doctor" && <RunScreeningButton study={study} />}
      </div>

      <Alert>
        <Info aria-hidden />
        <AlertTitle>A flag is a suggestion, not eligibility or consent</AlertTitle>
        <AlertDescription>
          Screening flags records that mention diabetes. A doctor checks each one against the study
          criteria. Reception only calls doctor-confirmed patients, and consent is recorded only
          when the patient gives it.
        </AlertDescription>
      </Alert>

      {role === "doctor" && <DoctorReview studyId={study.id} />}
      {role === "reception" && <CallList studyId={study.id} />}
      {role === "nurse" && (
        <Empty text="Doctors review study matches and reception makes the calls. Switch to Doctor or Reception to see those views." />
      )}
    </div>
  );
}

/** POST /api/studies/:id/screen */
function RunScreeningButton({ study }: { study: Study }) {
  const screen = useRunScreening();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={screen.isPending || !study.active}
      onClick={() =>
        screen.mutate(study.id, {
          onSuccess: (r) => toast.success(`Screened ${r.screened} patients: ${r.awaitingReview} waiting for review`),
        })
      }
    >
      <RefreshCw aria-hidden className={screen.isPending ? "animate-spin" : undefined} />
      {screen.isPending ? "Screening…" : "Run screening"}
    </Button>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

// ---------------------------------------------------------------- Doctor

function DoctorReview({ studyId }: { studyId: string }) {
  const matches = useMatches<DoctorMatch>(studyId);
  if (matches.isPending) return <ListSkeleton />;
  if (matches.isError) return <QueryError error={matches.error} onRetry={() => matches.refetch()} />;

  const pending = matches.data
    .filter(awaitingReview)
    // Possible matches first, then the ones needing a check.
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "possible_match" ? -1 : 1));
  const reviewed = matches.data.filter((m) => !awaitingReview(m));

  return (
    <Tabs defaultValue="pending">
      <TabsList>
        <TabsTrigger value="pending">To review ({pending.length})</TabsTrigger>
        <TabsTrigger value="reviewed">Reviewed ({reviewed.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="pending" className="mt-4 space-y-3">
        {pending.length === 0 && <Empty text="Nothing waiting for review. Run screening to check for new matches." />}
        {pending.map((m) => (
          <ReviewCard key={m.id} match={m} />
        ))}
      </TabsContent>

      <TabsContent value="reviewed" className="mt-4 space-y-3">
        {reviewed.length === 0 && <Empty text="No reviews yet." />}
        {reviewed.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.patient.name}</span>
                <MatchStatusPill status={m.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {m.evidence ? `“${m.evidence}”` : m.reason}
                {m.reviewedBy && ` · reviewed by ${ROLE_LABEL[m.reviewedBy].toLowerCase()}`}
              </p>
            </div>
            {m.status === "confirmed" && (
              <div className="flex flex-wrap gap-1.5">
                <ContactPill status={m.contactStatus} />
                <ConsentPill consent={m.consent} />
              </div>
            )}
          </div>
        ))}
      </TabsContent>
    </Tabs>
  );
}

function ReviewCard({ match }: { match: DoctorMatch }) {
  const patch = usePatchMatch();
  const needsChecking = match.status === "needs_checking";

  const review = (decision: "confirmed" | "rejected") =>
    patch.mutate(
      { id: match.id, op: { type: "review", decision } },
      {
        onSuccess: () =>
          toast.success(
            decision === "confirmed"
              ? `${match.patient.name} confirmed and added to reception's call list`
              : `${match.patient.name} rejected for this study`,
          ),
      },
    );

  return (
    <article
      className={
        needsChecking
          ? "space-y-3 rounded-xl border border-amber-300 bg-amber-50/40 p-4 dark:border-amber-800 dark:bg-amber-950/20"
          : "space-y-3 rounded-xl border p-4"
      }
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{match.patient.name}</h3>
        <span className="text-sm text-muted-foreground">{ageLabel(match.patient.age)}</span>
        <MatchStatusPill status={match.status} />
      </header>

      <p className="text-sm">{match.reason}</p>

      {match.evidence && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Found in the record</p>
          <p className="w-fit rounded bg-muted px-2 py-1 font-mono text-xs">“{match.evidence}”</p>
        </div>
      )}

      {match.missingInfo.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-200">Check before confirming</p>
          <ul className="list-inside list-disc text-sm text-amber-900 dark:text-amber-200">
            {match.missingInfo.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={patch.isPending} onClick={() => review("confirmed")}>
          <Check aria-hidden />
          Confirm match
        </Button>
        <Button size="sm" variant="outline" disabled={patch.isPending} onClick={() => review("rejected")}>
          <X aria-hidden />
          Reject
        </Button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- Reception

function CallList({ studyId }: { studyId: string }) {
  const matches = useMatches<ReceptionMatch>(studyId);
  const [calling, setCalling] = useState<ReceptionMatch | null>(null);

  if (matches.isPending) return <ListSkeleton />;
  if (matches.isError) return <QueryError error={matches.error} onRetry={() => matches.refetch()} />;

  const toCall = matches.data.filter(needsCall);
  const finished = matches.data.filter((m) => !needsCall(m));

  const rows = (list: ReceptionMatch[], empty: string) =>
    list.length === 0 ? (
      <Empty text={empty} />
    ) : (
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Patient</th>
              <th className="px-4 py-2.5 font-medium">Phone</th>
              <th className="px-4 py-2.5 font-medium">Contact</th>
              <th className="px-4 py-2.5 font-medium">Consent</th>
              <th className="px-4 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-4 py-3">
                  <div className="font-medium">{m.patient.name}</div>
                  <div className="text-xs text-muted-foreground">Confirmed by doctor</div>
                </td>
                <td className="px-4 py-3">
                  <a href={`tel:${digits(m.patient.phone)}`} className="inline-flex items-center gap-1.5 tabular-nums hover:underline">
                    <Phone className="size-3.5 text-muted-foreground" aria-hidden />
                    {m.patient.phone}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <ContactPill status={m.contactStatus} />
                </td>
                <td className="px-4 py-3">
                  <ConsentPill consent={m.consent} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant={needsCall(m) ? "default" : "outline"} onClick={() => setCalling(m)}>
                    <PhoneCall aria-hidden />
                    Record call
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <>
      <Tabs defaultValue="to-call">
        <TabsList>
          <TabsTrigger value="to-call">Still to call ({toCall.length})</TabsTrigger>
          <TabsTrigger value="finished">Decided ({finished.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="to-call" className="mt-4">
          {rows(toCall, "No one is waiting for a call.")}
        </TabsContent>
        <TabsContent value="finished" className="mt-4">
          {rows(finished, "No one has given an answer yet.")}
        </TabsContent>
      </Tabs>

      <RecordCallDialog key={calling?.id} match={calling} onClose={() => setCalling(null)} />
    </>
  );
}

/** PATCH /api/matches/:id { type: "record_contact" } */
function RecordCallDialog({ match, onClose }: { match: ReceptionMatch | null; onClose: () => void }) {
  const patch = usePatchMatch();
  const [reached, setReached] = useState<"yes" | "no" | "">("");
  const [consent, setConsent] = useState<Consent | "">("");
  const valid = reached === "no" || (reached === "yes" && consent !== "");

  const submit = () => {
    if (!match || !valid) return;
    const name = match.patient.name;
    patch.mutate(
      {
        id: match.id,
        op:
          reached === "yes"
            ? { type: "record_contact", contactStatus: "reached", consent: consent as Consent }
            : { type: "record_contact", contactStatus: "not_reached", consent: match.consent },
      },
      {
        onSuccess: () => {
          toast.success(
            reached === "yes"
              ? `${name}: reached, ${CONSENT_LABEL[consent as Consent].toLowerCase()}`
              : `${name}: not reached`,
          );
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open={Boolean(match)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {match && (
          <form
            className="grid gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>Record call: {match.patient.name}</DialogTitle>
              <DialogDescription>{match.patient.phone}</DialogDescription>
            </DialogHeader>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Did you reach the patient?</legend>
              <RadioGroup value={reached} onValueChange={(v) => setReached(v as "yes" | "no")}>
                <Choice value="no" label="Not reached" hint="No answer, voicemail, wrong number" />
                <Choice value="yes" label="Reached" hint="Spoke to the patient" />
              </RadioGroup>
            </fieldset>

            {reached === "yes" && (
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">What did the patient say about the study?</legend>
                <RadioGroup value={consent} onValueChange={(v) => setConsent(v as Consent)}>
                  <Choice value="consented" label="Consented" hint="Agreed to take part" />
                  <Choice value="declined" label="Declined" hint="Does not want to take part" />
                  <Choice value="undecided" label="Still deciding" hint="Will call again" />
                </RadioGroup>
              </fieldset>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!valid || patch.isPending}>
                {patch.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Choice({ value, label, hint }: { value: string; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-data-checked:border-foreground/40 has-data-checked:bg-muted/50">
      <RadioGroupItem value={value} className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{text}</p>;
}
