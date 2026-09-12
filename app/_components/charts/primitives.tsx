"use client";

import { AnimatePresence, motion, useReducedMotion, useSpring } from "motion/react";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import styles from "./tiles.module.css";

export const NUMBER_SPRING = { stiffness: 190, damping: 27, mass: 0.7 };
export const MARKER_SPRING = { stiffness: 650, damping: 42, mass: 0.5 };
export const CHART_EASE = [0.19, 1, 0.22, 1] as const;

export function AnimatedNumber({ value, format, className }: {
  value: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const { locale } = useI18n();
  const reduced = useReducedMotion();
  const spring = useSpring(value, NUMBER_SPRING);
  const node = useRef<HTMLSpanElement>(null);
  const formatter = useMemo(() => format ?? ((n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: "always" }).format(n)), [format, locale]);
  useLayoutEffect(() => {
    const paint = (n: number) => { if (node.current) node.current.textContent = formatter(n); };
    const unsubscribe = spring.on("change", paint);
    if (reduced) spring.jump(value);
    else spring.set(value);
    paint(spring.get());
    return unsubscribe;
  }, [value, reduced, spring, formatter]);
  return <span className={cn(styles.number, className)}><span aria-hidden="true" ref={node}>{formatter(value)}</span><span className="sr-only">{formatter(value)}</span></span>;
}

export function ChartPeriod({ value, children }: { value: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <span className={styles.periodText}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={value} initial={{ opacity: 0, y: reduced ? 0 : 5, filter: reduced ? "none" : "blur(3px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: reduced ? 0 : -5, filter: reduced ? "none" : "blur(3px)" }} transition={{ duration: reduced ? 0 : 0.18, ease: CHART_EASE }}>{children}</motion.span>
      </AnimatePresence>
    </span>
  );
}

export function ChartSelector({ options, value, onChange, label, className }: {
  options: readonly { value: string; label: ReactNode }[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  return <div className={cn("mt-4 flex max-w-full justify-center overflow-x-auto", className)} role="group" aria-label={label}>
    <SlidingTabs tabs={options.map((option) => ({ id: option.value, label: option.label }))} value={value} onValueChange={onChange} />
  </div>;
}

export function ChartGrid({ fractions }: { fractions: readonly number[] }) {
  return <div aria-hidden="true" className={styles.grid}>
    {fractions.map((fraction) => <span key={fraction} data-baseline={fraction === 0} style={{ bottom: `${fraction * 100}%` }} />)}
  </div>;
}
