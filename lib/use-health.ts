"use client";

import { useEffect, useState } from "react";
import { useCredentialsChanged } from "./credentials-changed";

export type HealthStatus = "ok" | "degraded" | "down";

export type Health = {
  readonly status: HealthStatus;
  readonly checks: {
    readonly store: boolean;
    readonly ai: boolean;
    readonly channels: { readonly connected: number; readonly total: number };
  };
  readonly mode: string;
  readonly environment: string;
  readonly node: string;
  readonly uptimeSeconds: number;
};

type Snapshot = { readonly health: Health | null; readonly reachable: boolean };

// ── One poller, however many readers ────────────────────────────────
//
// The sidebar dot, the notifications panel and the support dialog all want the
// same answer, and each used to run its own 30s interval — three identical
// requests per cycle for one piece of information. The state lives here
// instead, and the interval only exists while something is subscribed.

let snapshot: Snapshot = { health: null, reachable: true };
const subscribers = new Set<(next: Snapshot) => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let inFlight = false;

function publish(next: Snapshot): void {
  snapshot = next;
  for (const notify of subscribers) notify(next);
}

async function poll(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error("unreachable");
    publish({ health: (await res.json()) as Health, reachable: true });
  } catch {
    // A request that never lands is its own answer — the server not
    // responding is exactly the case the dot exists to show — so the last
    // known health stays on screen, marked unreachable.
    publish({ health: snapshot.health, reachable: false });
  } finally {
    inFlight = false;
  }
}

/** Stable across renders, so the listener is added once per subscriber. */
function refreshHealth(): void {
  void poll();
}

/**
 * The instance's health, for the sidebar's status dot.
 *
 * Every caller shares one request and one interval; `intervalMs` is read from
 * the first subscriber, which is the only one that starts the timer.
 */
export function useHealth(intervalMs = 30_000): { health: Health | null; reachable: boolean } {
  const [state, setState] = useState<Snapshot>(snapshot);

  useEffect(() => {
    const notify = (next: Snapshot) => setState(next);
    subscribers.add(notify);
    if (!timer) {
      void poll();
      timer = setInterval(() => void poll(), intervalMs);
    }
    return () => {
      subscribers.delete(notify);
      if (subscribers.size === 0 && timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };
  }, [intervalMs]);

  // The dot's amber state is "no model key". Saving one should turn it green
  // now, not up to half a minute later.
  useCredentialsChanged(refreshHealth);

  return state;
}
