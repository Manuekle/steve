import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto";
import { LICENSE_PUBLIC_KEYS } from "./keys";
import type { LicenseInfo, LicensePayload, LicenseStatus } from "./types";

// Offline verification for Enterprise license tokens.
//
// A token is `<keyId>.<payload>.<signature>`, payload and signature base64url
// — the same three-part shape as a compact JWS, minus the header, because
// there is exactly one algorithm (Ed25519) and negotiating it would be
// ceremony with nothing on the other end to negotiate with. Nothing here
// makes a network call: a self-hosted install with no route to Steve's
// servers must verify a license exactly as well as one with a route to
// everywhere. See docs/commercial-licensing.md for the full design.

const MS_PER_DAY = 86_400_000;

function base64urlDecode(segment: string): Buffer {
  return Buffer.from(segment, "base64url");
}

function base64urlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

/** Structural checks only — does not touch the signature. */
export function parseLicense(
  token: string,
): { ok: true; keyId: string; payload: LicensePayload; payloadBytes: Buffer; signature: Buffer } | { ok: false } {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return { ok: false };
  const [keyId, payloadSegment, signatureSegment] = parts;
  if (!keyId || !payloadSegment || !signatureSegment) return { ok: false };

  try {
    const payloadBytes = base64urlDecode(payloadSegment);
    const signature = base64urlDecode(signatureSegment);
    const payload = JSON.parse(payloadBytes.toString("utf-8")) as Partial<LicensePayload>;
    if (
      typeof payload.licenseId !== "string" ||
      typeof payload.company !== "string" ||
      typeof payload.customerEmail !== "string" ||
      typeof payload.edition !== "string" ||
      typeof payload.deploymentType !== "string" ||
      !Array.isArray(payload.features) ||
      typeof payload.issuedAt !== "string" ||
      typeof payload.maintenanceUntil !== "string" ||
      (payload.installationId !== undefined && typeof payload.installationId !== "string") ||
      payload.schemaVersion !== 1
    ) {
      return { ok: false };
    }
    return { ok: true, keyId, payload: payload as LicensePayload, payloadBytes, signature };
  } catch {
    return { ok: false };
  }
}

function loadPublicKey(keyId: string, keys: Readonly<Record<string, string>>): KeyObject | null {
  const pem = keys[keyId];
  if (!pem) return null;
  try {
    return createPublicKey(pem);
  } catch {
    return null;
  }
}

/**
 * Signature validity only. Use `deriveLicenseInfo` for the full picture.
 * `keys` defaults to the embedded production set — tests pass their own
 * freshly generated pair instead of depending on a real key living anywhere.
 */
export function verifyLicense(
  token: string,
  keys: Readonly<Record<string, string>> = LICENSE_PUBLIC_KEYS,
): { status: LicenseStatus; payload: LicensePayload | null } {
  const parsed = parseLicense(token);
  if (!parsed.ok) return { status: "malformed", payload: null };

  const publicKey = loadPublicKey(parsed.keyId, keys);
  if (!publicKey) return { status: "invalid_signature", payload: null };

  // Ed25519 signs the message directly — no digest algorithm to name.
  const valid = cryptoVerify(null, parsed.payloadBytes, publicKey, parsed.signature);
  if (!valid) return { status: "invalid_signature", payload: null };

  return { status: "valid", payload: parsed.payload };
}

/**
 * The status plus everything the UI needs, derived without ever blocking on
 * it. `localInstallationId` is the caller's own machine id (from
 * `lib/license/installation.ts`, which touches the filesystem — kept out of
 * this module so it stays pure) — pass it to get `installationMatches`;
 * omit it and that field is always `null`, same as an unbound license.
 */
export function deriveLicenseInfo(
  token: string | undefined,
  localInstallationId?: string,
  keys: Readonly<Record<string, string>> = LICENSE_PUBLIC_KEYS,
): LicenseInfo {
  if (!token || token.trim().length === 0) {
    return {
      status: "missing",
      payload: null,
      maintenanceActive: false,
      daysUntilMaintenanceEnds: null,
      installationMatches: null,
    };
  }

  const { status, payload } = verifyLicense(token, keys);
  if (status !== "valid" || !payload) {
    return {
      status,
      payload: null,
      maintenanceActive: false,
      daysUntilMaintenanceEnds: null,
      installationMatches: null,
    };
  }

  const maintenanceEndsMs = Date.parse(payload.maintenanceUntil);
  const daysUntilMaintenanceEnds = Number.isFinite(maintenanceEndsMs)
    ? Math.ceil((maintenanceEndsMs - Date.now()) / MS_PER_DAY)
    : null;
  const maintenanceActive = daysUntilMaintenanceEnds !== null && daysUntilMaintenanceEnds > 0;

  const installationMatches =
    !payload.installationId || !localInstallationId ? null : payload.installationId === localInstallationId;

  return { status: "valid", payload, maintenanceActive, daysUntilMaintenanceEnds, installationMatches };
}

/**
 * Signs a payload into a license token. Only ever called with a private key
 * that lives outside this repository — see scripts/license/issue-license.mjs.
 * Exported so the issuer script and its tests share one implementation of
 * the token format instead of two.
 */
export function signLicense(payload: LicensePayload, keyId: string, privateKeyPem: string): string {
  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf-8");
  const privateKey: KeyObject = createPrivateKey(privateKeyPem);
  const signature = cryptoSign(null, payloadBytes, privateKey);
  return `${keyId}.${base64urlEncode(payloadBytes)}.${base64urlEncode(signature)}`;
}
