import { defineHook } from "eve/hooks";
import {
  channelFromKind,
  getContactBySession,
  upsertChat,
  upsertContact,
} from "../../lib/business-store";

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
 * agent/channels/{whatsapp,messenger,instagram}.ts). WhatsApp's principalId
 * is a phone number; Messenger/Instagram's is a platform-scoped id (PSID/
 * IGSID) send_media needs to message the contact proactively.
 */
function identityFromAuth(
  channel: ReturnType<typeof channelFromKind>,
  principalId: string | undefined,
): { phone?: string; externalId?: string } {
  if (!principalId) return {};
  if (channel === "whatsapp") return { phone: principalId };
  if (channel === "messenger" || channel === "instagram") return { externalId: principalId };
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
    },
  },
});
