import { homedir } from "node:os";
import { join } from "node:path";
import { createDocumentStore } from "../doc-store";

/**
 * What the owner told us on the way in.
 *
 * Kept deliberately small. A question is only here if the answer changes
 * something — the language switches the app on the spot, the CRM writes a host
 * into `HTTP_ALLOWLIST`, and the goals decide which features the closing panel
 * puts first. The two that are stored and nothing else (`contactVolume`, the
 * test `phone`) are marked as such below, so nobody wires a feature to them
 * later believing they were already load-bearing.
 *
 * Same shape and the same directory as `credentials.ts` and `auth.ts`: one
 * JSON file, written through a temp file and a rename.
 */

const FILE = join(homedir(), ".steve", "onboarding.json");

// Re-exported so server callers have one import for the whole feature.
export { CRMS, GOALS, INDUSTRIES, VOLUMES, crmHost } from "./options";

export type OnboardingProfile = {
  readonly businessName: string;
  /** One of `VOLUMES`. Stored for the profile; nothing reads it yet. */
  readonly contactVolume: string;
  /** One of `CRMS`. Its host is appended to `HTTP_ALLOWLIST` on save. */
  readonly crm: string;
  readonly goals: readonly string[];
  /** One of `INDUSTRIES`. */
  readonly industry: string;
  /** The owner's own number, for sending test messages. Stored only. */
  readonly phone: string;
};

type Store = {
  completedAt: string | null;
  profile: OnboardingProfile | null;
  /** Set when the owner chose to skip, so it is never asked again either. */
  skippedAt: string | null;
};

function empty(): Store {
  return { completedAt: null, profile: null, skippedAt: null };
}

// Postgres when one is configured, ~/.steve/onboarding.json otherwise.
const onboardingStore = createDocumentStore<Store>({
  id: "onboarding",
  file: FILE,
  empty,
  normalize: (parsed: Partial<Store>) => ({
    completedAt: parsed.completedAt ?? null,
    profile: parsed.profile ?? null,
    skippedAt: parsed.skippedAt ?? null,
  }),
});

const read = (): Promise<Store> => onboardingStore.read();

/** True once it has been completed or skipped — either way, do not ask again. */
export async function isSettled(): Promise<boolean> {
  const store = await read();
  return store.completedAt !== null || store.skippedAt !== null;
}

export async function getProfile(): Promise<OnboardingProfile | null> {
  return (await read()).profile;
}

export async function saveProfile(profile: OnboardingProfile): Promise<void> {
  await onboardingStore.update((store: Store) => {
    store.completedAt = new Date().toISOString();
    store.profile = profile;
    store.skippedAt = null;
  });
}

export async function skip(): Promise<void> {
  await onboardingStore.update((store: Store) => {
    store.skippedAt = new Date().toISOString();
  });
}
