"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, Phone, Search, UserPlus } from "lucide-react";
import { checkIn, createPatient, useClinic } from "@/lib/clinic-store";
import { PageSkeleton } from "@/components/app-shell";
import { STAGE_LABEL, ageText, digits, formatTime, todaysVisits } from "@/lib/format";
import type { Patient } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/status-badges";

export function PatientsScreen() {
  const clinic = useClinic();
  const [query, setQuery] = useState("");
  const [checkingIn, setCheckingIn] = useState<Patient | null>(null);
  const [adding, setAdding] = useState(false);

  if (!clinic) return <PageSkeleton />;

  const isReception = clinic.role === "reception";
  const q = query.trim().toLowerCase();
  const qDigits = digits(q);
  // GET /api/patients?q= : name contains, or phone digits contain (3+ digits).
  const results = clinic.patients
    .filter((p) => !q || p.name.toLowerCase().includes(q) || (qDigits.length >= 3 && digits(p.phone).includes(qDigits)))
    .sort((a, b) => a.name.localeCompare(b.name));

  // A patient's open visit today (not yet done), if any.
  const activeVisit = new Map(
    todaysVisits(clinic)
      .filter((v) => v.stage !== "done")
      .map((v) => [v.patientId, v]),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
          <p className="text-sm text-muted-foreground">
            {isReception
              ? "Find a patient by name or phone number, then check them in."
              : "Find a patient by name or phone number. Switch to Reception to check someone in."}
          </p>
        </div>
        {isReception && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <UserPlus aria-hidden />
            New patient
          </Button>
        )}
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          autoFocus
          type="search"
          aria-label="Search patients by name or phone"
          placeholder="Search by name or phone, e.g. Lopez or 900123"
          className="h-10 pl-9 text-base"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Age</th>
              <th className="px-4 py-2.5 font-medium">Phone</th>
              <th className="px-4 py-2.5 font-medium">Today</th>
              <th className="px-4 py-2.5 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((p) => {
              const visit = activeVisit.get(p.id);
              return (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{ageText(p)}</td>
                  <td className="px-4 py-3">
                    <a
                      href={`tel:${digits(p.phone)}`}
                      className="inline-flex items-center gap-1.5 tabular-nums hover:underline"
                    >
                      <Phone className="size-3.5 text-muted-foreground" aria-hidden />
                      {p.phone}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    {visit ? (
                      <Pill tone="blue">
                        {STAGE_LABEL[visit.stage]} · since {formatTime(visit.checkedInAt)}
                      </Pill>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isReception && !visit && (
                      <Button size="sm" onClick={() => setCheckingIn(p)}>
                        <LogIn aria-hidden />
                        Check in
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {results.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No patients match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CheckInDialog key={checkingIn?.id} patient={checkingIn} onClose={() => setCheckingIn(null)} />
      <NewPatientDialog
        key={adding ? "open" : "closed"}
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(p) => {
          setAdding(false);
          setQuery(p.name);
          setCheckingIn(p);
        }}
      />
    </div>
  );
}

/** POST /api/visits */
function CheckInDialog({ patient, onClose }: { patient: Patient | null; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");

  const submit = () => {
    if (!patient) return;
    const res = checkIn(patient.id, reason);
    if (!res.ok) return toast.error(res.error);
    toast.success(`${patient.name} checked in`, {
      action: { label: "View board", onClick: () => router.push("/") },
    });
    onClose();
  };

  return (
    <Dialog open={Boolean(patient)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {patient && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>Check in {patient.name}</DialogTitle>
              <DialogDescription>
                {ageText(patient)} · {patient.phone}. They will appear in the Checked in column.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason for visit</Label>
              <Textarea
                id="reason"
                autoFocus
                rows={3}
                placeholder="What the patient says they've come in for"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!reason.trim()}>
                Check in
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** POST /api/patients */
function NewPatientDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (p: Patient) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const res = createPatient({ name, phone, dateOfBirth: dateOfBirth || null });
    if (!res.ok) return setError(res.error);
    toast.success(`${res.value.name} added`);
    onCreated(res.value);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>New patient</DialogTitle>
            <DialogDescription>
              Contact details only. Clinical history is added by clinical staff.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="np-name">Full name</Label>
            <Input id="np-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="np-phone">Phone</Label>
              <Input id="np-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-dob">Date of birth</Label>
              <Input id="np-dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || !phone.trim()}>
              Add and check in
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
