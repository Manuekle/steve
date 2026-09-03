import { Pool, type PoolClient } from "pg";
import { poolMaxConnections } from "./postgres-target";

// Postgres access for the AI-credits engine (model_pricing / credit_account /
// credit_transaction / ai_usage), kept in its own `credits` schema in the
// same database Eve's Workflow world already requires (WORKFLOW_POSTGRES_URL
// is mandatory for self-hosted Steve — this adds no new infrastructure, only
// a second schema Eve does not own or touch).
//
// The schema is applied lazily and idempotently (CREATE ... IF NOT EXISTS) on
// first use rather than through a separate operator migration step: every
// statement here is safe to re-run on every boot, so there is nothing new for
// deploy/ or docker-compose.enterprise.yml to orchestrate. The SQL is inlined
// as a string, not read from a sibling .sql file, because the eve backend
// image resolves `agent/agent.ts`'s imports at boot rather than inlining them
// at build time (see docs/commercial-licensing.md §11) — a file read at
// runtime relative to this module is exactly the class of thing that broke
// there once already.

let pool: Pool | undefined;
let schemaReady: Promise<void> | undefined;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.WORKFLOW_POSTGRES_URL;
    if (!connectionString) {
      throw new Error(
        "WORKFLOW_POSTGRES_URL is not set. AI credits and usage tracking need the same " +
          "Postgres connection string the Workflow world uses.",
      );
    }
    pool = new Pool({ connectionString, max: poolMaxConnections() });
    // See lib/doc-store.ts: an unhandled pool `error` event is an uncaught
    // exception, and takes the whole process with it.
    pool.on("error", (error) => {
      console.error("[credits] postgres pool error", error);
    });
  }
  return pool;
}

const SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS credits;

CREATE TABLE IF NOT EXISTS credits.model_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  modality text NOT NULL CHECK (modality IN ('llm', 'tts')),
  input_cost_per_1m numeric(14,6),
  output_cost_per_1m numeric(14,6),
  cached_input_cost_per_1m numeric(14,6),
  character_cost_per_1k numeric(14,6),
  currency text NOT NULL DEFAULT 'usd',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  active boolean NOT NULL DEFAULT true,
  source_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_pricing_lookup
  ON credits.model_pricing (provider, model, active);

CREATE TABLE IF NOT EXISTS credits.credit_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL UNIQUE,
  balance numeric(14,4) NOT NULL DEFAULT 0,
  monthly_allocation numeric(14,4) NOT NULL DEFAULT 0,
  used_this_period numeric(14,4) NOT NULL DEFAULT 0,
  period_start timestamptz,
  period_end timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credits.credit_transaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  type text NOT NULL CHECK (type IN (
    'PLAN_ALLOCATION', 'USAGE', 'PURCHASE', 'REFUND', 'GRANT', 'ADJUSTMENT', 'EXPIRATION'
  )),
  amount numeric(14,4) NOT NULL,
  balance_after numeric(14,4) NOT NULL,
  reference_type text,
  reference_id text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- One USAGE transaction per (reference_type, reference_id) — the other half
-- of ai_usage's own idempotency guard, so a retried recordUsage() can never
-- double-post to the ledger even if it somehow got past the ai_usage insert
-- guard (belt and suspenders: the ai_usage unique index is the primary one).
CREATE UNIQUE INDEX IF NOT EXISTS credit_transaction_usage_idempotency
  ON credits.credit_transaction (reference_type, reference_id)
  WHERE type = 'USAGE' AND reference_type IS NOT NULL AND reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS credit_transaction_org_created
  ON credits.credit_transaction (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS credits.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  workspace_id text,
  user_id text,
  agent_id text,
  conversation_id text,
  channel text,
  provider text NOT NULL,
  model text NOT NULL,
  usage_type text NOT NULL CHECK (usage_type IN ('llm', 'tts', 'image', 'video')),
  input_tokens integer,
  output_tokens integer,
  cached_input_tokens integer,
  characters integer,
  input_cost numeric(14,6),
  output_cost numeric(14,6),
  provider_cost numeric(14,6),
  credits_used numeric(14,4) NOT NULL DEFAULT 0,
  billing_source text NOT NULL CHECK (billing_source IN ('INCLUDED_CREDITS', 'BYOK', 'PURCHASED_CREDITS')),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_idempotency
  ON credits.ai_usage (provider, idempotency_key);
CREATE INDEX IF NOT EXISTS ai_usage_org_created ON credits.ai_usage (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_agent ON credits.ai_usage (agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_usage_channel ON credits.ai_usage (channel) WHERE channel IS NOT NULL;
`;

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA_SQL)
      .then(() => undefined);
  }
  await schemaReady;
}

/** Run `fn` with a client checked out from the pool, for a multi-statement
 *  transaction (BEGIN/COMMIT belongs to the caller — see lib/credit-account.ts
 *  and lib/ai-usage.ts for the actual atomic operations). */
export async function withCreditsClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** One-shot query outside a transaction. */
export async function creditsQuery<Row extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: readonly unknown[],
): Promise<Row[]> {
  await ensureSchema();
  const result = await getPool().query(text, params as unknown[]);
  return result.rows as Row[];
}
