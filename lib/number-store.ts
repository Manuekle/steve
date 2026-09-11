import { join } from "node:path";
import { homedir } from "node:os";
import { createDocumentStore } from "./doc-store";
import { formatE164, toE164 } from "./phone-format";
import type { NumberCapability, NumberProvider, PhoneNumber, PhoneNumberStatus } from "./types";

// The directory of numbers this installation owns, and which agent answers
// each one.
//
// The rule the whole file exists to enforce: **one agent per number**. Two
// agents bound to the same line do not split the traffic, they collide —
// both webhooks fire, both prompts answer, and the customer gets one thread
// written by two personalities. So `assignNumber` refuses a number another
// agent already holds and names the holder, rather than overwriting it and
// letting the crossing show up later as a support ticket.
//
// The directory is also deliberately wider than what this app can
// provision. A number on a provider we do not integrate with still belongs
// here as `manual`: the collision check is only as good as the list it
// checks against, and a number the owner forgot to write down is exactly
// the one that gets double-assigned.

const STORE_FILE = join(homedir(), ".senka", "numbers.json");

type NumberStore = {
  numbers: PhoneNumber[];
};

const CAPABILITIES: readonly NumberCapability[] = ["whatsapp", "sms", "voice", "instagram"];
const PROVIDERS: readonly NumberProvider[] = ["meta", "twilio", "elevenlabs", "manual"];

function empty(): NumberStore {
  return { numbers: [] };
}

function normalize(parsed: Partial<NumberStore>): NumberStore {
  return { numbers: parsed.numbers ?? [] };
}

const store = createDocumentStore<NumberStore>({
  id: "phone-numbers",
  file: STORE_FILE,
  empty,
  normalize,
  // Numbers belong to a business the way agents and contacts do: a second
  // shop has its own lines, and seeing the first one's would be worse than
  // useless — it would let the collision check block a number that is not
  // actually taken on this business.
  scoped: true,
});

// Formatting lives in lib/phone-format.ts so a client component can import it
// without pulling `pg` into the browser bundle. Re-exported here because every
// server caller wants both halves from one module.
export { formatE164, toE164 } from "./phone-format";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return `num-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readCapabilities(value: unknown): NumberCapability[] {
  if (!Array.isArray(value)) return [];
  const seen = value.filter((entry): entry is NumberCapability =>
    CAPABILITIES.includes(entry as NumberCapability),
  );
  return [...new Set(seen)];
}

function readProvider(value: unknown): NumberProvider {
  return PROVIDERS.includes(value as NumberProvider) ? (value as NumberProvider) : "manual";
}

export async function listNumbers(): Promise<PhoneNumber[]> {
  return (await store.read()).numbers;
}

export async function getNumber(id: string): Promise<PhoneNumber | undefined> {
  return (await store.read()).numbers.find((entry) => entry.id === id);
}

/** The number an agent answers on, if any. The inverse lookup the channel
 *  webhooks need: they arrive knowing the line, not the agent. */
export async function getNumberByE164(e164: string): Promise<PhoneNumber | undefined> {
  const normalized = toE164(e164);
  if (!normalized) return undefined;
  return (await store.read()).numbers.find((entry) => entry.e164 === normalized);
}

export async function getAgentNumbers(agentId: string): Promise<PhoneNumber[]> {
  return (await store.read()).numbers.filter((entry) => entry.agentId === agentId);
}

export type NumberConflict = {
  readonly conflict: "duplicate" | "assigned";
  readonly number: PhoneNumber;
};

/**
 * Is this number free, and if not, why not.
 *
 * Two different failures, kept apart because the fix differs: `duplicate`
 * means the directory already holds this line (edit that entry), `assigned`
 * means it is held by another agent (unassign there first).
 */
export async function checkNumber(input: {
  readonly e164: string;
  /** Ignore this entry when checking — the row being edited is not its own
   *  duplicate. */
  readonly ignoreId?: string;
  /** When set, also report a number already bound to a *different* agent. */
  readonly forAgentId?: string | null;
}): Promise<NumberConflict | null> {
  const normalized = toE164(input.e164);
  if (!normalized) return null;
  const numbers = (await store.read()).numbers;
  const existing = numbers.find(
    (entry) => entry.e164 === normalized && entry.id !== input.ignoreId,
  );
  if (existing) return { conflict: "duplicate", number: existing };

  if (input.forAgentId) {
    const held = numbers.find(
      (entry) =>
        entry.id !== input.ignoreId && entry.agentId !== null && entry.e164 === normalized,
    );
    if (held && held.agentId !== input.forAgentId) return { conflict: "assigned", number: held };
  }
  return null;
}

export type CreateNumberInput = {
  readonly e164: string;
  readonly label?: string;
  readonly capabilities?: unknown;
  readonly provider?: unknown;
  readonly providerNumberId?: string;
  readonly agentId?: string | null;
  readonly notes?: string;
  readonly status?: PhoneNumberStatus;
};

export type NumberResult =
  | { readonly ok: true; readonly number: PhoneNumber }
  | { readonly ok: false; readonly reason: "invalid_e164" }
  | { readonly ok: false; readonly reason: "duplicate"; readonly holder: PhoneNumber }
  | { readonly ok: false; readonly reason: "assigned"; readonly holder: PhoneNumber }
  | { readonly ok: false; readonly reason: "not_found" };

export async function createNumber(input: CreateNumberInput): Promise<NumberResult> {
  const e164 = toE164(input.e164);
  if (!e164) return { ok: false, reason: "invalid_e164" };

  return store.update((current) => {
    const clash = current.numbers.find((entry) => entry.e164 === e164);
    if (clash) return { ok: false as const, reason: "duplicate" as const, holder: clash };

    const at = nowIso();
    const created: PhoneNumber = {
      id: newId(),
      e164,
      label: input.label?.trim() || formatE164(e164),
      capabilities: readCapabilities(input.capabilities),
      provider: readProvider(input.provider),
      ...(input.providerNumberId?.trim()
        ? { providerNumberId: input.providerNumberId.trim() }
        : {}),
      agentId: typeof input.agentId === "string" && input.agentId ? input.agentId : null,
      status: input.status === "inactive" ? "inactive" : "active",
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      createdAt: at,
      updatedAt: at,
    };
    current.numbers = [created, ...current.numbers];
    return { ok: true as const, number: created };
  });
}

export async function updateNumber(
  id: string,
  updates: Partial<CreateNumberInput>,
): Promise<NumberResult> {
  const nextE164 = updates.e164 === undefined ? undefined : toE164(updates.e164);
  if (updates.e164 !== undefined && !nextE164) return { ok: false, reason: "invalid_e164" };

  return store.update((current) => {
    const existing = current.numbers.find((entry) => entry.id === id);
    if (!existing) return { ok: false as const, reason: "not_found" as const };

    if (nextE164 && nextE164 !== existing.e164) {
      const clash = current.numbers.find((entry) => entry.e164 === nextE164 && entry.id !== id);
      if (clash) return { ok: false as const, reason: "duplicate" as const, holder: clash };
    }

    const updated: PhoneNumber = {
      ...existing,
      ...(nextE164 ? { e164: nextE164 } : {}),
      ...(updates.label !== undefined ? { label: updates.label.trim() || existing.label } : {}),
      ...(updates.capabilities !== undefined
        ? { capabilities: readCapabilities(updates.capabilities) }
        : {}),
      ...(updates.provider !== undefined ? { provider: readProvider(updates.provider) } : {}),
      ...(updates.providerNumberId !== undefined
        ? { providerNumberId: updates.providerNumberId.trim() || undefined }
        : {}),
      ...(updates.agentId !== undefined
        ? { agentId: typeof updates.agentId === "string" && updates.agentId ? updates.agentId : null }
        : {}),
      ...(updates.status !== undefined
        ? { status: updates.status === "inactive" ? "inactive" : "active" }
        : {}),
      ...(updates.notes !== undefined ? { notes: updates.notes.trim() || undefined } : {}),
      updatedAt: nowIso(),
    };
    current.numbers = current.numbers.map((entry) => (entry.id === id ? updated : entry));
    return { ok: true as const, number: updated };
  });
}

/**
 * Bind a number to an agent, or clear it with `null`.
 *
 * The exclusivity check runs inside the same `update` as the write, which is
 * the only place it can run correctly: checking first and writing second is
 * a race two browser tabs can lose, and on Postgres this callback holds the
 * row lock for the whole read-modify-write.
 */
export async function assignNumber(
  numberId: string,
  agentId: string | null,
): Promise<NumberResult> {
  return store.update((current) => {
    const target = current.numbers.find((entry) => entry.id === numberId);
    if (!target) return { ok: false as const, reason: "not_found" as const };

    if (agentId) {
      const held = current.numbers.find(
        (entry) => entry.id !== numberId && entry.agentId === agentId,
      );
      // An agent with two numbers is a different kind of crossing: the same
      // prompt answering two lines cannot tell them apart, so replies leave
      // on whichever line the transport picks. Refused for the same reason.
      if (held) return { ok: false as const, reason: "assigned" as const, holder: held };
    }

    const updated: PhoneNumber = { ...target, agentId, updatedAt: nowIso() };
    current.numbers = current.numbers.map((entry) => (entry.id === numberId ? updated : entry));
    return { ok: true as const, number: updated };
  });
}

export async function deleteNumber(id: string): Promise<boolean> {
  return store.update((current) => {
    const before = current.numbers.length;
    current.numbers = current.numbers.filter((entry) => entry.id !== id);
    return current.numbers.length < before;
  });
}
