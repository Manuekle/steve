import { getAgent } from "@/lib/business-store";
import { startOutboundCall } from "@/lib/elevenlabs-agents";
import { type NextRequest, NextResponse } from "next/server";
import { apiError, apiFailure, missingField, withApiErrors } from "@/lib/api-error";

/** E.164: the only format Twilio dials. */
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Place a test call from this agent's number to a phone.
 *
 * The call itself runs entirely on ElevenLabs — this endpoint only dials, and
 * returns the conversation id so the transcript can be found afterwards.
 */
export const POST = withApiErrors(async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const agent = await getAgent(id);
  if (!agent) return apiError("not_found");

  const mirrorId = agent.voice?.elevenlabsAgentId;
  const phoneNumberId = agent.voice?.phoneNumberId;
  if (!mirrorId) {
    return apiError("conflict", {
      message: "This agent has no voice yet — enable and sync it first.",
    });
  }
  if (!phoneNumberId) {
    return apiError("conflict", {
      message: "This agent has no phone number assigned.",
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  const toNumber = (body as { toNumber?: unknown } | null)?.toNumber;
  if (typeof toNumber !== "string" || !toNumber.trim()) return missingField("toNumber");
  if (!E164.test(toNumber.trim())) {
    return apiError("invalid_field", {
      field: "toNumber",
      message: "The number must be in E.164 format, e.g. +541155550000.",
    });
  }

  try {
    const result = await startOutboundCall({
      elevenlabsAgentId: mirrorId,
      phoneNumberId,
      toNumber: toNumber.trim(),
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiFailure(error, "upstream_failed");
  }
});
