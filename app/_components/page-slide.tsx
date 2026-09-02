"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// The transitions.dev "page side-by-side" slide, wrapped so the markup is
// written once. See the `.t-page-slide` block in app/globals.css.
//
// The wrapper exists for one reason the raw snippet leaves to the caller:
// `.t-page` is absolutely positioned, so the container has no height of its
// own and collapses. Measuring the visible page and publishing it as
// `--page-height` is what makes the two views able to differ in height — and
// a read view and the form that edits it always do.
//
// What is measured is the inner div, never the section. `.t-page` carries
// `inset: 0`, so the section is exactly as tall as the container it is meant
// to be sizing — measuring it reads back the height it just set, and the
// whole thing settles at zero. The inner div is in normal flow, so its height
// is the content's.
//
// A ResizeObserver rather than a one-time measure: the edit form grows as
// someone types into a textarea or ticks another capability, and a height
// fixed at mount would clip exactly the content they just added.

export function PageSlide({
  page,
  first,
  second,
  className,
}: {
  /** 1 shows `first`, 2 shows `second`. */
  readonly page: 1 | 2;
  readonly first: ReactNode;
  readonly second: ReactNode;
  readonly className?: string;
}) {
  const firstRef = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const active = page === 1 ? firstRef.current : secondRef.current;
    if (!active) return;

    const measure = () => setHeight(active.getBoundingClientRect().height);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(active);
    return () => observer.disconnect();
  }, [page]);

  return (
    <div
      className={cn("t-page-slide", className)}
      data-page={String(page)}
      style={height === null ? undefined : ({ "--page-height": `${height}px` } as React.CSSProperties)}
    >
      <section className="t-page" data-page-id="1">
        <div ref={firstRef}>{first}</div>
      </section>
      <section className="t-page" data-page-id="2">
        <div ref={secondRef}>{second}</div>
      </section>
    </div>
  );
}
