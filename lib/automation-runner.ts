import { getCredential } from "./credentials";
import { appendRow, SHEETS_SCOPE } from "./google-sheets";
import { getGoogleToken } from "./google-auth";
import { createPaymentLink } from "./stripe";
import { createPaymentPreference, isMercadoPagoCurrency } from "./mercadopago";
import { assertSafeUrl, parseAllowlist } from "./http-guard";
import { upsertContact } from "./business-store";
import {
  isWithin24hWindow,
  sendWhatsAppTemplate,
  sendWhatsAppText,
} from "./whatsapp-send";
import { sendAppEmail, sendTemplateEmail } from "./email-send";
import type { Contact, ContactStatus, WorkflowStep } from "./types";

type PaymentChoice = { readonly provider: "stripe" | "mercadopago"; readonly key: string };

/**
 * Which processor creates a payment link, and with which key.
 *
 * An explicit `paymentProvider` on the step always wins — if someone picked
 * Mercado Pago and its token is missing, that is an error worth surfacing, not
 * a reason to silently charge through Stripe instead. With nothing picked, the
 * currency decides: Mercado Pago cannot bill in USD or EUR, and Stripe is the
 * safe default everywhere it is configured.
 */
async function resolvePaymentProvider(
  requested: "stripe" | "mercadopago" | undefined,
  currency: string,
): Promise<PaymentChoice | null> {
  const stripeKey = (await getCredential("STRIPE_SECRET_KEY"))?.trim();
  const mercadoKey = (await getCredential("MERCADOPAGO_ACCESS_TOKEN"))?.trim();

  if (requested === "stripe") return stripeKey ? { provider: "stripe", key: stripeKey } : null;
  if (requested === "mercadopago") {
    return mercadoKey ? { provider: "mercadopago", key: mercadoKey } : null;
  }

  // Nothing picked. Only Mercado Pago can take a local currency it supports,
  // so prefer it there; otherwise Stripe, then whatever is left.
  if (mercadoKey && isMercadoPagoCurrency(currency) && !stripeKey) {
    return { provider: "mercadopago", key: mercadoKey };
  }
  if (stripeKey) return { provider: "stripe", key: stripeKey };
  if (mercadoKey && isMercadoPagoCurrency(currency)) {
    return { provider: "mercadopago", key: mercadoKey };
  }
  return null;
}

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

/** Send free-form text when the 24h window is open, otherwise fall back to the template. */
async function sendWhatsApp(to: string, text: string, lastMessageAt: string | undefined, name: string) {
  if (isWithin24hWindow(lastMessageAt)) {
    await sendWhatsAppText(to, text);
    return "text";
  }
  const templateName = await getCredential("WHATSAPP_TEMPLATE_NAME");
  const templateLang = (await getCredential("WHATSAPP_TEMPLATE_LANG")) || "es";
  if (!templateName) throw new Error("Outside the 24h window and WHATSAPP_TEMPLATE_NAME is not set.");
  await sendWhatsAppTemplate(to, templateName, templateLang, [name, text]);
  return "template";
}

async function runStep(step: WorkflowStep, contact: Contact | undefined): Promise<StepOutcome> {
  const config = step.config;
  switch (step.type) {
    case "message": {
      const text = renderTemplate(config.message ?? "", contact);
      if (!text.trim()) return { type: step.type, status: "skipped", detail: "No message configured." };
      if (!contact?.phone || contact.channel !== "whatsapp") {
        return { type: step.type, status: "skipped", detail: "No WhatsApp contact to reply to." };
      }
      const mode = await sendWhatsApp(contact.phone, text, contact.lastMessageAt, contact.name);
      return { type: step.type, status: "done", detail: `Sent to ${contact.phone} as ${mode}.` };
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
      const mode = await sendWhatsApp(to, text, undefined, contact?.name ?? "");
      return { type: step.type, status: "done", detail: `Notified ${to} as ${mode}.` };
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
      const allowlist = parseAllowlist(await getCredential("HTTP_ALLOWLIST"));
      const url = assertSafeUrl(raw, allowlist);
      const method = (config.method ?? "POST").toUpperCase();
      const body = config.body ? renderTemplate(config.body, contact) : undefined;
      const headers = new Headers({ accept: "application/json, text/plain;q=0.9, */*;q=0.8" });
      if (body && method !== "GET") headers.set("content-type", "application/json");
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

    case "send_payment_link": {
      const amount = config.amount?.trim();
      const productName = config.productName?.trim();
      if (!amount || !productName) {
        return { type: step.type, status: "skipped", detail: "Amount or product name missing." };
      }
      const currency = config.currency?.trim() || "usd";
      const chosen = await resolvePaymentProvider(config.paymentProvider, currency);
      if (!chosen) {
        return {
          type: step.type,
          status: "skipped",
          detail: "Neither STRIPE_SECRET_KEY nor MERCADOPAGO_ACCESS_TOKEN is set.",
        };
      }
      const link =
        chosen.provider === "mercadopago"
          ? await createPaymentPreference({
              accessToken: chosen.key,
              amount,
              currency,
              productName,
            })
          : await createPaymentLink({
              secretKey: chosen.key,
              amount,
              currency,
              productName,
            });
      const text = renderTemplate(config.message?.trim() || "{{link}}", contact, { link });
      if (contact?.phone && contact.channel === "whatsapp") {
        const mode = await sendWhatsApp(contact.phone, text, contact.lastMessageAt, contact.name);
        return { type: step.type, status: "done", detail: `Link sent to ${contact.phone} as ${mode}.` };
      }
      return { type: step.type, status: "done", detail: `Created via ${chosen.provider}: ${link}` };
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
