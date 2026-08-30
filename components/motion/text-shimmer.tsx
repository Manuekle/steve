import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import {
  TEXT_SHIMMER_CLASS_NAME,
  TEXT_SHIMMER_KEYFRAMES,
  textShimmerStyle,
} from "@/lib/text-shimmer";

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

export interface TextShimmerProps {
  children: ReactNode;
  as?: TextTag;
  duration?: number;
  className?: string;
}

export function TextShimmer({ children, as: Comp = "span", duration = 2.5, className }: TextShimmerProps) {
  return (
    <>
      <style>
        {TEXT_SHIMMER_KEYFRAMES}
      </style>
      <Comp
        style={textShimmerStyle(duration)}
        className={cn(
          "inline-block",
          TEXT_SHIMMER_CLASS_NAME,
          className,
        )}
      >
        {children}
      </Comp>
    </>
  );
}
