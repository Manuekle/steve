"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Whether an element's text still fits inside `maxLines`.
 *
 * A fully rounded bubble only reads as a pill while it is short: the cap radius
 * is half the box height, so as soon as the text wraps the curves start eating
 * into the words. Callers pass the line budget their radius survives (one line,
 * for the chat bubbles) and step the radius down past it. CSS has no way to ask
 * how many lines rendered, which is why this measures.
 */
export function useFitsLines(ref: RefObject<HTMLElement | null>, maxLines = 2): boolean {
  const [fits, setFits] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const style = getComputedStyle(el);
      const fontSize = Number.parseFloat(style.fontSize) || 16;
      // `line-height: normal` computes to the keyword, not a number.
      const parsed = Number.parseFloat(style.lineHeight);
      const lineHeight = Number.isFinite(parsed) ? parsed : fontSize * 1.5;
      const inner =
        el.clientHeight -
        (Number.parseFloat(style.paddingTop) || 0) -
        (Number.parseFloat(style.paddingBottom) || 0);
      // A pixel of slack: sub-pixel line boxes round up often enough that an
      // exact comparison flips a genuinely one-line bubble to the wide radius.
      setFits(inner <= lineHeight * maxLines + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, maxLines]);

  return fits;
}
