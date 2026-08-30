import { getAgent, updateAgent } from "@/lib/business-store";
import {
  deleteVoiceAgent,
  hasVoicePlatform,
  syncVoiceAgent,
  assignNumberToAgent,
} from "@/lib/elevenlabs-agents";
import type { AgentVoice } from "@/lib/types";
import { type NextRequest, NextResponse } from "next/server";
import { apiError, apiFailure, withApiErrors } from "@/lib/api-error";

// The voice half of one agent.
//
// PUT saves the configuration and pushes it to the mirror agent on ElevenLabs
// in the same request, because a saved-but-unsynced state is invisible in the
// UI and only shows up as "the call used the old prompt".
//
// DELETE turns voice off and removes the mirror, so switching voice off in
// this app does not leave an agent running on the ElevenLabs account.

export const PUT = withApiErrors(async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const agent = await getAgent(id);
  if (!agent) return apiError("not_found");

  if (!(await hasVoicePlatform())) {
    return apiError("not_configured", {
      message: "Add an ElevenLabs API key in Settings before enabling voice.",
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  if (!body || typeof body !== "object") return apiError("invalid_body");

  const input = body as Partial<AgentVoice>;
  const voice: AgentVoice = {
    ...agent.voice,
    enabled: input.enabled ?? agent.voice?.enabled ?? true,
    voiceId: input.voiceId ?? agent.voice?.voiceId,
    firstMessage: input.firstMessage ?? agent.voice?.firstMessage,
    language: input.language ?? agent.voice?.language,
    phoneNumberId: input.phoneNumberId ?? agent.voice?.phoneNumberId,
  };

  try {
    const synced = await syncVoiceAgent(agent, voice);
    // Routing the number is a separate call, and only matters once the mirror
    // exists — an unassigned number rings nobody.
    if (synced.phoneNumberId && synced.elevenlabsAgentId) {
      await assignNumberToAgent(synced.phoneNumberId, synced.elevenlabsAgentId);
    }
    const updated = await updateAgent(id, { voice: synced });
    return NextResponse.json({ ok: true, agent: updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const perm = msg.match(/permission (\w+)/)?.[1];
    if (perm || msg.includes("missing_permissions") || msg.includes("unauthorized")) {
      return apiError("forbidden", {
        detail: msg,
        message: `La API key de ElevenLabs no tiene el permiso${perm ? ` ${perm}` : ""}. Actívalo en elevenlabs.io/app/settings/api-keys → Voces: Leído y ElevenAgents: Escribir.`,
      });
    }
    return apiFailure(error, "upstream_failed");
  }
});

export const DELETE = withApiErrors(async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const agent = await getAgent(id);
  if (!agent) return apiError("not_found");

  const mirrorId = agent.voice?.elevenlabsAgentId;
  if (mirrorId) {
    try {
      await deleteVoiceAgent(mirrorId);
    } catch (error) {
      // A mirror deleted from the ElevenLabs dashboard is already in the state
      // this call wants, so the local record is cleared either way rather than
      // leaving the agent stuck with an id that resolves to nothing.
      console.warn(`[voice] could not delete mirror agent ${mirrorId}:`, error);
    }
  }

  const updated = await updateAgent(id, { voice: { enabled: false } });
  return NextResponse.json({ ok: true, agent: updated });
});
