"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { resetDemo, setRole, useClinic } from "@/lib/clinic-store";
import { ROLE_LABEL } from "@/lib/format";
import type { Role } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const clinic = useClinic();

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
            {clinic ? (
              <Select
                items={ROLE_ITEMS}
                value={clinic.role}
                onValueChange={(v) => v && setRole(v as Role)}
              >
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
        Prototype · synthetic data only · no real patients
        {clinic && (
          <>
            {" · "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                resetDemo();
                toast("Demo data reset");
              }}
            >
              Reset demo data
            </button>
          </>
        )}
      </footer>
    </div>
  );
}

/** Loading placeholder shown until the client-side store is ready. */
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
