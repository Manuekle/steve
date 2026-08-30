"use client";
// beui.dev/components/motion/text-animation

import { motion, type Transition, useInView, useReducedMotion } from "motion/react";
import { useRef, type ReactNode } from "react";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

type SplitMode = "word" | "char";

/**
 * Text-level wrappers only, rather than `ElementType`.
 *
 * `@react-three/fiber` (pulled in by the voice orb on /agents/[id]/voice)
 * augments the global JSX element table with the whole three.js scene graph.
 * A prop typed as "any element" then has to satisfy every one of those
 * elements' props at once, which collapses `children` and `className` to
 * `never` and makes this component fail to typecheck from a dependency it
 * never imports. The narrow list is also closer to the truth: this renders
 * text, and every call site passes h1, h2 or span.
 */
type TextTag =
  | "span"
  | "div"
  | "p"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "label"
  | "strong"
  | "em";


export interface TextRevealProps {
  text: string | string[];
  as?: TextTag;
  className?: string;
  split?: SplitMode;
  stagger?: number;
  delay?: number;
  blur?: number;
  yOffset?: string | number;
  spring?: { stiffness?: number; damping?: number; mass?: number };
  once?: boolean;
  whileInView?: boolean;
  children?: ReactNode;
}

const DEFAULT_SPRING = { stiffness: 140, damping: 26, mass: 1.2 };

type WordGroup = { text: string; trailing: string };

/**
 * One tokenizer for both modes: a line becomes the words it is made of, each
 * carrying the whitespace that follows it. Word mode animates a group at a
 * time, char mode the characters inside one — so the two can't drift apart on
 * what counts as a word or where a space belongs. Runs of whitespace and tabs
 * survive as their own group rather than collapsing.
 */
function toWordGroups(line: string): WordGroup[] {
  const chunks = line.match(/\S+\s*|\s+/g) ?? [];
  return chunks.map((chunk) => {
    const text = chunk.replace(/\s+$/, "");
    return { text, trailing: chunk.slice(text.length) };
  });
}

export function TextReveal({
  text,
  as: Comp = "span",
  className,
  split = "word",
  stagger = 0.09,
  delay = 0,
  blur = 12,
  yOffset = "40%",
  spring,
  once = true,
  whileInView = false,
  children,
}: TextRevealProps) {
  /* JSX resolves a union of tags by intersecting their props, which makes the
     ref type impossible to satisfy (an HTMLDivElement is not an HTMLSpanElement).
     One concrete signature at the boundary — the same shape every tag in
     `TextTag` accepts — keeps the public prop honest and the JSX checkable. */
  const Tag = Comp as unknown as React.ComponentType<{
    ref?: React.Ref<HTMLElement>;
    className?: string;
    children?: ReactNode;
  }>;
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once, amount: 0.4 });
  const reduce = useReducedMotion();
  const shouldAnimate = whileInView ? inView : true;

  const lines = Array.isArray(text) ? text : [text];
  const s = { ...DEFAULT_SPRING, ...spring };

  let unitIndex = 0;
  const lineCounts = new Map<string, number>();

  return (
    <Tag ref={ref} className={cn("block", className)}>
      {lines.map((line) => {
        const lineCount = lineCounts.get(line) ?? 0;
        lineCounts.set(line, lineCount + 1);
        const lineKey = `${line}-${lineCount}`;
        const unitCounts = new Map<string, number>();

        const renderUnit = (unit: string) => {
          const d = delay + unitIndex * stagger;
          unitIndex += 1;
          const unitCount = unitCounts.get(unit) ?? 0;
          unitCounts.set(unit, unitCount + 1);
          const unitKey = `${unit}-${unitCount}`;
          const initial = reduce
            ? { opacity: 0 }
            : { y: yOffset, opacity: 0, filter: `blur(${blur}px)` };
          const animate = shouldAnimate
            ? reduce
              ? { opacity: 1 }
              : { y: 0, opacity: 1, filter: "blur(0px)" }
            : initial;
          const transition: Transition = reduce
            ? { opacity: { duration: 0.25, ease: EASE_OUT, delay: d * 0.3 } }
            : {
                y: { type: "spring" as const, ...s, delay: d },
                opacity: { duration: 0.7, ease: EASE_OUT, delay: d },
                filter: { duration: 0.9, ease: EASE_OUT, delay: d },
              };
          return (
            <motion.span
              key={unitKey}
              initial={initial}
              animate={animate}
              transition={transition}
              // `whitespace-pre` is load-bearing: a unit's trailing space is
              // inside an inline-block and would otherwise collapse to zero
              // width, running every word together.
              className="inline-block whitespace-pre will-change-transform"
            >
              {unit}
            </motion.span>
          );
        };

        const groups = toWordGroups(line);
        const groupCounts = new Map<string, number>();

        return (
          <span key={lineKey} className="block">
            {groups.map((group) => {
              const whole = group.text + group.trailing;
              // Characters animate one at a time, but each word (plus the
              // space that follows it) sits in its own inline-block so a long
              // line wraps between words instead of mid-word.
              if (split !== "char") return renderUnit(whole);

              const groupCount = groupCounts.get(whole) ?? 0;
              groupCounts.set(whole, groupCount + 1);
              return (
                <span
                  key={`${whole}-${groupCount}`}
                  className="inline-block whitespace-pre"
                >
                  {Array.from(whole).map((char) => renderUnit(char))}
                </span>
              );
            })}
          </span>
        );
      })}
      {children}
    </Tag>
  );
}
