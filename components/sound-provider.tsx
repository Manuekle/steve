"use client";

import { bind, play, setEnabled as setLibEnabled, setVolume as setLibVolume, type SoundName } from "cuelume";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { playWarning } from "@/lib/warning-cue";

/**
 * Cuelume's palette plus the one tone it does not carry.
 *
 * Callers ask for cues by name and should not have to know which of the two
 * synths answers — `warning` reads exactly like `error` at the call site.
 */
export type CueName = SoundName | "warning";

const ENABLED_KEY = "steve:sound-enabled";
const VOLUME_KEY = "steve:sound-volume";
const DEFAULT_VOLUME = 0.35;

type SoundContextValue = {
  readonly enabled: boolean;
  readonly volume: number;
  readonly setEnabled: (enabled: boolean) => void;
  readonly setVolume: (volume: number) => void;
  /** Play a sound for an outcome the user caused. No-op while muted. */
  readonly cue: (name: CueName) => void;
};

const SoundContext = createContext<SoundContextValue | null>(null);

/**
 * Interaction sounds, off until someone turns them on.
 *
 * cuelume owns the synthesis; this owns the preference. Sound is the kind of
 * thing that has to be opt-in and easy to kill — a interface that starts
 * making noise on a first visit is a interface people mute at the OS level.
 */
export function SoundProvider({ children }: { readonly children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);

  // Read the preference after mount: touching localStorage during render would
  // make the server and the first client pass disagree.
  useEffect(() => {
    try {
      setEnabledState(localStorage.getItem(ENABLED_KEY) === "1");
      // Guard on the key existing, not just on the parse: `Number(null)` is 0,
      // which is a perfectly valid volume — so a first visit would silently
      // pin the volume to zero and every cue would play as nothing.
      const raw = localStorage.getItem(VOLUME_KEY);
      if (raw !== null) {
        const stored = Number(raw);
        if (Number.isFinite(stored) && stored >= 0 && stored <= 1) setVolumeState(stored);
      }
    } catch {
      // Private mode / blocked storage — defaults are fine.
    }
  }, []);

  // One delegated binding for the whole document. It is idempotent and covers
  // nodes React mounts later, so route changes need no re-binding.
  useEffect(() => {
    bind();
  }, []);

  // A floor under `bind()`: every control that nobody tagged still feels
  // pressed.
  //
  // The app has ~150 raw `<button>` elements — icon actions in table rows, the
  // theme and language switches, close buttons — that never went through the
  // `Button` component and so carry no `data-cuelume-*` attribute. Tagging
  // each by hand is a large diff that goes stale the moment someone adds a
  // button, so the default lives here instead, delegated the same way cuelume
  // does it.
  //
  // `press`/`release` on purpose, not one of the melodic cues: this fires on
  // controls we know nothing about, so it has to be the quiet physical knock
  // that pairs with itself rather than something that competes with the
  // outcome cue landing right after it.
  useEffect(() => {
    /** True when cuelume's own binding already owns this element's click. */
    const isTagged = (element: Element) =>
      element.closest(
        "[data-cuelume-press],[data-cuelume-release],[data-cuelume-toggle],[data-cuelume-silent]",
      ) !== null;

    const control = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return null;
      // Not `a[href]`: a text link is not a control, and pressing every link
      // in a page of prose is exactly the noise this is trying to avoid.
      const element = target.closest<HTMLElement>('button,[role="button"]');
      if (!element) return null;
      if (element.matches(":disabled,[aria-disabled='true']")) return null;
      return isTagged(element) ? null : element;
    };

    const onDown = (event: PointerEvent) => {
      if (control(event)) play("press");
    };
    const onUp = (event: PointerEvent) => {
      if (control(event)) play("release");
    };

    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
    };
  }, []);

  useEffect(() => {
    setLibEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    setLibVolume(volume);
  }, [volume]);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    try {
      localStorage.setItem(ENABLED_KEY, next ? "1" : "0");
    } catch {
      // Best-effort.
    }
    // Confirm the change with the thing being changed — silence on unmute
    // reads as broken.
    //
    // The library has to be told here rather than left to the effect below:
    // the effect only runs after this render commits, so `play` would still
    // be hitting the engine's `enabled === false` gate and the very
    // confirmation this exists for would be the one that never sounds.
    if (next) {
      setLibEnabled(true);
      play("success");
    }
  }, []);

  const setVolume = useCallback((next: number) => {
    const clamped = Math.min(1, Math.max(0, next));
    setVolumeState(clamped);
    try {
      localStorage.setItem(VOLUME_KEY, String(clamped));
    } catch {
      // Best-effort.
    }
  }, []);

  const cue = useCallback(
    (name: CueName) => {
      if (!enabled) return;
      // `warning` has its own synth, so the volume cuelume holds internally
      // has to be handed over explicitly for that one.
      if (name === "warning") {
        playWarning(volume);
        return;
      }
      play(name);
    },
    [enabled, volume],
  );

  const value = useMemo<SoundContextValue>(
    () => ({ enabled, volume, setEnabled, setVolume, cue }),
    [enabled, volume, setEnabled, setVolume, cue],
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

/**
 * Sound controls. Safe outside the provider — `cue` becomes a no-op rather
 * than throwing, so a component can ask for a sound without caring whether
 * it's mounted inside the shell.
 */
export function useSound(): SoundContextValue {
  const context = useContext(SoundContext);
  return (
    context ?? {
      enabled: false,
      volume: DEFAULT_VOLUME,
      setEnabled: () => {},
      setVolume: () => {},
      cue: () => {},
    }
  );
}
