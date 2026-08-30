"use client";

import { useEffect, useState } from "react";

export type SessionState = {
  /** An owner account exists. False on a fresh install. */
  readonly claimed: boolean;
  /** Still asking. Renders nothing rather than the wrong call to action. */
  readonly loading: boolean;
  readonly signedIn: boolean;
};

/**
 * Whether this visitor is signed in, for the marketing pages.
 *
 * They are the only public surface, so they are the only place that has to ask
 * — everything else is behind the middleware and knows the answer by being
 * reachable at all. `/api/auth/state` is public for the same reason the login
 * page is.
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    claimed: true,
    loading: true,
    signedIn: false,
  });

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/state")
      .then((response) => response.json())
      .then((next: { claimed: boolean; signedIn: boolean }) => {
        if (!cancelled) setState({ ...next, loading: false });
      })
      // A failed call means the server is down, and a marketing page that
      // renders no button at all is worse than one offering a sign-in that
      // will explain the problem.
      .catch(() => {
        if (!cancelled) setState({ claimed: true, loading: false, signedIn: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
