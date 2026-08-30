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
