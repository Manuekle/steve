"use client";

import { useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { WhatsappIcon, InstagramIcon, Globe02Icon } from "@hugeicons/core-free-icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n/provider";
import { fetchJson } from "@/lib/api-error-message";
import type { Agent, ChannelId } from "@/lib/types";
import { Card, CardDescription, CardHeader, CardTitle } from "../../../_components/dashboard-card";

// Which agent answers each channel.
//
// This is the switch that makes the capability picker matter: without an
// agent on the channel, an inbound WhatsApp message belongs to no agent, and
// "this agent may only take payments" has nothing to apply to. Per channel
// rather than per conversation so that a working setup costs one decision —
// point all three at the same agent and it behaves as a single agent.

const UNASSIGNED = "__none__";

const CHANNEL_ICONS = {
  whatsapp: WhatsappIcon,
  instagram: InstagramIcon,
  web: Globe02Icon,
} as const;

const CHANNEL_LABELS: Record<ChannelId, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  web: "Web",
};

export function ChannelRouting({
  agents,
  onSaved,
}: {
  readonly agents: readonly Agent[];
  readonly onSaved?: () => void;
}) {
  const t = useT();
  const [channels, setChannels] = useState<ChannelId[]>([]);
  const [assignments, setAssignments] = useState<Partial<Record<ChannelId, string>>>({});
  const [saving, setSaving] = useState<ChannelId | null>(null);

  const load = useCallback(async () => {
    const result = await fetchJson<{
      channels: ChannelId[];
      assignments: Partial<Record<ChannelId, string>>;
    }>("/api/channels/agents", t);
    if (result.ok) {
      setChannels(result.data.channels);
      setAssignments(result.data.assignments);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const assign = async (channel: ChannelId, value: string) => {
    setSaving(channel);
    const agentId = value === UNASSIGNED ? null : value;
    const result = await fetchJson<{ assignments: Partial<Record<ChannelId, string>> }>(
      "/api/channels/agents",
      t,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, agentId }),
      },
    );
    setSaving(null);
    if (result.ok) {
      setAssignments(result.data.assignments);
      onSaved?.();
    }
  };

  if (channels.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex-col gap-1">
        <CardTitle>{t("agents.routingTitle")}</CardTitle>
        <CardDescription>{t("agents.routingDesc")}</CardDescription>
      </CardHeader>

      <div className="grid gap-2 p-5 pt-0 sm:grid-cols-2">
        {channels.map((channel) => (
          <div
            className="border-border flex items-center gap-2.5 rounded-lg border px-3 py-2"
            key={channel}
          >
            <HugeiconsIcon
              className="text-muted-foreground shrink-0"
              icon={CHANNEL_ICONS[channel]}
              size={16}
              strokeWidth={1.75}
            />
            <span className="w-20 shrink-0 text-[13px] font-medium">
              {CHANNEL_LABELS[channel]}
            </span>
            <Select
              disabled={saving === channel}
              onValueChange={(value) => void assign(channel, value)}
              value={assignments[channel] ?? UNASSIGNED}
            >
              <SelectTrigger className="h-8 flex-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>{t("agents.routingNone")}</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </Card>
  );
}
