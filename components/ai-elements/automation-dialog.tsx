"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { SuccessCheck } from "./success-check";
import type { Agent, Automation, AutomationTrigger, ChannelId } from "@/lib/types";

const TRIGGER_OPTIONS: ReadonlyArray<{ value: AutomationTrigger; labelKey: string; descriptionKey: string }> = [
  { value: "keyword", labelKey: "automations.triggerKeyword", descriptionKey: "automations.triggerKeywordDesc" },
  { value: "new_chat", labelKey: "automations.triggerNewChat", descriptionKey: "automations.triggerNewChatDesc" },
  { value: "schedule", labelKey: "automations.triggerSchedule", descriptionKey: "automations.triggerScheduleDesc" },
  { value: "no_reply", labelKey: "automations.triggerNoReply", descriptionKey: "automations.triggerNoReplyDesc" },
  { value: "webhook", labelKey: "automations.triggerWebhook", descriptionKey: "automations.triggerWebhookDesc" },
];

const CHANNEL_OPTIONS: ReadonlyArray<{ value: ChannelId | "all"; labelKey: string }> = [
  { value: "all", labelKey: "automations.channelAll" },
  { value: "web", labelKey: "chats.filterWeb" },
  { value: "whatsapp", labelKey: "chats.filterWhatsApp" },
  { value: "messenger", labelKey: "chats.filterMessenger" },
  { value: "instagram", labelKey: "chats.filterInstagram" },
];

/** Read-only endpoint for this automation, with a copy affordance. */
function WebhookUrl({ id }: { readonly id: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}/api/automations/${id}/webhook`;
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">{t("automations.webhookUrlLabel")}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground">
          {url}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            });
          }}
        >
          {copied ? (
            <span className="flex items-center gap-1.5">
              <SuccessCheck active className="text-sm" />
              {t("automations.copied")}
            </span>
          ) : (
            t("automations.copy")
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * Creates a new automation, or edits an existing one's basics (name/trigger/
 * channel). It never touches the workflow's steps — those are built on the
 * automation's own page (app/automations/[id]/page.tsx), not in this dialog.
 */
export function AutomationDialog({
  editing,
  onCreate,
  onUpdate,
  onClose,
}: {
  readonly editing: Automation | null;
  /** Omit when this dialog only ever edits (e.g. embedded on the automation's own page, where `editing` is always set). */
  readonly onCreate?: (data: Omit<Automation, "id" | "status" | "responseCount" | "createdAt" | "steps">) => void;
  readonly onUpdate: (id: string, updates: Partial<Omit<Automation, "id" | "steps">>) => void;
  readonly onClose: () => void;
}) {
  const t = useT();
  const isEditing = !!editing;
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [trigger, setTrigger] = useState<AutomationTrigger>(editing?.trigger ?? "keyword");
  const [triggerValue, setTriggerValue] = useState(editing?.triggerValue ?? "");
  const [channel, setChannel] = useState<ChannelId | "all">(editing?.channel ?? "all");
  const [agentId, setAgentId] = useState(editing?.agentId ?? "");
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    void fetch("/api/agents")
      .then((r) => r.json())
      .then((data: { agents?: Agent[] }) => setAgents(data.agents ?? []))
      .catch(() => {});
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    const data = {
      name: name.trim(),
      description: description.trim() || t("automations.noDescription"),
      trigger,
      triggerValue: triggerValue.trim(),
      channel,
      ...(agentId ? { agentId } : {}),
    };
    if (isEditing && editing) {
      onUpdate(editing.id, data);
    } else {
      onCreate?.(data);
    }
    setName("");
    setDescription("");
    setTrigger("keyword");
    setTriggerValue("");
    setChannel("all");
    setAgentId("");
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-lg flex flex-col max-h-[85vh] p-0 gap-0 overflow-hidden">
      <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
        <DialogTitle>{isEditing ? t("automations.editTitle") : t("automations.createTitle")}</DialogTitle>
        <DialogDescription>
          {isEditing ? t("automations.editDescription") : t("automations.createDescription")}
        </DialogDescription>
      </DialogHeader>
      <form id="create-automation-form" className="space-y-5 overflow-y-auto px-6 py-4 flex-1" onSubmit={handleSubmit}>
        <label className="block space-y-2 text-sm">
          <span className="font-medium">{t("automations.name")}</span>
          <Input
            onChange={(e) => setName(e.target.value)}
            placeholder={t("automations.namePlaceholder")}
            required
            value={name}
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span className="font-medium">{t("automations.description")}</span>
          <Input
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("automations.descriptionPlaceholder")}
            value={description}
          />
        </label>

        <div className="space-y-1.5">
          <span className="text-sm font-medium">{t("automations.trigger")}</span>
          <div className="grid grid-cols-2 gap-2">
            {TRIGGER_OPTIONS.map((opt) => (
              <button
                className={cn(
                  "rounded-lg border p-2.5 text-left text-sm transition-all duration-150",
                  trigger === opt.value
                    ? "border-foreground/20 bg-foreground/5 text-foreground shadow-[var(--shadow-inset)]"
                    : "border-border bg-card/50 text-muted-foreground hover:border-input hover:text-foreground",
                )}
                key={opt.value}
                onClick={() => setTrigger(opt.value)}
                type="button"
              >
                <span className="block text-sm font-medium">{t(opt.labelKey)}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t(opt.descriptionKey)}</span>
              </button>
            ))}
          </div>
        </div>
        {trigger === "keyword" ? (
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{t("automations.keywords")}</span>
            <Input
              onChange={(e) => setTriggerValue(e.target.value)}
              placeholder={t("automations.keywordsPlaceholder")}
              value={triggerValue}
            />
          </label>
        ) : null}
        {trigger === "schedule" ? (
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{t("automations.cronExpression")}</span>
            <Input
              onChange={(e) => setTriggerValue(e.target.value)}
              placeholder="0 9 * * *"
              value={triggerValue}
              pattern="^[\d\*\/\-\,]+$"
              title="Formato cron: minuto hora día mes díaSemana (ej: 0 9 * * *)"
            />
            <p className="text-xs text-muted-foreground">{t("automations.cronFormat")}</p>
          </label>
        ) : null}
        {trigger === "webhook" ? (
          <div className="space-y-2">
            <label className="block space-y-2 text-sm">
              <span className="font-medium">{t("automations.webhookToken")}</span>
              <Input
                onChange={(e) => setTriggerValue(e.target.value)}
                placeholder={t("automations.webhookTokenPlaceholder")}
                value={triggerValue}
              />
            </label>
            {editing ? <WebhookUrl id={editing.id} /> : null}
            <p className="text-xs leading-relaxed text-muted-foreground">{t("automations.webhookHelp")}</p>
          </div>
        ) : null}
        {trigger === "no_reply" ? (
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{t("automations.waitTime")}</span>
            <Input
              onChange={(e) => setTriggerValue(e.target.value)}
              placeholder="30min"
              value={triggerValue}
              pattern="^\\d+(min|h|d)?$"
              title="Formato: 30min, 2h, 1d"
            />
          </label>
        ) : null}

        <div className="space-y-1.5">
          <span className="text-sm font-medium">{t("automations.channel")}</span>
          <Select
            value={channel}
            onValueChange={(val) => setChannel(val as ChannelId | "all")}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNEL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium">{t("automations.agent")}</span>
          <Select
            value={agentId || "__default__"}
            onValueChange={(val) => setAgentId(val === "__default__" ? "" : val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("automations.agentPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">{t("automations.agentDefault")}</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("automations.agentHelp")}</p>
        </div>
      </form>
      <div className="px-6 py-4 border-t border-border shrink-0 bg-card">
        <div className="flex justify-end">
          <Button type="submit" form="create-automation-form">{isEditing ? t("automations.save") : t("automations.create")}</Button>
        </div>
      </div>
    </DialogContent>
  );
}
