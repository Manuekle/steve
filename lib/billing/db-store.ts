import { Pool } from "pg";
import { isPlanId, type CurrentPlan, type PlanId } from "../plans";

/**
 * PostgreSQL-backed billing store for production deployments.
 *
 * Mirrors the interface of lib/billing-store.ts but stores subscription state
 * in PostgreSQL instead of ~/.steve/billing.json. The schema is applied lazily
 * on first use — no separate migration step.
 *
 * Single-row design: this app has one billing state per installation, not per
 * user. The subscriptions table always has exactly one row (idempotent insert
 * on first read).
 */

let pool: Pool | undefined;
let schemaReady: Promise<void> | undefined;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.WORKFLOW_POSTGRES_URL;
    if (!connectionString) {
      throw new Error(
        "WORKFLOW_POSTGRES_URL is not set. Billing DB store needs the same Postgres connection.",
      );
    }
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

const SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS billing;

CREATE TABLE IF NOT EXISTS billing.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan text NOT NULL DEFAULT 'none',
  period_end timestamptz,
  pending_change_to text,
  pending_change_effective_at timestamptz,
  pending_change_requested_at timestamptz,
  pending_change_reason text,
  has_payment_method boolean NOT NULL DEFAULT false,
  stripe_customer_id text,
  stripe_subscription_id text,
  payment_past_due boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure exactly one row exists (singleton pattern)
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_singleton
  ON billing.subscriptions ((true));
`;

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool().query(SCHEMA_SQL).then(() => undefined);
  }
  await schemaReady;
}

export type PendingChange = {
  readonly to: PlanId;
  readonly effectiveAt: string;
  readonly requestedAt: string;
  readonly reason?: string;
};

export type BillingState = {
  readonly plan: CurrentPlan;
  readonly periodEnd: string | null;
  readonly pendingChange: PendingChange | null;
  readonly hasPaymentMethod: boolean;
  readonly stripeCustomerId: string | null;
  readonly stripeSubscriptionId: string | null;
  readonly paymentPastDue: boolean;
};

function emptyState(): BillingState {
  return {
    plan: "none",
    periodEnd: null,
    pendingChange: null,
    hasPaymentMethod: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    paymentPastDue: false,
  };
}

function rowToState(row: Record<string, unknown>): BillingState {
  const plan = isPlanId(row.plan) ? row.plan : "none";
  const pendingChangeTo = row.pending_change_to as string | null;
  const pendingChange: PendingChange | null =
    pendingChangeTo && isPlanId(pendingChangeTo)
      ? {
          to: pendingChangeTo,
          effectiveAt: (row.pending_change_effective_at as Date)?.toISOString() ?? "",
          requestedAt: (row.pending_change_requested_at as Date)?.toISOString() ?? "",
          reason: (row.pending_change_reason as string) ?? undefined,
        }
      : null;

  return {
    plan,
    periodEnd: (row.period_end as Date | null)?.toISOString() ?? null,
    pendingChange,
    hasPaymentMethod: row.has_payment_method === true,
    stripeCustomerId: (row.stripe_customer_id as string) ?? null,
    stripeSubscriptionId: (row.stripe_subscription_id as string) ?? null,
    paymentPastDue: row.payment_past_due === true,
  };
}

/**
 * Ensure the singleton row exists, returning its current state.
 * Creates a default row if none exists.
 */
async function ensureRow(): Promise<BillingState> {
  await ensureSchema();
  const result = await getPool().query("SELECT * FROM billing.subscriptions LIMIT 1");
  if (result.rowCount! > 0) return rowToState(result.rows[0]);

  // Insert default row
  const inserted = await getPool().query(
    "INSERT INTO billing.subscriptions DEFAULT VALUES RETURNING *",
  );
  return rowToState(inserted.rows[0]);
}

export async function readBillingState(): Promise<BillingState> {
  try {
    return await ensureRow();
  } catch {
    return emptyState();
  }
}

export async function updateBillingState(
  fn: (state: BillingState) => BillingState,
): Promise<BillingState> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    // Lock the row
    const result = await client.query(
      "SELECT * FROM billing.subscriptions LIMIT 1 FOR UPDATE",
    );

    let current: BillingState;
    if (result.rowCount! > 0) {
      current = rowToState(result.rows[0]);
    } else {
      // Insert default
      const inserted = await client.query(
        "INSERT INTO billing.subscriptions DEFAULT VALUES RETURNING *",
      );
      current = rowToState(inserted.rows[0]);
    }

    const next = fn(current);

    await client.query(
      `UPDATE billing.subscriptions SET
         plan = $1,
         period_end = $2,
         pending_change_to = $3,
         pending_change_effective_at = $4,
         pending_change_requested_at = $5,
         pending_change_reason = $6,
         has_payment_method = $7,
         stripe_customer_id = $8,
         stripe_subscription_id = $9,
         payment_past_due = $10,
         updated_at = now()
       WHERE id = (SELECT id FROM billing.subscriptions LIMIT 1)`,
      [
        next.plan,
        next.periodEnd ? new Date(next.periodEnd) : null,
        next.pendingChange?.to ?? null,
        next.pendingChange?.effectiveAt ? new Date(next.pendingChange.effectiveAt) : null,
        next.pendingChange?.requestedAt ? new Date(next.pendingChange.requestedAt) : null,
        next.pendingChange?.reason ?? null,
        next.hasPaymentMethod,
        next.stripeCustomerId,
        next.stripeSubscriptionId,
        next.paymentPastDue,
      ],
    );

    await client.query("COMMIT");
    return next;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function nextPeriodEnd(from: Date = new Date()): string {
  const end = new Date(from);
  end.setMonth(end.getMonth() + 1);
  return end.toISOString();
}

// ── Migration from file-based store ──────────────────────────────────────────

/**
 * One-time migration: reads ~/.steve/billing.json, writes it to PostgreSQL.
 * Safe to re-run (overwrites the singleton row).
 */
export async function migrateFromFileStore(
  fileState: BillingState,
): Promise<void> {
  await ensureSchema();
  await updateBillingState(() => fileState);
}

/** Check if the DB has billing data (for migration decision). */
export async function dbHasBillingData(): Promise<boolean> {
  await ensureSchema();
  const result = await getPool().query(
    "SELECT 1 FROM billing.subscriptions WHERE plan != 'none' LIMIT 1",
  );
  return result.rowCount! > 0;
}
