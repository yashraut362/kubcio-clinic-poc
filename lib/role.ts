"use client";

/**
 * The "Viewing as" role, kept in localStorage so it survives reloads.
 * It's a demo mechanism: the API enforces what each role may do.
 *
 * Read on the client only; during server render it is null and screens show
 * a skeleton (Cache Components also forbids reading the time while prerendering,
 * which several screens do once they have data).
 */
import { useSyncExternalStore } from "react";
import type { Role } from "./types";

const KEY = "clinic-poc-role";
const ROLES: Role[] = ["reception", "nurse", "doctor"];
let role: Role | null = null;
const listeners = new Set<() => void>();

function read(): Role {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && (ROLES as string[]).includes(stored)) return stored as Role;
  } catch {
    // storage unavailable
  }
  return "reception";
}

function getSnapshot(): Role {
  role ??= read();
  return role;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRole(): Role | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function setRole(next: Role) {
  role = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // storage unavailable: the role still applies for this page
  }
  listeners.forEach((l) => l());
}
