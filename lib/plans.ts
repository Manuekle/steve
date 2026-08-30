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
