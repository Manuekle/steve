import { getCredential } from "./credentials";

/**
 * Resend, the app's preferred way out for email.
 *
 * The SDK is imported lazily so an install that never configures Resend never
 * loads it, and a missing package degrades to a readable error instead of
 * taking the server down at startup.
 */

export type ResendEmailOptions = {
  readonly from: string;
  /** One address, or several — Resend accepts up to 50 per call. */
  readonly to: string | readonly string[];
  readonly subject: string;
  /** React Email component rendered to HTML server-side. */
  readonly react?: React.ReactNode;
  /** Pre-rendered HTML (alternative to `react`). */
  readonly html?: string;
  /** Plain-text part. Always worth sending beside HTML: it's what a client
   *  without HTML shows, and what spam filters look for. */
  readonly text?: string;
  /** Where a reply goes, when that isn't the `from` mailbox. */
  readonly replyTo?: string;
};

export type EmailSendResult = {
  readonly success: boolean;
  readonly error?: string;
  /** Resend's id for the sent message — what to quote in their dashboard. */
  readonly id?: string;
};

/** Send an email via Resend. Requires `RESEND_API_KEY`. */
export async function sendResendEmail(
  options: ResendEmailOptions,
): Promise<EmailSendResult> {
  const apiKey = await getCredential("RESEND_API_KEY");
  if (!apiKey) {
    return {
      success: false,
      error: "RESEND_API_KEY not configured. Add it in Settings → Resend.",
    };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const { data, error } = await resend.emails.send({
      from: options.from,
      to: Array.isArray(options.to) ? [...options.to] : (options.to as string),
      subject: options.subject,
      react: options.react,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    } as Parameters<typeof resend.emails.send>[0]);

    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * The default "from" address.
 *
 * `onboarding@resend.dev` is Resend's own sandbox sender: it works with no
 * verified domain, but only delivers to the address that owns the API key.
 * That makes it the right default for "does my key work at all", and the
 * wrong one for anything real — which `isResendSenderVerified` is for.
 */
export const RESEND_SANDBOX_FROM = "onboarding@resend.dev";

export async function getResendFromEmail(): Promise<string> {
  const from = await getCredential("RESEND_FROM_EMAIL");
  return from || RESEND_SANDBOX_FROM;
}

/** Whether a real sender address has been set, as opposed to the sandbox one. */
export async function isResendSenderVerified(): Promise<boolean> {
  const from = await getCredential("RESEND_FROM_EMAIL");
  return Boolean(from) && from !== RESEND_SANDBOX_FROM;
}

/** Whether Resend has an API key. */
export async function isResendConfigured(): Promise<boolean> {
  return Boolean(await getCredential("RESEND_API_KEY"));
}
