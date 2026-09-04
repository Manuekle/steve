import { Pool } from "pg";
import { poolMaxConnections } from "./postgres-target";

/**
 * The one connection pool this process opens to Postgres.
 *
 * There were four, one per module — documents, auth, billing, credits — each
 * built from the same connection string with the same options, differing only
 * in which file declared it. Four pools to one database is four times the
 * connections for no benefit: `pg` already multiplexes concurrent queries over
 * a pool, and nothing here needs isolation between the modules.
 *
 * It stopped being merely wasteful in production. Supabase's session pooler
 * caps clients — 40 on this project — and that budget is shared by every warm
 * serverless instance plus the Workflow world's own pool. At `max: 5` each,
 * two instances reached the ceiling, and the next connection got:
 *
 *   (EMAXCONNSESSION) max clients reached in session mode -
 *   max clients are limited to pool_size: 40
 *
 * The visible symptom was worse than an error page: `usingDb()` degrades to
 * the file store when a connection fails, so a correct password came back as
 * 401. Production looked like it was rejecting valid credentials.
 *
 * One pool per process cuts the per-instance draw fourfold and leaves
 * `STEVE_PG_MAX_POOL_SIZE` meaning what it says — the number of connections
 * this process holds, not a quarter of it.
 */

let pool: Pool | undefined;

export function sharedPool(): Pool {
  if (!pool) {
    const connectionString = process.env.WORKFLOW_POSTGRES_URL;
    if (!connectionString) {
      throw new Error(
        "WORKFLOW_POSTGRES_URL is not set. Every Postgres-backed store needs the same connection.",
      );
    }
    pool = new Pool({ connectionString, max: poolMaxConnections() });
    // Without this the process dies. `pg` emits `error` on the pool when an
    // idle client's connection drops or was never established, and an
    // unhandled `error` event on an EventEmitter is an uncaught exception —
    // not a rejected promise the callers' try/catch can see. A database that
    // is unreachable has to degrade, not take the server down first.
    pool.on("error", (error) => {
      console.error("[postgres] pool error", error);
    });
  }
  return pool;
}

/** Drops the pool so the next call builds a new one. Tests only. */
export async function resetSharedPool(): Promise<void> {
  const current = pool;
  pool = undefined;
  await current?.end().catch(() => undefined);
}
