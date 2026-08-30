import { getCredentialSync, type CredentialKey } from "./credentials";

// Bridge the credential store into process.env.
//
// Eve, the AI SDK, and @workflow/world-postgres all read process.env directly
// — none of them know the Settings page persists to ~/.steve/credentials.json.
// Without this, a value saved in the UI is silently ignored in favor of
// whatever the shell happened to export.
//
// Env vars already present win over the store for the database, deliberately:
// a deployment that injects WORKFLOW_POSTGRES_URL through systemd or a
// container runtime must not be re-pointed by a stale value someone typed into
// the UI months ago. Model keys go the other way — the UI is the intended way
// to rotate them.

const MODEL_KEYS: readonly CredentialKey[] = [
  "AI_GATEWAY_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
];

const DATABASE_KEYS: readonly CredentialKey[] = [
  "WORKFLOW_POSTGRES_URL",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
  "POSTGRES_HOST_PORT",
];

/** Stored model keys overwrite the environment. */
export function applyModelEnv(): void {
  for (const key of MODEL_KEYS) {
    const value = getCredentialSync(key);
    if (value) process.env[key] = value;
  }
}

/** Stored database settings fill in only what the environment left unset. */
export function applyDatabaseEnv(): void {
  for (const key of DATABASE_KEYS) {
    if (process.env[key]) continue;
    const value = getCredentialSync(key);
    if (value) process.env[key] = value;
  }
}

/**
 * Everything the runtime needs before Eve boots. Called from agent.ts, which
 * runs during Eve's synchronous discovery phase — early enough that the
 * Postgres world picks up the connection string.
 */
export function applyStoredEnv(): void {
  applyModelEnv();
  applyDatabaseEnv();
}
