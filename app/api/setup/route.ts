import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { connect } from "node:net";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { resolveEmbeddingModel, resolveProvider } from "@/lib/ai-provider";
import { getStoredCredentials } from "@/lib/credentials";
import { applyDatabaseEnv } from "@/lib/runtime-env";
import { withApiErrors } from "@/lib/api-error";

// GET /api/setup — "does this machine have what the project needs?"
//
// Written for someone who has never opened a terminal: every check answers in
// plain language and, when it fails, names the one command that fixes it. The
// commands are executed with execFile (argument arrays, no shell), so nothing
// from the credential store is ever interpolated into a command line.

export const maxDuration = 60;

const run = promisify(execFile);

export type CheckStatus = "ok" | "warn" | "fail" | "unknown";

export type SetupCheck = {
  id: string;
  status: CheckStatus;
  detail: string;
  /** Shell command that resolves the failure, when there is one. */
  fix?: string;
  /** Where to read more, for the checks a command can't fix. */
  link?: string;
};

/** Container name pinned in docker-compose.yml. */
const POSTGRES_CONTAINER = "steve-postgres";
const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]+$/;

async function tryRun(file: string, args: string[], timeout = 8000) {
  try {
    const { stdout } = await run(file, args, { timeout, windowsHide: true });
    return { ok: true as const, out: stdout.trim() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false as const, out: message };
  }
}

/** Host and port a Postgres URL points at, without pulling in a pg client. */
function parsePostgresUrl(url: string | undefined): { host: string; port: number } | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname || "127.0.0.1", port: Number(parsed.port || 5432) };
  } catch {
    return null;
  }
}

function tcpReachable(host: string, port: number, timeout = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

export const GET = withApiErrors(async function GET() {
  // The page can be opened before anything is wired up, so the stored values
  // have to stand in for a .env that may not exist yet.
  applyDatabaseEnv();

  const stored = await getStoredCredentials();
  const checks: SetupCheck[] = [];

  // ── Node ──────────────────────────────────────────────────────────────────
  const major = Number(process.versions.node.split(".")[0]);
  checks.push({
    id: "node",
    status: major >= 24 ? "ok" : "fail",
    detail: `Node.js ${process.version}`,
    fix: major >= 24 ? undefined : "nvm install 24 && nvm use 24",
    link: "https://nodejs.org/en/download",
  });

  // ── Docker ────────────────────────────────────────────────────────────────
  const dockerVersion = await tryRun("docker", ["--version"]);
  let dockerRunning = false;
  if (!dockerVersion.ok) {
    checks.push({
      id: "docker",
      status: "fail",
      detail: "docker.notInstalled",
      link: "https://www.docker.com/products/docker-desktop/",
    });
  } else {
    const info = await tryRun("docker", ["info", "--format", "{{.ServerVersion}}"], 12000);
    dockerRunning = info.ok;
    checks.push({
      id: "docker",
      status: info.ok ? "ok" : "fail",
      detail: info.ok ? `${dockerVersion.out} · daemon ${info.out}` : dockerVersion.out,
      fix: info.ok ? undefined : "open -a Docker",
      link: "https://www.docker.com/products/docker-desktop/",
    });
  }

  // ── Postgres container ────────────────────────────────────────────────────
  let containerUp = false;
  if (!dockerRunning) {
    checks.push({ id: "postgres-container", status: "unknown", detail: "docker.required" });
  } else {
    const ps = await tryRun("docker", [
      "ps",
      "--all",
      "--filter",
      `name=${POSTGRES_CONTAINER}`,
      "--format",
      "{{.State}}|{{.Status}}",
    ]);
    const [state = "", status = ""] = (ps.out.split("\n")[0] ?? "").split("|");
    containerUp = state === "running";
    checks.push({
      id: "postgres-container",
      status: containerUp ? "ok" : "fail",
      detail: ps.out ? `${POSTGRES_CONTAINER}: ${status || state}` : "postgres.noContainer",
      fix: containerUp ? undefined : "pnpm db:up",
    });
  }

  // ── Postgres reachable ────────────────────────────────────────────────────
  const target = parsePostgresUrl(process.env.WORKFLOW_POSTGRES_URL);
  if (!target) {
    checks.push({
      id: "postgres-url",
      status: "fail",
      detail: "postgres.noUrl",
    });
  } else {
    const reachable = await tcpReachable(target.host, target.port);
    checks.push({
      id: "postgres-url",
      status: reachable ? "ok" : "fail",
      detail: `${target.host}:${target.port}`,
      fix: reachable ? undefined : "pnpm db:up",
    });
  }

  // ── Migrations ────────────────────────────────────────────────────────────
  const dbUser = stored.POSTGRES_USER || process.env.POSTGRES_USER || "world";
  const dbName = stored.POSTGRES_DB || process.env.POSTGRES_DB || "world";
  if (!containerUp) {
    checks.push({ id: "migrations", status: "unknown", detail: "postgres.required" });
  } else if (!SAFE_IDENTIFIER.test(dbUser) || !SAFE_IDENTIFIER.test(dbName)) {
    checks.push({ id: "migrations", status: "unknown", detail: "postgres.badIdentifier" });
  } else {
    const tables = await tryRun("docker", [
      "exec",
      POSTGRES_CONTAINER,
      "psql",
      "-U",
      dbUser,
      "-d",
      dbName,
      "-tAc",
      "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')",
    ]);
    const count = tables.ok ? Number(tables.out) : Number.NaN;
    const migrated = Number.isFinite(count) && count > 0;
    checks.push({
      id: "migrations",
      status: migrated ? "ok" : "fail",
      detail: migrated ? `${count}` : tables.ok ? "0" : "postgres.queryFailed",
      fix: migrated ? undefined : "pnpm db:migrate",
    });
  }

  // ── Model credentials ─────────────────────────────────────────────────────
  const provider = resolveProvider();
  const providerKey =
    provider === "openai"
      ? "OPENAI_API_KEY"
      : provider === "anthropic"
        ? "ANTHROPIC_API_KEY"
        : "AI_GATEWAY_API_KEY";
  const hasModelKey = Boolean(stored[providerKey] || process.env[providerKey]);
  checks.push({
    id: "model",
    status: hasModelKey ? "ok" : "fail",
    detail: `${provider} · ${providerKey}`,
    link: "/settings",
  });

  // ── Embeddings (knowledge base) ───────────────────────────────────────────
  const embedding = resolveEmbeddingModel();
  checks.push({
    id: "embeddings",
    status: embedding ? "ok" : "warn",
    detail: embedding ? `${embedding.modelId} · ${embedding.route}` : "embeddings.missing",
    link: "/settings",
  });

  // ── .env ──────────────────────────────────────────────────────────────────
  const envPath = join(process.cwd(), ".env");
  checks.push({
    id: "env-file",
    status: existsSync(envPath) ? "ok" : "warn",
    detail: existsSync(envPath) ? ".env" : "env.missing",
    fix: existsSync(envPath) ? undefined : "cp .env.example .env",
  });

  const failing = checks.filter((c) => c.status === "fail").length;
  const warning = checks.filter((c) => c.status === "warn").length;

  return NextResponse.json({
    checks,
    summary: {
      ready: failing === 0,
      failing,
      warning,
      total: checks.length,
    },
  });
});
