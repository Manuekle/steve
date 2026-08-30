import { z } from "zod";
import type { WorkflowStep } from "./types";

// Shared between agent/tools/propose_automation.ts and
// agent/tools/propose_automation_update.ts — kept in lib/ (not agent/tools/)
// because eve's tool discovery treats every file directly under
// agent/tools/ as a candidate tool.

export type WorkflowStepInput = {
  readonly type: WorkflowStep["type"];
  readonly message?: string;
  readonly duration?: string;
  readonly condition?: string;
  readonly prompt?: string;
  readonly mediaUrl?: string;
  readonly mediaCaption?: string;
  readonly mediaPrompt?: string;
  readonly url?: string;
  readonly method?: string;
  readonly body?: string;
  readonly phone?: string;
  readonly service?: "slack" | "discord";
  readonly webhookUrl?: string;
  readonly contactStatus?: string;
  readonly contactNote?: string;
  readonly spreadsheetId?: string;
  readonly sheetName?: string;
  readonly paymentProvider?: "stripe" | "mercadopago";
  readonly amount?: string;
  readonly currency?: string;
  readonly productName?: string;
  readonly thenSteps?: readonly WorkflowStepInput[];
  readonly elseSteps?: readonly WorkflowStepInput[];
};

/**
 * Recursive step schema — a "condition" step can carry thenSteps/elseSteps,
 * each an ordered list of steps of the same shape. Branch execution is
 * advisory (see lib/automation-engine.ts formatPlaybook): there's no
 * deterministic runtime, the agent just reads the branch it should follow.
 */
export const workflowStepSchema: z.ZodType<WorkflowStepInput> = z.lazy(() =>
  z.object({
    type: z.enum([
      "message",
      "wait",
      "condition",
      "ai_response",
      "transfer_human",
      "send_audio",
      "send_image",
      "send_video",
      "http_request",
      "notify_whatsapp",
      "notify_team",
      "notify_email",
      "update_contact",
      "log_sheet",
      "send_payment_link",
    ]),
    message: z.string().optional().describe("Exact text to send. Used by: message, transfer_human."),
    duration: z.string().optional().describe("e.g. '30min', '2h', '1d'. Used by: wait."),
    condition: z.string().optional().describe("Plain-language condition the agent evaluates at runtime. Used by: condition."),
    prompt: z.string().optional().describe("Guidance for the AI-generated reply. Used by: ai_response."),
    mediaUrl: z.string().optional().describe("Public HTTPS URL of the media. Used by: send_audio, send_image, send_video."),
    mediaCaption: z.string().optional().describe("Caption shown with the media (WhatsApp only). Used by: send_image, send_video."),
    mediaPrompt: z.string().optional().describe("What to generate when there's no URL yet. Used by: send_audio, send_image, send_video."),
    url: z.string().optional().describe("HTTPS endpoint to call. Used by: http_request."),
    method: z.string().optional().describe("GET, POST, PUT, PATCH or DELETE. Used by: http_request."),
    body: z.string().optional().describe("JSON body sent with the request. Used by: http_request."),
    phone: z.string().optional().describe("Destination number in E.164, e.g. +5215512345678. Used by: notify_whatsapp."),
    emailTo: z.string().optional().describe("Recipient email address. Used by: notify_email."),
    emailSubject: z.string().optional().describe("Subject line. Used by: notify_email."),
    emailTemplate: z.string().optional().describe("Id of an email template to render as the body, e.g. 'welcome'. Omit to send `message` as plain text. Used by: notify_email."),
    service: z.enum(["slack", "discord"]).optional().describe("Which service the webhook belongs to. Used by: notify_team."),
    webhookUrl: z.string().optional().describe("The service's incoming-webhook URL. Used by: notify_team."),
    spreadsheetId: z.string().optional().describe("Google Sheets spreadsheet ID (from its URL). Used by: log_sheet."),
    sheetName: z.string().optional().describe("Tab name inside the spreadsheet, e.g. 'Sheet1'. Used by: log_sheet."),
    paymentProvider: z.enum(["stripe", "mercadopago"]).optional().describe("Which processor creates the checkout link. Mercado Pago covers ARS, BRL, CLP, COP, MXN, PEN and UYU; Stripe covers the rest. Omit to use whichever one is configured. Used by: send_payment_link."),
    amount: z.string().optional().describe("Decimal amount, e.g. '49.99'. Used by: send_payment_link."),
    currency: z.string().optional().describe("ISO currency code, e.g. 'usd', 'mxn'. Used by: send_payment_link."),
    productName: z.string().optional().describe("What the customer is paying for, shown on the checkout page. Used by: send_payment_link."),
    contactStatus: z.string().optional().describe("open, waiting_human, followup_due or closed. Used by: update_contact."),
    contactNote: z.string().optional().describe("Note appended to the contact. Used by: update_contact."),
    thenSteps: z.array(workflowStepSchema).optional().describe("condition only: steps to run when the condition is true."),
    elseSteps: z.array(workflowStepSchema).optional().describe("condition only: steps to run when the condition is false."),
  }),
);

// ── AI plan schema ──────────────────────────────────────────────────
//
// `workflowStepSchema` above is recursive via z.lazy, which is fine for tool
// input validation but does not survive conversion to the JSON Schema that
// `generateObject` sends to the model. So the flow-builder assistant uses an
// explicitly two-level shape instead: top-level steps, and a condition's
// branches holding leaf steps. That covers the automations people actually
// describe, and nested conditions can still be built by hand on the canvas.

const STEP_TYPE_ENUM = z.enum([
  "message",
  "wait",
  "condition",
  "ai_response",
  "transfer_human",
  "send_audio",
  "send_image",
  "send_video",
  "http_request",
  "notify_whatsapp",
  "notify_team",
  "notify_email",
  "update_contact",
  "log_sheet",
  "send_payment_link",
]);

// Every field is required-but-nullable rather than optional: OpenAI's strict
// structured-output mode rejects a schema whose `required` array does not list
// every key in `properties`, so `.optional()` fails there. `null` is the
// model's way of saying "not applicable to this step type"; `planToInput`
// below strips those back to undefined.
const leafStepSchema = z.object({
  type: STEP_TYPE_ENUM,
  message: z.string().nullable().describe("Exact text to send. Used by: message, transfer_human. null otherwise."),
  duration: z.string().nullable().describe("e.g. '30min', '2h', '1d'. Used by: wait. null otherwise."),
  condition: z.string().nullable().describe("Plain-language condition. Used by: condition. null otherwise."),
  prompt: z.string().nullable().describe("Guidance for the AI-generated reply. Used by: ai_response. null otherwise."),
  mediaUrl: z.string().nullable().describe("Public HTTPS URL of the media if the user gave one, else null."),
  mediaCaption: z.string().nullable().describe("Caption shown with the media (WhatsApp only), else null."),
  mediaPrompt: z.string().nullable().describe("What to generate when there's no URL. Used by send_* steps, else null."),
  url: z.string().nullable().describe("HTTPS endpoint to call. Used by: http_request. null otherwise."),
  method: z.string().nullable().describe("GET, POST, PUT, PATCH or DELETE. Used by: http_request. null otherwise."),
  body: z.string().nullable().describe("JSON body for the request. Used by: http_request. null otherwise."),
  phone: z.string().nullable().describe("Destination number in E.164. Used by: notify_whatsapp. null otherwise."),
  emailTo: z.string().nullable().describe("Recipient email address. Used by: notify_email. null otherwise."),
  emailSubject: z.string().nullable().describe("Subject line. Used by: notify_email. null otherwise."),
  emailTemplate: z.string().nullable().describe("Id of an email template to render as the body. Used by: notify_email. null otherwise."),
  service: z.enum(["slack", "discord"]).nullable().describe("Which service the webhook belongs to. Used by: notify_team. null otherwise."),
  webhookUrl: z.string().nullable().describe("The service's incoming-webhook URL. Used by: notify_team. null otherwise."),
  spreadsheetId: z.string().nullable().describe("Google Sheets spreadsheet ID. Used by: log_sheet. null otherwise."),
  sheetName: z.string().nullable().describe("Tab name inside the spreadsheet. Used by: log_sheet. null otherwise."),
  paymentProvider: z.enum(["stripe", "mercadopago"]).nullable().describe("Which processor creates the checkout link. Mercado Pago covers ARS, BRL, CLP, COP, MXN, PEN and UYU; Stripe covers the rest. null to use whichever is configured. Used by: send_payment_link."),
  amount: z.string().nullable().describe("Decimal amount, e.g. '49.99'. Used by: send_payment_link. null otherwise."),
  currency: z.string().nullable().describe("ISO currency code. Used by: send_payment_link. null otherwise."),
  productName: z.string().nullable().describe("What the customer is paying for. Used by: send_payment_link. null otherwise."),
  contactStatus: z.string().nullable().describe("open, waiting_human, followup_due or closed. Used by: update_contact. null otherwise."),
  contactNote: z.string().nullable().describe("Note appended to the contact. Used by: update_contact. null otherwise."),
});

const planStepSchema = leafStepSchema.extend({
  thenSteps: z.array(leafStepSchema).nullable().describe("condition only: steps to run when the condition is true, else null."),
  elseSteps: z.array(leafStepSchema).nullable().describe("condition only: steps to run when the condition is false, else null."),
});

export const workflowPlanSchema = z.object({
  summary: z
    .string()
    .describe("One or two sentences, in the user's own language, saying what this flow does. No preamble."),
  steps: z.array(planStepSchema).describe("The complete ordered flow. This REPLACES the existing steps."),
});

export type WorkflowPlan = z.infer<typeof workflowPlanSchema>;
export type WorkflowPlanLeaf = z.infer<typeof leafStepSchema>;
/** One step of an AI plan: a leaf, optionally carrying condition branches. */
export type WorkflowPlanStep = WorkflowPlanLeaf & {
  readonly thenSteps?: readonly WorkflowPlanLeaf[] | null;
  readonly elseSteps?: readonly WorkflowPlanLeaf[] | null;
};

/** Drop the schema's `null`s so a plan can flow into {@link toWorkflowSteps}. */
export function planToInput(steps: readonly WorkflowPlanStep[]): WorkflowStepInput[] {
  const clean = (step: WorkflowPlanStep): WorkflowStepInput => ({
    type: step.type,
    ...(step.message ? { message: step.message } : {}),
    ...(step.duration ? { duration: step.duration } : {}),
    ...(step.condition ? { condition: step.condition } : {}),
    ...(step.prompt ? { prompt: step.prompt } : {}),
    ...(step.mediaUrl ? { mediaUrl: step.mediaUrl } : {}),
    ...(step.mediaCaption ? { mediaCaption: step.mediaCaption } : {}),
    ...(step.mediaPrompt ? { mediaPrompt: step.mediaPrompt } : {}),
    ...(step.url ? { url: step.url } : {}),
    ...(step.method ? { method: step.method } : {}),
    ...(step.body ? { body: step.body } : {}),
    ...(step.phone ? { phone: step.phone } : {}),
    ...(step.emailTo ? { emailTo: step.emailTo } : {}),
    ...(step.emailSubject ? { emailSubject: step.emailSubject } : {}),
    ...(step.emailTemplate ? { emailTemplate: step.emailTemplate } : {}),
    ...(step.service ? { service: step.service } : {}),
    ...(step.webhookUrl ? { webhookUrl: step.webhookUrl } : {}),
    ...(step.spreadsheetId ? { spreadsheetId: step.spreadsheetId } : {}),
    ...(step.sheetName ? { sheetName: step.sheetName } : {}),
    ...(step.paymentProvider ? { paymentProvider: step.paymentProvider } : {}),
    ...(step.amount ? { amount: step.amount } : {}),
    ...(step.currency ? { currency: step.currency } : {}),
    ...(step.productName ? { productName: step.productName } : {}),
    ...(step.contactStatus ? { contactStatus: step.contactStatus } : {}),
    ...(step.contactNote ? { contactNote: step.contactNote } : {}),
    ...(step.thenSteps?.length ? { thenSteps: step.thenSteps.map(clean) } : {}),
    ...(step.elseSteps?.length ? { elseSteps: step.elseSteps.map(clean) } : {}),
  });
  return steps.map(clean);
}

let stepIdCounter = 0;

/** Convert model-facing step input into stored WorkflowStep[], assigning ids. */
export function toWorkflowSteps(steps: readonly WorkflowStepInput[]): WorkflowStep[] {
  return steps.map((s) => {
    stepIdCounter += 1;
    const id = `step-${Date.now()}-${stepIdCounter}`;
    return {
      id,
      type: s.type,
      config: {
        message: s.message,
        duration: s.duration,
        condition: s.condition,
        prompt: s.prompt,
        mediaUrl: s.mediaUrl,
        mediaCaption: s.mediaCaption,
        mediaPrompt: s.mediaPrompt,
        url: s.url,
        method: s.method,
        body: s.body,
        phone: s.phone,
        service: s.service,
        webhookUrl: s.webhookUrl,
        spreadsheetId: s.spreadsheetId,
        sheetName: s.sheetName,
        paymentProvider: s.paymentProvider ?? undefined,
        amount: s.amount,
        currency: s.currency,
        productName: s.productName,
        contactStatus: s.contactStatus,
        contactNote: s.contactNote,
      },
      ...(s.thenSteps ? { thenSteps: toWorkflowSteps(s.thenSteps) } : {}),
      ...(s.elseSteps ? { elseSteps: toWorkflowSteps(s.elseSteps) } : {}),
    };
  });
}
