"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Phone } from "lucide-react";
import { usePatchVisit, useVisit } from "@/lib/queries";
import { useRole } from "@/lib/role";
import type { VisitOp } from "@/lib/operations";
import { ROLE_LABEL, STAGE_LABEL, ageText, digits, followUpToBook, formatDate, formatTime } from "@/lib/format";
import type { VisitDetail } from "@/lib/types";
import type { Vitals } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { MatchStatusPill, Pill, QueryError, StudyFlagPill } from "@/components/status-badges";

/** PATCH /api/visits/:id with a success toast (errors are toasted by the hook). */
function usePatch(visitId: string) {
  const patch = usePatchVisit();
  return {
    pending: patch.isPending,
    run: (op: VisitOp, success: string) =>
      patch.mutate({ id: visitId, op }, { onSuccess: () => toast.success(success) }),
  };
}

export function VisitPanel({ visitId, onClose }: { visitId: string | null; onClose: () => void }) {
  const role = useRole();
  const detail = useVisit(visitId);
  const data = detail.data;

  return (
    <Sheet open={Boolean(visitId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-xl">
        {!data ? (
          <>
            <SheetHeader className="border-b pr-12">
              <SheetTitle>{detail.isError ? "Couldn't load visit" : "Loading visit…"}</SheetTitle>
              <SheetDescription className="sr-only">Visit details</SheetDescription>
            </SheetHeader>
            <div className="space-y-3 px-4">
              {detail.isError ? (
                <QueryError error={detail.error} onRetry={() => detail.refetch()} />
              ) : (
                <>
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="border-b pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-lg font-semibold">{data.patient.name}</SheetTitle>
                <Pill>{STAGE_LABEL[data.visit.stage]}</Pill>
                <StudyFlagPill flag={data.studyFlag} />
              </div>
              <SheetDescription>
                {ageText(data.patient)} · checked in {formatTime(data.visit.checkedInAt)}
                {role && ` · viewing as ${ROLE_LABEL[role]}`}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-6">
              <Field label="Reason for visit">
                <p className="text-sm">{data.visit.reason}</p>
              </Field>

              {role === "reception" && <ReceptionSection data={data} />}
              {/* Keyed by stage so the form drafts reset after a handoff. */}
              {role === "nurse" && <NurseSection key={`${data.visit.id}-${data.visit.stage}`} data={data} />}
              {role === "doctor" && <DoctorSection key={`${data.visit.id}-${data.visit.stage}`} data={data} />}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Reception

function ReceptionSection({ data }: { data: VisitDetail }) {
  const { visit, patient, studyFlag } = data;
  const { followUp } = visit;
  const doctorDone = visit.stage === "checkout" || visit.stage === "done";
  const patch = usePatch(visit.id);

  return (
    <>
      <Field label="Phone">
        <a
          href={`tel:${digits(patient.phone)}`}
          className="inline-flex items-center gap-2 text-lg font-medium tabular-nums hover:underline"
        >
          <Phone className="size-4" aria-hidden />
          {patient.phone}
        </a>
      </Field>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Before the patient leaves</h3>
        {!doctorDone ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            The patient is {STAGE_LABEL[visit.stage].toLowerCase()}. Anything the doctor asks for
            will show up here when they send the patient to checkout.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {followUp.needed && (
              <li className="flex items-center justify-between gap-3 p-3">
                <div>
                  <p className="text-sm font-medium">
                    Book follow-up in {followUp.weeks ?? "?"} week{followUp.weeks === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-muted-foreground">Requested by the doctor</p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={followUp.booked}
                    disabled={visit.stage === "done" || patch.pending}
                    onCheckedChange={(booked) =>
                      patch.run(
                        { type: "set_follow_up_booked", booked },
                        booked ? "Follow-up marked as booked" : "Follow-up unmarked",
                      )
                    }
                  />
                  Booked
                </label>
              </li>
            )}
            {visit.testOrdered && (
              <li className="p-3">
                <p className="text-sm font-medium">Test ordered</p>
                <p className="text-xs text-muted-foreground">
                  Make sure the patient knows how to get it done. Ask the doctor if unsure which test.
                </p>
              </li>
            )}
            {!followUp.needed && !visit.testOrdered && (
              <li className="p-3 text-sm text-muted-foreground">Nothing to arrange. The patient can leave.</li>
            )}
          </ul>
        )}
      </section>

      {studyFlag?.status === "confirmed" && (
        <p className="text-sm text-muted-foreground">
          This patient is on the{" "}
          <Link href="/studies" className="underline underline-offset-2">
            study call list
          </Link>
          . A confirmed match is not consent.
        </p>
      )}

      {visit.stage === "checkout" && (
        <div className="space-y-2">
          <Button
            className="w-full"
            disabled={followUpToBook(visit) || patch.pending}
            onClick={() => patch.run({ type: "complete_checkout" }, `${patient.name} checked out`)}
          >
            <Check aria-hidden />
            Complete checkout
          </Button>
          {followUpToBook(visit) && (
            <p className="text-center text-xs text-muted-foreground">
              Mark the follow-up as booked to finish checkout.
            </p>
          )}
        </div>
      )}
      {visit.stage === "done" && <p className="text-sm text-muted-foreground">Checkout complete.</p>}
    </>
  );
}

// ---------------------------------------------------------------- Nurse

type VitalsDraft = { bloodPressure: string; weightKg: string; temperatureC: string; notes: string };

const toDraft = (v: Vitals | null | undefined): VitalsDraft => ({
  bloodPressure: v?.bloodPressure ?? "",
  weightKg: v?.weightKg?.toString() ?? "",
  temperatureC: v?.temperatureC?.toString() ?? "",
  notes: v?.notes ?? "",
});

const num = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));

const fromDraft = (d: VitalsDraft): Vitals => ({
  bloodPressure: d.bloodPressure.trim(),
  weightKg: num(d.weightKg),
  temperatureC: num(d.temperatureC),
  notes: d.notes.trim(),
});

function NurseSection({ data }: { data: VisitDetail }) {
  const { visit } = data;
  const [draft, setDraft] = useState<VitalsDraft>(() => toDraft(visit.vitals));
  const editable = visit.stage === "with_nurse";
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(visit.vitals));
  const patch = usePatch(visit.id);
  const past = data.previousVitals ?? [];

  const set = (k: keyof VitalsDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <>
      {visit.stage === "checked_in" && (
        <Button
          className="w-full"
          disabled={patch.pending}
          onClick={() => patch.run({ type: "start_nurse" }, "Nurse assessment started")}
        >
          Start nurse assessment
          <ArrowRight aria-hidden />
        </Button>
      )}

      {(editable || visit.vitals) && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Today&apos;s vitals</h3>
          <div className="grid grid-cols-3 gap-3">
            <TextField id="bp" label="Blood pressure" placeholder="120/80" value={draft.bloodPressure} onChange={set("bloodPressure")} disabled={!editable} />
            <TextField id="weight" label="Weight (kg)" inputMode="decimal" value={draft.weightKg} onChange={set("weightKg")} disabled={!editable} />
            <TextField id="temp" label="Temp (°C)" inputMode="decimal" value={draft.temperatureC} onChange={set("temperatureC")} disabled={!editable} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nurse-notes">Notes for the doctor</Label>
            <Textarea id="nurse-notes" rows={4} value={draft.notes} onChange={set("notes")} disabled={!editable} placeholder="Observations, symptoms, anything the doctor should know" />
          </div>
        </section>
      )}

      {editable && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            disabled={!dirty || patch.pending}
            onClick={() => patch.run({ type: "save_vitals", vitals: fromDraft(draft) }, "Vitals saved")}
          >
            {dirty ? "Save" : "Saved"}
          </Button>
          <Button
            className="flex-1"
            disabled={patch.pending}
            onClick={() => patch.run({ type: "send_to_doctor", vitals: fromDraft(draft) }, "Sent to the doctor")}
          >
            Save and send to doctor
            <ArrowRight aria-hidden />
          </Button>
        </div>
      )}

      {!editable && visit.stage !== "checked_in" && (
        <p className="text-sm text-muted-foreground">
          The patient is {STAGE_LABEL[visit.stage].toLowerCase()}. Vitals can only be changed while
          the patient is with the nurse.
        </p>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Previous vitals</h3>
        {past.length === 0 ? (
          <p className="text-sm text-muted-foreground">No previous vitals recorded.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">BP</th>
                  <th className="px-3 py-2 font-medium">Weight</th>
                  <th className="px-3 py-2 font-medium">Temp</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {past.map((p) => (
                  <tr key={p.checkedInAt} className="border-t">
                    <td className="px-3 py-2">{formatDate(p.checkedInAt)}</td>
                    <td className="px-3 py-2">{p.vitals.bloodPressure || "–"}</td>
                    <td className="px-3 py-2">{p.vitals.weightKg ?? "–"} kg</td>
                    <td className="px-3 py-2">{p.vitals.temperatureC ?? "–"} °C</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------- Doctor

const WEEK_ITEMS = [1, 2, 4, 6, 12].map((w) => ({ value: String(w), label: `${w} week${w === 1 ? "" : "s"}` }));

function DoctorSection({ data }: { data: VisitDetail }) {
  const { visit, patient, studyFlag } = data;
  const initial = {
    doctorNotes: visit.doctorNotes ?? "",
    followUp: { needed: visit.followUp.needed, weeks: visit.followUp.weeks ?? 2 },
    testOrdered: visit.testOrdered,
  };
  const [draft, setDraft] = useState(initial);
  const editable = visit.stage === "with_doctor";
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const patch = usePatch(visit.id);

  return (
    <>
      <section className="space-y-2">
        <h3 className="text-sm font-medium">From the nurse</h3>
        {visit.vitals ? (
          <div className="rounded-lg border p-3">
            <dl className="grid grid-cols-3 gap-2 text-sm tabular-nums">
              <Stat label="BP" value={visit.vitals.bloodPressure || "–"} />
              <Stat label="Weight" value={visit.vitals.weightKg != null ? `${visit.vitals.weightKg} kg` : "–"} />
              <Stat label="Temp" value={visit.vitals.temperatureC != null ? `${visit.vitals.temperatureC} °C` : "–"} />
            </dl>
            {visit.vitals.notes && (
              <p className="mt-3 border-t pt-3 text-sm whitespace-pre-wrap">{visit.vitals.notes}</p>
            )}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            The nurse hasn&apos;t recorded vitals for this visit yet.
          </p>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <ListField label="Diagnoses" items={patient.diagnoses ?? []} empty="None recorded" />
        <ListField label="Medications" items={patient.medications ?? []} empty="None recorded" />
        <ListField label="Allergies" items={patient.allergies ?? []} empty="No known allergies" warn />
      </section>

      {studyFlag && (
        <section className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">Diabetes study</h3>
            <MatchStatusPill status={studyFlag.status} />
          </div>
          {studyFlag.reason && <p className="text-sm">{studyFlag.reason}</p>}
          {studyFlag.evidence && (
            <p className="rounded bg-muted px-2 py-1 font-mono text-xs">“{studyFlag.evidence}”</p>
          )}
          <p className="text-xs text-muted-foreground">
            A flag is not eligibility or consent.{" "}
            {studyFlag.status !== "confirmed" && (
              <Link href="/studies" className="underline underline-offset-2">
                Review it in Studies
              </Link>
            )}
          </p>
        </section>
      )}

      <Separator />

      <section className="space-y-4">
        <h3 className="text-sm font-medium">Your assessment</h3>
        <div className="space-y-1.5">
          <Label htmlFor="doctor-notes">Notes</Label>
          <Textarea
            id="doctor-notes"
            rows={4}
            disabled={!editable}
            placeholder="Assessment, plan, and details of any test ordered"
            value={draft.doctorNotes}
            onChange={(e) => setDraft((d) => ({ ...d, doctorNotes: e.target.value }))}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={draft.followUp.needed}
              disabled={!editable}
              onCheckedChange={(needed) => setDraft((d) => ({ ...d, followUp: { ...d.followUp, needed } }))}
            />
            Follow-up needed
          </label>
          {draft.followUp.needed && (
            <Select
              items={WEEK_ITEMS}
              value={String(draft.followUp.weeks)}
              disabled={!editable}
              onValueChange={(v) =>
                v && setDraft((d) => ({ ...d, followUp: { ...d.followUp, weeks: Number(v) } }))
              }
            >
              <SelectTrigger aria-label="Follow-up in" className="w-32" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEK_ITEMS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={draft.testOrdered}
            disabled={!editable}
            onCheckedChange={(testOrdered) => setDraft((d) => ({ ...d, testOrdered }))}
          />
          Test ordered
        </label>
      </section>

      {editable ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            disabled={patch.pending}
            onClick={() => patch.run({ type: "back_to_nurse", ...draft }, "Sent back to the nurse")}
          >
            <ArrowLeft aria-hidden />
            Back to nurse
          </Button>
          <Button
            variant="outline"
            disabled={!dirty || patch.pending}
            onClick={() => patch.run({ type: "save_doctor", ...draft }, "Notes saved")}
          >
            {dirty ? "Save" : "Saved"}
          </Button>
          <Button
            className="flex-1"
            disabled={patch.pending}
            onClick={() => patch.run({ type: "send_to_checkout", ...draft }, "Sent to checkout")}
          >
            Send to checkout
            <ArrowRight aria-hidden />
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {visit.stage === "checked_in" || visit.stage === "with_nurse"
            ? "The nurse will send this patient to you when they're ready."
            : "This patient has left the doctor stage, so the assessment is read-only."}
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------- small pieces

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function ListField({
  label,
  items,
  empty,
  warn,
}: {
  label: string;
  items: string[];
  empty: string;
  warn?: boolean;
}) {
  return (
    <Field label={label}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.map((i) => (
            <li key={i} className={warn ? "flex items-start gap-1.5 font-medium text-rose-700 dark:text-rose-300" : undefined}>
              {warn && <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
              {i}
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}

function TextField({
  id,
  label,
  ...props
}: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}
