import type { Agent, AgentBrief } from "./types";

// The builder's half of an agent: a structured brief, and the system prompt
// it composes into.
//
// Why compose rather than let people write the prompt directly: the prompt is
// the only thing the runtime reads (agent/instructions/persona.ts), and an
// empty textarea is the single worst place to start for someone who has never
// written one. The brief asks nine questions a business owner can answer in
// their own words — who is this, what is it for, how should it sound, what
// must it never do, when does it fetch a person — and this file turns those
// answers into the prompt.
//
// Two rules keep the composition honest:
//
//   1. Nothing about the business itself is composed in. The name, hours,
//      prices, policies and legal pages already reach every conversation
//      through agent/instructions/business-profile.ts and search_knowledge. A
//      second copy inside each agent's prompt is a copy that goes stale.
//   2. A hand-edited prompt is never overwritten. `promptCustomized` is set
//      the moment somebody edits the composed text, and from then on the
//      brief is documentation, not a source — see `shouldRecompose`.

export type BriefLocale = "es" | "en";

const LABELS: Record<BriefLocale, Record<string, string>> = {
  es: {
    role: "Rol",
    goal: "Objetivo",
    audience: "Con quién hablás",
    tone: "Tono",
    language: "Idioma",
    greeting: "Primer mensaje",
    rules: "Reglas",
    avoid: "Nunca",
    handoff: "Cuándo pasar a una persona",
    languageAuto: "Respondé siempre en el idioma en el que te escriben.",
    closing:
      "Si te piden algo fuera de este rol, decilo con claridad y ofrecé lo que sí " +
      "hacés. No inventes precios, plazos ni condiciones: buscalos con " +
      "search_knowledge o pasá la conversación a una persona.",
  },
  en: {
    role: "Role",
    goal: "Goal",
    audience: "Who you talk to",
    tone: "Tone",
    language: "Language",
    greeting: "Opening message",
    rules: "Rules",
    avoid: "Never",
    handoff: "When to hand off to a person",
    languageAuto: "Always answer in the language the customer writes in.",
    closing:
      "If someone asks for something outside this role, say so plainly and offer " +
      "what you do handle. Never invent prices, deadlines or terms: look them up " +
      "with search_knowledge, or hand the conversation to a person.",
  },
};

const LANGUAGE_NAMES: Record<BriefLocale, Record<string, string>> = {
  es: { es: "español", en: "inglés", pt: "portugués", fr: "francés", it: "italiano", de: "alemán" },
  en: { es: "Spanish", en: "English", pt: "Portuguese", fr: "French", it: "Italian", de: "German" },
};

/** Languages the builder offers. "auto" mirrors the customer, which is what a
 *  business on WhatsApp almost always wants. */
export const BRIEF_LANGUAGES = ["auto", "es", "en", "pt", "fr", "it", "de"] as const;

/** "Answer in Spanish" — the fixed-language half of the language line. */
function languageInstruction(locale: BriefLocale, code: string): string {
  const name = LANGUAGE_NAMES[locale][code] ?? code;
  return locale === "en" ? `Always answer in ${name}.` : `Respondé siempre en ${name}.`;
}

export function emptyBrief(): AgentBrief {
  return {
    role: "",
    goal: "",
    audience: "",
    tone: "",
    language: "auto",
    greeting: "",
    rules: [],
    avoid: [],
    handoff: "",
  };
}

/** Fills in whatever an older brief — or a model's partial patch — left out. */
export function normalizeBrief(input: Partial<AgentBrief> | undefined): AgentBrief {
  const base = emptyBrief();
  if (!input) return base;
  const list = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
      : [];
  const text = (value: unknown, fallback: string): string =>
    typeof value === "string" ? value.trim() : fallback;
  return {
    role: text(input.role, base.role),
    goal: text(input.goal, base.goal),
    audience: text(input.audience, base.audience),
    tone: text(input.tone, base.tone),
    language: text(input.language, base.language) || "auto",
    greeting: text(input.greeting, base.greeting),
    rules: list(input.rules),
    avoid: list(input.avoid),
    handoff: text(input.handoff, base.handoff),
    ...(input.promptCustomized ? { promptCustomized: true } : {}),
    ...(typeof input.updatedAt === "string" ? { updatedAt: input.updatedAt } : {}),
  };
}

/** True when the brief carries nothing anyone typed. */
export function isBriefEmpty(brief: AgentBrief): boolean {
  return (
    !brief.role &&
    !brief.goal &&
    !brief.audience &&
    !brief.tone &&
    !brief.greeting &&
    !brief.handoff &&
    brief.rules.length === 0 &&
    brief.avoid.length === 0
  );
}

/**
 * The system prompt a brief describes.
 *
 * Markdown, because that is what persona.ts drops it into, and short on
 * purpose: every line here competes for attention with the business profile,
 * the active playbook and the tool instructions already in the context.
 */
export function composePrompt(brief: AgentBrief, options: { readonly locale?: BriefLocale } = {}): string {
  // An empty brief composes to nothing at all. Without this the language line
  // — which is always written, since "mirror the customer" is the default —
  // would be enough text on its own to make a brand-new agent look like it had
  // instructions, and the readiness check counts characters.
  if (isBriefEmpty(brief)) return "";
  const locale: BriefLocale = options.locale === "en" ? "en" : "es";
  const l = LABELS[locale];
  const lines: string[] = [];

  const section = (label: string, body: string) => {
    if (!body.trim()) return;
    lines.push(`**${label}:** ${body.trim()}`, "");
  };

  section(l.role, brief.role);
  section(l.goal, brief.goal);
  section(l.audience, brief.audience);
  section(l.tone, brief.tone);

  const languageLine =
    brief.language && brief.language !== "auto" ? languageInstruction(locale, brief.language) : l.languageAuto;
  section(l.language, languageLine);

  section(l.greeting, brief.greeting ? `"${brief.greeting}"` : "");

  if (brief.rules.length > 0) {
    lines.push(`**${l.rules}:**`, "", ...brief.rules.map((rule) => `- ${rule}`), "");
  }
  if (brief.avoid.length > 0) {
    lines.push(`**${l.avoid}:**`, "", ...brief.avoid.map((rule) => `- ${rule}`), "");
  }
  section(l.handoff, brief.handoff);

  if (lines.length === 0) return "";
  lines.push(l.closing);
  return lines.join("\n").trim() + "\n";
}

/** Whether a brief edit may rewrite the stored prompt. */
export function shouldRecompose(brief: AgentBrief): boolean {
  return brief.promptCustomized !== true;
}

// ── Readiness ────────────────────────────────────────────────────────
//
// What is still missing before an agent is worth turning on, as a list rather
// than a percentage nobody can act on. The builder renders it as the check
// list beside the blueprint, and the Activate button reads `blocking`.

export type ReadinessCheckId =
  | "identity"
  | "brief"
  | "prompt"
  | "capabilities"
  | "channel"
  | "knowledge";

export type ReadinessCheck = {
  readonly id: ReadinessCheckId;
  readonly done: boolean;
  /** A check that is merely advice — a green agent can ship without it. */
  readonly optional: boolean;
};

export type ReadinessInput = {
  readonly agent: Pick<Agent, "name" | "description" | "systemPrompt" | "tools"> & {
    readonly brief?: AgentBrief;
  };
  /** True when at least one customer channel points at this agent. */
  readonly channelAssigned: boolean;
  /** Documents in the business knowledge base. Zero is not fatal, but an
   *  agent that cannot quote a price list is half an agent. */
  readonly knowledgeDocuments: number;
};

export function readiness(input: ReadinessInput): {
  readonly checks: readonly ReadinessCheck[];
  readonly score: number;
  readonly ready: boolean;
} {
  const brief = input.agent.brief ? normalizeBrief(input.agent.brief) : emptyBrief();
  const checks: ReadinessCheck[] = [
    {
      id: "identity",
      done: input.agent.name.trim().length > 0 && input.agent.description.trim().length > 0,
      optional: false,
    },
    { id: "brief", done: Boolean(brief.role && brief.goal), optional: false },
    { id: "prompt", done: input.agent.systemPrompt.trim().length >= 40, optional: false },
    { id: "capabilities", done: input.agent.tools.length > 0, optional: false },
    { id: "channel", done: input.channelAssigned, optional: true },
    { id: "knowledge", done: input.knowledgeDocuments > 0, optional: true },
  ];
  const required = checks.filter((check) => !check.optional);
  const done = checks.filter((check) => check.done).length;
  return {
    checks,
    score: Math.round((done / checks.length) * 100),
    ready: required.every((check) => check.done),
  };
}
