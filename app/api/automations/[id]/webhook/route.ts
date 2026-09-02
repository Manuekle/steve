import { runAutomationSteps } from "@/lib/automation-runner";
import {
  ingestLead,
  listAutomations,
  recordAutomationFire,
  upsertChat,
} from "@/lib/business-store";
import type { LeadInput } from "@/lib/types";
import { type NextRequest, NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";

/** Constant-time-ish comparison, so a wrong token can't be probed byte by byte. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Inbound webhook for one automation: an external system POSTs a lead payload
 * and the automation's deterministic steps run immediately. See
 * lib/automation-runner.ts for what "deterministic" covers.
 */
export const POST = withApiErrors(async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const automations = await listAutomations();
  const automation = automations.find((a) => a.id === id);
  if (!automation) {
    return apiError("not_found");
  }
  if (automation.trigger !== "webhook") {
    return apiError("conflict", { message: "This automation is not webhook-triggered." });
  }
  // The token is mandatory. This route is public (a third-party dashboard
  // cannot send a session cookie) and running an automation sends WhatsApp
  // messages, emails and payment links on the operator's behalf — so an
  // automation with no token is not an open endpoint, it is a broken one.
  // Automations saved through the API get a token generated for them; one
  // that predates that gets this error instead of running for anybody.
  const token = automation.triggerValue?.trim();
  if (!token) {
    return apiError("unauthorized", {
      message:
        "This webhook automation has no secret token. Re-save it in Automations to have one generated, then send it as the x-webhook-secret header.",
    });
  }
  const provided = request.headers.get("x-webhook-secret");
  if (!provided || !secretsMatch(provided, token)) {
    return apiError("unauthorized");
  }
  if (automation.status !== "active") {
    return apiError("conflict", { message: "This automation is not active." });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  if (!body || typeof body !== "object") {
    return apiError("invalid_body");
  }

  const input = body as LeadInput;
  const contact = await ingestLead({
    ...input,
    source: input.source ?? `webhook:${automation.name}`,
    channel: input.channel ?? (automation.channel === "all" ? "web" : automation.channel),
  });

  const channel = contact.channel === "form" ? "web" : contact.channel;
  await upsertChat({
    title: contact.name,
    channel,
    lastMessage: input.message ?? "Webhook",
    lastMessageAt: contact.lastMessageAt,
    messageCount: input.message ? 1 : 0,
  });

  await recordAutomationFire(automation.id);
  const results = await runAutomationSteps(automation.steps ?? [], contact);

  return NextResponse.json({ ok: true, automation: automation.id, contact, results });
});

// Same reasoning as /api/leads: this URL is pasted into third-party dashboards
// and opened by hand, so a GET should explain itself rather than 405 blankly.
export const GET = withApiErrors(function GET() {
  return apiError("method_not_allowed", {
    message: "This automation webhook only accepts POST.",
  });
});
