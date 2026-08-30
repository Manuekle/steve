import { getCurrentLicenseInfo } from "./license/store";
import { getInstallationId } from "./license/installation";
import { getStoredCredentials, type CredentialKey } from "./credentials";
import { getAccount } from "./credit-account";
import type { AiProvider } from "./ai-provider";
import { PROVIDER_CREDENTIAL_KEY as CATALOG_PROVIDER_KEY } from "./model-catalog";

// Which pocket pays for one AI provider call, and whether Steve should let
// it start at all. Two separate questions, both answered here because they
// share the same inputs (the active license, and who put the active key
// there):
//
//   billing source — INCLUDED_CREDITS | BYOK | PURCHASED_CREDITS. Decides
//   whether lib/ai-usage.ts debits the credit ledger for this call.
//
//   the gate — allowed | blocked. Only ever blocks an INCLUDED_CREDITS call,
//   and only when the account is genuinely out of balance. BYOK and
//   Enterprise are never blocked, by construction: see resolveBillingSource.

export type BillingSource = "INCLUDED_CREDITS" | "BYOK" | "PURCHASED_CREDITS";

const PROVIDER_CREDENTIAL_KEY = CATALOG_PROVIDER_KEY as Record<AiProvider, CredentialKey>;

/**
 * Enterprise short-circuits to BYOK unconditionally: a self-hosted install
 * has no vendor-supplied key at all — the operator and the end customer are
 * the same person, so there is no "Steve pays" pocket to distinguish from
 * (see docs' §9/§25 of the commercial spec this implements). Everywhere
 * else, the distinction is *who put the active key there*: a value saved
 * through Settings/Connections (`getStoredCredentials`, disk-backed) is the
 * customer's own key — BYOK. A value that only exists as a bare environment
 * variable, with nothing on disk, is read as vendor-seeded on the hosted
 * Pro/Managed control plane — included.
 */
export async function resolveBillingSource(credentialKey: CredentialKey): Promise<BillingSource> {
  const license = await getCurrentLicenseInfo();
  if (license.status === "valid" && license.payload?.edition === "enterprise") return "BYOK";

  const stored = await getStoredCredentials();
  if (stored[credentialKey]) return "BYOK";
  if (process.env[credentialKey]) return "INCLUDED_CREDITS";
  // No key anywhere for this provider — the call is about to fail on its
  // own for lack of credentials. Don't charge credits for a call that can't
  // happen; let it fail with whatever error the provider client raises.
  return "BYOK";
}

export function billingSourceForProvider(provider: AiProvider): Promise<BillingSource> {
  return resolveBillingSource(PROVIDER_CREDENTIAL_KEY[provider]);
}

export function billingSourceForElevenLabs(): Promise<BillingSource> {
  return resolveBillingSource("ELEVENLABS_API_KEY");
}

export type CreditGateResult = { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

/**
 * Pre-flight check before an included-credit call starts. This is a balance
 * read, not a reservation — it bounds overspend by refusing to *start* a new
 * call once the account is already at or below zero, but it cannot know a
 * call's exact cost before the call returns, so it can't hold that amount
 * in reserve. The atomicity guarantee that matters — never losing or
 * double-applying a charge — lives in lib/credit-account.ts's
 * applyUsageCharge, which runs at record time inside the same DB transaction
 * as the usage row it's charging for.
 */
export async function checkCreditGate(billingSource: BillingSource): Promise<CreditGateResult> {
  if (billingSource !== "INCLUDED_CREDITS") return { allowed: true };

  const organizationId = await getInstallationId();
  const account = await getAccount(organizationId);
  if (!account.hasIncludedCredits) return { allowed: true };
  if (account.balance <= 0) {
    return {
      allowed: false,
      reason:
        "Sin AI Credits disponibles en este período. Conectá tu propia API key en Configuración → IA para seguir " +
        "usando el agente sin límite, o esperá a la renovación del período.",
    };
  }
  return { allowed: true };
}
