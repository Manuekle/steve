"use client";

import { HugeiconsIcon, type IconSvgElement } from "@/components/icons/icon";
import {
  Globe02Icon,
  WhatsappIcon,
  InstagramIcon,
  TelegramIcon,
  FileEditIcon,
} from "@hugeicons/core-free-icons";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { useT } from "@/lib/i18n/provider";
import type { ChannelId, ChannelStatus, ContactChannel } from "@/lib/types";
import { cn } from "@/lib/utils";

const CHANNEL_ICONS: Record<ContactChannel, IconSvgElement> = {
  web: Globe02Icon,
  whatsapp: WhatsappIcon,
  instagram: InstagramIcon,
  telegram: TelegramIcon,
  // Not a place you can reply, so it has no entry in CHANNEL_LABELS with the
  // messaging products — but contacts do arrive this way and have to be drawn.
  form: FileEditIcon,
};

/** An icon we can always render. `channel` comes off API data, so a value
 *  outside the union is a data problem — and an undefined icon throws inside
 *  HugeiconsIcon, which takes the whole page down with it. */
const iconFor = (channel: ContactChannel): IconSvgElement =>
  CHANNEL_ICONS[channel] ?? Globe02Icon;

/** Product names, so they stay as they are in every language. */
export const CHANNEL_LABELS: Record<ChannelId, string> = {
  web: "Web",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  telegram: "Telegram",
};

export function ChannelIcon({ channel, className }: {
  readonly channel: ContactChannel;
  readonly className?: string;
}) {
  return <HugeiconsIcon icon={iconFor(channel)} size={16} strokeWidth={1.75} className={cn("shrink-0", className)} />;
}

export function ChannelBadge({ channel }: { readonly channel: ContactChannel }) {
  const t = useT();
  // The four messaging channels are products and keep their names; "form" is a
  // common noun, so it is the one label here that gets translated.
  const label = channel === "form" ? t("channel.form") : (CHANNEL_LABELS[channel] ?? channel);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <HugeiconsIcon icon={iconFor(channel)} size={14} strokeWidth={1.75} className="shrink-0" />
      {label}
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
