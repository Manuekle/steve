import type { NextRequest } from "next/server";
import { apiError } from "./api-error";
import { resolveProvider } from "./ai-provider";
import { billingSourceForProvider, checkCreditGate } from "./credit-gate";
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
 * This is the gate, not the meter: it refuses a call that should not start.
 * Recording what a call actually cost still only happens on the Eve path —
 * these four routes stream or `generateObject` straight from the AI SDK and
 * would each need their own `recordUsage` with a real idempotency key. That is
 * a larger change than a guard and is tracked separately; the gate at least
 * stops the unbounded case.
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
