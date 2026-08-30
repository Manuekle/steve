"use client";

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Globe02Icon,
  MessageCircleIcon,
  MessengerIcon,
  InstagramIcon,
} from "@hugeicons/core-free-icons";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import type { ChannelId, ChannelStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const CHANNEL_ICONS: Record<ChannelId, IconSvgElement> = {
  web: Globe02Icon,
  whatsapp: MessageCircleIcon,
  messenger: MessengerIcon,
  instagram: InstagramIcon,
};

/** Product names, so they stay as they are in every language. */
export const CHANNEL_LABELS: Record<ChannelId, string> = {
  web: "Web",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
};

export function ChannelIcon({ channel, className }: {
  readonly channel: ChannelId;
  readonly className?: string;
}) {
  return <HugeiconsIcon icon={CHANNEL_ICONS[channel]} size={16} strokeWidth={1.75} className={cn("shrink-0", className)} />;
}

export function ChannelBadge({ channel }: { readonly channel: ChannelId }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <HugeiconsIcon icon={CHANNEL_ICONS[channel]} size={14} strokeWidth={1.75} className="shrink-0" />
      {CHANNEL_LABELS[channel]}
    </span>
  );
}

// ── Status badges ────────────────────────────────────────────────────
// The badge system itself moved to components/ui/status-badge.tsx so surfaces
// outside app/ can use it. Re-exported here because every existing caller
// imports it from this file.

export { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";

/** Legacy channel status badge — maps ChannelStatus to StatusBadge. */
export function ChannelStatusBadge({ status }: { readonly status: ChannelStatus }) {
  const variant: StatusVariant =
    status === "connected" ? "connected" : status === "error" ? "error" : "disconnected";
  return <StatusBadge status={variant} />;
}
