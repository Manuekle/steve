"use client";

import { Liquid } from "liquid-gooey";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STEP_ICONS, STEP_LABEL_KEYS } from "@/lib/workflow-step-meta";
import { useT } from "@/lib/i18n/provider";
import type { WorkflowStepType } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The step types worth one click; everything else lives behind "more". */
const QUICK: readonly WorkflowStepType[] = ["message", "condition", "ai_response"];

const PLUS_SIZE = 44;
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
  onMore,
  className,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPick: (type: WorkflowStepType) => void;
  readonly onMore: () => void;
  readonly className?: string;
}) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);

  // Escape and outside clicks close it — it floats over the canvas, so there's
  // no backdrop to catch them.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
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

  // A quarter arc of radius ~80 sweeping up and to the left of the "+", which
  // lives in the canvas's bottom-right corner. Evenly spaced so the 36px
  // buttons bridge into each other without stacking.
  const offsets: readonly { x: number; y: number }[] = [
    { x: -8, y: -80 },
    { x: -45, y: -68 },
    { x: -68, y: -45 },
  ];
  const moreOffset = { x: -80, y: -8 };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Liquid
        blur={9}
        contrast={22}
        fill="var(--card)"
        filterPadding={80}
        // Liquid lays its items out in normal flow (each wrapper is an
        // inline-block), so left alone the closed menu is a row of buttons the
        // goo smears into one long blob. Stacking every item on the same 44px
        // square makes the closed state a single circle that splits into
        // droplets as the offsets kick in.
        style={{ width: PLUS_SIZE, height: PLUS_SIZE }}
      >
        {QUICK.map((type, i) => (
          <Liquid.Item
            key={type}
            x={open ? offsets[i]!.x : 0}
            y={open ? offsets[i]!.y : 0}
            transition="bouncy"
            delay={open ? i * 40 : (QUICK.length - 1 - i) * 30}
            style={STACKED}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  tabIndex={open ? 0 : -1}
                  aria-label={t(STEP_LABEL_KEYS[type])}
                  onClick={() => {
                    onPick(type);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full border border-border text-foreground/80",
                    "transition-[opacity,color] duration-200 ease-out hover:text-foreground",
                    open ? "opacity-100" : "pointer-events-none opacity-0",
                  )}
                >
                  <HugeiconsIcon icon={STEP_ICONS[type]} size={15} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">{t(STEP_LABEL_KEYS[type])}</TooltipContent>
            </Tooltip>
          </Liquid.Item>
        ))}

        <Liquid.Item
          x={open ? moreOffset.x : 0}
          y={open ? moreOffset.y : 0}
          transition="bouncy"
          delay={open ? 120 : 0}
          style={STACKED}
        >
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              onMore();
              onOpenChange(false);
            }}
            className={cn(
              "flex size-9 items-center justify-center rounded-full border border-border",
              "font-mono text-[10px] tracking-wide text-muted-foreground",
              "transition-[opacity,color] duration-200 ease-out hover:text-foreground",
              open ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            {t("automations.moreSteps")}
          </button>
        </Liquid.Item>

        <Liquid.Item style={STACKED}>
          <button
            type="button"
            onClick={() => onOpenChange(!open)}
            aria-expanded={open}
            aria-label={t("automations.addStep")}
            className={cn(
              "flex size-11 items-center justify-center rounded-full border border-border text-foreground",
              "transition-transform duration-300 ease-out active:scale-95",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/50",
              open ? "rotate-45" : "rotate-0",
            )}
          >
            <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </Liquid.Item>
      </Liquid>
    </div>
  );
}
