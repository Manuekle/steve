import { defineTool } from "eve/tools";
import { z } from "zod";
import { getContactBySession } from "../../lib/business-store";
import { sendWhatsAppMedia } from "../../lib/whatsapp-send";
import { sendMessengerMedia } from "../../lib/messenger-send";
import { sendInstagramMedia } from "../../lib/instagram-send";

export default defineTool({
  description:
    "Send an image, audio, or video by public HTTPS URL to the current contact, on " +
    "whichever channel they're messaging from (WhatsApp, Messenger, or Instagram). " +
    "Requires the matching channel's credentials to be configured. Not available on " +
    "the web chat widget — for web, just put the URL in your reply.",
  inputSchema: z.object({
    type: z.enum(["audio", "image", "video"]),
    url: z.string().url(),
    caption: z
      .string()
      .optional()
      .describe("Shown with the media on WhatsApp. Ignored on Messenger/Instagram — those platforms don't support attachment captions."),
    to: z.string().optional().describe("WhatsApp phone override, with country code. Defaults to this contact. Only applies on WhatsApp."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    status: z.number(),
    body: z.string(),
  }),
  async execute({ type, url, caption, to }, ctx) {
    const contact = await getContactBySession(ctx.session.id);
    const channel = contact?.channel;

    if (channel === "messenger") {
      if (!contact?.externalId) {
        return { ok: false, status: 0, body: "No Messenger recipient id on this contact yet." };
      }
      return sendMessengerMedia({ recipientId: contact.externalId, type, url });
    }

    if (channel === "instagram") {
      if (!contact?.externalId) {
        return { ok: false, status: 0, body: "No Instagram recipient id on this contact yet." };
      }
      return sendInstagramMedia({ recipientId: contact.externalId, type, url });
    }

    if (channel === "web") {
      return {
        ok: false,
        status: 0,
        body: "The web chat has no proactive send channel — include the URL directly in your reply instead of calling send_media.",
      };
    }

    // WhatsApp (or unknown contact — fall back to phone/`to` override, same
    // as before this tool learned about other channels).
    const phone = to ?? contact?.phone;
    if (!phone) {
      return {
        ok: false,
        status: 0,
        body: "No phone number. Call upsert_contact with phone first, or pass `to`.",
      };
    }
    return sendWhatsAppMedia({ to: phone, type, url, caption });
  },
});
