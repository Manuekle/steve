import { createHmac, timingSafeEqual } from "node:crypto";
import { getCredential } from "./credentials";
import type { Agent, AgentVoice, VoiceCallTurn } from "./types";

// The ElevenLabs Agents platform, which is what answers a phone call.
//
// `lib/elevenlabs.ts` next door is one-shot text-to-speech: text in, mp3 out.
// This file is the other product — a live conversation, where ElevenLabs owns
// the whole loop (listen, think, speak) at phone latency. A local agent that
// speaks therefore has a mirror agent over there; `syncVoiceAgent` is what
// pushes this app's prompt, voice and first message into it.
//
// Nothing here runs without the ELEVENLABS_API_KEY from Settings, and every
// function throws a sentence meant to be read rather than a raw SDK error.

/** `TtsConversationalModel` in the SDK is a closed union — the phone pipeline
 *  only accepts models built for it, and flash 2.5 is the one that answers
 *  fast enough (~75 ms) to not sound like a bad connection. */
const DEFAULT_TTS_MODEL = "eleven_flash_v2_5" as const;
const DEFAULT_LANGUAGE = "es";

/**
 * The reasoning model behind the voice, named rather than left to the
 * platform's default.
 *
 * Leaving it unset is what produced the "this agent uses an outdated LLM"
 * warning in the ElevenLabs console: the default is frozen at whatever was
 * current the day the mirror was created, and the mirror outlives it. Naming
 * it here means a re-sync moves every agent forward at once. Flash-class on
 * purpose — a phone call is the one place where a slow first token is heard
 * as a bad connection.
 */
const DEFAULT_LLM = "gemini-3.5-flash" as const;

/**
 * Guardrails, on by default.
 *
 * A voice agent reads a stranger's speech straight into a prompt, so
 * "ignorá tus instrucciones y…" is an input this thing genuinely receives.
 * ElevenLabs flags an agent without these as high severity, and it is right:
 * the app creates these mirrors, so the app is what should be turning them
 * on rather than leaving it as a checkbox nobody finds.
 */
const GUARDRAILS = {
  version: "1",
  promptInjection: { isEnabled: true },
  focus: { isEnabled: true },
} as const;

/** Tag written on every mirror agent, so an account shared with other tools
 *  still shows which agents this app owns. */
const OWNER_TAG = "steve";

export type VoiceOption = {
  readonly voiceId: string;
  readonly name: string;
  readonly category?: string;
  readonly previewUrl?: string;
};

export type PhoneNumberOption = {
  readonly phoneNumberId: string;
  readonly phoneNumber: string;
  readonly label?: string;
  readonly provider?: string;
  readonly assignedAgentId?: string;
};

async function client() {
  const apiKey = await getCredential("ELEVENLABS_API_KEY");
  if (!apiKey) throw new Error("ElevenLabs API key is not configured.");
  const { ElevenLabsClient } = await import("@elevenlabs/elevenlabs-js");
  return new ElevenLabsClient({ apiKey });
}

/** True when the key exists, so a route can answer `not_configured` instead of
 *  throwing at the caller. */
export async function hasVoicePlatform(): Promise<boolean> {
  return Boolean(await getCredential("ELEVENLABS_API_KEY"));
}

/** The account's voices, for the picker. */
export async function listVoices(): Promise<VoiceOption[]> {
  const el = await client();
  const response = await el.voices.getAll();
  return (response.voices ?? []).map((voice) => ({
    voiceId: voice.voiceId,
    name: voice.name ?? voice.voiceId,
    category: voice.category ?? undefined,
    previewUrl: voice.previewUrl ?? undefined,
  }));
}

/**
 * Push this agent into ElevenLabs, creating the mirror on first call and
 * updating it after that. Returns the patch to persist on the local agent.
 *
 * The mirror is deliberately a projection, never a source: the prompt, the
 * voice and the first message are read from here every time, so editing an
 * agent in this app and re-syncing is always what wins.
 */
export async function syncVoiceAgent(
  agent: Agent,
  voice: AgentVoice,
): Promise<AgentVoice> {
  const el = await client();

  const conversationConfig = {
    tts: {
      ...(voice.voiceId ? { voiceId: voice.voiceId } : {}),
      modelId: DEFAULT_TTS_MODEL,
    },
    turn: {
      turnTimeout: 7,
      silenceEndCallTimeout: 25,
      mode: "turn" as const,
    },
    agent: {
      firstMessage: voice.firstMessage?.trim() || undefined,
      language: voice.language?.trim() || DEFAULT_LANGUAGE,
      prompt: { prompt: buildPrompt(agent), llm: DEFAULT_LLM },
    },
  };

  const platformSettings = { guardrails: GUARDRAILS };

  if (voice.elevenlabsAgentId) {
    await el.conversationalAi.agents.update(voice.elevenlabsAgentId, {
      name: agent.name,
      conversationConfig,
      platformSettings,
    });
    return { ...voice, syncedAt: new Date().toISOString() };
  }

  const created = await el.conversationalAi.agents.create({
    name: agent.name,
    tags: [OWNER_TAG],
    conversationConfig,
    platformSettings,
  });
  return {
    ...voice,
    elevenlabsAgentId: created.agentId,
    syncedAt: new Date().toISOString(),
  };
}

/** Delete the mirror. Called when voice is switched off, so an account does
 *  not accumulate agents nobody can see from this app. */
export async function deleteVoiceAgent(elevenlabsAgentId: string): Promise<void> {
  const el = await client();
  await el.conversationalAi.agents.delete(elevenlabsAgentId);
}

/**
 * A short-lived WebRTC token for the browser.
 *
 * Agents created through the API are private, so the browser cannot connect
 * with a bare agent id — it needs a token, and minting one requires the API
 * key, which is exactly why this is server-side.
 */
export async function getWebrtcToken(elevenlabsAgentId: string): Promise<string> {
  const el = await client();
  const response = await el.conversationalAi.conversations.getWebrtcToken({
    agentId: elevenlabsAgentId,
  });
  return response.token;
}

/** Every number imported into the account. */
export async function listPhoneNumbers(): Promise<PhoneNumberOption[]> {
  const el = await client();
  const numbers = await el.conversationalAi.phoneNumbers.list();
  return numbers.map((entry) => ({
    phoneNumberId: entry.phoneNumberId,
    phoneNumber: entry.phoneNumber,
    label: entry.label,
    provider: entry.provider,
    assignedAgentId: entry.assignedAgent?.agentId,
  }));
}

/**
 * Import a Twilio number into ElevenLabs and, optionally, route it straight to
 * an agent. Importing is idempotent from this app's side only in the sense
 * that ElevenLabs rejects a duplicate — the caller surfaces that message.
 */
export async function importTwilioNumber(input: {
  phoneNumber: string;
  label: string;
  sid: string;
  token: string;
  agentId?: string;
}): Promise<string> {
  const el = await client();
  const created = await el.conversationalAi.phoneNumbers.create({
    provider: "twilio",
    phoneNumber: input.phoneNumber,
    label: input.label,
    sid: input.sid,
    token: input.token,
    ...(input.agentId ? { agentId: input.agentId } : {}),
  });
  return created.phoneNumberId;
}

/** Route an existing number to an agent — this is what makes inbound calls
 *  reach it. */
export async function assignNumberToAgent(
  phoneNumberId: string,
  elevenlabsAgentId: string,
): Promise<void> {
  const el = await client();
  await el.conversationalAi.phoneNumbers.update(phoneNumberId, {
    agentId: elevenlabsAgentId,
  });
}

export type OutboundCallResult = {
  readonly ok: boolean;
  readonly message: string;
  readonly conversationId?: string;
  readonly callSid?: string;
};

/** Place a call. The agent does the talking; this app only dials. */
export async function startOutboundCall(input: {
  elevenlabsAgentId: string;
  phoneNumberId: string;
  toNumber: string;
}): Promise<OutboundCallResult> {
  const el = await client();
  const result = await el.conversationalAi.twilio.outboundCall({
    agentId: input.elevenlabsAgentId,
    agentPhoneNumberId: input.phoneNumberId,
    toNumber: input.toNumber,
  });
  return {
    ok: Boolean(result.success),
    message: result.message ?? "",
    conversationId: result.conversationId ?? undefined,
    callSid: result.callSid ?? undefined,
  };
}

/**
 * Verifies the `elevenlabs-signature` header on a post-call webhook.
 *
 * Same scheme as Stripe's (see `verifyStripeWebhookSignature` in lib/stripe.ts):
 * `t=<unix seconds>,v0=<hex hmac-sha256>` over `${timestamp}.${rawBody}`. Done
 * locally rather than through the SDK's own `webhooks.constructEvent` so this
 * has no dependency on an ELEVENLABS_API_KEY being configured — the signing
 * secret alone is what proves the request came from ElevenLabs.
 */
export function verifyElevenLabsWebhookSignature(opts: {
  readonly rawBody: string;
  readonly signatureHeader: string | null;
  readonly webhookSecret: string;
  /** Seconds. ElevenLabs' own docs use 30 minutes; this app is stricter. */
  readonly toleranceSeconds?: number;
}): boolean {
  if (!opts.signatureHeader) return false;

  const parts = new Map<string, string>();
  for (const entry of opts.signatureHeader.split(",")) {
    const [key, value] = entry.split("=");
    if (key && value) parts.set(key.trim(), value.trim());
  }
  const timestamp = parts.get("t");
  const signature = parts.get("v0");
  if (!timestamp || !signature) return false;

  const tolerance = opts.toleranceSeconds ?? 300;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > tolerance) return false;

  const expected = createHmac("sha256", opts.webhookSecret)
    .update(`${timestamp}.${opts.rawBody}`, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

/** The fields this app reads off a `post_call_transcription` webhook body —
 *  ElevenLabs sends more than this, none of it typed by the SDK, and none of
 *  it needed here. */
export type PostCallTranscriptionEvent = {
  readonly type: string;
  readonly data?: {
    readonly agent_id?: string;
    readonly conversation_id?: string;
    readonly transcript?: ReadonlyArray<{
      readonly role?: string;
      readonly message?: string | null;
      readonly time_in_call_secs?: number;
    }>;
    readonly metadata?: {
      readonly start_time_unix_secs?: number;
      readonly call_duration_secs?: number;
    };
  };
};

/** Normalizes a webhook transcript entry into this app's own shape, dropping
 *  turns with no text (tool-call-only turns ElevenLabs also includes). */
export function normalizeTranscript(
  raw: PostCallTranscriptionEvent["data"],
): VoiceCallTurn[] {
  return (raw?.transcript ?? [])
    .filter((turn) => typeof turn.message === "string" && turn.message.trim().length > 0)
    .map((turn) => ({
      role: turn.role === "agent" ? "agent" : "user",
      message: turn.message as string,
      timeInCallSecs: turn.time_in_call_secs ?? 0,
    }));
}

/**
 * One conversation, read back from ElevenLabs.
 *
 * The post-call webhook is the push path and stays the one that works
 * unattended — but it needs a public URL, which a laptop running `next dev`
 * does not have, and it only ever fires *after* a call. Pulling covers both
 * gaps: a transcript arrives on a localhost install with no tunnel, and a
 * call that is still ringing or still talking has a status to show while it
 * happens. Both paths write the same record; whichever arrives first wins and
 * the other is a no-op.
 */
export type ConversationState = {
  /** ElevenLabs' own vocabulary, passed through rather than reinterpreted. */
  readonly status: "initiated" | "in-progress" | "processing" | "done" | "failed";
  readonly transcript: VoiceCallTurn[];
  readonly durationSecs?: number;
  readonly startedAt?: string;
  /** Why it ended, when it ended badly. Worth surfacing: the useful ones name
   *  a Twilio problem the operator can actually go and fix. */
  readonly terminationReason?: string;
};

export async function getConversation(conversationId: string): Promise<ConversationState> {
  const el = await client();
  const conversation = await el.conversationalAi.conversations.get(conversationId);
  const metadata = conversation.metadata;
  return {
    status: conversation.status,
    transcript: (conversation.transcript ?? [])
      .filter((turn) => typeof turn.message === "string" && turn.message.trim().length > 0)
      .map((turn) => ({
        role: turn.role === "agent" ? ("agent" as const) : ("user" as const),
        message: turn.message as string,
        timeInCallSecs: turn.timeInCallSecs ?? 0,
      })),
    durationSecs: metadata?.callDurationSecs,
    startedAt: metadata?.startTimeUnixSecs
      ? new Date(metadata.startTimeUnixSecs * 1000).toISOString()
      : undefined,
    terminationReason: metadata?.terminationReason || metadata?.error?.reason || undefined,
  };
}

/**
 * What the mirror agent is told to be.
 *
 * The agent's own system prompt carries over unchanged, with a short preamble
 * about the medium: the same instructions that read fine in a chat bubble
 * produce unlistenable speech when the model answers with a bulleted list.
 */
function buildPrompt(agent: Agent): string {
  const parts = [
    agent.systemPrompt?.trim(),
    agent.description?.trim() ? `Contexto del negocio: ${agent.description.trim()}` : "",
    "Estás en una llamada telefónica, no en un chat. Hablás, no escribís: " +
      "sin listas, sin markdown, sin emojis y sin leer URLs en voz alta. " +
      "Respuestas de una o dos frases, y dejá hablar a la persona. " +
      "Si no entendés algo, pedí que lo repitan.",
    "Mantené siempre tu rol definido en el prompt y la descripción del negocio. No te desvíes de tu función (vender, atender, asesorar, etc.): si te preguntan algo fuera de tu objetivo, respondé muy breve (1 frase) y redirigí al objetivo comercial (producto, precio, entrega, stock, reserva, ayuda). No des recetas, tutoriales ni información ajena completa si tu rol es vender/atender.",
    "No repitas el mismo saludo. Si ya saludaste, no vuelvas a decir 'hola' idéntico cuando el usuario diga 'hola' de nuevo; variá, recordá lo ya dicho y avanzá la conversación.",
    "Turnos: no interrumpas. Dejá que la persona termine de hablar. Si decís 'un momento por favor' porque estás consultando algo, quedate en silencio trabajando: NO digas '¿sigues ahí?' antes de 10 segundos, no pidas que hable. Solo avisa cuando tengas el resultado.",
    "Cierre: cuando el pedido/duda esté resuelto y el usuario diga 'gracias/vale/chau' sin más pendientes, despedite breve ('Gracias Manuel, te llega el link por WhatsApp, que tengas buen día') y quedate en silencio para que la llamada se corte sola. No insistas con '¿sigues ahí?'",
    "CRM y pago: cuando juntes nombre completo, teléfono y dirección, confirmá los datos una sola vez y avisá que el link de pago de Stripe se enviará por WhatsApp al número dado (no lo leas en la llamada). El sistema se encarga de crearlo y enviarlo.",
  ];
  return parts.filter(Boolean).join("\n\n");
}
