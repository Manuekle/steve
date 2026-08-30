import {
  createAutomation,
  deleteAutomation,
  listAutomations,
  updateAutomation,
} from "@/lib/business-store";
import type { Automation, AutomationStatus, ChannelId, WorkflowStep } from "@/lib/types";
import { type NextRequest, NextResponse } from "next/server";
import { apiError, missingField, withApiErrors } from "@/lib/api-error";

export const GET = withApiErrors(async function GET(request: NextRequest) {
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10) || 50));

  const all = await listAutomations();
  const total = all.length;
  const start = (page - 1) * limit;
  const automations = all.slice(start, start + limit);

  return NextResponse.json({ automations, total, page, limit });
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
  const input = body as Partial<Automation>;
  if (!input.name || typeof input.name !== "string") {
    return missingField("name");
  }
  const automations = await createAutomation({
    name: input.name.trim(),
    description: typeof input.description === "string" ? input.description : "",
    trigger: input.trigger ?? "keyword",
    triggerValue: typeof input.triggerValue === "string" ? input.triggerValue : "",
    channel: (input.channel as ChannelId | "all") ?? "all",
    ...(typeof input.agentId === "string" ? { agentId: input.agentId } : {}),
    steps: Array.isArray(input.steps) ? (input.steps as WorkflowStep[]) : [],
  });
  return NextResponse.json({ automations });
});

export const PUT = withApiErrors(async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string") {
    return missingField("id");
  }
  const { id, ...updates } = body as { id: string } & Partial<Omit<Automation, "id">>;
  if (updates.status && !isStatus(updates.status)) {
    return apiError("invalid_field", { field: "status" });
  }
  const automations = await updateAutomation(id, updates);
  return NextResponse.json({ automations });
});

export const DELETE = withApiErrors(async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return missingField("id");
  const automations = await deleteAutomation(id);
  return NextResponse.json({ automations });
});

function isStatus(value: string): value is AutomationStatus {
  return value === "active" || value === "paused" || value === "draft";
}
