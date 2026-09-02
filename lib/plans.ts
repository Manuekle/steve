// The plan ladder, and the rules for moving up and down it.
//
// Moving up and moving down are deliberately not symmetric. An upgrade is one
// confirmation and takes effect at once — nobody should have to think about
// paying us more. A downgrade has to spell out what is being given up, be
// typed to confirm, and lands at the end of the period already paid for.
//
// The friction stops there on purpose: the downgrade is always reachable from
// the same button, in the same dialog, and stays cancellable until it takes
// effect. Making the way out genuinely hard to find is a dark pattern, and in
// the EU and California it is also illegal.

export const PLAN_IDS = ["pro", "managed", "enterprise"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

/** No plan on file yet — the state a fresh installation is in. */
export type CurrentPlan = PlanId | "none";

export type PlanDefinition = {
  readonly id: PlanId;
  /** Position on the ladder. Higher is more. */
  readonly rank: number;
  readonly nameKey: string;
  readonly summaryKey: string;
  /** USD. `interval` says what the number buys. */
  readonly amount: number;
  readonly interval: "month" | "once";
  /**
   * What this plan carries that the one below it does not. Only distinct
   * capabilities belong here — a roll-up line ("everything in Pro") would be
   * listed as something given up when downgrading to Pro, which is backwards.
   */
  readonly featureKeys: readonly string[];
};

export const PLANS: readonly PlanDefinition[] = [
  {
    id: "pro",
    rank: 1,
    nameKey: "plan.pro.name",
    summaryKey: "plan.pro.summary",
    amount: 79,
    interval: "month",
    featureKeys: ["plan.pro.feature1", "plan.pro.feature2", "plan.pro.feature3"],
  },
  {
    id: "managed",
    rank: 2,
    nameKey: "plan.managed.name",
    summaryKey: "plan.managed.summary",
    amount: 249,
    interval: "month",
    featureKeys: ["plan.managed.feature1", "plan.managed.feature2", "plan.managed.feature3"],
  },
  {
    id: "enterprise",
    rank: 3,
    nameKey: "plan.enterprise.name",
    summaryKey: "plan.enterprise.summary",
    amount: 9990,
    interval: "once",
    featureKeys: [
      "plan.enterprise.feature1",
      "plan.enterprise.feature2",
      "plan.enterprise.feature3",
    ],
  },
];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function getPlan(id: PlanId): PlanDefinition {
  const plan = PLANS.find((p) => p.id === id);
  // `PlanId` is the union of the ids in `PLANS`, so this is unreachable —
  // it exists so callers get a `PlanDefinition`, not `| undefined`.
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/** Ladder position. "none" sits below every real plan. */
export function planRank(plan: CurrentPlan): number {
  return plan === "none" ? 0 : getPlan(plan).rank;
}

export type PlanMove = "upgrade" | "downgrade" | "current";

export function planMove(from: CurrentPlan, to: PlanId): PlanMove {
  const delta = planRank(to) - planRank(from);
  if (delta === 0) return "current";
  return delta > 0 ? "upgrade" : "downgrade";
}

/**
 * What a move gives up: every feature of the current plan that the target
 * doesn't carry. Empty for an upgrade, which is why the confirm step for one
 * has nothing to show.
 */
export function featuresLost(from: CurrentPlan, to: PlanId): readonly string[] {
  if (from === "none" || planMove(from, to) !== "downgrade") return [];
  const target = new Set(getPlan(to).featureKeys);
  return getPlan(from).featureKeys.filter((key) => !target.has(key));
}

// ── The marketing side of the same three plans ──────────────────────
//
// `/pricing` and the landing's pricing band quote figures, and until now each
// held its own copy of them. Two hardcoded "$79"s is the pair that drifts:
// one gets updated, the visitor reads the other, and the site contradicts
// itself before anyone notices. Both read what follows, which in turn derives
// from `PLANS` above — so the price a visitor is quoted and the price the
// billing dialog charges cannot disagree either.

/**
 * The marketing pages key their cards by the i18n key of the plan's name on
 * `/pricing`, which is a different string from the `plan.<id>.name` the
 * in-app billing UI uses. This is the bridge between the two.
 */
export const PLAN_BY_PRICING_KEY: Record<string, PlanId> = {
  "pricing.pro.name": "pro",
  "pricing.managed.name": "managed",
  "pricing.enterprise.name": "enterprise",
};

export type BillingPeriod = "monthly" | "annual";

/** Paying for the year costs ten months, i.e. two months free. The same ratio
 *  on both subscriptions — a different discount per plan is a number nobody
 *  can hold in their head while comparing two cards side by side. */
export const ANNUAL_MONTHS_CHARGED = 10;

/** `$79`, `$2,490`. Whole dollars stay whole: every figure here is an integer,
 *  and `$79.00` on a marketing page reads as a form field, not as a price. */
export function formatUSD(amount: number): string {
  const formatted = Number.isInteger(amount)
    ? amount.toLocaleString("en-US")
    : amount.toFixed(2);
  return `$${formatted}`;
}

/**
 * What a plan costs under the selected billing cycle, keyed by the pricing
 * page's name key, plus the i18n key for the period label that goes under the
 * figure. A one-time plan (Enterprise) ignores `billing` entirely — there is
 * no cycle to toggle, and showing it a discount would be a lie about a
 * purchase that happens once.
 *
 * `null` for a key no plan answers to, which is the caller's cue to render its
 * "price to be decided" placeholder rather than a plausible-looking figure.
 */
export function priceFor(
  pricingNameKey: string,
  billing: BillingPeriod,
): { readonly amount: number; readonly periodKey: string } | null {
  const id = PLAN_BY_PRICING_KEY[pricingNameKey];
  if (!id) return null;

  const plan = getPlan(id);
  if (plan.interval === "once") return { amount: plan.amount, periodKey: "pricing.oneTime" };

  return billing === "annual"
    ? { amount: plan.amount * ANNUAL_MONTHS_CHARGED, periodKey: "pricing.perYear" }
    : { amount: plan.amount, periodKey: "pricing.perMonth" };
}

/** The "works out at $X a month" line under an annual figure. */
export function monthlyEquivalent(pricingNameKey: string): number | null {
  const id = PLAN_BY_PRICING_KEY[pricingNameKey];
  if (!id) return null;
  const plan = getPlan(id);
  return plan.interval === "once" ? null : Math.round((plan.amount * ANNUAL_MONTHS_CHARGED) / 12);
}
