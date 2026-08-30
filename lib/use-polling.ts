"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `fn` immediately, then every `intervalMs`.
 * Stops on unmount. Skips if previous call still in-flight.
 * Uses a ref so `fn` can change without resetting the interval.
 */
/**
 * Re-run `fn` on an interval. Pass `enabled: false` to stand it down — a route
 * that structurally cannot succeed (an integration with no credentials) should
 * not be re-asked every minute.
 */
export function usePolling(fn: () => void | Promise<void>, intervalMs: number, enabled = true) {
  const fnRef = useRef(fn);
  const inFlight = useRef(false);

  // Always point to the latest fn
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (inFlight.current) return;
      inFlight.current = true;
      Promise.resolve(fnRef.current()).finally(() => {
        inFlight.current = false;
      });
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}
