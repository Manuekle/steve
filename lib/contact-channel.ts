import type { ChannelId, ContactChannel } from "./types";

/**
 * A contact's channel, narrowed to somewhere you can actually send a message.
 *
 * `ContactChannel` is a superset of `ChannelId`: a lead can arrive from a form
 * on the site or from a phone call the voice agent answered, and neither is a
 * transport. Every caller that needs a `ChannelId` — the chat mirror, the
 * playbook's channel match, the handoff flag — used to inline
 * `channel === "form" ? "web" : channel`, which quietly widened into a lie the
 * day a second non-messaging origin appeared: a voice contact would have been
 * cast straight through as if `"voice"` were a channel you could DM.
 *
 * Falling back to `"web"` rather than dropping the contact is deliberate. The
 * inbox is the destination in both cases, and "web" is what it already means
 * by "this conversation lives in the app".
 */
export function toMessagingChannel(channel: ContactChannel): ChannelId {
  if (channel === "whatsapp" || channel === "instagram") return channel;
  return "web";
}

/** True when this contact has no outbound transport of its own — a form
 *  submission or a phone call. Callers that would otherwise message them (the
 *  no-reply follow-up schedule) skip these rather than sending nowhere. */
export function isInboundOnlyChannel(channel: ContactChannel): boolean {
  return channel === "form" || channel === "voice";
}
