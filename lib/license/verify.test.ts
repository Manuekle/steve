import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveLicenseInfo, parseLicense, signLicense, verifyLicense } from "./verify";
import type { LicensePayload } from "./types";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const KEY_ID = "test-key";
const KEYS = { [KEY_ID]: publicKey.export({ type: "spki", format: "pem" }).toString() };
const PRIVATE_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function makePayload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    licenseId: "lic-1",
    company: "Acme Ecommerce",
    customerEmail: "ops@acme.example",
    edition: "enterprise",
    deploymentType: "self-hosted",
    features: ["whatsapp", "instagram", "messenger", "agents"],
    issuedAt: "2026-01-01T00:00:00.000Z",
    maintenanceUntil: "2099-01-01T00:00:00.000Z",
    schemaVersion: 1,
    ...overrides,
  };
}

describe("license token roundtrip", () => {
  it("verifies a token signed with the matching key", () => {
    const token = signLicense(makePayload(), KEY_ID, PRIVATE_PEM);
    const result = verifyLicense(token, KEYS);
    expect(result.status).toBe("valid");
    expect(result.payload?.company).toBe("Acme Ecommerce");
  });

  it("rejects a token whose payload was tampered with after signing", () => {
    const token = signLicense(makePayload(), KEY_ID, PRIVATE_PEM);
    const [keyId, , signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify(makePayload({ company: "Not Acme" })),
      "utf-8",
    ).toString("base64url");
    const tampered = `${keyId}.${tamperedPayload}.${signature}`;
    expect(verifyLicense(tampered, KEYS).status).toBe("invalid_signature");
  });

  it("rejects a token signed with a key the verifier doesn't hold", () => {
    const token = signLicense(makePayload(), "some-other-key", PRIVATE_PEM);
    expect(verifyLicense(token, KEYS).status).toBe("invalid_signature");
  });

  it("treats a malformed token as malformed, not invalid", () => {
    expect(parseLicense("not-a-token").ok).toBe(false);
    expect(verifyLicense("not-a-token", KEYS).status).toBe("malformed");
    expect(verifyLicense("a.b", KEYS).status).toBe("malformed");
  });
});

describe("deriveLicenseInfo", () => {
  it("reports missing when there is no token", () => {
    expect(deriveLicenseInfo(undefined, undefined, KEYS).status).toBe("missing");
    expect(deriveLicenseInfo("", undefined, KEYS).status).toBe("missing");
  });

  it("stays valid and keeps running past maintenanceUntil — expiry never blocks usage", () => {
    const token = signLicense(
      makePayload({ maintenanceUntil: "2020-01-01T00:00:00.000Z" }),
      KEY_ID,
      PRIVATE_PEM,
    );
    const info = deriveLicenseInfo(token, undefined, KEYS);
    expect(info.status).toBe("valid");
    expect(info.payload).not.toBeNull();
    expect(info.maintenanceActive).toBe(false);
    expect(info.daysUntilMaintenanceEnds).toBeLessThan(0);
  });

  it("reports maintenance active while the date is still ahead", () => {
    const farFuture = new Date(Date.now() + 200 * 86_400_000).toISOString();
    const token = signLicense(makePayload({ maintenanceUntil: farFuture }), KEY_ID, PRIVATE_PEM);
    const info = deriveLicenseInfo(token, undefined, KEYS);
    expect(info.maintenanceActive).toBe(true);
    expect(info.daysUntilMaintenanceEnds).toBeGreaterThan(190);
  });
});

describe("installation binding", () => {
  it("reports installationMatches: null for a license with no installationId — unbound, not mismatched", () => {
    const token = signLicense(makePayload(), KEY_ID, PRIVATE_PEM);
    expect(deriveLicenseInfo(token, "this-machine", KEYS).installationMatches).toBeNull();
    // Also null when the caller has no local id to compare against.
    expect(deriveLicenseInfo(token, undefined, KEYS).installationMatches).toBeNull();
  });

  it("reports installationMatches: true when the ids agree", () => {
    const token = signLicense(makePayload({ installationId: "machine-a" }), KEY_ID, PRIVATE_PEM);
    const info = deriveLicenseInfo(token, "machine-a", KEYS);
    expect(info.status).toBe("valid");
    expect(info.installationMatches).toBe(true);
  });

  it("reports installationMatches: false without changing status or blocking anything", () => {
    const token = signLicense(makePayload({ installationId: "machine-a" }), KEY_ID, PRIVATE_PEM);
    const info = deriveLicenseInfo(token, "machine-b", KEYS);
    expect(info.status).toBe("valid");
    expect(info.payload).not.toBeNull();
    expect(info.installationMatches).toBe(false);
  });
});
