import { defineDynamic } from "eve";
import { resolveLanguageModel } from "./ai-provider";
import { warmCredentialCache } from "./credentials";

// The model a declared subagent runs on.
//
// A subagent inherits nothing from the root, and that includes the model — so
// without this each one would need its own copy of the resolver in
// agent/agent.ts, and the day somebody switched provider in Ajustes the root
// would move and the three specialists would not. The isolation boundary is
// about capabilities, not about which vendor answers the call.
//
// It lives in lib/ because that is the only sharing mechanism subagents have:
// "share typed helpers via `lib/`" (node_modules/eve/docs/subagents.mdx).
//
// Two differences from the root's resolver, both deliberate:
//
//   - **No credit gate.** The gate in agent/agent.ts runs once per model call
//     and charges the ledger through the usage hook. A subagent's calls are
//     recorded by that same hook on its own session, so gating here as well
//     would double-count a refusal, not double-charge a call.
//   - **No per-chat model pick.** The picker writes a choice keyed by the
//     *conversation's* session id; a child session has its own id and no pick,
//     so reading the store would always miss. The subagent follows the
//     installation's configured provider, which is the right default for work
//     the operator never explicitly routed.

/** Resolved once per child session. A specialist's turn is short and the
 *  prompt cache is per model, so re-resolving per step would buy nothing and
 *  risk re-ingesting the context at uncached prices. */
export function subagentModel() {
  return defineDynamic({
    // `fallback` anchors build-time metadata and is what runs if the resolver
    // below degrades — eve treats a resolver failure as "fall through", never
    // as "fail the turn".
    fallback: resolveLanguageModel(),
    events: {
      "session.started": async () => {
        // The credential store cannot load itself synchronously from Postgres,
        // and a child session may be the first thing this process does after a
        // cold start. Warming it here is what makes a database-backed install
        // resolve the same provider the root does.
        await warmCredentialCache();
        return resolveLanguageModel();
      },
    },
  });
}
