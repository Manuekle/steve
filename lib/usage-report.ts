import { creditsQuery } from "./credits-db";

// Read-only aggregation over credits.ai_usage for the Settings → AI Usage
// dashboard. Every number here is derived straight from the ledger tables —
// nothing is cached or precomputed, so it can never drift from what
// lib/ai-usage.ts actually recorded.

export type ProviderBreakdown = {
  readonly provider: string;
  readonly credits: number;
  readonly providerCost: number;
  readonly calls: number;
};

export type AgentBreakdown = {
  /** `null` = calls with no known Agent — see the "known gap" note in
   *  agent/hooks/usage.ts about what this app can attribute today. */
  readonly agentId: string | null;
  readonly credits: number;
  readonly providerCost: number;
  readonly calls: number;
};

export type ChannelBreakdown = {
  readonly channel: string | null;
  readonly credits: number;
  readonly providerCost: number;
  readonly calls: number;
};

/** One day of spend. `day` is a `YYYY-MM-DD` calendar date in UTC, not a
 *  timestamp — the series is a set of buckets, and a bucket with no calls is
 *  still a day that happened, so the gaps are filled rather than dropped. */
export type DailyUsage = {
  readonly day: string;
  readonly credits: number;
  readonly providerCost: number;
  readonly calls: number;
};

export type UsageSummary = {
  readonly totalCredits: number;
  readonly totalProviderCost: number;
  readonly includedCost: number;
  readonly byokEstimatedCost: number;
  readonly byProvider: readonly ProviderBreakdown[];
  readonly byAgent: readonly AgentBreakdown[];
  readonly byChannel: readonly ChannelBreakdown[];
  /** The trailing `DAILY_WINDOW_DAYS` ending at `until`, oldest first. Bounded
   *  independently of the summary's own range: the breakdowns want everything
   *  ever, the trend wants a period a reader can actually compare across. */
  readonly byDay: readonly DailyUsage[];
};

/** Two weeks: long enough to show a working rhythm, short enough that each day
 *  is still a legible bar on a phone. */
const DAILY_WINDOW_DAYS = 14;

type Row = {
  readonly provider?: string;
  readonly agent_id?: string | null;
  readonly channel?: string | null;
  readonly billing_source?: string;
  readonly day?: string;
  readonly credits: string;
  readonly provider_cost: string | null;
  readonly calls: string;
};

/** `YYYY-MM-DD` in UTC, matching what `date_trunc('day', …)` buckets by. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function num(value: string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Usage summary for one organization within `[since, until)`. `since`
 *  defaults to the start of the current credit period when omitted — the
 *  window the dashboard's credits bar is about — `until` defaults to now. */
export async function getUsageSummary(
  organizationId: string,
  range: { readonly since?: Date; readonly until?: Date } = {},
): Promise<UsageSummary> {
  const since = range.since ?? new Date(0);
  const until = range.until ?? new Date();

  // The trend's own window, floored to midnight so the oldest bucket is a
  // whole day rather than a partial one that reads as a slow start.
  const dailySince = new Date(until);
  dailySince.setUTCHours(0, 0, 0, 0);
  dailySince.setUTCDate(dailySince.getUTCDate() - (DAILY_WINDOW_DAYS - 1));

  const [totals, byProvider, byAgent, byChannel, byDay] = await Promise.all([
    creditsQuery<{ credits: string; provider_cost: string | null; included_cost: string | null; byok_cost: string | null }>(
      `SELECT
         COALESCE(SUM(credits_used), 0) AS credits,
         COALESCE(SUM(provider_cost), 0) AS provider_cost,
         COALESCE(SUM(provider_cost) FILTER (WHERE billing_source = 'INCLUDED_CREDITS'), 0) AS included_cost,
         COALESCE(SUM(provider_cost) FILTER (WHERE billing_source = 'BYOK'), 0) AS byok_cost
       FROM credits.ai_usage
       WHERE organization_id = $1 AND created_at >= $2 AND created_at < $3`,
      [organizationId, since, until],
    ),
    creditsQuery<Row>(
      `SELECT provider, COALESCE(SUM(credits_used), 0) AS credits,
              COALESCE(SUM(provider_cost), 0) AS provider_cost, COUNT(*) AS calls
         FROM credits.ai_usage
        WHERE organization_id = $1 AND created_at >= $2 AND created_at < $3
        GROUP BY provider
        ORDER BY provider_cost DESC`,
      [organizationId, since, until],
    ),
    creditsQuery<Row>(
      `SELECT agent_id, COALESCE(SUM(credits_used), 0) AS credits,
              COALESCE(SUM(provider_cost), 0) AS provider_cost, COUNT(*) AS calls
         FROM credits.ai_usage
        WHERE organization_id = $1 AND created_at >= $2 AND created_at < $3
        GROUP BY agent_id
        ORDER BY provider_cost DESC`,
      [organizationId, since, until],
    ),
    creditsQuery<Row>(
      `SELECT channel, COALESCE(SUM(credits_used), 0) AS credits,
              COALESCE(SUM(provider_cost), 0) AS provider_cost, COUNT(*) AS calls
         FROM credits.ai_usage
        WHERE organization_id = $1 AND created_at >= $2 AND created_at < $3
        GROUP BY channel
        ORDER BY provider_cost DESC`,
      [organizationId, since, until],
    ),
    creditsQuery<Row>(
      `SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
              COALESCE(SUM(credits_used), 0) AS credits,
              COALESCE(SUM(provider_cost), 0) AS provider_cost, COUNT(*) AS calls
         FROM credits.ai_usage
        WHERE organization_id = $1 AND created_at >= $2 AND created_at < $3
        GROUP BY 1
        ORDER BY 1`,
      [organizationId, dailySince, until],
    ),
  ]);

  // Days the ledger has nothing for are absent from the result, not zero. A
  // chart that drops them would compress a quiet week into a dense one.
  const spendByDay = new Map(byDay.map((r) => [r.day ?? "", r]));
  const days: DailyUsage[] = Array.from({ length: DAILY_WINDOW_DAYS }, (_, i) => {
    const date = new Date(dailySince);
    date.setUTCDate(date.getUTCDate() + i);
    const key = dayKey(date);
    const row = spendByDay.get(key);
    return {
      day: key,
      credits: num(row?.credits),
      providerCost: num(row?.provider_cost),
      calls: num(row?.calls),
    };
  });

  const total = totals[0];
  return {
    totalCredits: num(total?.credits),
    totalProviderCost: num(total?.provider_cost),
    includedCost: num(total?.included_cost),
    byokEstimatedCost: num(total?.byok_cost),
    byProvider: byProvider.map((r) => ({
      provider: r.provider ?? "unknown",
      credits: num(r.credits),
      providerCost: num(r.provider_cost),
      calls: num(r.calls),
    })),
    byAgent: byAgent.map((r) => ({
      agentId: r.agent_id ?? null,
      credits: num(r.credits),
      providerCost: num(r.provider_cost),
      calls: num(r.calls),
    })),
    byChannel: byChannel.map((r) => ({
      channel: r.channel ?? null,
      credits: num(r.credits),
      providerCost: num(r.provider_cost),
      calls: num(r.calls),
    })),
    byDay: days,
  };
}

export type UsageDetailRow = {
  readonly id: string;
  readonly createdAt: string;
  readonly provider: string;
  readonly model: string;
  readonly agentId: string | null;
  readonly channel: string | null;
  readonly userId: string | null;
  readonly workspaceId: string | null;
  readonly usageType: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly characters: number | null;
  readonly providerCost: number | null;
  readonly credits: number;
  readonly billingSource: string;
};

export type UsageDetailFilters = {
  readonly since?: Date;
  readonly until?: Date;
  readonly provider?: string;
  readonly model?: string;
  readonly agentId?: string;
  readonly workspaceId?: string;
  readonly userId?: string;
  readonly billingSource?: string;
  readonly limit?: number;
  readonly offset?: number;
};

type DetailRow = {
  readonly id: string;
  readonly created_at: string;
  readonly provider: string;
  readonly model: string;
  readonly agent_id: string | null;
  readonly channel: string | null;
  readonly user_id: string | null;
  readonly workspace_id: string | null;
  readonly usage_type: string;
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  readonly characters: number | null;
  readonly provider_cost: string | null;
  readonly credits_used: string;
  readonly billing_source: string;
};

/** Filtered, paginated usage rows for the "Usage details" table. Newest
 *  first. `limit` caps at 200 — this is a UI table, not an export. */
export async function getUsageDetails(
  organizationId: string,
  filters: UsageDetailFilters = {},
): Promise<{ readonly rows: readonly UsageDetailRow[]; readonly total: number }> {
  const conditions: string[] = ["organization_id = $1"];
  const params: unknown[] = [organizationId];

  function add(sql: string, value: unknown): void {
    params.push(value);
    conditions.push(sql.replace("?", `$${params.length}`));
  }

  if (filters.since) add("created_at >= ?", filters.since);
  if (filters.until) add("created_at < ?", filters.until);
  if (filters.provider) add("provider = ?", filters.provider);
  if (filters.model) add("model = ?", filters.model);
  if (filters.agentId) add("agent_id = ?", filters.agentId);
  if (filters.workspaceId) add("workspace_id = ?", filters.workspaceId);
  if (filters.userId) add("user_id = ?", filters.userId);
  if (filters.billingSource) add("billing_source = ?", filters.billingSource);

  const where = conditions.join(" AND ");
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  const [rows, countRows] = await Promise.all([
    creditsQuery<DetailRow>(
      `SELECT id, created_at, provider, model, agent_id, channel, user_id, workspace_id,
              usage_type, input_tokens, output_tokens, characters, provider_cost, credits_used, billing_source
         FROM credits.ai_usage
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    ),
    creditsQuery<{ count: string }>(`SELECT COUNT(*) AS count FROM credits.ai_usage WHERE ${where}`, params),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      provider: r.provider,
      model: r.model,
      agentId: r.agent_id,
      channel: r.channel,
      userId: r.user_id,
      workspaceId: r.workspace_id,
      usageType: r.usage_type,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      characters: r.characters,
      providerCost: r.provider_cost === null ? null : num(r.provider_cost),
      credits: num(r.credits_used),
      billingSource: r.billing_source,
    })),
    total: num(countRows[0]?.count),
  };
}
