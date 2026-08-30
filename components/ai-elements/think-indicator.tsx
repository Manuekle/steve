"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

export interface ThinkIndicatorProps {
  /** States to cycle through while thinking. */
  states?: string[];
  /** Hold time per state, ms. Defaults to CSS var --think-hold. */
  holdMs?: number;
  className?: string;
}

const DEFAULT_STATES = [
  "Thinking…",
  "Analyzing…",
  "Reasoning…",
  "Processing…",
];

/**
 * transitions.dev "Thinking states" (.t-think).
 *
 * Cycles through states with a vertical blur-swap transition and a
 * shimmer sweep on the active glyph. The hidden sizer sets the box
 * width to the longest state so the box never resizes mid-swap.
 *
 * Requires the `.t-think*` CSS from globals.css.
 */
export function ThinkIndicator({
  states = DEFAULT_STATES,
  holdMs,
  className,
}: ThinkIndicatorProps) {
  const longest = states.reduce((a, b) => (b.length > a.length ? b : a), "");
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"enter-start" | "holding" | "exit">(
    "holding",
  );
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hold = holdMs ?? 2000;

  // Clear all timers on unmount
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    // Skip cycling if only one state
    if (states.length <= 1) return;

    const cycle = () => {
      // Start exit of current
      setPhase("exit");
      timers.current.push(
        setTimeout(() => {
          // Advance index, set enter-start (no transition, below + blurred)
          setIndex((i) => (i + 1) % states.length);
          setPhase("enter-start");
          // Force reflow then release into holding
          timers.current.push(
            setTimeout(() => {
              setPhase("holding");
            }, 20),
          );
        }, 150), // --think-swap
      );
    };

    const id = setInterval(cycle, hold);
    timers.current.push(id as unknown as ReturnType<typeof setTimeout>);
    return () => clearInterval(id);
  }, [states, hold]);

  const text = states[index];

  return (
    <span className={cn("t-think", className)} role="status">
      <span className="t-think-sizer" aria-hidden="true">
        {longest}
      </span>
      <span
        className={cn(
          "t-think-text",
          phase === "exit" && "is-exit",
          phase === "enter-start" && "is-enter-start",
        )}
        data-text={text}
      >
        {text}
      </span>
    </span>
  );
}
