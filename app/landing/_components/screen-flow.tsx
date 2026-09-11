"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { AiElementsIcon, PanelLeftIcon } from "@hugeicons/core-free-icons";
import { FlowCanvas } from "@/components/ai-elements/flow-canvas";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import type { WorkflowStep } from "@/lib/types";
import { MockSidebar, MockTopBar } from "./screen-chrome";

/**
 * The flow editor — read-only canvas with the same sidebar as every other
 * screen. The flow has its own header bar (workspace toolbar) instead of the
 * standard page header, so it uses MockSidebar directly.
 */

function buildSteps(t: (key: string) => string): readonly WorkflowStep[] {
  return [
    {
      id: "lp-step-1",
      type: "ai_response",
      config: {
        prompt: t("landing.demo.flow.step1Prompt"),
      },
    },
    {
      id: "lp-step-2",
      type: "condition",
      config: { condition: t("landing.demo.flow.step2Condition") },
      thenSteps: [
        {
          id: "lp-step-2-then-1",
          type: "update_contact",
          config: { contactNote: t("landing.demo.flow.step2ThenNote"), contactStatus: "closed" },
        },
      ],
      elseSteps: [
        {
          id: "lp-step-2-else-1",
          type: "transfer_human",
          config: { message: t("landing.demo.flow.step2ElseMessage") },
        },
      ],
    },
    {
      id: "lp-step-3",
      type: "message",
      config: { message: t("landing.demo.flow.step3Message") },
    },
  ];
}

export function FlowScreen({ compact = false }: { readonly compact?: boolean }) {
  const t = useT();
  const steps = buildSteps(t);

  return (
    // Same window as `AppChrome`: this screen builds its own shell for the
    // full-bleed canvas, so it carries the same fixed height and clip.
    <div
      className={`relative flex overflow-hidden bg-background text-foreground ${compact ? "h-[28rem] sm:h-[32rem] lg:h-[37rem]" : "h-[38rem] lg:h-[42rem]"}`}
      // `inert` bloquea TODA interacción en el subtree: hover, click, focus,
      // context menu. Los children con pointer-events-auto son ignorados.
      // Los portales (ContextMenu) nunca se abren porque el evento trigger
      // nunca llega al handler.
      inert={true}
    >
      {!compact ? <MockSidebar active="/automations" /> : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!compact ? <>
        <MockTopBar />

        {/* Workspace header — same shape as the real flow editor. */}
        <div className="flex shrink-0 items-center gap-3 border-border border-b bg-card/40 px-3 py-2.5 backdrop-blur-sm sm:px-4">
          <HugeiconsIcon icon={AiElementsIcon} size={16} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {/* Mockup chrome, not a page heading — see screen-chrome.tsx. */}
            <h2 className="truncate text-sm font-semibold tracking-tight">{t("landing.demo.flow.title")}</h2>
            <StatusBadge status="draft" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm">{t("automations.edit")}</Button>
            <Button variant="default" size="sm">{t("automations.activate")}</Button>
            <span className="mx-0.5 h-5 w-px bg-border" />
            <button
              type="button"
              aria-label={t("assistant.tab")}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground"
            >
              <HugeiconsIcon icon={PanelLeftIcon} size={16} strokeWidth={1.75} className="rotate-180" />
            </button>
          </div>
        </div>

        {/* Draft note, like the app. */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-border border-t bg-muted/30 px-4 py-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">{t("automations.draftLabel")}</span>
          <span className="h-3 w-px bg-border" />
          <span className="text-[11px] text-muted-foreground">{t("automations.draftHint")}</span>
        </div>
        </> : null}

        {/* Canvas fills remaining space. Static on the landing: no pan, zoom or
            selection — the visitor only reads the flow, they don't drive it. */}
        <div className="pointer-events-none relative min-h-0 flex-1">
          <FlowCanvas
            steps={steps}
            selectedPath={null}
            onSelect={() => {}}
            onAddStep={() => {}}
            onAddStepAt={() => {}}
            onRemoveStep={() => {}}
            onMoveNode={() => {}}
            onResetLayout={() => {}}
            onIsolateStep={() => {}}
            onConnectSteps={() => {}}
            onToggleDisabled={() => {}}
            onSetConnector={() => {}}
            onRunStep={() => {}}
            embedded
            heightClassName="h-full"
            containerClassName="h-full rounded-none border-0"
          />
        </div>
      </div>

    </div>
  );
}
