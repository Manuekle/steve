import { defineTool } from "eve/tools";
import { z } from "zod";
import { listAutomations, listContacts, listReminders } from "../../lib/business-store";
import { getConnectionSummaries } from "../../lib/connection-store";
import { getInstallationId } from "../../lib/license/installation";
import { getUsageSummary } from "../../lib/usage-report";
import { daysSince } from "../../lib/deals";
import { assertToolAllowed } from "../../lib/agent-scope";
import { isOperatorConsole, OPERATOR_ONLY } from "../../lib/operator-console";
import type { Automation } from "../../lib/types";

/**
 * The machine the owner is running, as opposed to the customers it serves.
 *
 * `pipeline`, `inbox` and `marketing` read the business. This one reads the
 * installation: which playbooks actually fire, which integrations have quietly
 * expired, what the AI is costing, and what work is piling up unattended. All
 * of it exists in this app already and none of it was reachable from a
 * conversation — an owner could only find a broken Google connection by
 * visiting the page that draws it.
 *
 * Read-only, console-only (lib/operator-console.ts).
 *
 * ## What is deliberately not returned
 *
 * No tokens, no secrets, no credential values, not even the masked previews
 * the Connections page shows. `getConnectionSummaries` is already token-free
 * by design; this narrows it further to status and names, because a masked key
 * is still a thing a model can repeat into a chat and a status is all any
 * decision here needs.
 */
export default defineTool({
  description:
    "Read the health of the installation itself: which automations (playbooks) are " +
    "active and when each last fired, which integrations are connected or need " +
    "reconnecting, what the AI has cost by provider, agent and channel, and what work " +
    "is queued. Read-only, and no secrets — statuses and names only. Use it for " +
    "'is everything working', 'why did nothing happen', and 'what is this costing me'. " +
    "Only available in the business owner's own console.",
  inputSchema: z.object({
    action: z
      .enum(["automations", "connections", "usage", "queue"])
      .describe(
        "automations: the playbooks and whether they fire. connections: integration " +
          "status. usage: what the AI cost. queue: work waiting on somebody.",
      ),
    days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe("action=usage: how far back to total. Defaults to the current billing period."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    /** action=automations */
    automations: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          status: z.string(),
          trigger: z.string(),
          triggerValue: z.string(),
          channel: z.string(),
          steps: z.number(),
          endsInHandoff: z.boolean(),
          fires: z.number(),
          lastFiredDaysAgo: z.number().optional(),
          neverFired: z.boolean(),
        }),
      )
      .optional(),
    automationTotals: z
      .object({
        total: z.number(),
        active: z.number(),
        paused: z.number(),
        draft: z.number(),
        activeNeverFired: z.number(),
      })
      .optional(),
    /** action=connections */
    connections: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          kind: z.string(),
          status: z.string(),
          account: z.string().optional(),
          connectedDaysAgo: z.number().optional(),
        }),
      )
      .optional(),
    /** action=usage */
    usage: z
      .object({
        since: z.string().optional(),
        credits: z.number(),
        providerCostUsd: z.number(),
        includedCostUsd: z.number(),
        byokEstimatedCostUsd: z.number(),
        byProvider: z.array(z.object({ provider: z.string(), credits: z.number(), calls: z.number() })),
        byAgent: z.array(z.object({ agent: z.string(), credits: z.number(), calls: z.number() })),
        byChannel: z.array(z.object({ channel: z.string(), credits: z.number(), calls: z.number() })),
        byDay: z.array(z.object({ day: z.string(), credits: z.number(), calls: z.number() })),
      })
      .optional(),
    /** action=queue */
    queue: z
      .object({
        waitingForHuman: z.number(),
        followupDue: z.number(),
        openContacts: z.number(),
        remindersPending: z.number(),
        remindersOverdue: z.number(),
        remindersFailed: z.number(),
        oldestWaitDays: z.number().optional(),
      })
      .optional(),
    totalMatched: z.number().optional(),
  }),
  async execute(input, ctx) {
    await assertToolAllowed(ctx.session.id, "operations");

    if (!(await isOperatorConsole(ctx.session.id))) {
      return { ok: false, error: OPERATOR_ONLY };
    }

    const now = new Date();

    if (input.action === "automations") {
      const list = await listAutomations();
      const rows = list.map((automation) => automationRow(automation, now));
      const active = rows.filter((row) => row.status === "active");
      return {
        ok: true,
        totalMatched: rows.length,
        automations: rows,
        automationTotals: {
          total: rows.length,
          active: active.length,
          paused: rows.filter((row) => row.status === "paused").length,
          draft: rows.filter((row) => row.status === "draft").length,
          // The one number that catches a silently broken setup: switched on,
          // and nothing has ever matched it.
          activeNeverFired: active.filter((row) => row.neverFired).length,
        },
      };
    }

    if (input.action === "connections") {
      const { oauth, manual } = await getConnectionSummaries();
      return {
        ok: true,
        totalMatched: oauth.length + manual.length,
        connections: [
          ...oauth.map((row) => ({
            id: row.id,
            label: row.label,
            kind: "account",
            status: row.status,
            account: row.accountLabel,
            connectedDaysAgo: row.connectedAt ? daysSince(row.connectedAt, now) : undefined,
          })),
          // Names and whether it is set — never the masked preview the page
          // shows. A masked key is still something a model can repeat.
          ...manual.map((row) => ({
            id: row.id,
            label: row.label,
            kind: "credential",
            status: row.configured ? "connected" : "disconnected",
          })),
        ],
      };
    }

    if (input.action === "usage") {
      const since = input.days
        ? new Date(now.getTime() - input.days * 24 * 60 * 60 * 1000)
        : undefined;
      const summary = await getUsageSummary(await getInstallationId(), { since });
      return {
        ok: true,
        usage: {
          since: since?.toISOString(),
          credits: round(summary.totalCredits),
          providerCostUsd: round(summary.totalProviderCost),
          includedCostUsd: round(summary.includedCost),
          byokEstimatedCostUsd: round(summary.byokEstimatedCost),
          byProvider: summary.byProvider.map((row) => ({
            provider: row.provider,
            credits: round(row.credits),
            calls: row.calls,
          })),
          // A null agent is a call this app could not attribute, not an agent
          // named "null" — say so rather than inventing one.
          byAgent: summary.byAgent.map((row) => ({
            agent: row.agentId ?? "(sin agente atribuido)",
            credits: round(row.credits),
            calls: row.calls,
          })),
          byChannel: summary.byChannel.map((row) => ({
            channel: row.channel ?? "(sin canal atribuido)",
            credits: round(row.credits),
            calls: row.calls,
          })),
          byDay: summary.byDay.map((row) => ({
            day: row.day,
            credits: round(row.credits),
            calls: row.calls,
          })),
        },
      };
    }

    const [contacts, reminders] = await Promise.all([listContacts(), listReminders()]);
    const waiting = contacts.filter((row) => row.status === "waiting_human");
    const pending = reminders.filter((row) => row.status === "pending");
    return {
      ok: true,
      queue: {
        waitingForHuman: waiting.length,
        followupDue: contacts.filter((row) => row.status === "followup_due").length,
        openContacts: contacts.filter((row) => row.status === "open").length,
        remindersPending: pending.length,
        // Pending and its moment has passed: the schedule should have sent it.
        remindersOverdue: pending.filter((row) => new Date(row.datetime) < now).length,
        remindersFailed: reminders.filter((row) => row.status === "failed").length,
        oldestWaitDays:
          waiting.length > 0
            ? Math.max(...waiting.map((row) => daysSince(row.lastMessageAt, now)))
            : undefined,
      },
    };
  },
});

function automationRow(automation: Automation, now: Date) {
  const steps = automation.steps ?? [];
  return {
    id: automation.id,
    name: automation.name,
    status: automation.status,
    trigger: automation.trigger,
    triggerValue: automation.triggerValue,
    channel: automation.channel,
    steps: steps.length,
    // A customer-facing playbook with no way out traps whoever it catches.
    endsInHandoff: steps.some((step) => step.type === "transfer_human"),
    fires: automation.responseCount,
    lastFiredDaysAgo: automation.lastTriggeredAt
      ? daysSince(automation.lastTriggeredAt, now)
      : undefined,
    neverFired: !automation.lastTriggeredAt,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
