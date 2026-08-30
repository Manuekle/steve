import { matchInbound } from "@/lib/automation-engine";
import {
  ingestLead,
  listAutomations,
  recordAutomationFire,
  upsertChat,
} from "@/lib/business-store";
import { getCredential } from "@/lib/credentials";
import type { LeadInput } from "@/lib/types";
import {
  isWithin24hWindow,
  sendWhatsAppText,
  sendWhatsAppTemplate,
} from "@/lib/whatsapp-send";
import { type NextRequest, NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function verifySecret(request: NextRequest): Promise<boolean> {
  const secret = await getCredential("LEAD_WEBHOOK_SECRET");
  if (!secret) return true; // No secret configured = open endpoint
  const provided = request.headers.get("x-webhook-secret");
  if (!provided) return false;
  return timingSafeEqual(provided, secret);
}

export const POST = withApiErrors(async function POST(request: NextRequest) {
  if (!(await verifySecret(request))) {
    return apiError("unauthorized");
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
  const contact = await ingestLead(input);

  const channel = contact.channel === "form" ? "web" : contact.channel;
  await upsertChat({
    title: contact.name,
    channel,
    lastMessage: input.message ?? "New lead",
    lastMessageAt: contact.lastMessageAt,
    messageCount: input.message ? 1 : 0,
  });

  const automations = await listAutomations();
  const matched = matchInbound({
    automations,
    channel,
    message: input.message ?? "",
    isNewSession: true,
  });
  for (const auto of matched) {
    await recordAutomationFire(auto.id);
    const welcome = auto.steps?.find((s) => s.type === "message")?.config.message;
    if (welcome && contact.phone && contact.channel === "whatsapp") {
      // New lead from webhook: no prior WhatsApp conversation → need template.
      // New lead from WhatsApp inbound: within 24h window → free-form OK.
      const withinWindow = isWithin24hWindow(contact.lastMessageAt);
      if (withinWindow) {
        await sendWhatsAppText(contact.phone, welcome);
      } else {
        const templateName = await getCredential("WHATSAPP_TEMPLATE_NAME");
        const templateLang = (await getCredential("WHATSAPP_TEMPLATE_LANG")) || "es";
        if (templateName) {
          await sendWhatsAppTemplate(contact.phone, templateName, templateLang, [
            contact.name,
            welcome,
          ]);
        }
        // else: no template → welcome not sent, lead is saved in inbox.
      }
    }
  }

  return NextResponse.json({ ok: true, contact });
});

// A public webhook URL gets opened in a browser sooner or later. Answering the
// framework's bare 405 leaves the person staring at an empty page; this says
// the endpoint is alive and what it wants instead.
export const GET = withApiErrors(function GET() {
  return apiError("method_not_allowed", {
    message: "This endpoint only accepts POST from your lead form or webhook.",
  });
});
