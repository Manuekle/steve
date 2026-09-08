import { describe, expect, it } from "vitest";
import battlecard from "../../../agent/skills/sales-battlecard";
import brief from "../../../agent/skills/sales-brief";
import crmHygiene from "../../../agent/skills/sales-crm-hygiene";
import customers from "../../../agent/skills/sales-customers";
import findLeads from "../../../agent/skills/sales-find-leads";
import forecast from "../../../agent/skills/sales-forecast";
import meeting from "../../../agent/skills/sales-meeting";
import proposal from "../../../agent/skills/sales-proposal";
import researchAccount from "../../../agent/skills/sales-research-account";
import setup from "../../../agent/skills/sales-setup";
import triage from "../../../agent/skills/sales-triage";
import writeOutreach from "../../../agent/skills/sales-write-outreach";
import supportDocs from "../../../agent/skills/support-docs";
import supportInbox from "../../../agent/skills/support-inbox";
import supportPlaybook from "../../../agent/skills/support-playbook";
import supportPromises from "../../../agent/skills/support-promises";
import supportReply from "../../../agent/skills/support-reply";
import supportReview from "../../../agent/skills/support-review";
import supportSignals from "../../../agent/skills/support-signals";
import supportThread from "../../../agent/skills/support-thread";
import marketingAdCopy from "../../../agent/skills/marketing-ad-copy";
import marketingCampaign from "../../../agent/skills/marketing-campaign";
import marketingCompetitors from "../../../agent/skills/marketing-competitors";
import marketingForms from "../../../agent/skills/marketing-forms";
import marketingPerformance from "../../../agent/skills/marketing-performance";
import marketingPost from "../../../agent/skills/marketing-post";
import marketingSite from "../../../agent/skills/marketing-site";
import marketingVoice from "../../../agent/skills/marketing-voice";
import opsAutomations from "../../../agent/skills/ops-automations";
import opsCalendar from "../../../agent/skills/ops-calendar";
import opsCosts from "../../../agent/skills/ops-costs";
import opsData from "../../../agent/skills/ops-data";
import opsHealth from "../../../agent/skills/ops-health";

// The resolvers read `ctx.channel.kind` and nothing else, so a bare object is
// a faithful stand-in for the resolve context.
const ctx = (kind: string | undefined) => ({ channel: { kind } }) as never;

/** What a resolved operator skill looks like from the test's side. */
type Resolved = { description: string; markdown: string } | null;
type Resolver = (event: never, ctx: never) => Promise<Resolved> | Resolved;

const SKILLS = [
  ["sales-battlecard", battlecard],
  ["sales-brief", brief],
  ["sales-crm-hygiene", crmHygiene],
  ["sales-customers", customers],
  ["sales-find-leads", findLeads],
  ["sales-forecast", forecast],
  ["sales-meeting", meeting],
  ["sales-proposal", proposal],
  ["sales-research-account", researchAccount],
  ["sales-setup", setup],
  ["sales-triage", triage],
  ["sales-write-outreach", writeOutreach],
  ["support-docs", supportDocs],
  ["support-inbox", supportInbox],
  ["support-playbook", supportPlaybook],
  ["support-promises", supportPromises],
  ["support-reply", supportReply],
  ["support-review", supportReview],
  ["support-signals", supportSignals],
  ["support-thread", supportThread],
  ["marketing-ad-copy", marketingAdCopy],
  ["marketing-campaign", marketingCampaign],
  ["marketing-competitors", marketingCompetitors],
  ["marketing-forms", marketingForms],
  ["marketing-performance", marketingPerformance],
  ["marketing-post", marketingPost],
  ["marketing-site", marketingSite],
  ["marketing-voice", marketingVoice],
  ["ops-automations", opsAutomations],
  ["ops-calendar", opsCalendar],
  ["ops-costs", opsCosts],
  ["ops-data", opsData],
  ["ops-health", opsHealth],
] as const;

describe.each(SKILLS)("%s", (_slug, skill) => {
  const resolve = (skill as unknown as { events: Record<string, Resolver> }).events[
    "session.started"
  ];

  it("resolves for the owner's console", async () => {
    const resolved = await resolve({} as never, ctx("eve"));

    expect(resolved).not.toBeNull();
    if (!resolved) return;
    // The description is what eve advertises; without one the model cannot
    // route to the skill at all.
    expect(resolved.description.length).toBeGreaterThan(40);
    expect(resolved.markdown).toContain("What I never do");
    expect(resolved.markdown).toContain("How I report back");
    // Shared fragments must have interpolated, not shipped as placeholders.
    expect(resolved.markdown).not.toContain("{NO_INVENTION}");
  });

  it.each(["whatsapp", "channel:whatsapp", "instagram", "channel:instagram"])(
    "is withheld on %s",
    async (kind) => {
      expect(await resolve({} as never, ctx(kind))).toBeNull();
    },
  );
});
