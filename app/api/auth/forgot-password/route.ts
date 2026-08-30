import { NextResponse, type NextRequest } from "next/server";
import { sendEmail } from "@/lib/email";
import { startPasswordReset } from "@/lib/auth/store";

/**
 * Always answers `{ ok: true }`, whether or not the email has an account —
 * the same no-enumeration stance as login. Only the email itself (sent or
 * not) tells the requester anything.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  if (!body?.email) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
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
