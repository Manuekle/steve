import { getCredential } from "./credentials";
import { appendRow, SHEETS_SCOPE } from "./google-sheets";
import { getGoogleToken } from "./google-auth";
import { bookCalendarEvent, checkCalendarSlots } from "./calendar";
import { createCheckoutLink } from "./payments";
import { connectedApiHosts, connectionAuthHeaders } from "./connection-http";
import { assertSafeUrl, parseAllowlist } from "./http-guard";
import { upsertContact } from "./business-store";
import {
  isWithin24hWindow,
  sendWhatsAppTemplate,
  sendWhatsAppText,
} from "./whatsapp-send";
import { sendInstagramText } from "./instagram-send";
import { sendAppEmail, sendTemplateEmail } from "./email-send";
import type { Contact, ContactStatus, WorkflowStep } from "./types";

/**
 * Server-side execution of the deterministic part of a workflow.
 *
 * Steps split into two kinds. Deterministic ones (send a message, call a
 * webhook, write to the CRM) have a single correct outcome, so a trigger that
 * arrives without a person in the loop — a webhook POST — can just run them.
 * The rest (`condition`, `ai_response`, `transfer_human`) need the agent's
 * judgement, and there is no deterministic branch runtime: those are handed to
 * the agent through the playbook (see lib/automation-engine.ts formatPlaybook).
 *
 * The runner therefore executes the leading deterministic steps and stops at
 * the first one that needs the agent, reporting exactly what it did.
 */

export type StepOutcome = {
  readonly type: WorkflowStep["type"];
  readonly status: "done" | "skipped" | "failed" | "deferred";
  readonly detail?: string;
};

const AGENT_STEPS = new Set<WorkflowStep["type"]>(["condition", "ai_response", "transfer_human"]);

const CONTACT_STATUSES = new Set<ContactStatus>(["open", "waiting_human", "followup_due", "closed"]);

/**
 * Fill `{{contact.field}}` placeholders from the contact that triggered the
 * run, plus any flat `{{name}}` tokens a step supplies at runtime — e.g. a
 * payment-link step filling in `{{link}}` after it creates the link.
 */
export function renderTemplate(text: string, contact: Contact | undefined, extra?: Record<string, string>): string {
  let result = text;
  if (extra) {
    result = result.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
      Object.hasOwn(extra, key) ? extra[key] : match,
    );
  }
  if (!contact) return result;
  return result.replace(/\{\{\s*contact\.(\w+)\s*\}\}/g, (match, field: string) => {
    const value = (contact as unknown as Record<string, unknown>)[field];
    if (typeof value === "string") return value;
    const attribute = contact.attributes?.[field];
    return typeof attribute === "string" ? attribute : match;
  });
}

/** What the Graph API answered. Both send libraries return this shape. */
type SendResult = { readonly ok: boolean; readonly status: number; readonly body: string };

/** The outcome of one delivery attempt, in the words the step will report. */
type Delivery = { readonly ok: boolean; readonly detail: string };

/**
 * Meta's refusal, trimmed to something that fits in a step outcome.
 *
 * Graph answers with a JSON body whose useful part is the message; the whole
 * envelope would bury it. A zero status means the call never left this
 * process — missing credentials — and there is no HTTP code to print.
 */
function refusal(result: SendResult): string {
  const body = result.body.trim().slice(0, 200);
  return result.status ? `${result.status} ${body}` : body || "no response";
}

/**
 * Send free-form text when the 24h window is open, otherwise fall back to the
 * template.
 *
 * The result is inspected, not discarded. Reporting "done" for a message Meta
 * refused — an expired token, an unapproved template, a number outside the
 * window — told operators their automation had replied when nobody received
 * anything, which is the one failure mode a run log exists to catch.
 */
async function sendWhatsApp(
  to: string,
  text: string,
  lastMessageAt: string | undefined,
  name: string,
): Promise<Delivery> {
  if (isWithin24hWindow(lastMessageAt)) {
    const result = await sendWhatsAppText(to, text);
    return {
      ok: result.ok,
      detail: result.ok ? `Sent to ${to} as text.` : `WhatsApp text to ${to} refused — ${refusal(result)}`,
    };
  }
  const templateName = await getCredential("WHATSAPP_TEMPLATE_NAME");
  const templateLang = (await getCredential("WHATSAPP_TEMPLATE_LANG")) || "es";
  if (!templateName) {
    return { ok: false, detail: "Outside the 24h window and WHATSAPP_TEMPLATE_NAME is not set." };
  }
  const result = await sendWhatsAppTemplate(to, templateName, templateLang, [name, text]);
  return {
    ok: result.ok,
    detail: result.ok
      ? `Sent to ${to} as template "${templateName}".`
      : `WhatsApp template to ${to} refused — ${refusal(result)}`,
  };
}

/** Send an Instagram DM. No template path exists on this channel. */
async function sendInstagram(recipientId: string, text: string): Promise<Delivery> {
  const result = await sendInstagramText(recipientId, text);
  return {
    ok: result.ok,
    detail: result.ok
      ? `Sent to ${recipientId} as an Instagram DM.`
      : `Instagram DM to ${recipientId} refused — ${refusal(result)}`,
  };
}

/**
 * Reply to a contact on the channel they actually wrote from.
 *
 * `null` means there is no transport for this contact at all, which is a
 * skip rather than a failure: a web-chat contact is answered by the agent in
 * its own session, not from here.
 *
 * Exported because every place that messages a contact off its own back — the
 * lead webhook's welcome, the no-reply follow-up schedule — has to make the
 * same WhatsApp-window and Instagram-IGSID decisions. They used to each carry
 * their own WhatsApp-only copy, so an Instagram lead was silently never
 * answered by any of them.
 */
export async function replyToContact(contact: Contact | undefined, text: string): Promise<Delivery | null> {
  if (contact?.channel === "whatsapp" && contact.phone) {
    return sendWhatsApp(contact.phone, text, contact.lastMessageAt, contact.name);
  }
  if (contact?.channel === "instagram" && contact.externalId) {
    return sendInstagram(contact.externalId, text);
  }
  return null;
}

/** Why {@link replyToContact} had nowhere to send, in the operator's terms. */
function unreachable(contact: Contact | undefined): string {
  if (!contact) return "No contact in this run.";
  if (contact.channel === "whatsapp") return "This WhatsApp contact has no phone number.";
  if (contact.channel === "instagram") {
    return "This Instagram contact has no IGSID — it was saved before their first DM.";
  }
  return `No outbound transport for a ${contact.channel} contact.`;
}

async function runStep(step: WorkflowStep, contact: Contact | undefined): Promise<StepOutcome> {
  const config = step.config;
  switch (step.type) {
    case "message": {
      const text = renderTemplate(config.message ?? "", contact);
      if (!text.trim()) return { type: step.type, status: "skipped", detail: "No message configured." };
      const sent = await replyToContact(contact, text);
      if (!sent) return { type: step.type, status: "skipped", detail: unreachable(contact) };
      return { type: step.type, status: sent.ok ? "done" : "failed", detail: sent.detail };
    }

    case "notify_whatsapp": {
      const to = config.phone?.trim();
      const text = renderTemplate(config.message ?? "", contact);
      if (!to || !text.trim()) {
        return { type: step.type, status: "skipped", detail: "Number or message missing." };
      }
      // A notification goes to your own team, which has no inbound 24h window
      // of its own, so this always needs the template path unless they have
      // messaged the business recently. Treat it as outside the window.
      const sent = await sendWhatsApp(to, text, undefined, contact?.name ?? "");
      return { type: step.type, status: sent.ok ? "done" : "failed", detail: sent.detail };
    }

    case "notify_team": {
      const service = config.service ?? "slack";
      const raw = config.webhookUrl?.trim();
      const text = renderTemplate(config.message ?? "", contact);
      if (!raw || !text.trim()) {
        return { type: step.type, status: "skipped", detail: "Webhook URL or message missing." };
      }
      // Slack/Discord webhooks live on one fixed, known host per service —
      // gate on that instead of the user's general HTTP_ALLOWLIST, so this
      // step works without asking anyone to allowlist Slack by hand.
      const knownHosts: Record<string, string[]> = {
        slack: ["hooks.slack.com"],
        discord: ["discord.com", "discordapp.com"],
      };
      const url = assertSafeUrl(raw, knownHosts[service] ?? [], `the ${service} webhook host list`);
      const body = service === "discord" ? { content: text } : { text };
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      return {
        type: step.type,
        status: response.ok ? "done" : "failed",
        detail: `Posted to ${service} → ${response.status}`,
      };
    }

    case "notify_email": {
      // `phone` is where the recipient used to live, back when this step
      // borrowed the WhatsApp field. Automations saved then still work.
      const to = renderTemplate((config.emailTo ?? config.phone ?? "").trim(), contact);
      if (!to) {
        return { type: step.type, status: "skipped", detail: "No email recipient configured." };
      }

      // Whatever the contact record holds is what a template's variables and
      // the subject's placeholders both resolve against.
      const variables: Record<string, unknown> = {
        ...(contact ? { ...contact, ...(contact.attributes ?? {}) } : {}),
      };

      if (config.emailTemplate) {
        const result = await sendTemplateEmail({
          templateId: config.emailTemplate,
          to,
          variables,
          subject: config.emailSubject
            ? renderTemplate(config.emailSubject, contact)
            : undefined,
        });
        return {
          type: step.type,
          status: result.success ? "done" : "failed",
          detail: result.success
            ? `Sent "${config.emailTemplate}" to ${to} via ${result.via}`
            : `Email failed: ${result.error}`,
        };
      }

      // No template: the step's own message is the whole email, and its first
      // line stands in for a subject nobody set.
      const text = renderTemplate(config.message ?? "", contact);
      const subject = config.emailSubject
        ? renderTemplate(config.emailSubject, contact)
        : text.split("\n")[0]?.slice(0, 120).trim();
      if (!subject) {
        return { type: step.type, status: "skipped", detail: "Email subject and body are both empty." };
      }

      const result = await sendAppEmail({ to, subject, text });
      return {
        type: step.type,
        status: result.success ? "done" : "failed",
        detail: result.success
          ? `Email sent to ${to} via ${result.via}`
          : `Email failed: ${result.error}`,
      };
    }

    case "http_request": {
      const raw = config.url?.trim();
      if (!raw) return { type: step.type, status: "skipped", detail: "No URL configured." };
      // Same two sources as the agent's http_request tool, on purpose: a
      // connected account's API host is reachable, and authenticated, in a
      // deterministic step exactly as it is in a model-driven one.
      const allowlist = [
        ...parseAllowlist(await getCredential("HTTP_ALLOWLIST")),
        ...(await connectedApiHosts()),
      ];
      const url = assertSafeUrl(raw, allowlist);
      const method = (config.method ?? "POST").toUpperCase();
      const body = config.body ? renderTemplate(config.body, contact) : undefined;
      const headers = new Headers({ accept: "application/json, text/plain;q=0.9, */*;q=0.8" });
      if (body && method !== "GET") headers.set("content-type", "application/json");
      for (const [key, value] of Object.entries((await connectionAuthHeaders(url.host)) ?? {})) {
        headers.set(key, value);
      }
      const response = await fetch(url, {
        method,
        headers,
        body: body && method !== "GET" ? body : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      return {
        type: step.type,
        status: response.ok ? "done" : "failed",
        detail: `${method} ${url.host} → ${response.status}`,
      };
    }

    case "update_contact": {
      if (!contact) return { type: step.type, status: "skipped", detail: "No contact in this run." };
      const status = config.contactStatus as ContactStatus | undefined;
      const note = config.contactNote ? renderTemplate(config.contactNote, contact) : undefined;
      await upsertContact({
        id: contact.id,
        ...(status && CONTACT_STATUSES.has(status) ? { status } : {}),
        ...(note ? { notes: contact.notes ? `${contact.notes}\n${note}` : note } : {}),
      });
      return { type: step.type, status: "done", detail: status ? `status=${status}` : "note added" };
    }

    case "log_sheet": {
      const spreadsheetId = config.spreadsheetId?.trim();
      if (!spreadsheetId) return { type: step.type, status: "skipped", detail: "No spreadsheet configured." };
      const accessToken = await getGoogleToken(SHEETS_SCOPE);
      if (!accessToken) {
        return {
          type: step.type,
          status: "skipped",
          detail: "No Google account is connected and GOOGLE_SERVICE_ACCOUNT_JSON is not set.",
        };
      }
      await appendRow({
        accessToken,
        spreadsheetId,
        sheetName: config.sheetName?.trim() || "Sheet1",
        values: [
          new Date().toISOString(),
          contact?.name ?? "",
          contact?.phone ?? "",
          contact?.email ?? "",
          contact?.channel ?? "",
          contact?.lastMessage ?? "",
        ],
      });
      return { type: step.type, status: "done", detail: `Logged to ${spreadsheetId}` };
    }

    case "book_meeting": {
      const durationMin = Number(config.meetingDurationMin) || 30;
      const summary =
        renderTemplate(config.meetingSummary?.trim() || "Reunión con {{contact.name}}", contact).trim() ||
        "Reunión";

      const now = new Date();
      const searchEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      let slots;
      try {
        slots = await checkCalendarSlots({ start: now.toISOString(), end: searchEnd.toISOString(), durationMin });
      } catch (error) {
        return {
          type: step.type,
          status: "skipped",
          detail: error instanceof Error ? error.message : "Connect a Google account, or set GOOGLE_SERVICE_ACCOUNT_JSON.",
        };
      }
      const slot = slots[0];
      if (!slot) {
        return { type: step.type, status: "skipped", detail: "No available slot in the next 14 days." };
      }

      const booked = await bookCalendarEvent({
        start: slot.start,
        end: new Date(new Date(slot.start).getTime() + durationMin * 60_000).toISOString(),
        summary,
        contactEmail: contact?.email,
      });
      const meetLink = booked.meetLink ?? booked.link;
      const startLabel = new Date(slot.start).toLocaleString("es-AR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

      const text = renderTemplate(
        config.message?.trim() || "Tu reunión quedó agendada para {{start}}. Unite acá: {{meetLink}}",
        contact,
        { start: startLabel, meetLink: meetLink ?? "" },
      );
      // The booking already happened, so a delivery that failed downgrades the
      // detail, not the status — telling someone the meeting was not booked
      // would send them to re-book a slot that is already taken.
      const notified = await replyToContact(contact, text);
      if (notified) {
        return {
          type: step.type,
          status: "done",
          detail: `Booked for ${slot.start}; ${notified.detail}`,
        };
      }
      return {
        type: step.type,
        status: "done",
        detail: `Booked for ${slot.start}${meetLink ? ` — ${meetLink}` : ""}.`,
      };
    }

    case "send_payment_link": {
      const amount = config.amount?.trim();
      const productName = config.productName?.trim();
      if (!amount || !productName) {
        return { type: step.type, status: "skipped", detail: "Amount or product name missing." };
      }
      const currency = config.currency?.trim() || "usd";
      const created = await createCheckoutLink({
        amount,
        currency,
        productName,
        requested: config.paymentProvider,
        contactId: contact?.id,
      });
      if (!created) {
        return {
          type: step.type,
          status: "skipped",
          detail: "Neither STRIPE_SECRET_KEY nor MERCADOPAGO_ACCESS_TOKEN is set.",
        };
      }
      const link = created.url;
      const text = renderTemplate(config.message?.trim() || "{{link}}", contact, { link });
      const sent = await replyToContact(contact, text);
      if (sent) {
        return {
          type: step.type,
          status: sent.ok ? "done" : "failed",
          detail: sent.ok ? `Link ${link} — ${sent.detail}` : sent.detail,
        };
      }
      return { type: step.type, status: "done", detail: `Created via ${created.provider}: ${link}` };
    }

    case "wait":
      // No durable timer here: a delayed step belongs to the agent's own
      // follow-up scheduling, not to a synchronous webhook response.
      return { type: step.type, status: "deferred", detail: "Timing is handled by the agent." };

    default:
      return { type: step.type, status: "skipped", detail: "Not runnable outside a conversation." };
  }
}

export async function runAutomationSteps(
  steps: readonly WorkflowStep[],
  contact: Contact | undefined,
): Promise<StepOutcome[]> {
  const outcomes: StepOutcome[] = [];
  for (const step of steps) {
    if (AGENT_STEPS.has(step.type)) {
      outcomes.push({
        type: step.type,
        status: "deferred",
        detail: "Handed to the agent — it reads the rest of the flow from the playbook.",
      });
      break;
    }
    try {
      outcomes.push(await runStep(step, contact));
    } catch (error) {
      outcomes.push({
        type: step.type,
        status: "failed",
        detail: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }
  return outcomes;
}
