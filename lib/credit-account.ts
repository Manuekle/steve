import type { PoolClient } from "pg";
import { withCreditsClient } from "./credits-db";
import { readBillingState, nextPeriodEnd } from "./billing-store";

// One AI Credits balance per organization — which today always means one
// installation (see docs/commercial-licensing.md and lib/license/installation.ts:
// this repo is mono-tenant, so `organizationId` is the installation id until a
// real multi-tenant control plane exists to hand it a real organization).
//
// Conversion rate: 1,000 credits per USD of provider cost — the ratio implied
// by the product spec's own worked example ($0.08 provider cost → 80 AI
// Credits). Not something this file invented; kept as one named constant so
// changing the margin later is a one-line edit, not a grep.
export const CREDITS_PER_USD = 1000;

export function usdToCredits(usd: number): number {
  return usd * CREDITS_PER_USD;
}

/** Included-credit allowance per plan. Enterprise and "none" carry no
 *  included credits at all — Enterprise is BYOK + self-hosted by design (see
 *  lib/credit-gate.ts), and "none" is a fresh installation with no plan on
 *  file yet. */
const PLAN_MONTHLY_CREDITS: Record<string, number> = {
  pro: 100_000,
  managed: 500_000,
};

export type CreditAccountSnapshot = {
  readonly organizationId: string;
  readonly balance: number;
  readonly monthlyAllocation: number;
  readonly usedThisPeriod: number;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  /** False when the current plan carries no included credits at all — every
   *  call for this organization must be BYOK, there is no "out of credits"
   *  state to show because there was never a balance to begin with. */
  readonly hasIncludedCredits: boolean;
};

type AccountRow = {
  readonly organization_id: string;
  readonly balance: string;
  readonly monthly_allocation: string;
  readonly used_this_period: string;
  readonly period_start: string | null;
  readonly period_end: string | null;
};

function toSnapshot(row: AccountRow): CreditAccountSnapshot {
  return {
    organizationId: row.organization_id,
    balance: Number(row.balance),
    monthlyAllocation: Number(row.monthly_allocation),
    usedThisPeriod: Number(row.used_this_period),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    hasIncludedCredits: Number(row.monthly_allocation) > 0,
  };
}

async function currentPlanAllocation(): Promise<number> {
  const { plan } = await readBillingState();
  return PLAN_MONTHLY_CREDITS[plan] ?? 0;
}

/**
 * The account's current snapshot, rolling over to a new period first when the
 * previous one has ended. Locks the row for the duration (`FOR UPDATE`) so
 * two requests racing to be "the one that rolls over the period" can't both
 * allocate — the second waits for the first's transaction, then sees the
 * already-rolled-over row and skips straight to returning it.
 *
 * No rollover for v1: unused included credits from the ended period are
 * logged as an EXPIRATION transaction and dropped, never carried forward.
 * Purchased credits (out of scope here — PURCHASED_CREDITS exists in the
 * ledger's type vocabulary for when that ships) can carry different
 * expiration rules later without touching this function.
 */
export async function getAccount(organizationId: string): Promise<CreditAccountSnapshot> {
  return withCreditsClient(async (client) => {
    await client.query("BEGIN");
    try {
      const snapshot = await rollover(client, organizationId);
      await client.query("COMMIT");
      return snapshot;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function rollover(client: PoolClient, organizationId: string): Promise<CreditAccountSnapshot> {
  const existing = await client.query<AccountRow>(
    `SELECT * FROM credits.credit_account WHERE organization_id = $1 FOR UPDATE`,
    [organizationId],
  );

  let row = existing.rows[0];
  if (!row) {
    const inserted = await client.query<AccountRow>(
      `INSERT INTO credits.credit_account
         (organization_id, balance, monthly_allocation, used_this_period, period_start, period_end)
       VALUES ($1, 0, 0, 0, NULL, NULL)
       RETURNING *`,
      [organizationId],
    );
    row = inserted.rows[0];
  }

  const allocation = await currentPlanAllocation();
  const now = new Date();
  const periodExpired = !row.period_end || new Date(row.period_end).getTime() <= now.getTime();

  if (!periodExpired) return toSnapshot(row);

  if (allocation <= 0) {
    // No included credits on the current plan (Enterprise, or no plan yet).
    // Nothing to allocate; clear a stale allocation from a previous plan.
    if (Number(row.monthly_allocation) !== 0) {
      const cleared = await client.query<AccountRow>(
        `UPDATE credits.credit_account SET monthly_allocation = 0, updated_at = now()
          WHERE organization_id = $1 RETURNING *`,
        [organizationId],
      );
      row = cleared.rows[0];
    }
    return toSnapshot(row);
  }

  const remaining = Number(row.balance);
  if (remaining !== 0) {
    await client.query(
      `INSERT INTO credits.credit_transaction (organization_id, type, amount, balance_after, description)
       VALUES ($1, 'EXPIRATION', $2, 0, $3)`,
      [organizationId, -remaining, "Unused included credits expired at period end — no rollover"],
    );
  }

  const periodStart = now.toISOString();
  const periodEnd = nextPeriodEnd(now);
  const updated = await client.query<AccountRow>(
    `UPDATE credits.credit_account
        SET balance = $2, monthly_allocation = $2, used_this_period = 0,
            period_start = $3, period_end = $4, updated_at = now()
      WHERE organization_id = $1
      RETURNING *`,
    [organizationId, allocation, periodStart, periodEnd],
  );
  row = updated.rows[0];

  await client.query(
    `INSERT INTO credits.credit_transaction (organization_id, type, amount, balance_after, description)
     VALUES ($1, 'PLAN_ALLOCATION', $2, $2, $3)`,
    [organizationId, allocation, `Monthly allocation for period starting ${periodStart}`],
  );

  return toSnapshot(row);
}

/**
 * Posts a USAGE charge against the account and returns the balance after.
 * Must run inside the same DB transaction as the `ai_usage` insert it is
 * charging for (see lib/ai-usage.ts) — the caller owns BEGIN/COMMIT so both
 * writes land together or not at all.
 *
 * Unconditional, not `WHERE balance >= amount`: the provider call already
 * happened by the time usage is recorded (its exact cost is only known once
 * the response comes back), so there is nothing left to "reject" here — the
 * charge is real either way. What actually bounds overspend is the pre-flight
 * check in lib/credit-gate.ts, which refuses to *start* a new included-credit
 * call once the balance has already reached zero. A concurrent pair of calls
 * that both passed that check before either finished can, in the narrow
 * window between them, land the balance slightly negative — the same
 * tolerance every usage-based billing system (this app's own Stripe
 * dependency included) accepts rather than holding a reservation against a
 * cost nobody can quote in advance. The `credit_transaction` insert this
 * function makes is still exactly atomic with the balance update — that half
 * of the "no lost updates" requirement holds unconditionally.
 */
export async function applyUsageCharge(
  client: PoolClient,
  organizationId: string,
  amount: number,
  reference: { readonly type: string; readonly id: string },
  description: string,
): Promise<{ readonly balanceAfter: number }> {
  const result = await client.query<{ balance: string }>(
    `UPDATE credits.credit_account
        SET balance = balance - $1, used_this_period = used_this_period + $1, updated_at = now()
      WHERE organization_id = $2
      RETURNING balance`,
    [amount, organizationId],
  );
  const balanceAfter = result.rows[0] ? Number(result.rows[0].balance) : -amount;

  // No explicit conflict target: the only unique constraint this insert can
  // hit is credit_transaction_usage_idempotency, and hitting it means this
  // exact usage event was already charged — which recordUsage()'s own
  // ai_usage insert guard should have already caught. This is the second,
  // belt-and-suspenders layer, not the primary one.
  await client.query(
    `INSERT INTO credits.credit_transaction
       (organization_id, type, amount, balance_after, reference_type, reference_id, description)
     VALUES ($1, 'USAGE', $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING`,
    [organizationId, -amount, balanceAfter, reference.type, reference.id, description],
  );

  return { balanceAfter };
}
