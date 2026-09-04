import { type NextRequest, NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";
import { sendAppEmail } from "@/lib/email-send";
import { ENTITY } from "@/app/landing/_components/legal-page";

/**
 * The Enterprise "contact sales" form on /pricing — the one public form on
 * the marketing site that emails a human instead of a webhook or a stored
 * business record. Everything here assumes the caller is hostile: this route
 * is listed in PUBLIC_PATHS (middleware.ts) precisely because a prospect has
 * no session to send.
 */

const MAX_LEN = { name: 200, email: 320, company: 200, message: 4000 } as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 10 submissions in a ten-minute window per address — a sales form gets
 *  nowhere near the traffic a public webhook does, so the budget is tighter
 *  than the one on /api/f/<slug>. Both now share lib/rate-limit.ts. */
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_MAX = 10;

type DemoRequestBody = {
  readonly name?: unknown;
  readonly email?: unknown;
  readonly company?: unknown;
  readonly message?: unknown;
  /** Honeypot: a real visitor never fills a field named this convincingly
   *  and hidden off-screen. A bot filling every input does. */
  readonly website?: unknown;
};

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

export const POST = withApiErrors(async function POST(request: NextRequest) {
  // No destination, no point collecting the lead — the same "don't fake a
  // capability" stance the mailto fallback already took (see
  // app/pricing/_components/pricing.tsx's ContactSalesDialog).
  if (!ENTITY.email) return apiError("not_configured");

  const limit = rateLimit("demo-request", request, { max: RATE_MAX, windowMs: RATE_WINDOW_MS });
  if (!limit.allowed) return apiError("rate_limited");

  let body: DemoRequestBody;
  try {
    body = (await request.json()) as DemoRequestBody;
  } catch {
    return apiError("invalid_json");
  }
  if (!body || typeof body !== "object") return apiError("invalid_body");

  // Honeypot tripped: answer as if it worked, send nothing. Tipping the bot
  // off would just teach it to leave the field blank.
  if (typeof body.website === "string" && body.website.trim().length > 0) {
    return NextResponse.json({ ok: true });
  }

  const name = cleanString(body.name, MAX_LEN.name);
  if (!name) return apiError("missing_field", { field: "name" });

  const email = cleanString(body.email, MAX_LEN.email);
  if (!email || !EMAIL_RE.test(email)) return apiError("invalid_field", { field: "email" });

  const company = cleanString(body.company, MAX_LEN.company);
  if (!company) return apiError("missing_field", { field: "company" });

  const message = cleanString(body.message, MAX_LEN.message) ?? "";

  const result = await sendAppEmail({
    to: ENTITY.email,
    replyTo: email,
    subject: `Enterprise demo — ${company}`,
    text: [
      `Name: ${name}`,
      `Email: ${email}`,
      `Company: ${company}`,
      message ? `\nMessage:\n${message}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
    html: [
      `<p><strong>Name:</strong> ${escapeHtml(name)}</p>`,
      `<p><strong>Email:</strong> ${escapeHtml(email)}</p>`,
      `<p><strong>Company:</strong> ${escapeHtml(company)}</p>`,
      message ? `<p><strong>Message:</strong><br/>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>` : "",
    ].join(""),
  });

  if (!result.success) {
    console.error("demo-request: sendAppEmail failed:", result.error);
    return apiError("upstream_failed", { message: "Couldn't send the request. Try again shortly." });
  }

  return NextResponse.json({ ok: true });
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const GET = withApiErrors(function GET() {
  return apiError("method_not_allowed", {
    message: "This endpoint only accepts POST from the Enterprise contact form.",
  });
});
