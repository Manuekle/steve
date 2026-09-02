"use client";

import { useCallback } from "react";
import { useSound } from "@/components/sound-provider";
import { fireConfetti, fireConfettiFrom } from "@/lib/confetti";

/**
 * One call for "the user just won something": the burst and the sound that
 * goes with it.
 *
 * They were two calls at every site, which is how the first two confetti
 * moments ended up silent for months — nothing forces you to remember the
 * second line. Here the pair cannot come apart.
 *
 * `once` is what keeps confetti meaning anything. A burst is a first-time
 * feeling: connecting a channel, watching the AI build your profile out of a
 * URL, putting an agent to work. Do it on every repeat and within a day it is
 * just something the app does when you press save. Pass a key and the
 * milestone celebrates once per browser, then goes quiet and lets the ordinary
 * `success` cue do its job.
 */
const STORAGE_PREFIX = "steve:celebrated:";

type CelebrateOptions = {
  /** Milestone key. Omit for moments that are a win every single time. */
  readonly once?: string;
  /** Burst from this element rather than the top third of the viewport. */
  readonly from?: HTMLElement | null;
};

/** False when this milestone already had its moment on this browser. */
function claim(key: string): boolean {
  try {
    const storageKey = STORAGE_PREFIX + key;
    if (localStorage.getItem(storageKey)) return false;
    localStorage.setItem(storageKey, "1");
    return true;
  } catch {
    // Private mode or blocked storage: celebrate rather than swallow it. A
    // repeated burst is a smaller failure than a milestone that never lands.
    return true;
  }
}

export function useCelebrate(): (options?: CelebrateOptions) => void {
  const { cue } = useSound();

  return useCallback(
    (options: CelebrateOptions = {}) => {
      if (options.once && !claim(options.once)) return;
      // Sound first: the burst takes a frame to paint, and starting the cue
      // after it lands makes the two read as separate events.
      cue("sparkle");
      if (options.from !== undefined) fireConfettiFrom(options.from);
      else fireConfetti();
    },
    [cue],
  );
}
