"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A checkmark that plays the transitions.dev "success check" appear
 * animation (fade + rotate + blur + bob, with the stroke drawing in) the
 * moment `active` turns true. Renders nothing beforehand — there is no
 * static "off" state, only the transition into "done".
 */
export function SuccessCheck({ active, className }: { readonly active: boolean; readonly className?: string }) {
  const [shown, setShown] = useState(active);

  useEffect(() => {
    if (active) setShown(true);
  }, [active]);

  if (!shown) return null;

  return (
    <span className={cn("t-success-check", className)} data-state={active ? "in" : "out"} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" width="1em" height="1em">
        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
