import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getMaskedCredentials } from "./credentials";
import { resolveModelId, resolveProvider } from "./ai-provider";

// Is the Agent Stack actually wired, or does it only look wired?
//
// Six pieces have to line up before an agent does anything useful, and each
// one fails differently and silently:
//
//   Agent Stack (eve)  — the runtime itself, mounted at /eve/v1.
//   AI SDK             — how a model call is made.
//   AI Gateway         — one key for the whole model catalog. Optional if a
//                        direct provider key is configured instead.
//   Sandbox            — where run_python / bash execute.
//   Workflows          — durability. Without a world, a turn that crashes is
//                        a turn that is gone.
//   Connect            — OAuth for MCP connections that need a real account.
//
// A "check" here is deliberately cheap and local: installed version, declared
// configuration, and the environment. It never calls a provider, because the
// question this page answers is "did I set this up", and a network probe turns
// a config mistake into a timeout.
//
// Every string this module produces is a dictionary key plus its parameters,
// never a finished sentence. The runtime page renders in whichever language
// the reader picked, and a server that words its own findings can only ever be
// right for one of them.

export type StackStatus = "ok" | "warn" | "missing";

/** A line of prose the client will word. `params` are already strings so the
 *  payload survives JSON without a second normalisation step. */
export type StackLine = {
  readonly key: string;
  readonly params?: Readonly<Record<string, string>>;
};

export type StackComponent = {
  readonly id: "agent-stack" | "ai-sdk" | "ai-gateway" | "sandbox" | "workflows" | "connect";
  /** Product name. Never translated — "AI Gateway" is called that everywhere. */
  readonly label: string;
  readonly status: StackStatus;
  /** Installed package version, when the piece is a package. */
  readonly version?: string;
  /** What is true right now. */
  readonly detail: StackLine;
  /** What to do about it, when something is not `ok`. */
  readonly fix?: StackLine;
  readonly docs: string;
};

/**
 * The installed version of a dependency, read straight off disk.
 *
 * Two things rule out the obvious `require("<pkg>/package.json").version`:
 *
 *   - **Export maps.** `workflow` and `@vercel/connect` do not list
 *     `./package.json` in their `exports`, so resolving it throws
 *     `ERR_PACKAGE_PATH_NOT_EXPORTED` even though the file is right there.
 *   - **The bundler.** A `createRequire(import.meta.url)` inside a route
 *     resolves relative to the *bundle*, not the app, so every lookup missed
 *     and this page reported a fully working stack as entirely uninstalled.
 *
 * Walking up from the working directory to find `node_modules/<pkg>` sidesteps
 * both: it is the same search the resolver does, minus the parts that can
 * refuse. `undefined` means "not installed" and is what turns a card red.
 */
function installedVersion(pkg: string): string | undefined {
  let directory = process.cwd();
  // Bounded: a package that is not in any ancestor is not installed, and an
  // unbounded loop on a symlink cycle would hang the request.
  for (let depth = 0; depth < 12; depth += 1) {
    try {
      const manifest = readFileSync(join(directory, "node_modules", pkg, "package.json"), "utf-8");
      const version = (JSON.parse(manifest) as { version?: string }).version;
      if (version) return version;
    } catch {
      // Not here. Keep walking.
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return undefined;
}

/** True when this process is running on Vercel, which decides what the sandbox
 *  and Connect can actually reach. */
function onVercel(): boolean {
  return !!process.env.VERCEL || !!process.env.VERCEL_ENV;
}

/** The "not installed" card, which is the same shape for every package. */
function notInstalled(
  id: StackComponent["id"],
  label: string,
  pkg: string,
  docs: string,
  status: StackStatus = "missing",
): StackComponent {
  return {
    id,
    label,
    status,
    detail: { key: "stack.notInstalled", params: { pkg } },
    fix: { key: "stack.install", params: { pkg } },
    docs,
  };
}

function agentStackCheck(): StackComponent {
  const version = installedVersion("eve");
  if (!version) {
    return notInstalled("agent-stack", "Agent Stack (eve)", "eve", "https://eve.dev/docs");
  }
  return {
    id: "agent-stack",
    label: "Agent Stack (eve)",
    status: "ok",
    version,
    detail: {
      key: process.env.EVE_SELF_HOSTED === "1" ? "stack.eveSelfHosted" : "stack.eveMounted",
      params: { version },
    },
    docs: "https://eve.dev/docs",
  };
}

function aiSdkCheck(): StackComponent {
  const version = installedVersion("ai");
  if (!version) return notInstalled("ai-sdk", "AI SDK", "ai", "https://ai-sdk.dev");
  const current = Number(version.split(".")[0]) >= 6;
  return {
    id: "ai-sdk",
    label: "AI SDK",
    status: current ? "ok" : "warn",
    version,
    detail: { key: current ? "stack.aiSdkOk" : "stack.aiSdkOld", params: { version } },
    ...(current ? {} : { fix: { key: "stack.upgrade", params: { pkg: "ai" } } }),
    docs: "https://ai-sdk.dev",
  };
}

function gatewayCheck(masked: Record<string, boolean>): StackComponent {
  const provider = resolveProvider();
  const hasKey = !!masked.AI_GATEWAY_API_KEY || !!process.env.AI_GATEWAY_API_KEY;
  const model = resolveModelId(provider);
  const docs = "https://vercel.com/docs/ai-gateway";

  if (provider === "gateway") {
    // Deployed on Vercel the Gateway authenticates with the project's OIDC
    // token and needs no key at all, so a missing key there is normal — and a
    // missing key anywhere else is the reason the first turn will fail.
    const wired = hasKey || onVercel();
    return {
      id: "ai-gateway",
      label: "AI Gateway",
      status: wired ? "ok" : "missing",
      detail: {
        key: hasKey ? "stack.gatewayKeyed" : onVercel() ? "stack.gatewayOidc" : "stack.gatewayNoKey",
        params: { model },
      },
      ...(wired ? {} : { fix: { key: "stack.gatewayFix" } }),
      docs,
    };
  }

  // A direct provider key is a legitimate configuration, not a failure — but
  // it does mean no fallbacks, no unified usage, and one vendor.
  return {
    id: "ai-gateway",
    label: "AI Gateway",
    status: hasKey ? "ok" : "warn",
    detail: {
      key: hasKey ? "stack.gatewayIdle" : "stack.gatewayDirect",
      params: { provider, model },
    },
    ...(hasKey ? {} : { fix: { key: "stack.gatewayOptional" } }),
    docs,
  };
}

function sandboxCheck(): StackComponent {
  const docs = "https://vercel.com/docs/vercel-sandbox";
  const version = installedVersion("@vercel/sandbox");
  if (!version) {
    return {
      ...notInstalled("sandbox", "Sandbox", "@vercel/sandbox", docs, "warn"),
      detail: { key: "stack.sandboxMissing" },
    };
  }
  // agent/sandbox/sandbox.ts pins defaultBackend(), which resolves per host:
  // Vercel Sandbox when deployed, otherwise Docker, microsandbox, just-bash.
  return {
    id: "sandbox",
    label: "Sandbox",
    status: "ok",
    version,
    detail: {
      key: onVercel() ? "stack.sandboxVercel" : "stack.sandboxLocal",
      params: { version },
    },
    docs,
  };
}

function workflowsCheck(): StackComponent {
  const docs = "https://vercel.com/docs/workflows";
  const version = installedVersion("workflow");
  if (!version) {
    return {
      ...notInstalled("workflows", "Workflows", "workflow", docs),
      detail: { key: "stack.workflowsMissing" },
    };
  }
  if (!process.env.WORKFLOW_POSTGRES_URL) {
    // agent.ts declares world: "@workflow/world-postgres". Without a
    // connection string that world has nowhere to write, so sessions, queues
    // and streams fall back to whatever the process holds in memory — which
    // survives exactly until the next restart.
    return {
      id: "workflows",
      label: "Workflows",
      status: "warn",
      version,
      detail: { key: "stack.workflowsNoDb", params: { version } },
      fix: { key: "stack.workflowsFix" },
      docs,
    };
  }
  return {
    id: "workflows",
    label: "Workflows",
    status: "ok",
    version,
    detail: {
      key: "stack.workflowsOk",
      params: { version, world: installedVersion("@workflow/world-postgres") ?? "?" },
    },
    docs,
  };
}

function connectCheck(): StackComponent {
  const docs = "https://vercel.com/docs/connect";
  const version = installedVersion("@vercel/connect");
  if (!version) return notInstalled("connect", "Connect", "@vercel/connect", docs);
  // Connect brokers OAuth for connections that act as a real user. It needs a
  // linked project to resolve connectors, which off Vercel means the pulled
  // env from `vercel env pull`.
  const linked = onVercel() || !!process.env.VERCEL_OIDC_TOKEN || !!process.env.VERCEL_TOKEN;
  return {
    id: "connect",
    label: "Connect",
    status: linked ? "ok" : "warn",
    version,
    detail: { key: linked ? "stack.connectOk" : "stack.connectUnlinked", params: { version } },
    ...(linked ? {} : { fix: { key: "stack.connectFix" } }),
    docs,
  };
}

export type StackReport = {
  readonly components: readonly StackComponent[];
  readonly status: StackStatus;
  readonly checkedAt: string;
};

/** The worst status in the list — one missing piece makes the whole stack
 *  "missing", because the page's job is to say whether it will work. */
function worst(components: readonly StackComponent[]): StackStatus {
  if (components.some((c) => c.status === "missing")) return "missing";
  if (components.some((c) => c.status === "warn")) return "warn";
  return "ok";
}

export async function checkAgentStack(): Promise<StackReport> {
  const masked = await getMaskedCredentials().catch(() => ({}) as Record<string, boolean>);
  const components: StackComponent[] = [
    agentStackCheck(),
    aiSdkCheck(),
    gatewayCheck(masked),
    sandboxCheck(),
    workflowsCheck(),
    connectCheck(),
  ];
  return { components, status: worst(components), checkedAt: new Date().toISOString() };
}
