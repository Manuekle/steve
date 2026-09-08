"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** How much of each edge dissolves once there is something past it. */
const FADE = "2.5rem";

/**
 * Fade the clipped edges of a horizontal scroller.
 *
 * A board wider than its column has to be cut off somewhere, and a hard cut is
 * what makes a scrolling row read as broken rather than as continuing. The
 * mask itself lives in `.x-fade`; this decides which sides are on, because
 * fading a side with nothing past it just dims real content — a board sitting
 * at scroll zero should have a crisp left edge.
 *
 * The ref is a callback rather than an object on purpose. This scroller mounts
 * *after* its data arrives, so an effect keyed on `[]` runs while the ref is
 * still null, returns early, and never fires again — which is exactly how the
 * first version of this shipped with a fade that never moved.
 */
export function useEdgeFade<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const nodeRef = useRef<T | null>(null);

  const measure = useCallback(() => {
    const el = nodeRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // A couple of pixels of slack: sub-pixel layout means `scrollLeft` rarely
    // lands exactly on either bound, and a fade that never quite switches off
    // is worse than none.
    setEdges({ start: el.scrollLeft > 2, end: el.scrollLeft < max - 2 });
  }, []);

  const ref = useCallback((next: T | null) => {
    nodeRef.current = next;
    setNode(next);
  }, []);

  useEffect(() => {
    if (!node) return;
    measure();
    node.addEventListener("scroll", measure, { passive: true });
    // Both the scroller and its content: the fade depends on the difference
    // between them, and either can change on its own — the dock opening
    // resizes the first, a new deal resizes the second.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const child of Array.from(node.children)) observer.observe(child);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [node, measure]);

  return {
    ref,
    /** Spread onto the scroller, alongside the `x-fade` class. */
    style: {
      ["--x-fade-start" as string]: edges.start ? FADE : "0px",
      ["--x-fade-end" as string]: edges.end ? FADE : "0px",
    },
    remeasure: measure,
  };
}
