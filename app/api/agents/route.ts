import {
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  toggleAgentStatus,
  updateAgent,
} from "@/lib/business-store";
import type { Agent } from "@/lib/types";
import { resolveProvider } from "@/lib/ai-provider";
import { listModels } from "@/lib/provider-catalog";
import { readAccess } from "@/lib/model-access";
import { type NextRequest, NextResponse } from "next/server";
import { apiError, missingField, withApiErrors } from "@/lib/api-error";

/**
 * Accept a model only when the configured provider actually serves it.
 * Storing an id the provider does not have would fail much later, at the
 * agent's first run, with nothing pointing back here.
 *
 * Returns the id to store, or an error message to reject with. An empty
 * catalog (provider unreachable) is treated as "cannot disprove" and lets the
 * value through rather than blocking edits while the network is down.
 */
async function validateModel(model: unknown): Promise<{ value: string | null } | { error: string }> {
  if (model === undefined || model === null || model === "") return { value: null };
  if (typeof model !== "string") return { error: "model must be a string" };

  const provider = resolveProvider();
  const available = await listModels(provider);
  if (available.length > 0 && !available.some((entry) => entry.id === model)) {
    return { error: `El proveedor ${provider} no ofrece el modelo ${model}.` };
  }

  // Offered is not the same as allowed: a plan can list a model it will
  // refuse to run. The probe in Settings is what fills this in.
  const { restricted } = await readAccess();
  if (restricted[model]) return { error: restricted[model] };

  return { value: model };
}

export const GET = withApiErrors(async function GET() {
  const agents = await listAgents();
  return NextResponse.json({ agents });
});

export const POST = withApiErrors(async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  if (!body || typeof body !== "object") {
    return apiError("invalid_body");
  }
  const input = body as {
    name?: string;
    description?: string;
    systemPrompt?: string;
    tools?: string[];
    model?: unknown;
  };
  if (!input.name?.trim()) {
    return missingField("name");
  }
  const model = await validateModel(input.model);
  if ("error" in model) {
    return apiError("model_unavailable", { detail: model.error });
  }
  const agent = await createAgent({
    name: input.name.trim(),
    description: input.description?.trim() ?? "",
    systemPrompt: input.systemPrompt?.trim() ?? "",
    tools: input.tools ?? [],
    model: model.value,
  });
  return NextResponse.json({ ok: true, agent });
});

export const PUT = withApiErrors(async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  if (!body || typeof body !== "object") {
    return apiError("invalid_body");
  }
  const input = body as {
    agentId?: string;
    name?: string;
    description?: string;
    systemPrompt?: string;
    tools?: string[];
    model?: unknown;
    status?: Agent["status"];
    toggleStatus?: boolean;
  };
  if (!input.agentId) {
    return missingField("agentId");
  }

  if (input.toggleStatus) {
    const toggled = await toggleAgentStatus(input.agentId);
    if (!toggled) {
      return apiError("not_found");
    }
    return NextResponse.json({ ok: true, agent: toggled });
  }

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.description !== undefined) updates.description = input.description.trim();
  if (input.systemPrompt !== undefined) updates.systemPrompt = input.systemPrompt.trim();
  if (input.tools !== undefined) updates.tools = input.tools;
  if (input.model !== undefined) {
    const model = await validateModel(input.model);
    if ("error" in model) {
      return apiError("model_unavailable", { detail: model.error });
    }
    updates.model = model.value;
  }
  if (input.status !== undefined) updates.status = input.status;

  const updated = await updateAgent(input.agentId, updates as Partial<Omit<Agent, "id" | "createdAt">>);
  if (!updated) {
    return apiError("not_found");
  }
  return NextResponse.json({ ok: true, agent: updated });
});

export const DELETE = withApiErrors(async function DELETE(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) {
    return missingField("agentId");
  }
  const deleted = await deleteAgent(agentId);
  if (!deleted) {
    return apiError("not_found");
  }
  return NextResponse.json({ ok: true });
});
