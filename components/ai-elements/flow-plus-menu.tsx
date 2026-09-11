"use client";

import { Liquid } from "liquid-gooey";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STEP_ICONS, STEP_LABEL_KEYS } from "@/lib/workflow-step-meta";
import { useT } from "@/lib/i18n/provider";
import type { WorkflowStepType } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Three quick actions; the full catalogue stays in the canvas step palette. */
const QUICK: readonly WorkflowStepType[] = ["message", "condition", "ai_response"];

const PLUS_SIZE = 36;
/** Every item occupies the same square, so closed they merge into one circle. */
const STACKED = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
} as const;

/**
 * Quick-add for the canvas. Closed it's a single "+"; open, the shortcuts
 * split off it like droplets — `liquid-gooey` merges the buttons into one
 * surface while they're close, so the fan-out reads as liquid separating
 * rather than three icons appearing.
 */
export function FlowPlusMenu({
  open,
  onOpenChange,
  onPick,
  className,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPick: (type: WorkflowStepType) => void;
  readonly className?: string;
}) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();

  // Escape and outside clicks close it — it floats over the canvas, so there's
  // no backdrop to catch them.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
        if (rootRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, onOpenChange]);

  // A compact quarter arc. The 32px droplets have room to separate at rest.
  const offsets: readonly { x: number; y: number }[] = [
    { x: 0, y: -64 },
    { x: -46, y: -46 },
    { x: -64, y: 0 },
  ];

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Liquid
        blur={5}
        contrast={22}
        fill="var(--card)"
        filterPadding={80}
        // Liquid lays its items out in normal flow (each wrapper is an
        // inline-block), so left alone the closed menu is a row of buttons the
        // goo smears into one long blob. Stacking every item on the same 36px
        // square makes the closed state a single circle that splits into
        // droplets as the offsets kick in.
        style={{ width: PLUS_SIZE, height: PLUS_SIZE }}
      >
        <Liquid.Item style={{ ...STACKED, zIndex: 1 }}>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => onOpenChange(!open)}
            aria-expanded={open}
            aria-label={t("automations.addStep")}
            className={cn(
              "flex size-9 items-center justify-center rounded-full border border-border text-foreground",
              "transition-transform duration-200 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--foreground)]",
              open ? "rotate-45" : "rotate-0",
            )}
          >
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </Liquid.Item>

        {QUICK.map((type, i) => (
          <Liquid.Item
            key={type}
            x={open ? offsets[i]!.x : 0}
            y={open ? offsets[i]!.y : 0}
            transition={reducedMotion ? { duration: 0 } : "smooth"}
            delay={reducedMotion ? 0 : open ? i * 25 : (QUICK.length - 1 - i) * 20}
            style={STACKED}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  tabIndex={open ? 0 : -1}
                  disabled={!open}
                  aria-hidden={!open}
                  aria-label={t(STEP_LABEL_KEYS[type])}
                  onClick={() => {
                    onPick(type);
                    onOpenChange(false);
                    triggerRef.current?.focus();
                  }}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border border-border text-foreground/80",
                    "transition-[opacity,color] duration-150 ease-out hover:text-foreground motion-reduce:transition-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--foreground)]",
                    open ? "opacity-100" : "pointer-events-none opacity-0",
                  )}
                >
                  <HugeiconsIcon icon={STEP_ICONS[type]} size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">{t(STEP_LABEL_KEYS[type])}</TooltipContent>
            </Tooltip>
          </Liquid.Item>
        ))}

      </Liquid>
    </div>
  );
}
