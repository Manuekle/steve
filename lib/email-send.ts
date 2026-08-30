import { sendEmail as sendSmtpEmail } from "./email";
import {
  getResendFromEmail,
  isResendConfigured,
  sendResendEmail,
  type EmailSendResult,
} from "./resend";
import { renderTemplateById, TemplateRenderError, type TemplateVariables } from "./email-render";
import { getTemplateMeta, renderSubject } from "./email-templates";

/**
 * The one way this app sends an email.
 *
 * Two providers, one order: Resend when it has a key, SMTP otherwise. Callers
 * — the automation runner, the editor's test send — say what to send, never
 * which provider sends it, so configuring Resend switches every email over
 * without touching a call site.
 */

export type SentVia = "resend" | "smtp";

export type AppEmailResult = EmailSendResult & {
  /** Which provider actually took it, for the line the UI shows afterwards. */
  readonly via?: SentVia;
};

export type AppEmailOptions = {
  readonly to: string;
  readonly subject: string;
  readonly html?: string;
  readonly text?: string;
  readonly from?: string;
  readonly replyTo?: string;
};

export async function sendAppEmail(options: AppEmailOptions): Promise<AppEmailResult> {
  if (await isResendConfigured()) {
    const result = await sendResendEmail({
      from: options.from ?? (await getResendFromEmail()),
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    });
    return { ...result, via: "resend" };
  }

  // SMTP wants a text body, so an HTML-only email falls back to its tags
  // stripped rather than arriving blank.
  const result = await sendSmtpEmail({
    to: options.to,
    subject: options.subject,
    text: options.text ?? (options.html ? stripTags(options.html) : ""),
    html: options.html,
  });
  return { ...result, via: "smtp" };
}

/**
 * Render a template by id and send it — what an automation's email step does.
 *
 * The subject comes from the template unless the caller overrides it, and both
 * subject and body see the same variables, so `{{firstName}}` in the subject
 * says what the greeting says.
 */
export async function sendTemplateEmail(options: {
  readonly templateId: string;
  readonly to: string;
  readonly variables?: TemplateVariables;
  readonly subject?: string;
  readonly from?: string;
  readonly replyTo?: string;
}): Promise<AppEmailResult> {
  const meta = await getTemplateMeta(options.templateId);
  if (!meta) {
    return { success: false, error: `No template named "${options.templateId}".` };
  }

  // Sample values fill whatever the caller didn't pass, so a template is never
  // sent with holes in it where an optional variable should be.
  const variables = { ...meta.sample, ...(options.variables ?? {}) };

  let rendered;
  try {
    rendered = await renderTemplateById(options.templateId, variables);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof TemplateRenderError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error),
    };
  }

  const subject = renderSubject(options.subject ?? meta.subject ?? meta.label, variables);

  return sendAppEmail({
    to: options.to,
    subject,
    html: rendered.html,
    text: rendered.text,
    from: options.from,
    replyTo: options.replyTo,
  });
}

/** Crude, and deliberately so: it exists only to give SMTP a text part when
 *  the caller had nothing but HTML. Real plain text comes from React Email. */
function stripTags(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
