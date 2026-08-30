import { getCredential } from "./credentials";

// Email sending utility via SMTP using nodemailer.
// Requires: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM

export type EmailOptions = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
};

export type EmailResult = {
  readonly success: boolean;
  readonly error?: string;
};

/**
 * Send an email via SMTP.
 * Lazy-loads nodemailer to avoid startup failure if not installed.
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const host = await getCredential("SMTP_HOST");
  const port = (await getCredential("SMTP_PORT")) || "587";
  const user = await getCredential("SMTP_USER");
  const pass = await getCredential("SMTP_PASS");
  const from = (await getCredential("SMTP_FROM")) || user;

  if (!host || !user || !pass) {
    return {
      success: false,
      error: "SMTP credentials not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS.",
    };
  }

  try {
    // Dynamic import to avoid requiring nodemailer at startup
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host,
      port: parseInt(port, 10),
      secure: parseInt(port, 10) === 465,
      auth: { user, pass },
      connectionTimeout: 10_000,
    });

    await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Whether SMTP has the three credentials it can't send without. */
export async function isSmtpConfigured(): Promise<boolean> {
  const [host, user, pass] = await Promise.all([
    getCredential("SMTP_HOST"),
    getCredential("SMTP_USER"),
    getCredential("SMTP_PASS"),
  ]);
  return Boolean(host && user && pass);
}
