// What plan this installation is on, and any downgrade waiting to take effect.
//
// When WORKFLOW_POSTGRES_URL is set, subscription state lives in PostgreSQL
// (billing schema). Otherwise it falls back to ~/.steve/billing.json.
//
// Stripe is the system of record for money; these stores only record what the
// installation believes it is entitled to, and the one scheduled change the
// billing page needs to show and be able to cancel.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { isPlanId, type CurrentPlan, type PlanId } from "./plans";
import {
  readBillingState as dbReadBillingState,
  updateBillingState as dbUpdateBillingState,
  migrateFromFileStore as dbMigrateFromFile,
  dbHasBillingData,
} from "./billing/db-store";

const STORE_FILE = join(homedir(), ".steve", "billing.json");

export type PendingChange = {
  readonly to: PlanId;
  /** ISO. When the downgrade takes effect — the end of the paid period. */
  readonly effectiveAt: string;
  readonly requestedAt: string;
  readonly reason?: string;
};

export type BillingState = {
  readonly plan: CurrentPlan;
  /** ISO. When the current period ends; a downgrade lands here. */
  readonly periodEnd: string | null;
  readonly pendingChange: PendingChange | null;
  /** Whether a card is on file with Stripe. Set once a setup session completes. */
  readonly hasPaymentMethod: boolean;
  /** Set by the Stripe webhook once a checkout confirms — the identifiers
   *  that let the account get looked up on Stripe's side later (invoices,
   *  a future self-serve cancel). Never set from a client request. */
  readonly stripeCustomerId: string | null;
  readonly stripeSubscriptionId: string | null;
  /** True from `invoice.payment_failed` until the next successful payment
   *  clears it. Informational — nothing in this app hard-blocks on it (that
   *  would need its own product decision, e.g. a dunning flow); it's here
   *  so the billing page can show that a charge didn't go through. */
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

// ── DB availability detection (resolved once, lazily) ────────────────────────

let dbMode: boolean | null = null;

async function usingDb(): Promise<boolean> {
  if (dbMode !== null) return dbMode;

  if (!process.env.WORKFLOW_POSTGRES_URL) {
    dbMode = false;
    return false;
  }

  try {
    const hasDb = await dbHasBillingData();
    if (hasDb) {
      dbMode = true;
      return true;
    }

    // DB reachable but no billing data — check if file has data to migrate
    try {
      const raw = await readFile(STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw) as Partial<BillingState>;
      const state = coerce(parsed);
      if (state.plan !== "none") {
        await dbMigrateFromFile(state);
      }
    } catch {
      // No file — fresh install
    }

    dbMode = true;
    return true;
  } catch {
    dbMode = false;
    return false;
  }
}

// ── File-based store (original logic, preserved) ─────────────────────────────

let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function coerce(parsed: Partial<BillingState> | null): BillingState {
  if (!parsed) return emptyState();
  const plan: CurrentPlan = isPlanId(parsed.plan) ? parsed.plan : "none";
  const pending =
    parsed.pendingChange && isPlanId(parsed.pendingChange.to)
      ? {
          to: parsed.pendingChange.to,
          effectiveAt: parsed.pendingChange.effectiveAt,
          requestedAt: parsed.pendingChange.requestedAt,
          reason: parsed.pendingChange.reason,
        }
      : null;
  return {
    plan,
    periodEnd: parsed.periodEnd ?? null,
    pendingChange: pending,
    hasPaymentMethod: parsed.hasPaymentMethod === true,
    stripeCustomerId: parsed.stripeCustomerId ?? null,
    stripeSubscriptionId: parsed.stripeSubscriptionId ?? null,
    paymentPastDue: parsed.paymentPastDue === true,
  };
}

async function fileReadBillingState(): Promise<BillingState> {
  try {
    return coerce(JSON.parse(await readFile(STORE_FILE, "utf-8")) as Partial<BillingState>);
  } catch {
    return emptyState();
  }
}

async function fileWrite(state: BillingState): Promise<void> {
  await mkdir(dirname(STORE_FILE), { recursive: true });
  const tmp = `${STORE_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2) + "\n", "utf-8");
  await rename(tmp, STORE_FILE);
}

async function fileUpdateBillingState(
  fn: (state: BillingState) => BillingState,
): Promise<BillingState> {
  return enqueue(async () => {
    const next = fn(await fileReadBillingState());
    await fileWrite(next);
    return next;
  });
}

// ── Public API: routes to DB or file ─────────────────────────────────────────

export async function readBillingState(): Promise<BillingState> {
  return (await usingDb()) ? dbReadBillingState() : fileReadBillingState();
}

export async function updateBillingState(
  fn: (state: BillingState) => BillingState,
): Promise<BillingState> {
  return (await usingDb()) ? dbUpdateBillingState(fn) : fileUpdateBillingState(fn);
}

/** One month out, which is the period every subscription plan bills on. */
export function nextPeriodEnd(from: Date = new Date()): string {
  const end = new Date(from);
  end.setMonth(end.getMonth() + 1);
  return end.toISOString();
}

/** Reset the DB mode cache — useful for tests or when config changes at runtime. */
export function resetDbMode(): void {
  dbMode = null;
}
