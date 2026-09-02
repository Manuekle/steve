import { defineHook } from "eve/hooks";
import {
  appendConversationTurn,
  channelFromKind,
  getContactBySession,
  upsertChat,
  upsertContact,
} from "../../lib/business-store";
import type { ChannelId } from "../../lib/types";

/** The whole message, not the list preview — a mirrored transcript is only
 *  worth reading if it says what was actually said. */
function fullText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "content" in value) {
    const content = (value as { content?: unknown }).content;
    if (typeof content === "string") return content;
  }
  return "";
}

/** Web chat is the operator's own console, not a customer channel — mirroring
 *  it would fill the conversation viewer with the operator talking to
 *  themselves. */
function isCustomerChannel(channel: ChannelId): boolean {
  return channel === "whatsapp" || channel === "instagram";
}

/**
 * Mirror one turn into the app's own transcript store. Never allowed to
 * break a turn: what the customer sees matters more than the copy of it.
 */
async function mirrorTurn(
  sessionId: string,
  channel: ChannelId,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  if (!isCustomerChannel(channel) || !content.trim()) return;
  try {
    const contact = await getContactBySession(sessionId);
    await appendConversationTurn({
      sessionId,
      channel,
      role,
      content,
      contactId: contact?.id,
      title: contact?.name,
    });
  } catch {
    // Persistence must never fail a turn.
  }
}

function preview(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 240);
  if (value && typeof value === "object" && "content" in value) {
    const content = (value as { content?: unknown }).content;
    if (typeof content === "string") return content.slice(0, 240);
  }
  return "";
}

/**
 * Channel-native sender identity carried on the session's auth context
 * (set by the channel file when it calls `send(...)` — see
 * agent/channels/{whatsapp,instagram}.ts). WhatsApp's principalId is a phone
 * number; Instagram's is a platform-scoped id (IGSID) that send_media needs to
 * message the contact proactively.
 */
function identityFromAuth(
  channel: ReturnType<typeof channelFromKind>,
  principalId: string | undefined,
): { phone?: string; externalId?: string } {
  if (!principalId) return {};
  if (channel === "whatsapp") return { phone: principalId };
  if (channel === "instagram") return { externalId: principalId };
  return {};
}

export default defineHook({
  events: {
    async "session.started"(_event, ctx) {
      try {
        const channel = channelFromKind(ctx.channel.kind);
        await upsertContact({
          sessionId: ctx.session.id,
          channel,
          source: channel,
          ...identityFromAuth(channel, ctx.session.auth.current?.principalId),
        });
        await upsertChat({
          title: "Conversation",
          channel,
          lastMessage: "",
          lastMessageAt: new Date().toISOString(),
          messageCount: 0,
          sessionId: ctx.session.id,
        });
      } catch {
        // Persistence must never fail a turn.
      }
    },
    async "message.received"(event, ctx) {
      await mirrorTurn(
        ctx.session.id,
        channelFromKind(ctx.channel.kind),
        "user",
        fullText(event.data.message),
      );
    },
    async "message.completed"(event, ctx) {
      try {
        const lastMessage = preview(event.data.message);
        const channel = channelFromKind(ctx.channel.kind);
        const existing = await getContactBySession(ctx.session.id);
        await upsertContact({
          sessionId: ctx.session.id,
          channel,
          lastMessage: lastMessage || existing?.lastMessage,
          lastMessageAt: new Date().toISOString(),
        });
        await upsertChat({
          title: existing?.name ?? "Conversation",
          channel,
          lastMessage: lastMessage || existing?.lastMessage || "",
          lastMessageAt: new Date().toISOString(),
          messageCount: 1,
          sessionId: ctx.session.id,
          handoff: existing?.status === "waiting_human",
        });
      } catch {
        // Persistence must never fail a turn.
      }
      await mirrorTurn(
        ctx.session.id,
        channelFromKind(ctx.channel.kind),
        "assistant",
        fullText(event.data.message),
      );
    },
  },
});
