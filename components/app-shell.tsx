"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { setRole, useRole } from "@/lib/role";
import { useResetDemo } from "@/lib/queries";
import { ROLE_LABEL } from "@/lib/format";
import type { Role } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const NAV = [
  { href: "/", label: "Today's visits" },
  { href: "/patients", label: "Patients" },
  { href: "/studies", label: "Studies" },
];

const ROLE_ITEMS = (Object.keys(ROLE_LABEL) as Role[]).map((r) => ({
  value: r,
  label: ROLE_LABEL[r],
}));

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const role = useRole();
  const reset = useResetDemo();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Stethoscope className="size-5" aria-hidden />
            <span className="hidden sm:inline">Clinic</span>
          </Link>

          <nav className="flex items-center gap-1 overflow-x-auto text-sm">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                    active && "bg-muted font-medium text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground md:inline">Viewing as</span>
            {role ? (
              <Select items={ROLE_ITEMS} value={role} onValueChange={(v) => v && setRole(v as Role)}>
                <SelectTrigger aria-label="Viewing as" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_ITEMS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Skeleton className="h-8 w-32" />
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6">{children}</main>

      <footer className="border-t py-3 text-center text-xs text-muted-foreground">
        Prototype · synthetic data only · no real patients ·{" "}
        <button
          type="button"
          disabled={reset.isPending}
          className="underline underline-offset-2 hover:text-foreground disabled:opacity-50"
          onClick={() => setConfirmReset(true)}
        >
          {reset.isPending ? "Resetting…" : "Reset demo data"}
        </button>
      </footer>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset demo data?</DialogTitle>
            <DialogDescription>
              This replaces all patients, visits and study matches with the original synthetic demo
              data. Everyone using this app sees the reset.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reset.isPending}
              onClick={() =>
                reset.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmReset(false);
                    toast.success("Demo data reset");
                  },
                })
              }
            >
              {reset.isPending ? "Resetting…" : "Reset data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Loading placeholder for a whole screen. */
export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
