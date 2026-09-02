import { getCredential, getCredentialSync } from "./credentials";

// ElevenLabs text-to-speech.
//
// Used by agent/tools/generate_media.ts (type: "audio") and, through it, by
// the "send_audio" automation step. The key lives in the same local
// credential store as every other secret (~/.steve/credentials.json, with an
// ELEVENLABS_API_KEY env fallback), so it is configured from /settings and
// never baked into the build.
//
// Only the synchronous convert endpoint is used, which returns the finished
// audio in the same HTTP response — ElevenLabs webhooks are only needed for
// async speech-to-text and for ElevenAgents post-call events, neither of
// which this app calls.

/** George — the neutral narrative voice ElevenLabs ships by default. */
export const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
export const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

/** mp3 44.1kHz 128kbps — audio/mpeg, which WhatsApp and Instagram both accept. */
const OUTPUT_FORMAT = "mp3_44100_128";
const MIME_TYPE = "audio/mpeg";

/** Longest text we send in one request. The cheapest models cap at 40k, the
 *  v3 family at 5k — 4500 stays inside every model's limit. */
const MAX_CHARS = 4500;

export type SpeechResult = {
  readonly data: Uint8Array;
  readonly mimeType: string;
  /** The model actually used — the configured ELEVENLABS_MODEL_ID, or
   *  DEFAULT_MODEL_ID when none is set. For AI-usage recording: ElevenLabs'
   *  API returns no usage/cost figure in the response, so the caller prices
   *  this against `characters` itself (see lib/model-pricing.ts). */
  readonly modelId: string;
  /** Characters actually sent for synthesis, after the MAX_CHARS clip —
   *  what ElevenLabs bills for, not the caller's original, possibly longer,
   *  text. */
  readonly characters: number;
};

function readKey(): string | undefined {
  return getCredentialSync("ELEVENLABS_API_KEY");
}

/** True when a key is configured, so callers can fall back to another provider. */
export async function hasElevenLabsKey(): Promise<boolean> {
  return Boolean((await getCredential("ELEVENLABS_API_KEY")) ?? readKey());
}

/**
 * Synthesize `text` and return the raw mp3 bytes.
 *
 * `voice` accepts either a voice id or the name of one of the well-known
 * preset voices, because the agent tool exposes it as a free-text field.
 * Throws when no key is configured or when ElevenLabs rejects the request.
 */
export async function generateElevenLabsSpeech(opts: {
  text: string;
  voice?: string;
  abortSignal?: AbortSignal;
}): Promise<SpeechResult> {
  const apiKey = (await getCredential("ELEVENLABS_API_KEY")) ?? readKey();
  if (!apiKey) throw new Error("ElevenLabs API key is not configured.");

  const configuredVoice = (await getCredential("ELEVENLABS_VOICE_ID"))?.trim();
  const configuredModel = (await getCredential("ELEVENLABS_MODEL_ID"))?.trim();
  const voiceId = resolveVoiceId(opts.voice) ?? configuredVoice ?? DEFAULT_VOICE_ID;
  const modelId = configuredModel || DEFAULT_MODEL_ID;

  const { ElevenLabsClient } = await import("@elevenlabs/elevenlabs-js");
  const client = new ElevenLabsClient({ apiKey });

  const text = opts.text.slice(0, MAX_CHARS);
  const audio = await client.textToSpeech.convert(
    voiceId,
    {
      text,
      modelId,
      outputFormat: OUTPUT_FORMAT,
    },
    { abortSignal: opts.abortSignal, timeoutInSeconds: 60 },
  );

  return { data: await collect(audio), mimeType: MIME_TYPE, modelId, characters: text.length };
}

/** Preset voices, so `voice: "sarah"` works as well as a raw voice id. */
const PRESET_VOICES: Record<string, string> = {
  george: "JBFqnCBsd6RMkjVDRZzb",
  sarah: "EXAVITQu4vr4xnSDxMaL",
  daniel: "onwK4e9ZLuTAKqWW03F9",
  charlotte: "XB0fDUnXU5powFXDhCwa",
};

function resolveVoiceId(voice: string | undefined): string | undefined {
  const trimmed = voice?.trim();
  if (!trimmed) return undefined;
  return PRESET_VOICES[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * Transcribe `data` (raw audio bytes) to text via ElevenLabs speech-to-text.
 *
 * Throws when no key is configured or when ElevenLabs rejects the request —
 * same contract as generateElevenLabsSpeech, callers decide the fallback.
 */
export async function transcribeAudio(opts: {
  data: Buffer;
  mimeType?: string;
  filename?: string;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const apiKey = (await getCredential("ELEVENLABS_API_KEY")) ?? readKey();
  if (!apiKey) throw new Error("ElevenLabs API key is not configured.");

  const { ElevenLabsClient } = await import("@elevenlabs/elevenlabs-js");
  const client = new ElevenLabsClient({ apiKey });

  // scribe_v1: the generally-available multilingual transcription model.
  const response = await client.speechToText.convert(
    {
      modelId: "scribe_v1",
      file: { data: opts.data, filename: opts.filename, contentType: opts.mimeType },
    },
    { abortSignal: opts.abortSignal, timeoutInSeconds: 60 },
  );

  const text = (response as { text?: unknown }).text;
  if (typeof text !== "string" || !text) {
    throw new Error("ElevenLabs speech-to-text returned no text.");
  }
  return text;
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
