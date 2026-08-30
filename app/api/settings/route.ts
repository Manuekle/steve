import {
  CREDENTIAL_GROUPS,
  getMaskedCredentials,
  getStoredCredentials,
  saveCredentials,
  type CredentialKey,
} from "@/lib/credentials";
import { type NextRequest, NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";

// GET /api/settings — returns which credentials are configured (masked)
// plus the actual stored values so the form can be prefilled on load.
// POST /api/settings — saves credential values to the local store.

export const GET = withApiErrors(async function GET() {
  const masked = await getMaskedCredentials();
  const values = await getStoredCredentials();
  return NextResponse.json({ credentials: masked, values, groups: CREDENTIAL_GROUPS });
});

export const POST = withApiErrors(async function POST(request: NextRequest) {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }

  // Only accept known credential keys to prevent arbitrary writes.
  const knownKeys = new Set<string>(
    CREDENTIAL_GROUPS.flatMap((g) => g.fields.map((f) => f.key)),
  );

  const updates: Partial<Record<CredentialKey, string>> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!knownKeys.has(key)) continue;
    if (typeof value !== "string") continue;
    // Empty string clears; non-empty sets.
    updates[key as CredentialKey] = value;
  }

  await saveCredentials(updates);

  const masked = await getMaskedCredentials();
  return NextResponse.json({ ok: true, credentials: masked });
});
