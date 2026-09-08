"use client";

import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export interface SlidingTab {
  readonly id: string;
  readonly label: ReactNode;
}

export interface SlidingTabsProps {
  tabs: readonly SlidingTab[];
  value: string;
  onValueChange: (id: string) => void;
  className?: string;
  /** Optional content rendered to the right of the tabs, inside the bar. */
  trailing?: ReactNode;
}

/**
 * transitions.dev "Tabs sliding" (.t-tabs).
 *
 * A segmented tab bar with a pill that slides between tabs using
 * measured offsetLeft / offsetWidth. On first paint and resize the
 * pill snaps without a transition; on tab click it animates.
 *
 * Requires the `.t-tabs*` CSS from globals.css.
 *
 * Deliberately NOT `role="tablist"` / `role="tab"`. Those roles promise a
 * composite widget — one tab stop, arrow keys between tabs, and an
 * `aria-controls` panel — and this bar has none of that. It is also used for
 * things that are not tabs at all (pagination, a monthly/yearly price
 * toggle), where the roles would be wrong even with the keyboard handling.
 * Plain buttons carrying `aria-pressed` describe what this actually is: a
 * group of toggles, each its own tab stop, one of them on.
 */
export function SlidingTabs({
  tabs,
  value,
  onValueChange,
  className,
  trailing,
}: SlidingTabsProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const valueRef = useRef(value);
  const hasSnappedRef = useRef(false);
  const [ready, setReady] = useState(false);

  // Keep valueRef in sync so positionPill can read the latest value
  // without being recreated on every change — this prevents the
  // snap effect from firing on value changes and clobbering the
  // animate effect.
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  /** Position the pill at the active tab. When `animate` is false,
   *  the transition is suspended so the pill snaps instantly. */
  const positionPill = useCallback((animate: boolean) => {
    const pill = pillRef.current;
    const tab = tabRefs.current.get(valueRef.current);
    if (!pill || !tab) return;

    if (!animate) {
      pill.style.transition = "none";
    }
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
    pill.style.width = `${tab.offsetWidth}px`;

    if (!animate) {
      // Force reflow then restore the CSS transition
      void pill.offsetWidth;
      pill.style.transition = "";
    }
  }, []);

  // Snap on first paint (no animation) — runs once after mount
  useEffect(() => {
    positionPill(false);
    hasSnappedRef.current = true;
    setReady(true);
  }, [positionPill]);

  // Animate on value change (after first paint)
  useEffect(() => {
    if (!hasSnappedRef.current) return;
    positionPill(true);
  }, [value, positionPill]);

  // Re-snap on resize (no animation)
  useEffect(() => {
    if (!hasSnappedRef.current) return;
    const handleResize = () => positionPill(false);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [positionPill]);

  return (
    <div className={cn("t-tabs", className)} ref={barRef}>
      <span
        className="t-tabs-pill"
        ref={pillRef}
        style={{ visibility: ready ? "visible" : "hidden" } as CSSProperties}
        aria-hidden="true"
      />
      {tabs.map((tab) => (
        <button
          aria-pressed={tab.id === value}
          className="t-tab"
          data-cuelume-toggle
          key={tab.id}
          onClick={() => onValueChange(tab.id)}
          ref={(el) => {
            if (el) tabRefs.current.set(tab.id, el);
            else tabRefs.current.delete(tab.id);
          }}
          type="button"
        >
          {tab.label}
        </button>
      ))}
      {trailing}
    </div>
  );
}
