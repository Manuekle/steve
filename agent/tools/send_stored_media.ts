import { defineTool } from "eve/tools";
import { z } from "zod";
import { getContactBySession } from "../../lib/business-store";
import { getAsset, readAssetBytes } from "../../lib/media-store";
import { sendWhatsAppMediaBytes } from "../../lib/whatsapp-send";
import { sendMessengerMediaBytes } from "../../lib/messenger-send";
import { sendInstagramMediaBytes } from "../../lib/instagram-send";

// The sending half of the media library. The bytes go straight from
// ~/.steve/media to the platform's own media API — same path
// generate_media.ts uses — so nothing has to be exposed on a public URL for
// a locally hosted install to be able to send a photo.

export default defineTool({
  description:
    "Send a file from the business's saved media library to the current contact, by the " +
    "asset_id returned from find_media. Call find_media first — never guess an id. Works on " +
    "WhatsApp, Messenger, and Instagram; not on the web chat widget.",
  inputSchema: z.object({
    asset_id: z.string().describe("The asset_id from find_media."),
    caption: z
      .string()
      .optional()
      .describe("Shown with the file on WhatsApp. Ignored on Messenger/Instagram — those platforms don't support attachment captions."),
    to: z
      .string()
      .optional()
      .describe("WhatsApp phone override, with country code. Defaults to this contact. Only applies on WhatsApp."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    status: z.number(),
    body: z.string(),
  }),
  async execute({ asset_id, caption, to }, ctx) {
    const asset = await getAsset(asset_id);
    if (!asset) {
      return { ok: false, status: 0, body: `No saved file with id ${asset_id}. Call find_media first.` };
    }
    if (asset.kind === "file") {
      return {
        ok: false,
        status: 0,
        body: "That asset isn't an image, video, or audio file, so it can't be sent as media.",
      };
    }

    let data: Uint8Array;
    try {
      data = await readAssetBytes(asset);
    } catch {
      return {
        ok: false,
        status: 0,
        body: "The file is listed in the library but its bytes are missing on disk. Ask the team to re-upload it.",
      };
    }

    const contact = await getContactBySession(ctx.session.id);
    const channel = contact?.channel;

    if (channel === "messenger" || channel === "instagram") {
      if (!contact?.externalId) {
        return { ok: false, status: 0, body: `No ${channel} recipient id on this contact yet.` };
      }
      const send = channel === "messenger" ? sendMessengerMediaBytes : sendInstagramMediaBytes;
      return send({
        recipientId: contact.externalId,
        type: asset.kind,
        data,
        mimeType: asset.mime,
        filename: asset.name,
      });
    }

    if (channel === "web") {
      return {
        ok: false,
        status: 0,
        body: "The web chat has no proactive send channel — describe the file instead, or tell the user this needs WhatsApp/Messenger/Instagram.",
      };
    }

    // WhatsApp, or a contact whose channel was never recorded — fall back to
    // the phone number, the same way send_media does.
    const phone = to ?? contact?.phone;
    if (!phone) {
      return {
        ok: false,
        status: 0,
        body: "No phone number. Call upsert_contact with phone first, or pass `to`.",
      };
    }
    return sendWhatsAppMediaBytes({
      to: phone,
      type: asset.kind,
      data,
      mimeType: asset.mime,
      filename: asset.name,
      caption,
    });
  },
});
