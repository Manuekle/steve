import { getGoogleToken } from "./google-auth";
import type { EmailSendResult } from "./resend";

// Sending mail as the connected Google account itself, via the Gmail API.
//
// No "from" to set here: Gmail sends as whichever mailbox granted the token,
// the same restriction Gmail's own compose window has. That is the point —
// this is "send from the business's own inbox", not a generic relay a
// `from` address could redirect.

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export type GmailSendOptions = {
  readonly to: string;
  readonly subject: string;
  readonly html?: string;
  readonly text?: string;
  readonly replyTo?: string;
};

function base64url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** RFC 2047 encoded-word — a raw header mangles the moment a subject carries
 *  a non-ASCII character, which "Recordatorio: turno mañana" already does. */
function encodeMimeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
}

/** Whether a connected Google account can send mail as itself. */
export async function isGmailConfigured(): Promise<boolean> {
  return Boolean(await getGoogleToken(GMAIL_SEND_SCOPE));
}

export async function sendGmailEmail(options: GmailSendOptions): Promise<EmailSendResult> {
  const token = await getGoogleToken(GMAIL_SEND_SCOPE);
  if (!token) {
    return { success: false, error: "No Google account connected with Gmail send access." };
  }

  const headers = [
    `To: ${options.to}`,
    `Subject: ${encodeMimeSubject(options.subject)}`,
    options.replyTo ? `Reply-To: ${options.replyTo}` : undefined,
    "MIME-Version: 1.0",
  ].filter((line): line is string => Boolean(line));

  const boundary = `steve_${Date.now()}`;
  let body: string;
  if (options.html && options.text) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body =
      `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${options.text}\r\n` +
      `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${options.html}\r\n` +
      `--${boundary}--`;
  } else if (options.html) {
    headers.push(`Content-Type: text/html; charset="UTF-8"`);
    body = options.html;
  } else {
    headers.push(`Content-Type: text/plain; charset="UTF-8"`);
    body = options.text ?? "";
  }

  const raw = base64url(`${headers.join("\r\n")}\r\n\r\n${body}`);

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    return { success: false, error: `Gmail API ${response.status}: ${await response.text()}` };
  }
  const data = (await response.json()) as { id?: string };
  return { success: true, id: data.id };
}
