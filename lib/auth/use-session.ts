"use client";

import { useSyncExternalStore } from "react";

export type SessionState = {
  /** An owner account exists. False on a fresh install. */
  readonly claimed: boolean;
  /** Still asking. Renders nothing rather than the wrong call to action. */
  readonly loading: boolean;
  readonly signedIn: boolean;
};

type SessionPayload = { claimed: boolean; signedIn: boolean };

const PENDING: SessionState = { claimed: true, loading: true, signedIn: false };

// A failed call means the server is down, and a marketing page that renders no
// button at all is worse than one offering a sign-in that will explain the
// problem.
const FALLBACK: SessionState = { claimed: true, loading: false, signedIn: false };

/**
 * One request per page load, shared by every caller.
 *
 * `useSession` used to fetch from its own effect, which meant one request per
 * call site: the landing mounts four — the hero, the header, the footer and
 * the capabilities grid — so a single visit to the marketing page asked the
 * server the same question four times, and each answer arrived on its own
 * schedule, so the four calls to action settled at four different moments.
 *
 * The promise is module scope rather than a context because these components
 * do not share a provider — the header and the footer live in
 * `MarketingShell`, the other two are somewhere inside `children` — and a
 * provider wrapping all of them is the whole marketing tree re-rendering when
 * the answer lands.
 */
let request: Promise<SessionState> | null = null;
let resolved: SessionState | null = null;
const subscribers = new Set<(state: SessionState) => void>();

function fetchSession(): Promise<SessionState> {
  request ??= fetch("/api/auth/state")
    .then((response) => response.json())
    .then((next: SessionPayload) => ({ ...next, loading: false }) satisfies SessionState)
    .catch(() => FALLBACK)
    .then((state) => {
      resolved = state;
      for (const notify of subscribers) notify(state);
      return state;
    });
  return request;
}

function subscribe(onChange: () => void): () => void {
  subscribers.add(onChange);
  void fetchSession();
  return () => {
    subscribers.delete(onChange);
  };
}

// Stable identities on both sides: `PENDING` is a module constant and
// `resolved` is written once, so `useSyncExternalStore` never sees a new
// object for an unchanged answer and cannot loop.
function getSnapshot(): SessionState {
  return resolved ?? PENDING;
}

export function useSession(): SessionState {
  // `useSyncExternalStore` rather than an effect: the answer lives outside
  // React, one copy for the page, and a component mounting after it has
  // arrived reads it on its first render instead of flashing the loading
  // state again. The server snapshot is the pending one, which is what the
  // markup has to be — there is no session on a statically rendered page.
  return useSyncExternalStore(subscribe, getSnapshot, () => PENDING);
}
