import { type NextRequest, NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";
import { isConnectionId, isManualConnectionId } from "@/lib/connections";
import { clearManualConnection, removeConnection } from "@/lib/connection-store";

// DELETE /api/connections/<provider> — forget the tokens for one OAuth
// account, or clear the key(s) behind one manual (API-key) connection —
// Anthropic, OpenAI, the AI Gateway, ElevenLabs, Stripe, Meta, Twilio, SMTP.
//
// Local only, and deliberately so: revoking an OAuth grant is the provider's
// own screen, and doing it from here would decide on the operator's behalf
// that a disconnect means a revoke. What this guarantees is that Steve stops
// holding the token or key.

export const DELETE = withApiErrors(async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (isManualConnectionId(provider)) {
    await clearManualConnection(provider);
    return NextResponse.json({ ok: true });
  }
  if (!isConnectionId(provider)) return apiError("not_found");
  await removeConnection(provider);
  return NextResponse.json({ ok: true });
});
