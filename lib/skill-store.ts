import { join } from "node:path";
import { homedir } from "node:os";
import { createDocumentStore } from "./doc-store";
import type { AgentSkill, AgentSkillSource } from "./types";

// The owner's own skills.
//
// The ones in agent/skills/*.ts ship with a release: they are how *this
// product* sells, supports and markets, written once and versioned in git.
// These are how *this business* does it — the reception script, the price
// objection playbook, the checklist for a refund — and they arrive three
// ways: written in the app, started from a template, or promoted out of a
// document already uploaded to Conocimiento.
//
// Why promoting a document is not the same as retrieving it: search_knowledge
// finds a passage when the model thinks to look. A skill is advertised on
// every turn by its description and pulled in whole when it matches, which is
// what a *procedure* needs — half a checklist retrieved by cosine similarity
// is worse than none. So a price list stays a document, and "how we handle a
// refund" becomes a skill.

const STORE_FILE = join(homedir(), ".senka", "skills.json");

type SkillStore = {
  skills: AgentSkill[];
};

const SOURCES: readonly AgentSkillSource[] = ["manual", "template", "knowledge"];

function empty(): SkillStore {
  return { skills: [] };
}

function normalize(parsed: Partial<SkillStore>): SkillStore {
  return { skills: parsed.skills ?? [] };
}

const store = createDocumentStore<SkillStore>({
  id: "agent-skills",
  file: STORE_FILE,
  empty,
  normalize,
  scoped: true,
});

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * A name the runtime can use as a skill id.
 *
 * Eve places a skill package at `$HOME/.agents/skills/<slug>/`, so the slug
 * has to survive being a directory name and a tool-visible identifier: ASCII,
 * lowercase, no spaces. Accents are folded rather than dropped — "Atención al
 * cliente" becoming `atencion-al-cliente` keeps the name readable, while
 * dropping them would give `atenci-n-al-cliente`.
 */
export function slugifySkill(name: string): string {
  const folded = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const slug = folded
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "skill";
}

/** A slug nothing else is using. Collisions are resolved with a numeric
 *  suffix rather than rejected: the owner named two things the same, which is
 *  their business, and a skill that refuses to save over a name clash is a
 *  worse answer than `refunds-2`. */
function uniqueSlug(existing: readonly AgentSkill[], name: string, ignoreId?: string): string {
  const base = slugifySkill(name);
  const taken = new Set(
    existing.filter((skill) => skill.id !== ignoreId).map((skill) => skill.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function newId(): string {
  return `skill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readSource(value: unknown): AgentSkillSource {
  return SOURCES.includes(value as AgentSkillSource) ? (value as AgentSkillSource) : "manual";
}

function readAgentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && !!entry))];
}

export async function listSkills(): Promise<AgentSkill[]> {
  return (await store.read()).skills;
}

export async function getSkill(id: string): Promise<AgentSkill | undefined> {
  return (await store.read()).skills.find((skill) => skill.id === id);
}

/**
 * The skills one agent should be served, enabled only.
 *
 * An empty `agentIds` means "every agent" — that is the shape an owner means
 * when they upload the business playbook, and making them tick every agent
 * would guarantee the list goes stale the next time they hire one.
 */
export async function skillsForAgent(agentId: string | null): Promise<AgentSkill[]> {
  const skills = (await store.read()).skills.filter((skill) => skill.enabled);
  if (!agentId) return skills.filter((skill) => skill.agentIds.length === 0);
  return skills.filter(
    (skill) => skill.agentIds.length === 0 || skill.agentIds.includes(agentId),
  );
}

export type CreateSkillInput = {
  readonly name: string;
  readonly description: string;
  readonly markdown: string;
  readonly source?: unknown;
  readonly templateId?: string;
  readonly documentId?: string;
  readonly enabled?: boolean;
  readonly agentIds?: unknown;
};

export async function createSkill(input: CreateSkillInput): Promise<AgentSkill> {
  return store.update((current) => {
    const at = nowIso();
    const name = input.name.trim() || "Habilidad";
    const created: AgentSkill = {
      id: newId(),
      slug: uniqueSlug(current.skills, name),
      name,
      description: input.description.trim(),
      markdown: input.markdown,
      source: readSource(input.source),
      ...(input.templateId ? { templateId: input.templateId } : {}),
      ...(input.documentId ? { documentId: input.documentId } : {}),
      enabled: input.enabled !== false,
      agentIds: readAgentIds(input.agentIds),
      createdAt: at,
      updatedAt: at,
    };
    current.skills = [created, ...current.skills];
    return created;
  });
}

export async function updateSkill(
  id: string,
  updates: Partial<CreateSkillInput>,
): Promise<AgentSkill | undefined> {
  return store.update((current) => {
    const existing = current.skills.find((skill) => skill.id === id);
    if (!existing) return undefined;
    const name = updates.name?.trim() || existing.name;
    const updated: AgentSkill = {
      ...existing,
      name,
      // Renaming re-slugs. The slug is the model-visible identity, and a skill
      // called "Devoluciones" that still loads as `refunds` is a debugging
      // trap the first time somebody reads a log.
      slug: name === existing.name ? existing.slug : uniqueSlug(current.skills, name, id),
      ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
      ...(updates.markdown !== undefined ? { markdown: updates.markdown } : {}),
      ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
      ...(updates.agentIds !== undefined ? { agentIds: readAgentIds(updates.agentIds) } : {}),
      updatedAt: nowIso(),
    };
    current.skills = current.skills.map((skill) => (skill.id === id ? updated : skill));
    return updated;
  });
}

export async function deleteSkill(id: string): Promise<boolean> {
  return store.update((current) => {
    const before = current.skills.length;
    current.skills = current.skills.filter((skill) => skill.id !== id);
    return current.skills.length < before;
  });
}

/** Whether a knowledge document has already been promoted, so the Conocimiento
 *  page can show "ya es una habilidad" instead of offering the button twice. */
export async function skillForDocument(documentId: string): Promise<AgentSkill | undefined> {
  return (await store.read()).skills.find((skill) => skill.documentId === documentId);
}
