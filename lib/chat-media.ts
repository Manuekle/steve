import type { UserContent } from "ai";
import type { Message } from "chat";
import { messageToUserContent } from "eve/channels/chat-sdk";
import { transcribeAudio } from "./elevenlabs";

// @chat-adapter/whatsapp and @chat-adapter/instagram build every attachment
// (image, document, audio, voice note, video, sticker) with fetchData /
// fetchMetadata — never `.url`. eve's own messageToUserContent only includes
// an attachment when `.url` is set, so every attachment on these two channels
// was being silently dropped before reaching the model: no error, no log,
// just gone. This fetches the bytes instead, and transcribes audio (raw audio
// content parts aren't supported here — see the toAiMessages doc comment in
// the chat package, which treats audio/video the same way).

/** Same contract as eve's messageToUserContent, for a message whose
 *  attachments carry fetchData instead of a public url. */
export async function messageToAgentContent(message: Message): Promise<string | UserContent> {
  const attachments = message.attachments ?? [];
  if (attachments.length === 0) return messageToUserContent(message);

  const parts: UserContent = [];
  if (message.text) parts.push({ type: "text", text: message.text });

  let voiceNotes = "";
  for (const attachment of attachments) {
    if (attachment.url) {
      parts.push({
        type: "file",
        data: new URL(attachment.url),
        filename: attachment.name,
        mediaType: attachment.mimeType ?? "application/octet-stream",
      });
      continue;
    }
    if (!attachment.fetchData) continue;

    let data: Buffer;
    try {
      data = await attachment.fetchData();
    } catch (error) {
      console.error("[chat-media] failed to fetch attachment", { name: attachment.name, error });
      continue;
    }

    const mimeType = attachment.mimeType ?? "";
    if (mimeType.startsWith("audio/")) {
      try {
        const text = await transcribeAudio({ data, mimeType, filename: attachment.name });
        voiceNotes += `${voiceNotes ? "\n" : ""}[Nota de voz]: ${text}`;
      } catch (error) {
        console.error("[chat-media] transcription failed", { name: attachment.name, error });
        voiceNotes += `${voiceNotes ? "\n" : ""}[Nota de voz recibida, no se pudo transcribir]`;
      }
      continue;
    }

    parts.push({
      type: "file",
      data: data.toString("base64"),
      filename: attachment.name,
      mediaType: mimeType || "application/octet-stream",
    });
  }

  if (voiceNotes) parts.push({ type: "text", text: voiceNotes });

  return parts.length > 0 ? parts : (message.text ?? "");
}
