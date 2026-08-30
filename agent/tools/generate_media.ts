import { defineTool } from "eve/tools";
import { generateImage, generateSpeech, experimental_generateVideo as generateVideo } from "ai";
import { z } from "zod";
import { getContactBySession } from "../../lib/business-store";
import { generateElevenLabsSpeech, hasElevenLabsKey } from "../../lib/elevenlabs";
import { sendWhatsAppMediaBytes } from "../../lib/whatsapp-send";
import { sendMessengerMediaBytes } from "../../lib/messenger-send";
import { sendInstagramMediaBytes } from "../../lib/instagram-send";

// Images and video are routed through the Vercel AI Gateway (same
// AI_GATEWAY_API_KEY as the chat model in agent/agent.ts) — no separate
// provider key needed.
//
// Audio prefers ElevenLabs when an ELEVENLABS_API_KEY is configured in
// /settings, and falls back to the Gateway speech model when it is not, so
// the tool keeps working on a fresh install.
const IMAGE_MODEL = "openai/gpt-image-1";
const SPEECH_MODEL = "openai/tts-1";
const VIDEO_MODEL = "google/veo-3.1-fast-generate-001";

const EXTENSION_BY_TYPE = { image: "png", audio: "mp3", video: "mp4" } as const;

export default defineTool({
  description:
    "Generate an image, a short spoken-audio clip, or a short video from a text prompt, and send " +
    "it to the current contact on whichever channel they're messaging from (WhatsApp, Messenger, " +
    "or Instagram). Nothing is uploaded anywhere public — the file is generated, uploaded straight " +
    "to that platform's own media API, and sent. Video generation can take a while; say so before " +
    "calling this for a video. Not available on the web chat widget.",
  inputSchema: z.object({
    type: z.enum(["image", "audio", "video"]),
    prompt: z.string().min(1).describe("What to generate. For image and video, be descriptive — this is the only guidance the model gets. For audio, this is the exact script that gets spoken, word for word."),
    caption: z.string().optional().describe("Shown with the media on WhatsApp. Ignored on Messenger/Instagram — those platforms don't support attachment captions."),
    voice: z.string().optional().describe("Voice for audio, if the user asked for a specific one — an ElevenLabs voice id or one of george, sarah, daniel, charlotte. Defaults to the voice configured in Settings."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    status: z.number(),
    body: z.string(),
  }),
  async execute({ type, prompt, caption, voice }, ctx) {
    const contact = await getContactBySession(ctx.session.id);
    const channel = contact?.channel;

    if (channel !== "whatsapp" && channel !== "messenger" && channel !== "instagram") {
      return {
        ok: false,
        status: 0,
        body:
          channel === "web"
            ? "The web chat has no proactive send channel yet — describe the media instead, or tell the user this needs WhatsApp/Messenger/Instagram."
            : "This contact has no messaging channel yet — nothing to send to.",
      };
    }
    if (channel !== "whatsapp" && !contact?.externalId) {
      return { ok: false, status: 0, body: `No ${channel} recipient id on this contact yet.` };
    }
    if (channel === "whatsapp" && !contact?.phone) {
      return { ok: false, status: 0, body: "No phone number on this contact yet." };
    }

    let data: Uint8Array;
    let mimeType: string;
    try {
      if (type === "image") {
        const result = await generateImage({ model: IMAGE_MODEL, prompt, abortSignal: ctx.abortSignal });
        data = result.image.uint8Array;
        mimeType = result.image.mediaType;
      } else if (type === "audio") {
        if (await hasElevenLabsKey()) {
          const speech = await generateElevenLabsSpeech({
            text: prompt,
            voice,
            abortSignal: ctx.abortSignal,
          });
          data = speech.data;
          mimeType = speech.mimeType;
        } else {
          const result = await generateSpeech({
            model: SPEECH_MODEL,
            text: prompt,
            voice,
            abortSignal: ctx.abortSignal,
          });
          data = result.audio.uint8Array;
          mimeType = result.audio.mediaType;
        }
      } else {
        const result = await generateVideo({ model: VIDEO_MODEL, prompt, abortSignal: ctx.abortSignal });
        data = result.video.uint8Array;
        mimeType = result.video.mediaType;
      }
    } catch (error) {
      return { ok: false, status: 0, body: `Generation failed: ${error instanceof Error ? error.message : String(error)}` };
    }

    const filename = `generated.${EXTENSION_BY_TYPE[type]}`;

    if (channel === "whatsapp") {
      return sendWhatsAppMediaBytes({ to: contact!.phone!, type, data, mimeType, filename, caption });
    }
    if (channel === "messenger") {
      return sendMessengerMediaBytes({ recipientId: contact!.externalId!, type, data, mimeType, filename });
    }
    return sendInstagramMediaBytes({ recipientId: contact!.externalId!, type, data, mimeType, filename });
  },
});
