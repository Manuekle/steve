import { withCreditsClient } from "./credits-db";
import { computeProviderCost, type UsageAmounts } from "./model-pricing";
import { applyUsageCharge, usdToCredits } from "./credit-account";
import type { BillingSource } from "./credit-gate";

export type { BillingSource };

export type UsageType = "llm" | "tts" | "image" | "video";

export type RecordUsageInput = UsageAmounts & {
  readonly organizationId: string;
  readonly workspaceId?: string | null;
  readonly userId?: string | null;
  readonly agentId?: string | null;
  readonly conversationId?: string | null;
  readonly channel?: string | null;
  readonly provider: string;
  readonly model: string;
  readonly usageType: UsageType;
  /**
   * Cost already known — e.g. Eve's own `step.completed` event carries
   * `usage.costUsd` for a Gateway-routed call, since the Gateway publishes
   * list price with zero markup. When present this skips the ModelPricing
   * lookup entirely; when absent, lib/model-pricing.ts computes it from the
   * token/character amounts above.
   */
  readonly knownProviderCostUsd?: number;
  readonly billingSource: BillingSource;
  /**
   * Stable id for this exact call — Eve's `providerMetadata.gateway.generationId`
   * for a Gateway text step, a tool's `ctx.callId` for a direct provider call
   * made from inside a tool, or `${sessionId}:${turnId}:${stepIndex}` as the
   * generic fallback. Paired with `provider` as the uniqueness key, so the
   * same call retried (a step replay, a webhook redelivery) is recorded once.
   */
  readonly idempotencyKey: string;
};

export type RecordUsageResult =
  | {
      readonly recorded: true;
      readonly usageId: string;
      readonly providerCost: number | null;
      readonly creditsUsed: number;
      readonly balanceAfter: number | null;
    }
  | { readonly recorded: false; readonly reason: "duplicate" };

/**
 * Records one AI provider call and, when it draws on included credits,
 * charges the ledger atomically in the same transaction. Safe to call twice
 * with the same `(provider, idempotencyKey)` — the second call is absorbed
 * as a no-op duplicate rather than charged again.
 *
 * Never throws for "insufficient credits": by the time a call's usage is
 * known, the call already happened and the cost is real. What prevents
 * overspend is the pre-flight check in lib/credit-gate.ts, before the call
 * is even issued — see that file.
 */
export async function recordUsage(input: RecordUsageInput): Promise<RecordUsageResult> {
  let providerCost: number | null = null;
  let inputCost: number | null = null;
  let outputCost: number | null = null;
  if (input.knownProviderCostUsd !== undefined) {
    // Eve's own step.completed usage.costUsd — a Gateway-published total,
    // not broken out by input/output on the wire, so those two columns stay
    // null for this row; provider_cost still carries the real total.
    providerCost = input.knownProviderCostUsd;
  } else {
    const computed = await computeProviderCost(input.provider, input.model, {
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cachedInputTokens: input.cachedInputTokens,
      characters: input.characters,
    });
    providerCost = computed?.cost ?? null;
    inputCost = computed?.inputCost ?? null;
    outputCost = computed?.outputCost ?? null;
  }

  // No known price and no known cost — still record the raw usage (tokens,
  // characters, who/what/where) so it shows up in the dashboard, just with
  // no cost or credit figure attached rather than a fabricated one.
  const creditsUsed =
    input.billingSource === "INCLUDED_CREDITS" && providerCost !== null ? usdToCredits(providerCost) : 0;

  return withCreditsClient(async (client) => {
    await client.query("BEGIN");
    try {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO credits.ai_usage
           (organization_id, workspace_id, user_id, agent_id, conversation_id, channel,
            provider, model, usage_type, input_tokens, output_tokens, cached_input_tokens,
            characters, input_cost, output_cost, provider_cost, credits_used, billing_source,
            idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (provider, idempotency_key) DO NOTHING
         RETURNING id`,
        [
          input.organizationId,
          input.workspaceId ?? null,
          input.userId ?? null,
          input.agentId ?? null,
          input.conversationId ?? null,
          input.channel ?? null,
          input.provider,
          input.model,
          input.usageType,
          input.inputTokens ?? null,
          input.outputTokens ?? null,
          input.cachedInputTokens ?? null,
          input.characters ?? null,
          inputCost,
          outputCost,
          providerCost,
          creditsUsed,
          input.billingSource,
          input.idempotencyKey,
        ],
      );

      const row = inserted.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return { recorded: false, reason: "duplicate" as const };
      }

      let balanceAfter: number | null = null;
      if (input.billingSource === "INCLUDED_CREDITS" && creditsUsed > 0) {
        const charge = await applyUsageCharge(
          client,
          input.organizationId,
          creditsUsed,
          { type: "ai_usage", id: row.id },
          `${input.provider}/${input.model} — ${input.usageType}`,
        );
        balanceAfter = charge.balanceAfter;
      }

      await client.query("COMMIT");
      return { recorded: true, usageId: row.id, providerCost, creditsUsed, balanceAfter };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
