import { NextResponse, type NextRequest } from "next/server";
import { AI_PROVIDERS, resolveProvider, type AiProvider } from "@/lib/ai-provider";
import { MODEL_TASKS, modelTier, pickForTask, recommendedIds } from "@/lib/model-catalog";
import { getProviderReport } from "@/lib/provider-catalog";
import { readAccess } from "@/lib/model-access";
import { withApiErrors } from "@/lib/api-error";

// GET  /api/models        — models the active provider can serve, plus key health
// POST /api/models        — same, but re-checked now; { probe: true } also
//                           spends one token to find out whether the account
//                           can actually pay.

export const maxDuration = 60;

function requestedProvider(request: NextRequest | undefined): AiProvider {
  const raw = request ? new URL(request.url).searchParams.get("provider") : null;
  return AI_PROVIDERS.includes(raw as AiProvider) ? (raw as AiProvider) : resolveProvider();
}

async function report(probe: boolean, force: boolean, request?: NextRequest) {
  const provider = requestedProvider(request);
  const health = await getProviderReport(provider, { probe, force });
  const recommended = recommendedIds(provider);
  const restricted = health.restricted ?? (await readAccess()).restricted;
  const usable = health.models.filter((model) => !(model.id in restricted));

  return NextResponse.json({
    provider,
    status: health.status,
    detail: health.detail,
    balanceUsd: health.balanceUsd,
    billingChecked: health.billingChecked,
    checkedAt: health.checkedAt,
    restricted,
    models: health.models.map((model) => ({
      ...model,
      tier: modelTier(model),
      recommended: recommended.has(model.id),
      // Surfaced rather than hidden: "you cannot use this and here is why"
      // beats a model quietly missing from the list.
      restrictedReason: restricted[model.id],
    })),
    // What the app picks on its own for each kind of work, so the UI can show
    // the automatic choice next to the manual one.
    tasks: Object.fromEntries(
      MODEL_TASKS.map((task) => [task, pickForTask(provider, task, usable)]),
    ),
  });
}

export const GET = withApiErrors(async function GET(request: NextRequest) {
  return report(false, false, request);
});

export const POST = withApiErrors(async function POST(request: NextRequest) {
  let body: { probe?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // A bodyless POST is a plain refresh.
  }
  return report(body.probe === true, true, request);
});
