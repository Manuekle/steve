import { generateObject } from "ai";
import { z } from "zod";
import { getProviderReport } from "./provider-catalog";
import { languageModelForTask } from "./task-model";
import type { LeadResearch } from "./types";
import type { WebSearchResult } from "./web-search";

// Composing a lead dossier from whatever material is already gathered — the
// knowledge base and a live web search, both optional. Same shape as
// lib/prospect.ts: a pure synthesis step over material the caller already
// fetched, gated on provider health, bounded by a timeout, never throwing.

const MAX_SIGNALS = 6;

const researchSchema = z.object({
  summary: z
    .string()
    .describe("2-4 sentences, in the language the lead's own info is in. What matters for a salesperson to know."),
  companyName: z.string().optional().describe("The lead's company, if it's identifiable. Omit if unclear."),
  signals: z
    .array(z.string())
    .max(MAX_SIGNALS)
    .describe("Short, concrete facts found — company size, budget hints, public presence, fit. Not filler."),
});

export type ResearchInput = {
  readonly name?: string;
  readonly notes?: string;
  /** Passages already retrieved from the business's own knowledge base. */
  readonly knowledge: readonly string[];
  /** Results already retrieved from a live web search. */
  readonly webResults: readonly WebSearchResult[];
};

/**
 * Synthesize a lead dossier from internal knowledge and web results.
 *
 * Returns `null` — never throws — when there is nothing to read, no model
 * credential, or the model failed: research that didn't run is a normal
 * state, and a fabricated dossier is worse than none.
 */
export async function researchLead(input: ResearchInput): Promise<LeadResearch | null> {
  const knowledge = input.knowledge.filter((k) => k.trim().length > 0);
  const web = input.webResults.filter((r) => r.content.trim().length > 0);
  if (knowledge.length === 0 && web.length === 0 && !input.notes?.trim()) return null;

  const health = await getProviderReport();
  if (health.status === "missing" || health.status === "invalid") return null;

  const system = [
    "You research a sales lead for the business you work for, from the material given to you.",
    "",
    "## Rules",
    "",
    "- Use only what the material actually says. Never invent a company, a number, or a fact not present below.",
    "- If the material says little, say little — a short, honest summary beats a padded one.",
    "- Write in the language the lead's own name or notes are in, or Spanish if neither gives a hint.",
    "- A signal is a fact worth a salesperson's attention, not a restatement of the summary.",
  ].join("\n");

  const sections = [
    input.name ? `Lead name: ${input.name}` : null,
    input.notes?.trim() ? `Existing notes:\n${input.notes.trim()}` : null,
    knowledge.length > 0 ? `Internal knowledge base:\n${knowledge.join("\n---\n")}` : null,
    web.length > 0
      ? `Web search results:\n${web.map((r) => `[${r.title}](${r.url})\n${r.content}`).join("\n---\n")}`
      : null,
  ].filter((s): s is string => s !== null);

  try {
    const result = await generateObject({
      model: await languageModelForTask("quick"),
      schema: researchSchema,
      system,
      prompt: sections.join("\n\n"),
      abortSignal: AbortSignal.timeout(45_000),
    });
    return {
      summary: result.object.summary.trim(),
      companyName: result.object.companyName?.trim() || undefined,
      signals: result.object.signals.map((s) => s.trim()).filter(Boolean),
      sources: web.map((r) => r.url),
      researchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
