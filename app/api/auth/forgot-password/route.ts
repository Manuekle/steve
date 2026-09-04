import { NextResponse, type NextRequest } from "next/server";
import { sendEmail } from "@/lib/email";
import { startPasswordReset } from "@/lib/auth/store";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Always answers `{ ok: true }`, whether or not the email has an account —
 * the same no-enumeration stance as login. Only the email itself (sent or
 * not) tells the requester anything.
 */
export async function POST(request: NextRequest) {
  // Each call sends an email on someone else's say-so, so an unlimited one is
  // a way to use this install as a mailer against an address its owner picks.
  // The 429 is the one answer here that is *not* `{ ok: true }`: it discloses
  // nothing about the address, only that this caller has asked too often.
  const limit = rateLimit("forgot-password", request, { max: 5, windowMs: 15 * 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: limit.headers });
  }

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  if (!body?.email) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const perAddress = rateLimit("forgot-password:email", body.email.trim().toLowerCase(), {
    max: 3,
    windowMs: 60 * 60_000,
  });
  if (!perAddress.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: perAddress.headers });
  }

  const token = await startPasswordReset(body.email);
  if (token) {
    const link = new URL(`/reset-password?token=${token}`, request.nextUrl.origin).toString();
    const result = await sendEmail({
      to: body.email,
      subject: "Restablecé tu contraseña",
      text: `Entrá a este enlace para elegir una contraseña nueva (vale por una hora):\n\n${link}\n\nSi no pediste esto, ignorá el mensaje.`,
      html: `<p>Entrá a este enlace para elegir una contraseña nueva (vale por una hora):</p><p><a href="${link}">${link}</a></p><p>Si no pediste esto, ignorá el mensaje.</p>`,
    });
    // Not surfaced to the requester — leaking "SMTP isn't configured" would
    // itself confirm the email had an account. It's here for the operator's
    // own server log.
    if (!result.success) console.error("forgot-password: sendEmail failed:", result.error);
  }

  return NextResponse.json({ ok: true });
}
