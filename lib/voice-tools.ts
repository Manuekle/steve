import { randomBytes, timingSafeEqual } from "node:crypto";
import { getCredential, saveCredentials } from "./credentials";
import { SITE_URL, SITE_URL_IS_CONFIGURED } from "./site";
import { toCapabilityIds, type CapabilityId } from "./agent-capabilities";
import type { Agent, AgentVoice } from "./types";

/**
 * The tools a phone call can actually use.
 *
 * A mirror agent on ElevenLabs runs its own model loop: it hears, it thinks,
 * it speaks, and none of that goes through Eve. So the tools in agent/tools/
 * — the ones a WhatsApp conversation reaches — do not exist on a call. Until
 * this file, a caller could ask the agent to book an appointment, hear "listo,
 * te lo agendé", and have nothing whatsoever happen: no calendar event, no
 * reminder, no contact, no trace anywhere except the transcript.
 *
 * The bridge is ElevenLabs' webhook tools. Each one is an HTTP endpoint on
 * this app that the platform calls mid-conversation, so the call ends up
 * running the same lib/ functions the chat tools do.
 *
 * Two things are deliberately *not* used here:
 *
 *   Dynamic variables. `{{system__caller_id}}` and friends would be a neat way
 *   to identify the call, but a variable the platform does not substitute
 *   fails the tool call itself, and a booking that fails silently is the exact
 *   bug this file exists to fix. Identity comes from the URL instead — each
 *   agent gets its own tools, with its own agent id baked into the path — and
 *   the caller's details come from the model, which has just been told them
 *   out loud.
 *
 *   A shared tool per account. Tools are per agent for the same reason: the
 *   endpoint has to know which agent is calling to enforce that agent's
 *   capability list (lib/agent-scope.ts does this for chat; the URL does it
 *   here).
 */

/** Header the endpoint checks. Not `authorization`: some proxies strip it. */
export const VOICE_TOOL_SECRET_HEADER = "x-steve-voice-secret";

/** Every voice tool this app knows how to run, in the order they are synced. */
export type VoiceToolName =
  | "check_availability"
  | "book_appointment"
  | "save_contact"
  | "set_reminder"
  | "send_payment_link"
  | "search_knowledge"
  | "transfer_to_human";

type LiteralType = "string" | "number" | "boolean" | "integer";

type Param = {
  readonly name: string;
  readonly type: LiteralType;
  readonly description: string;
  readonly required?: boolean;
};

type VoiceToolSpec = {
  readonly name: VoiceToolName;
  /** Which capability in Mis Agentes has to be ticked for this to be attached. */
  readonly capability: CapabilityId;
  readonly description: string;
  readonly params: readonly Param[];
  /**
   * Seconds ElevenLabs waits. A Google Calendar round trip is slower than a
   * database write, and a timeout here is heard as dead air.
   */
  readonly timeoutSecs: number;
};

/**
 * Descriptions are written for a model that is speaking, not typing: they say
 * when to call the tool and what the caller will hear, because the alternative
 * is an agent that narrates a booking it never made.
 */
export const VOICE_TOOLS: readonly VoiceToolSpec[] = [
  {
    name: "check_availability",
    capability: "calendar",
    description:
      "Consultá los horarios libres en la agenda real del negocio. Llamala ANTES de " +
      "ofrecer cualquier horario: nunca inventes disponibilidad. Devuelve horarios en " +
      "formato ISO junto con una etiqueta para leer en voz alta. Si no pasás fechas, " +
      "busca en los próximos 14 días.",
    params: [
      {
        name: "start_iso",
        type: "string",
        description:
          "Inicio del rango a consultar, en ISO 8601 con zona (ej. 2026-09-08T09:00:00Z). Opcional.",
      },
      {
        name: "end_iso",
        type: "string",
        description: "Fin del rango a consultar, en ISO 8601. Opcional.",
      },
      {
        name: "duration_min",
        type: "integer",
        description: "Duración en minutos que necesita la cita. Por defecto 30.",
      },
    ],
    timeoutSecs: 20,
  },
  {
    name: "book_appointment",
    capability: "calendar",
    description:
      "Agendá la cita de verdad en el calendario del negocio. Llamala solo después de " +
      "confirmar el horario con la persona, y usá un start_iso que haya salido de " +
      "check_availability. Recién cuando esta herramienta responda success podés decir " +
      "que la cita quedó agendada.",
    params: [
      {
        name: "start_iso",
        type: "string",
        description: "Inicio de la cita en ISO 8601 con zona (ej. 2026-09-08T15:00:00Z).",
        required: true,
      },
      {
        name: "summary",
        type: "string",
        description: "Título de la cita, con el nombre de la persona si lo sabés.",
        required: true,
      },
      {
        name: "duration_min",
        type: "integer",
        description: "Duración en minutos. Por defecto 30.",
      },
      {
        name: "description",
        type: "string",
        description: "Detalle de lo que se va a tratar en la cita.",
      },
      {
        name: "contact_name",
        type: "string",
        description: "Nombre completo de la persona que llama.",
      },
      {
        name: "contact_phone",
        type: "string",
        description: "Teléfono de la persona, en formato internacional si lo dictó.",
      },
      {
        name: "contact_email",
        type: "string",
        description: "Email de la persona, para invitarla al evento.",
      },
    ],
    timeoutSecs: 30,
  },
  {
    name: "save_contact",
    capability: "contacts",
    description:
      "Guardá en el CRM los datos de la persona que llama. Llamala apenas tengas nombre " +
      "y algún dato de contacto, sin esperar al final de la llamada.",
    params: [
      { name: "name", type: "string", description: "Nombre completo.", required: true },
      { name: "phone", type: "string", description: "Teléfono en formato internacional." },
      { name: "email", type: "string", description: "Email." },
      {
        name: "notes",
        type: "string",
        description: "Qué necesita, presupuesto, plazo: lo que sirva para el seguimiento.",
      },
    ],
    timeoutSecs: 15,
  },
  {
    name: "set_reminder",
    capability: "reminders",
    description:
      "Programá un recordatorio real para esta persona en una fecha y hora concretas. " +
      "Necesita que el contacto ya exista: llamá save_contact o book_appointment antes, " +
      "o pasá los datos acá y se crea solo.",
    params: [
      {
        name: "datetime_iso",
        type: "string",
        description: "Cuándo avisar, en ISO 8601 con zona. Tiene que ser en el futuro.",
        required: true,
      },
      {
        name: "message",
        type: "string",
        description: "Qué hay que recordarle a la persona.",
        required: true,
      },
      { name: "contact_name", type: "string", description: "Nombre completo de la persona." },
      { name: "contact_phone", type: "string", description: "Teléfono en formato internacional." },
      { name: "contact_email", type: "string", description: "Email." },
    ],
    timeoutSecs: 15,
  },
  {
    name: "send_payment_link",
    capability: "payments",
    description:
      "Creá un link de pago real y mandáselo a la persona por WhatsApp. Nunca leas el " +
      "link en voz alta. Llamala solo cuando haya acuerdo sobre qué y cuánto se paga.",
    params: [
      { name: "amount", type: "string", description: "Importe, solo el número (ej. 15000).", required: true },
      { name: "product_name", type: "string", description: "Qué se está pagando.", required: true },
      { name: "currency", type: "string", description: "Moneda ISO, ej. ars, usd. Por defecto usd." },
      {
        name: "contact_phone",
        type: "string",
        description: "Teléfono al que mandar el link, en formato internacional.",
      },
      { name: "contact_name", type: "string", description: "Nombre completo de la persona." },
    ],
    timeoutSecs: 30,
  },
  {
    name: "search_knowledge",
    capability: "knowledge",
    description:
      "Buscá en los documentos que cargó el negocio: listas de precios, catálogos, " +
      "políticas, horarios. Llamala ANTES de decir un precio o una condición. Si no " +
      "encuentra nada, decilo — no inventes.",
    params: [
      {
        name: "query",
        type: "string",
        description: "Qué buscar, con las palabras de la persona.",
        required: true,
      },
    ],
    timeoutSecs: 20,
  },
  {
    name: "transfer_to_human",
    capability: "handoff",
    description:
      "Marcá la conversación para que la siga una persona del equipo. Llamala cuando " +
      "te lo pidan explícitamente o cuando no puedas resolver el pedido.",
    params: [
      { name: "reason", type: "string", description: "Por qué hace falta una persona." },
      { name: "contact_name", type: "string", description: "Nombre completo de quien llama." },
      { name: "contact_phone", type: "string", description: "Teléfono en formato internacional." },
    ],
    timeoutSecs: 15,
  },
];

const BY_NAME = new Map<string, VoiceToolSpec>(VOICE_TOOLS.map((spec) => [spec.name, spec]));

export function getVoiceTool(name: string): VoiceToolSpec | undefined {
  return BY_NAME.get(name);
}

/**
 * The tools this agent should have on a call.
 *
 * Same rule as lib/agent-scope.ts, and for the same reason: an agent with
 * nothing ticked keeps everything, so turning voice on never silently disables
 * an install that predates the capability picker.
 */
export function voiceToolsForAgent(agent: Agent): VoiceToolSpec[] {
  const allowed = toCapabilityIds(agent.tools);
  if (allowed.length === 0) return [...VOICE_TOOLS];
  return VOICE_TOOLS.filter((spec) => allowed.includes(spec.capability));
}

/**
 * The shared secret the endpoint checks, minted on first use.
 *
 * Generated rather than configured: it is this app talking to itself through
 * ElevenLabs, so there is no second party to agree a value with, and asking an
 * operator to invent one is a step that only produces weak secrets.
 */
export async function voiceToolsSecret(): Promise<string> {
  const existing = (await getCredential("VOICE_TOOLS_SECRET"))?.trim();
  if (existing) return existing;
  const minted = randomBytes(32).toString("hex");
  await saveCredentials({ VOICE_TOOLS_SECRET: minted });
  return minted;
}

/** Constant-time compare, so the secret can't be probed byte by byte. */
export function voiceSecretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function voiceToolUrl(agentId: string, tool: VoiceToolName): string {
  return `${SITE_URL}/api/webhooks/elevenlabs/tools/${encodeURIComponent(agentId)}/${tool}`;
}

/** Why tools cannot be attached at all, or `undefined` when they can. */
export function voiceToolsBlocker(): string | undefined {
  if (SITE_URL_IS_CONFIGURED) return undefined;
  return (
    "Las herramientas de voz (agenda, recordatorios, CRM) no se pudieron conectar: " +
    "ElevenLabs necesita una URL pública de esta app para llamarlas, y no hay ninguna " +
    "configurada. Definí NEXT_PUBLIC_SITE_URL con el dominio de este servidor y volvé a " +
    "sincronizar la voz. Mientras tanto el agente puede hablar, pero no agenda ni guarda nada."
  );
}

/** One ElevenLabs webhook-tool payload for one spec. */
function toolRequest(agentId: string, spec: VoiceToolSpec, secret: string) {
  const properties: Record<string, { type: LiteralType; description: string }> = {};
  const required: string[] = [];
  for (const param of spec.params) {
    properties[param.name] = { type: param.type, description: param.description };
    if (param.required) required.push(param.name);
  }

  return {
    toolConfig: {
      type: "webhook" as const,
      name: spec.name,
      description: spec.description,
      responseTimeoutSecs: spec.timeoutSecs,
      apiSchema: {
        url: voiceToolUrl(agentId, spec.name),
        method: "POST" as const,
        contentType: "application/json" as const,
        requestHeaders: { [VOICE_TOOL_SECRET_HEADER]: secret },
        requestBodySchema: {
          type: "object" as const,
          description: `Arguments for ${spec.name}.`,
          properties,
          ...(required.length > 0 ? { required } : {}),
        },
      },
    },
  };
}

/** Minimal client, built here rather than imported so this module and
 *  lib/elevenlabs-agents.ts don't import each other. */
async function client() {
  const apiKey = await getCredential("ELEVENLABS_API_KEY");
  if (!apiKey) throw new Error("ElevenLabs API key is not configured.");
  const { ElevenLabsClient } = await import("@elevenlabs/elevenlabs-js");
  return new ElevenLabsClient({ apiKey });
}

export type VoiceToolSync = {
  /** Tool name to ElevenLabs tool id, for `toolIds` on the mirror's prompt. */
  readonly toolIds: Record<string, string>;
  /** Set when nothing could be attached, in words an operator can act on. */
  readonly warning?: string;
};

/**
 * Push this agent's tools to ElevenLabs and return the ids to attach.
 *
 * Updates in place where a previous sync left an id, so re-syncing an agent
 * does not litter the account with duplicates — and drops the ids of tools the
 * agent is no longer allowed, so un-ticking "Agenda" in Mis Agentes actually
 * takes the booking tool away from the phone.
 *
 * Never throws for a single tool: a partial tool set is worth far more than a
 * sync that fails outright and leaves the mirror with the tools it had.
 */
export async function syncVoiceTools(agent: Agent, existing: AgentVoice): Promise<VoiceToolSync> {
  const blocker = voiceToolsBlocker();
  if (blocker) return { toolIds: {}, warning: blocker };

  const el = await client();
  const secret = await voiceToolsSecret();
  const wanted = voiceToolsForAgent(agent);
  const previous = { ...(existing.toolIds ?? {}) };
  const toolIds: Record<string, string> = {};
  const failed: string[] = [];

  for (const spec of wanted) {
    const request = toolRequest(agent.id, spec, secret);
    const knownId = previous[spec.name];
    try {
      if (knownId) {
        await el.conversationalAi.tools.update(knownId, request);
        toolIds[spec.name] = knownId;
      } else {
        const created = await el.conversationalAi.tools.create(request);
        toolIds[spec.name] = created.id;
      }
    } catch (error) {
      // A stored id ElevenLabs no longer has (deleted from their dashboard)
      // is the common case, and it is recoverable: create it again.
      if (knownId) {
        try {
          const created = await el.conversationalAi.tools.create(request);
          toolIds[spec.name] = created.id;
          continue;
        } catch {
          // fall through to the failure below
        }
      }
      failed.push(spec.name);
      console.warn(`[voice-tools] could not sync ${spec.name} for agent ${agent.id}:`, error);
    }
  }

  // Tools this agent used to have and no longer should. Detached by leaving
  // them out of `toolIds`; deleted so the account stays readable.
  for (const [name, id] of Object.entries(previous)) {
    if (toolIds[name] === id) continue;
    try {
      await el.conversationalAi.tools.delete(id);
    } catch {
      // Already gone, or still referenced by another agent. Either way this
      // app has stopped pointing at it, which is what mattered.
    }
  }

  if (Object.keys(toolIds).length === 0 && wanted.length > 0) {
    return {
      toolIds,
      warning:
        "No se pudo crear ninguna herramienta de voz en ElevenLabs. Revisá que la API key " +
        "tenga permiso de escritura sobre ElevenAgents (elevenlabs.io/app/settings/api-keys).",
    };
  }
  if (failed.length > 0) {
    return {
      toolIds,
      warning: `Estas herramientas de voz no se pudieron sincronizar: ${failed.join(", ")}.`,
    };
  }
  return { toolIds };
}

/** Remove every tool this agent owns. Called when voice is switched off. */
export async function deleteVoiceTools(toolIds: Readonly<Record<string, string>>): Promise<void> {
  const ids = Object.values(toolIds);
  if (ids.length === 0) return;
  const el = await client();
  await Promise.all(
    ids.map(async (id) => {
      try {
        await el.conversationalAi.tools.delete(id);
      } catch {
        // Same reasoning as deleteVoiceAgent: already-gone is the desired state.
      }
    }),
  );
}
