import {
  CREDENTIAL_GROUPS,
  getCredentialPreviews,
  getCredentialSources,
  getMaskedCredentials,
  getStoredCredentials,
  isPasswordCredential,
  saveCredentials,
  type CredentialKey,
} from "@/lib/credentials";
import { type NextRequest, NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";

// GET /api/settings — which credentials are configured (masked), the real
// value for every non-secret field (a phone number id, a hostname — nothing
// worth hiding), and a short preview instead of the real value for every
// secret field (API keys, tokens, passwords). A secret's full value is never
// sent back once saved: the form shows what was typed this session, or
// nothing, never what the server holds — see lib/credentials.ts's
// `isPasswordCredential`/`getCredentialPreviews`.
// POST /api/settings — saves credential values to the local store.

export const GET = withApiErrors(async function GET() {
  const [masked, stored, previews, sources] = await Promise.all([
    getMaskedCredentials(),
    getStoredCredentials(),
    getCredentialPreviews(),
    getCredentialSources(),
  ]);

  // Non-secret values, from the store *and* from the environment. A hostname
  // or an account id set through .env is configured and working; showing its
  // box empty told the operator the opposite.
  const values: Record<string, string> = {};
  for (const group of CREDENTIAL_GROUPS) {
    for (const field of group.fields) {
      if (isPasswordCredential(field.key)) continue;
      const value = stored[field.key] ?? process.env[field.key];
      if (value !== undefined) values[field.key] = value;
    }
  }

  return NextResponse.json({
    credentials: masked,
    // Only values explicitly saved through the UI count as "configured" for the
    // badge — environment-provided secrets are real and working, but the badge
    // should reflect whether the operator set them up from this app. The
    // "from env" hint in the form already communicates the env origin.
    configured: Object.fromEntries(
      Object.entries(sources)
        .filter(([, source]) => source === "store")
        .map(([key]) => [key, true]),
    ),
    sources,
    values,
    previews,
    groups: CREDENTIAL_GROUPS,
  });
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
