"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  AiImagineIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InformationCircleIcon,
  PauseIcon,
  PencilEdit01Icon,
  PlayIcon,
  SearchIcon,
} from "@hugeicons/core-free-icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { AppChrome } from "./screen-chrome";

/**
 * Five agents, and the first one open.
 *
 * Three closed rows left the frame two-thirds empty — the screen was a header,
 * a search field, a short list and then 500px of background, which reads as a
 * page that failed to load rather than as a list with three things in it. The
 * page's own row expansion is what fills it, and it fills it with the thing
 * the section is actually claiming: an agent is instructions plus tools.
 */
function useMockAgents(t: (key: string) => string): readonly {
  readonly active: boolean;
  readonly description: string;
  readonly id: string;
  readonly name: string;
  readonly systemPrompt?: string;
  readonly time: string;
  readonly tools?: readonly string[];
}[] {
  return [
    {
      active: true,
      description: t("landing.demo.agents.steveDescription"),
      id: "steve",
      name: "steve",
      systemPrompt: t("landing.demo.agents.stevePrompt"),
      time: t("landing.demo.agents.time2h"),
      tools: ["search_knowledge", "update_contact", "create_reminder", "handoff_human"],
    },
    {
      active: true,
      description: t("landing.demo.agents.ventasDescription"),
      id: "ventas",
      name: t("landing.demo.agents.ventasName"),
      time: t("landing.demo.agents.time1d"),
    },
    {
      active: true,
      description: t("landing.demo.agents.catalogoDescription"),
      id: "catalogo",
      name: t("landing.demo.agents.catalogoName"),
      time: t("landing.demo.agents.time2d"),
    },
    {
      active: false,
      description: t("landing.demo.agents.postventaDescription"),
      id: "postventa",
      name: t("landing.demo.agents.postventaName"),
      time: t("landing.demo.agents.time3d"),
    },
    {
      active: false,
      description: t("landing.demo.agents.campanasDescription"),
      id: "campanas",
      name: t("landing.demo.agents.campanasName"),
      time: t("landing.demo.agents.time6d"),
    },
  ];
}

/**
 * The agents list, as `app/agents/page.tsx` renders it: the page header with
 * the provider badge and the new-agent action, the search row, and the cards —
 * icon, name, active/inactive pill, description, and the pause/play plus
 * expand controls. Static like every landing screen.
 */
export function AgentsScreen() {
  const t = useT();
  const MOCK_AGENTS = useMockAgents(t);

  return (
    <AppChrome
      active="/agents"
      title={t("agents.title")}
      subtitle={t("agents.subtitle")}
      actions={
        <span className="flex items-center gap-2">
          <StatusBadge
            status="connected"
            label={`${t("models.status.ok")} · ${t("models.balance", { amount: "18.40" })}`}
          />
          <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 font-medium text-sm shadow-[var(--shadow-inset)]">
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
            <span className="hidden sm:inline">{t("agents.new")}</span>
          </span>
        </span>
      }
    >
      <div className="relative mb-4">
        <HugeiconsIcon
          icon={SearchIcon}
          size={16}
          strokeWidth={1.75}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input placeholder={t("agents.search")} className="pl-9" />
      </div>

      <div className="space-y-2">
        {MOCK_AGENTS.map((agent) => {
          const isOpen = agent.systemPrompt !== undefined;

          return (
            <div key={agent.id} className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-3 px-5 py-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={AiImagineIcon} size={20} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{agent.name}</p>
                    <StatusBadge status={agent.active ? "active" : "paused"} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{agent.description}</p>
                </div>
                <span className="hidden text-xs text-muted-foreground sm:block">{agent.time}</span>
                <span className="flex size-8 items-center justify-center rounded-lg text-muted-foreground">
                  <HugeiconsIcon
                    icon={agent.active ? PauseIcon : PlayIcon}
                    size={14}
                    strokeWidth={1.75}
                  />
                </span>
                <span className="flex size-8 items-center justify-center rounded-lg text-muted-foreground">
                  <HugeiconsIcon
                    icon={isOpen ? ChevronUpIcon : ChevronDownIcon}
                    size={14}
                    strokeWidth={1.75}
                  />
                </span>
              </div>

              {isOpen ? (
                <div className="space-y-3 border-border border-t px-5 py-4 text-muted-foreground text-xs">
                  <div className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={InformationCircleIcon} size={12} strokeWidth={1.75} />
                    <span className="font-medium text-foreground">{t("agents.description")}:</span>
                    <span className="truncate">{agent.description}</span>
                  </div>
                  <div>
                    <p className="mb-1 font-medium text-foreground">{t("agents.systemPrompt")}:</p>
                    <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-[11px] leading-relaxed">
                      {agent.systemPrompt}
                    </pre>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{t("agents.tools")}:</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {agent.tools?.map((tool) => (
                        <span
                          key={tool}
                          className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-[10px]"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 border-border border-t pt-3">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 font-medium text-foreground text-xs shadow-[var(--shadow-inset)]">
                      <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={1.75} />
                      {t("agents.edit")}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </AppChrome>
  );
}
