"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Reveals every `[data-reveal]` element under `rootRef` as it scrolls into
 * view, by adding `is-in`. The animation itself lives in globals.css under
 * `.lp [data-reveal]`, so a section only has to mark up *what* animates and
 * optionally stagger it with `--lp-d`.
 *
 * One observer for the whole page rather than one per element: the landing
 * has upwards of forty revealing nodes, and forty IntersectionObservers is
 * forty separate rAF callbacks for the same scroll.
 *
 * `rootMargin` pulls the trigger line up from the viewport bottom so an
 * element starts moving while it is still a little below the fold — by the
 * time it is properly on screen it has already settled, which is what keeps
 * a fast scroll from feeling like a slideshow of pop-ins.
 */
export function useReveal(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const targets = root.querySelectorAll<HTMLElement>("[data-reveal]");

    // No IntersectionObserver (or motion turned off): show everything at once
    // rather than leaving the page blank.
    if (typeof IntersectionObserver === "undefined") {
      for (const el of targets) el.classList.add("is-in");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          // Reveals are one-way. Re-hiding on scroll-up makes a long page feel
          // like it is redrawing itself every time you look back at it.
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );

    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
  }, [rootRef]);
}

/**
 * Adds `is-stuck` to the header once the page has scrolled past `offset`.
 * Kept out of React state on purpose — a `setState` per scroll frame is the
 * one thing guaranteed to make a landing page feel cheap.
 */
export function useStuckHeader(headerRef: RefObject<HTMLElement | null>, offset = 12): void {
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    let frame = 0;
    const apply = () => {
      frame = 0;
      header.classList.toggle("is-stuck", window.scrollY > offset);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [headerRef, offset]);
}

/**
 * Reports which of `ids` the reader is currently inside, for a nav that wants
 * to mark its own section.
 *
 * The observer watches the band between the header and the middle of the
 * viewport, and of the sections crossing it takes the last in document order.
 * A full-viewport observer is useless here: these sections are 1500px tall, so
 * two are on screen for most of a scroll and "is it visible" never resolves to
 * one answer.
 *
 * The midline is where it is because it was measured, not guessed. Sampling
 * every section at 25 scroll positions and comparing the band's answer against
 * which section actually fills most of the viewport: a band ending at 22% of
 * the viewport disagrees 14% of the time — it keeps the old section marked
 * through the last 200px of scrolling, while the reader is already looking at
 * the next one. Ending it at the midline drops that to 1%.
 *
 * `ids` must be in document order, and stable across renders — pass a
 * module-level constant, not an inline array.
 *
 * State is set only when the answer actually changes, not per scroll frame.
 */
export function useActiveSection(ids: readonly string[], headerHeight = 64): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const nodes = ids
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => node !== null);

    if (nodes.length === 0 || typeof IntersectionObserver === "undefined") return;

    const onScreen = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onScreen.add(entry.target.id);
          else onScreen.delete(entry.target.id);
        }
        // Last in document order: of the sections crossing the band, that is
        // the one the reader is entering. Above the first section nothing
        // matches and the nav correctly marks nothing.
        let current: string | null = null;
        for (const id of ids) if (onScreen.has(id)) current = id;
        setActive((previous) => (previous === current ? previous : current));
      },
      { rootMargin: `-${headerHeight + 8}px 0px -50% 0px`, threshold: 0 },
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [ids, headerHeight]);

  return active;
}
