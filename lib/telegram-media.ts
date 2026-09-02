import { fetchTelegramFile } from "./telegram-send";
import { transcribeAudio } from "./elevenlabs";

// eve's Telegram channel parses photos and documents out of an update and
// nothing else (see parseTelegramUpdate in
// node_modules/eve/dist/src/public/channels/telegram/inbound.js): a voice note
// or an audio file arrives, matches no attachment kind, and the update reaches
// the agent as an empty message — the same silent drop lib/chat-media.ts
// exists to fix on WhatsApp and Instagram.
//
// The fix has to happen before eve parses the update, which is what
// `webhookVerifier` allows: it may return a string, and that string becomes
// the verified body. So the audio is fetched and transcribed here, and the
// transcript is written into `message.text` — the one field every downstream
// step already reads.

const TRANSCRIBE_TIMEOUT_MS = 20_000;

type TelegramFile = { file_id?: unknown; mime_type?: unknown };

type TelegramUpdate = {
  message?: {
    text?: unknown;
    caption?: unknown;
    voice?: TelegramFile;
    audio?: TelegramFile;
  };
};

function fileOf(message: NonNullable<TelegramUpdate["message"]>): TelegramFile | undefined {
  const file = message.voice ?? message.audio;
  return file && typeof file.file_id === "string" ? file : undefined;
}

/**
 * Rewrite one inbound Telegram update so a voice note reaches the agent as
 * text. Returns `body` untouched when there is no audio in it.
 *
 * Never throws: a webhook that fails verification is a 401 to Telegram and a
 * retry loop, so a transcription that could not run degrades to a marker the
 * agent can answer ("I got your voice note but could not hear it") rather
 * than to a rejected delivery.
 */
export async function transcribeVoiceNote(body: string): Promise<string> {
  let update: TelegramUpdate;
  try {
    update = JSON.parse(body) as TelegramUpdate;
  } catch {
    return body;
  }

  const message = update.message;
  if (!message) return body;
  const file = fileOf(message);
  if (!file) return body;

  const existing = typeof message.text === "string" && message.text ? message.text : undefined;
  let line: string;
  try {
    const data = await fetchTelegramFile(file.file_id as string);
    const text = await transcribeAudio({
      data,
      mimeType: typeof file.mime_type === "string" ? file.mime_type : "audio/ogg",
      filename: "voice.ogg",
      // Bounded well inside Telegram's own webhook patience: this runs before
      // the 200, and a delivery Telegram gives up on is redelivered — the same
      // voice note transcribed and answered twice.
      abortSignal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
    });
    line = `[Nota de voz]: ${text}`;
  } catch (error) {
    console.error("[telegram-media] voice note transcription failed", { error });
    line = "[Nota de voz recibida, no se pudo transcribir]";
  }

  // A caption can ride along with an audio file; keep whatever the sender
  // actually typed above the transcript rather than replacing it.
  message.text = existing ? `${existing}\n${line}` : line;
  return JSON.stringify(update);
}
