// Where this install's Postgres actually lives.
//
// One connection string serves the whole app (Eve's Workflow world and the
// credits ledger both read WORKFLOW_POSTGRES_URL), but *where* it points
// changes what setup advice is true. On a laptop it is the Docker container
// `pnpm db:up` starts. On a hosted database — Supabase, Neon, RDS — Docker is
// not involved at all, and telling someone to run `pnpm db:up` because their
// database is unreachable is worse than saying nothing.
//
// Derived from the URL rather than stored as its own setting: a second field
// saying "I use Supabase" could disagree with the connection string, and then
// the app would be wrong in a way nobody could see.

export type PostgresKind = "local" | "supabase" | "remote";

/** What each of the app's own pools may hold when nothing says otherwise. */
const DEFAULT_POOL_MAX = 5;

/**
 * How many connections one of the app's Postgres pools may hold.
 *
 * There are four of them — documents, credits, auth, billing — and they are
 * separate because they were written separately, not because anything needs
 * them to be. Each one used to hardcode 5, which is 20 connections from a
 * single process before the Workflow world opens its own.
 *
 * That is fine against the Docker container, whose `max_connections` is 100.
 * It is not fine against a hosted pooler: Supabase's session pooler defaults
 * to 15 *client* connections regardless of the 60 the database itself allows,
 * and going over it fails the request outright —
 *
 *   (EMAXCONNSESSION) max clients reached in session mode -
 *   max clients are limited to pool_size: 15
 *
 * — which is not a slow query or a retry, it is a 500. Worse on a serverless
 * host, where the count is per instance and the instances are not yours to
 * count. So the number has to be settable per deployment rather than compiled
 * in, the same way WORKFLOW_POSTGRES_MAX_POOL_SIZE already is for the world.
 */
export function poolMaxConnections(): number {
  const parsed = Number.parseInt(process.env.STEVE_PG_MAX_POOL_SIZE ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_POOL_MAX;
}

export type PostgresTarget = {
  readonly host: string;
  readonly port: number;
  readonly kind: PostgresKind;
  /** True when a container on this machine is what serves it. */
  readonly isLocal: boolean;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"]);

export function describePostgresTarget(url: string | undefined): PostgresTarget | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname || "127.0.0.1";
  const port = Number(parsed.port || 5432);
  // Both the direct host (db.<ref>.supabase.co) and the poolers
  // (aws-0-<region>.pooler.supabase.com) live under supabase.
  const kind: PostgresKind = LOCAL_HOSTS.has(host)
    ? "local"
    : /(^|\.)supabase\.(co|com|net|io)$/i.test(host)
      ? "supabase"
      : "remote";
  return { host, port, kind, isLocal: kind === "local" };
}
