import { matchInbound } from "./automation-engine";
import { replyToContact } from "./automation-runner";
import {
  ingestLead,
  listAutomations,
  recordAutomationFire,
  upsertChat,
} from "./business-store";
import type { Contact, LeadInput } from "./types";

/**
 * Take one lead in: save it, put it in the inbox, and fire whatever active
 * automation matches.
 *
 * Shared by every door a lead can arrive through — the public /api/leads
 * webhook and the Meta lead-ads poller — because they had started to drift.
 * The welcome message is sent through `replyToContact`, so a lead that came in
 * on Instagram is answered on Instagram rather than silently skipped for not
 * having a phone number.
 *
 * Only the automation's first `message` step is sent here. The rest of a flow
 * needs either the agent (a live conversation) or a webhook trigger, which
 * runs the deterministic steps itself — see app/api/automations/[id]/webhook.
 */
export async function intakeLead(input: LeadInput): Promise<Contact> {
  const contact = await ingestLead(input);

  const channel = contact.channel === "form" ? "web" : contact.channel;
  await upsertChat({
    title: contact.name,
    channel,
    lastMessage: input.message ?? "New lead",
    lastMessageAt: contact.lastMessageAt,
    messageCount: input.message ? 1 : 0,
  });

  const matched = matchInbound({
    automations: await listAutomations(),
    channel,
    message: input.message ?? "",
    isNewSession: true,
  });

  for (const auto of matched) {
    await recordAutomationFire(auto.id);
    const welcome = auto.steps?.find((step) => step.type === "message")?.config.message;
    if (!welcome) continue;
    const sent = await replyToContact(contact, welcome);
    // A refusal is logged, not thrown: the lead is already saved, and the
    // caller's success is about ingestion, not about Meta's mood.
    if (sent && !sent.ok) {
      console.warn("[leads] welcome not delivered", { automation: auto.id, detail: sent.detail });
    }
  }

  return contact;
}
