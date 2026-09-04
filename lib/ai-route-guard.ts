import { randomUUID } from "node:crypto";
import type { LanguageModelUsage } from "ai";
import type { NextRequest } from "next/server";
import { apiError } from "./api-error";
import { resolveProvider } from "./ai-provider";
import { recordUsage } from "./ai-usage";
import { billingSourceForProvider, checkCreditGate } from "./credit-gate";
import { getInstallationId } from "./license/installation";
import { rateLimit } from "./rate-limit";

/**
 * The two checks every model call made from a Next route was missing.
 *
 * The Eve side of the app runs both: agent/hooks/usage.ts records each step
 * and lib/credit-gate.ts refuses one that has no credits left. The four routes
 * in app/api that call the model directly — the agent playground, the
 * automation assistant, the prompt optimizer, the email-template generator —
 * ran neither. Two consequences, both real:
 *
 *   An account at zero balance kept spending, because nothing asked. The
 *   ledger the billing page reads was undercounting by whatever the web UI
 *   burned.
 *
 *   Nothing bounded the call rate. A signed-in browser holding the send key
 *   is a loop against a metered provider, and until lib/auth/signup-policy.ts
 *   landed, "signed in" was anyone who found the URL.
 *
 * `guardAiRoute` is the gate — it refuses a call that should not start.
 * `recordRouteUsage` is the meter, and every one of the four calls it after
 * the model answers, so the ledger the billing page reads finally counts what
 * the web UI spends as well as what the channels do.
 */
export async function guardAiRoute(
  request: NextRequest,
  /** Names the rate-limit budget. Routes sharing a name share a counter. */
  bucket: string,
  options: { readonly max: number; readonly windowMs: number } = {
    max: 30,
    windowMs: 5 * 60_000,
  },
): Promise<Response | null> {
  const limit = rateLimit(`ai:${bucket}`, request, options);
  if (!limit.allowed) {
    return apiError("rate_limited", { status: 429 });
  }

  const gate = await checkCreditGate(await billingSourceForProvider(resolveProvider()));
  if (!gate.allowed) {
    // 402 rather than the code's default: "you are out of credit" is not the
    // same answer as "slow down", and the billing page keys off the status.
    return apiError("unprocessable", { status: 402, message: gate.reason });
  }

  return null;
}


/**
 * Records one model call made from a Next route.
 *
 * Never throws and is never awaited by the response path: the call already
 * happened and the person is already reading the answer, so losing a usage row
 * is far cheaper than turning a successful generation into a 500. Same stance
 * as agent/hooks/usage.ts.
 *
 * The idempotency key is a fresh uuid rather than something derived from the
 * request, and that is the right answer here even though it means a duplicate
 * can never be detected. The keys that Eve uses identify a call that the
 * *platform* may replay — a step retried, a webhook redelivered — where two
 * records would be one charge counted twice. Nothing replays these: a browser
 * that submits the same prompt again has made a second call to the provider
 * and been billed for it twice, so recording it twice is the accurate answer.
 */
export function recordRouteUsage(input: {
  readonly model: string;
  readonly usage: LanguageModelUsage | undefined;
  /** Which screen spent it, so the usage table can be read by feature. */
  readonly conversationId?: string;
}): void {
  if (!input.usage) return;

  void (async () => {
    try {
      const provider = resolveProvider();
      await recordUsage({
        organizationId: await getInstallationId(),
        conversationId: input.conversationId ?? null,
        channel: "web",
        provider,
        model: input.model,
        usageType: "llm",
        inputTokens: input.usage!.inputTokens,
        outputTokens: input.usage!.outputTokens,
        cachedInputTokens: input.usage!.inputTokenDetails?.cacheReadTokens,
        billingSource: await billingSourceForProvider(provider),
        idempotencyKey: randomUUID(),
      });
    } catch (error) {
      console.error("[ai-route-guard] usage not recorded", error);
    }
  })();
}
