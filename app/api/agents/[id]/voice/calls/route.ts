import { type NextRequest, NextResponse } from "next/server";
import { apiError, missingField, withApiErrors } from "@/lib/api-error";
import { getAgent, listVoiceCalls, startVoiceCall } from "@/lib/business-store";

// GET lists this agent's saved calls (test and real) — the post-call webhook
// (see app/api/webhooks/elevenlabs) is what actually fills in the transcript
// on each one.
//
// POST is called from the browser the moment the in-browser Orb call
// connects, to tag that conversation "test" before the webhook can arrive —
// the same reason app/api/agents/[id]/voice/call/route.ts tags the outbound
// "Llamada de prueba" button's call. Without this, a call this app itself
// placed from inside the browser would default to "real" once the webhook
// shows up with no matching pending row.

export const GET = withApiErrors(async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const agent = await getAgent(id);
  if (!agent) return apiError("not_found");

  const calls = await listVoiceCalls(id);
  return NextResponse.json({ calls });
});

export const POST = withApiErrors(async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const agent = await getAgent(id);
  if (!agent) return apiError("not_found");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  const conversationId = (body as { conversationId?: unknown } | null)?.conversationId;
  if (typeof conversationId !== "string" || !conversationId.trim()) {
    return missingField("conversationId");
  }

  const call = await startVoiceCall({ agentId: id, conversationId: conversationId.trim(), source: "test" });
  return NextResponse.json({ call });
});
