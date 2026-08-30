"use client";

import { bind, play, setEnabled as setLibEnabled, setVolume as setLibVolume, type SoundName } from "cuelume";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const ENABLED_KEY = "steve:sound-enabled";
const VOLUME_KEY = "steve:sound-volume";
const DEFAULT_VOLUME = 0.35;

type SoundContextValue = {
  readonly enabled: boolean;
  readonly volume: number;
  readonly setEnabled: (enabled: boolean) => void;
  readonly setVolume: (volume: number) => void;
  /** Play a sound for an outcome the user caused. No-op while muted. */
  readonly cue: (name: SoundName) => void;
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
    if (next) play("success");
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
    (name: SoundName) => {
      if (!enabled) return;
      play(name);
    },
    [enabled],
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
