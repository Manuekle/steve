import { readFile, readdir, unlink } from "node:fs/promises";
import { createDocumentStore } from "./doc-store";
import { join } from "node:path";
import { homedir } from "node:os";
import { BUILTIN_TEMPLATES } from "@/components/email-templates";

/**
 * Email template registry — the five that ship with the app plus whatever the
 * operator has written in the editor.
 *
 * Built-ins are modules under `components/email-templates/`. Custom ones are
 * `.tsx` files under `~/.steve/email-templates/`, each beside a `.meta.json`
 * holding the label, subject and sample values the editor needs before it has
 * compiled anything.
 */

const CUSTOM_DIR = join(homedir(), ".steve", "email-templates");

export type EmailTemplateMeta = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Default subject, with `{{variable}}` placeholders. */
  readonly subject: string;
  readonly variables: readonly string[];
  /** One value per variable, used for the preview and for test sends. */
  readonly sample: Record<string, unknown>;
  readonly source: "builtin" | "custom";
};

/** What `saveCustomTemplate` accepts — everything but the id and the origin,
 *  which the caller and the store already know. */
export type CustomTemplateMeta = {
  readonly label: string;
  readonly description: string;
  readonly subject: string;
  readonly variables: readonly string[];
  readonly sample: Record<string, unknown>;
};

// ── Built-in templates ──────────────────────────────────────────────

function builtinMeta(): EmailTemplateMeta[] {
  return BUILTIN_TEMPLATES.map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description,
    subject: t.subject,
    variables: t.variables,
    sample: t.sample,
    source: "builtin" as const,
  }));
}

/**
 * A built-in's source text, read from the repo so the editor can show it.
 *
 * Only ever shown — `renderTemplateById` renders built-ins from the imported
 * component, never from this string. Under `output: "standalone"` the `.tsx`
 * files aren't traced into the runtime image, so this can legitimately come
 * back null; the editor treats that as "read-only, no source to show" rather
 * than as a broken template.
 */
async function builtinSource(id: string): Promise<string | null> {
  if (!BUILTIN_TEMPLATES.some((t) => t.id === id)) return null;
  try {
    return await readFile(join(process.cwd(), "components", "email-templates", `${id}.tsx`), "utf-8");
  } catch {
    return null;
  }
}

// ── Custom templates ────────────────────────────────────────────────

/** Ids reach here from a URL segment, so they never get to shape a path:
 *  anything outside `[A-Za-z0-9_-]` — a dot, a slash — becomes an underscore. */
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function customPath(id: string): string {
  return join(CUSTOM_DIR, `${safeId(id)}.tsx`);
}

function customMetaPath(id: string): string {
  return join(CUSTOM_DIR, `${safeId(id)}.meta.json`);
}

/** A meta file written by an older build can be missing the newer fields, and
 *  a hand-edited one can hold anything at all. */
function normalizeCustomMeta(id: string, raw: unknown): EmailTemplateMeta {
  const record = (raw ?? {}) as Record<string, unknown>;
  const variables = Array.isArray(record.variables)
    ? record.variables.filter((v): v is string => typeof v === "string")
    : [];
  return {
    id,
    label: typeof record.label === "string" && record.label ? record.label : id,
    description: typeof record.description === "string" ? record.description : "",
    subject: typeof record.subject === "string" ? record.subject : "",
    variables,
    sample:
      record.sample && typeof record.sample === "object" && !Array.isArray(record.sample)
        ? (record.sample as Record<string, unknown>)
        : {},
    source: "custom",
  };
}

// Custom templates were a directory: a `.tsx` and a `.meta.json` per
// template, listed with readdir. That has no equivalent on a read-only
// filesystem, and the pair could half-write. One document holds both halves
// per id, so a save is one atomic write and a list is one read.
type CustomTemplate = { readonly source: string; readonly meta: unknown };

type EmailTemplateStore = { custom: Record<string, CustomTemplate> };

const templateStore = createDocumentStore<EmailTemplateStore>({
  id: "email-templates",
  file: join(CUSTOM_DIR, "custom-templates.json"),
  empty: () => ({ custom: {} }),
  normalize: (parsed) => ({ custom: parsed.custom ?? {} }),
});

/**
 * Templates written by the directory layout this replaced.
 *
 * Read on every list rather than migrated once: the document store's own
 * import only moves the JSON file it is pointed at, and these are a directory
 * of pairs. A template saved from here on lands in the document, and one
 * saved under the same id shadows the file — so an install upgrades by
 * editing, and nothing disappears in the meantime.
 */
async function listLegacyCustom(): Promise<Record<string, CustomTemplate>> {
  let files: string[];
  try {
    files = await readdir(CUSTOM_DIR);
  } catch {
    return {};
  }
  const found: Record<string, CustomTemplate> = {};
  for (const file of files) {
    if (!file.endsWith(".meta.json")) continue;
    const id = file.slice(0, -".meta.json".length);
    try {
      const [meta, source] = await Promise.all([
        readFile(join(CUSTOM_DIR, file), "utf-8"),
        readFile(customPath(id), "utf-8").catch(() => ""),
      ]);
      found[id] = { source, meta: JSON.parse(meta) };
    } catch {
      // A corrupted meta file hides one template rather than emptying the list.
    }
  }
  return found;
}

async function allCustom(): Promise<Record<string, CustomTemplate>> {
  const [legacy, stored] = await Promise.all([listLegacyCustom(), templateStore.read()]);
  return { ...legacy, ...stored.custom };
}

async function listCustom(): Promise<EmailTemplateMeta[]> {
  const custom = await allCustom();
  const results = Object.entries(custom).map(([id, template]) =>
    normalizeCustomMeta(id, template.meta),
  );
  return results.sort((a, b) => a.label.localeCompare(b.label));
}

async function customSource(id: string): Promise<string | null> {
  return (await allCustom())[safeId(id)]?.source ?? null;
}

// ── Public API ──────────────────────────────────────────────────────

export async function listTemplates(): Promise<EmailTemplateMeta[]> {
  return [...builtinMeta(), ...(await listCustom())];
}

export async function getTemplateSource(id: string): Promise<string | null> {
  return (await builtinSource(id)) ?? (await customSource(id));
}

export async function getTemplateMeta(id: string): Promise<EmailTemplateMeta | null> {
  const builtin = builtinMeta().find((t) => t.id === id);
  if (builtin) return builtin;
  const template = (await allCustom())[safeId(id)];
  return template ? normalizeCustomMeta(safeId(id), template.meta) : null;
}

/** Create or update a custom template. Built-ins never reach here — the
 *  routes refuse them first. */
export async function saveCustomTemplate(
  id: string,
  source: string,
  meta: CustomTemplateMeta,
): Promise<EmailTemplateMeta> {
  const stored: EmailTemplateMeta = { id: safeId(id), ...meta, source: "custom" };
  await templateStore.update((store) => {
    store.custom[safeId(id)] = { source, meta: stored };
  });
  return stored;
}

/** Delete a custom template. Built-in templates cannot be deleted. */
export async function deleteCustomTemplate(id: string): Promise<boolean> {
  const removed = await templateStore.update((store) => {
    if (!(safeId(id) in store.custom)) return false;
    delete store.custom[safeId(id)];
    return true;
  });

  // Also remove the directory pair, when this install still has one — a
  // delete that left the legacy files behind would have the template
  // reappear on the next list.
  let unlinked = false;
  for (const path of [customPath(id), customMetaPath(id)]) {
    try {
      await unlink(path);
      unlinked = true;
    } catch {
      // Already gone.
    }
  }
  return removed || unlinked;
}

export function isBuiltinTemplate(id: string): boolean {
  return BUILTIN_TEMPLATES.some((t) => t.id === id);
}

/**
 * Fill `{{variable}}` placeholders in a subject line. Anything the values
 * don't cover is left as written rather than blanked, so a typo in a
 * placeholder is visible in the subject instead of silently vanishing.
 */
export function renderSubject(subject: string, variables: Record<string, unknown>): string {
  return subject.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = variables[key];
    if (value === undefined || value === null || value === "") return match;
    return typeof value === "string" ? value : String(value);
  });
}
