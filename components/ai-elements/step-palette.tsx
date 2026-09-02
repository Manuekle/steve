"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  STEP_DESCRIPTION_KEYS,
  STEP_GROUPS,
  STEP_ICONS,
  STEP_LABEL_KEYS,
} from "@/lib/workflow-step-meta";
import { useT } from "@/lib/i18n/provider";
import type { WorkflowStepType } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The step picker, as a centred modal rather than a full-bleed sheet dropping
 * out of the canvas's top edge — that read as a page-wide banner for what is a
 * short, focused list. Groups are accordions (`.t-acc`), so the whole catalogue
 * is reachable without the dialog growing taller than the viewport; searching
 * opens every group that still has a match.
 */
export function StepPalette({
  open,
  onOpenChange,
  onPick,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPick: (type: WorkflowStepType) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCollapsed(new Set());
    }
  }, [open]);

  const needle = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      STEP_GROUPS.map((group) => ({
        labelKey: group.labelKey,
        types: group.types.filter(
          (type) =>
            !needle ||
            t(STEP_LABEL_KEYS[type]).toLowerCase().includes(needle) ||
            t(STEP_DESCRIPTION_KEYS[type]).toLowerCase().includes(needle),
        ),
      })).filter((group) => group.types.length > 0),
    [needle, t],
  );

  const toggleGroup = (labelKey: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(labelKey)) next.delete(labelKey);
      else next.add(labelKey);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // `flex flex-col` is load-bearing, not decoration. DialogContent is a
        // grid by default, and in a grid the two children below size to their
        // content: the list took its full 980px, the dialog clipped it at its
        // max-height, and the group that fell past the fold could not be
        // reached at all — the pane had nothing to scroll. As a column the
        // list is the one item that flexes, so the overflow lands on it.
        className="flex max-h-[min(78vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        // Centred in the 44px search row rather than sitting at the padding
        // inset this dialog no longer has.
        closeClassName="top-2 right-3"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("automations.addStep")}</DialogTitle>
          <DialogDescription>{t("automations.searchStep")}</DialogDescription>
        </DialogHeader>

        {/* `pr-12` is the close button's lane — without it a long query runs
            under the ✕. */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border py-3 pr-12 pl-4">
          <HugeiconsIcon
            icon={Search01Icon}
            size={15}
            strokeWidth={1.75}
            className="shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("automations.searchStep")}
            aria-label={t("automations.searchStep")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {groups.length === 0 ? (
            <p className="px-1 py-8 text-center text-sm text-muted-foreground">
              {t("automations.noStepMatches")}
            </p>
          ) : (
            groups.map((group) => {
              // Searching re-opens everything: a hidden match is a dead end.
              const isOpen = needle.length > 0 || !collapsed.has(group.labelKey);
              return (
                <div key={group.labelKey} className="t-acc" data-open={isOpen}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.labelKey)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50"
                  >
                    <span className="flex-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground/70 uppercase">
                      {t(group.labelKey)}
                    </span>
                    <span className="t-acc-chevron text-muted-foreground/60" aria-hidden="true">
                      <svg viewBox="0 0 16 16" width={13} height={13} fill="none">
                        <path
                          d="M4 6.5L8 10.5L12 6.5"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                  <div className="t-acc-panel">
                    <div className="t-acc-panel-inner">
                      <div className="flex flex-col gap-0.5 pt-1 pb-2">
                        {group.types.map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => onPick(type)}
                            className={cn(
                              "flex items-start gap-2.5 rounded-lg p-2 text-left",
                              "transition-colors duration-150 hover:bg-accent",
                              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50",
                            )}
                          >
                            <span
                              className="mt-px flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/70"
                              aria-hidden="true"
                            >
                              <HugeiconsIcon icon={STEP_ICONS[type]} size={14} strokeWidth={1.75} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium">
                                {t(STEP_LABEL_KEYS[type])}
                              </span>
                              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                                {t(STEP_DESCRIPTION_KEYS[type])}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
