"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

export interface StreamTextProps {
  /** The text to animate word-by-word. */
  text: string;
  /** Gap between words, ms. Defaults to --stream-gap (60ms). */
  gapMs?: number;
  /** Replay the animation when `text` changes. Default true. */
  replay?: boolean;
  className?: string;
}

/** Split into words while preserving spacing cues. */
function splitWords(text: string): string[] {
  return text.split(/(\s+)/).filter((s) => s.length > 0);
}

/**
 * transitions.dev "Streaming text" (.t-stream).
 *
 * Wraps each word in a `.t-stream-w` span and reveals them one by
 * one every `gapMs` by adding `.is-in`. Each word resolves through
 * opacity + a small blur over --stream-fade.
 *
 * When `text` changes: wipes all spans (transition: none), forces a
 * reflow, restores the transition, then adds `.is-in` word by word.
 *
 * Requires the `.t-stream*` CSS from globals.css.
 */
export function StreamText({
  text,
  gapMs = 60,
  replay = true,
  className,
}: StreamTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear timers on unmount
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  // Run the reveal whenever text changes
  useEffect(() => {
    if (!replay) return;
    const container = containerRef.current;
    if (!container) return;

    const words = container.querySelectorAll<HTMLElement>(".t-stream-w");

    // Wipe: transition none + remove is-in
    words.forEach((w) => {
      w.style.transition = "none";
      w.classList.remove("is-in");
    });

    // Force reflow
    void container.offsetWidth;

    // Restore transition and reveal word by word
    words.forEach((w, i) => {
      w.style.transition = "";
      timersRef.current.push(
        setTimeout(() => w.classList.add("is-in"), i * gapMs),
      );
    });

    return () => timersRef.current.forEach(clearTimeout);
  }, [text, gapMs, replay]);

  const tokens = splitWords(text);

  return (
    <span className={cn("t-stream", className)} ref={containerRef}>
      {tokens.map((token, i) => (
        <span className="t-stream-w" key={i}>
          {token}
        </span>
      ))}
    </span>
  );
}
