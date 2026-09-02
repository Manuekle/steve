import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectionForHost } from "./connection-http";

const getCredential = vi.fn();
const getStoredConnection = vi.fn();
const getConnectionAccessToken = vi.fn();

vi.mock("./credentials", () => ({
  getCredential: (...args: unknown[]) => getCredential(...(args as [])),
}));
vi.mock("./connection-store", () => ({
  getStoredConnection: (...args: unknown[]) => getStoredConnection(...(args as [])),
  getConnectionAccessToken: (...args: unknown[]) => getConnectionAccessToken(...(args as [])),
}));

/** Only these keys are set; every other credential reads as unconfigured. */
function credentials(values: Record<string, string>): void {
  getCredential.mockImplementation(async (key: string) => values[key]);
}

function decodeBasic(header: string): string {
  return Buffer.from(header.replace(/^Basic /, ""), "base64").toString();
}

beforeEach(() => {
  getCredential.mockReset().mockResolvedValue(undefined);
  getStoredConnection.mockReset().mockResolvedValue(undefined);
  getConnectionAccessToken.mockReset().mockResolvedValue(undefined);
});

describe("connectionForHost", () => {
  it("matches a vendor's own API host", () => {
    expect(connectionForHost("api.hubapi.com")?.id).toBe("hubspot");
    expect(connectionForHost("slack.com")?.id).toBe("slack");
    expect(connectionForHost("api.notion.com")?.id).toBe("notion");
  });

  it("matches subdomains, which is how Google's APIs are addressed", () => {
    expect(connectionForHost("sheets.googleapis.com")?.id).toBe("google");
    expect(connectionForHost("gmail.googleapis.com")?.id).toBe("google");
  });

  it("is case-insensitive, since a host is", () => {
    expect(connectionForHost("API.HubAPI.com")?.id).toBe("hubspot");
  });

  // The one that matters: a token must never leave for a look-alike host a
  // prompt-injected agent picked, so the match is on domain boundaries and
  // never on a bare string suffix.
  it("refuses look-alike hosts", () => {
    for (const host of [
      "evil-slack.com",
      "slack.com.evil.example",
      "notapi.notion.com.attacker.test",
      "googleapis.com.evil.test",
    ]) {
      expect(connectionForHost(host)).toBeUndefined();
    }
  });

  it("returns nothing for an unrelated host", () => {
    expect(connectionForHost("hooks.zapier.com")).toBeUndefined();
  });

  it("carries Notion's required API version header", () => {
    expect(connectionForHost("api.notion.com")?.apiHeaders).toEqual({
      "Notion-Version": "2022-06-28",
    });
  });
});

// The gap these cover: a key pasted into Settings used to be stored and then
// ignored — `http_request` would neither reach the vendor's host nor carry the
// key, so the connection card promised something no code delivered.
describe("key-based vendors", () => {
  it("makes a configured Zendesk account's own host reachable", async () => {
    const { connectedApiHosts } = await import("./connection-http");
    credentials({
      ZENDESK_SUBDOMAIN: "acme",
      ZENDESK_EMAIL: "ops@acme.com",
      ZENDESK_API_TOKEN: "zt",
    });

    expect(await connectedApiHosts()).toContain("acme.zendesk.com");
  });

  it("authenticates Zendesk with the email/token Basic scheme", async () => {
    const { connectionAuthHeaders } = await import("./connection-http");
    credentials({
      ZENDESK_SUBDOMAIN: "acme",
      ZENDESK_EMAIL: "ops@acme.com",
      ZENDESK_API_TOKEN: "zt",
    });

    const headers = await connectionAuthHeaders("acme.zendesk.com");

    expect(decodeBasic(headers!.authorization)).toBe("ops@acme.com/token:zt");
  });

  it("authenticates Chargebee with the key as the username and no password", async () => {
    const { connectionAuthHeaders, connectedApiHosts } = await import("./connection-http");
    credentials({ CHARGEBEE_SITE: "acme", CHARGEBEE_API_KEY: "cb-key" });

    expect(await connectedApiHosts()).toContain("acme.chargebee.com");
    const headers = await connectionAuthHeaders("acme.chargebee.com");
    expect(decodeBasic(headers!.authorization)).toBe("cb-key:");
  });

  it("authenticates MailerLite with a bearer token on its fixed host", async () => {
    const { connectionAuthHeaders, connectedApiHosts } = await import("./connection-http");
    credentials({ MAILERLITE_API_KEY: "ml-key" });

    expect(await connectedApiHosts()).toContain("connect.mailerlite.com");
    expect(await connectionAuthHeaders("connect.mailerlite.com")).toEqual({
      authorization: "Bearer ml-key",
    });
  });

  it("accepts a pasted console URL where a subdomain was asked for", async () => {
    const { connectedApiHosts } = await import("./connection-http");
    credentials({
      ZENDESK_SUBDOMAIN: "https://acme.zendesk.com/agent/dashboard",
      ZENDESK_EMAIL: "ops@acme.com",
      ZENDESK_API_TOKEN: "zt",
    });

    expect(await connectedApiHosts()).toContain("acme.zendesk.com");
  });

  // A typo, or a link to somewhere else entirely, must not widen the
  // allowlist to a host the operator never named.
  it("refuses a value that is not in the vendor's own domain", async () => {
    const { connectedApiHosts } = await import("./connection-http");
    credentials({
      ZENDESK_SUBDOMAIN: "https://attacker.test/acme.zendesk.com",
      ZENDESK_EMAIL: "ops@acme.com",
      ZENDESK_API_TOKEN: "zt",
    });

    expect(await connectedApiHosts()).toEqual([]);
  });

  it("stays unreachable while a vendor is only half configured", async () => {
    const { connectedApiHosts, connectionAuthHeaders } = await import("./connection-http");
    credentials({ ZENDESK_SUBDOMAIN: "acme", ZENDESK_EMAIL: "ops@acme.com" });

    expect(await connectedApiHosts()).toEqual([]);
    expect(await connectionAuthHeaders("acme.zendesk.com")).toBeNull();
  });

  it("attaches nothing to an unrelated host", async () => {
    const { connectionAuthHeaders } = await import("./connection-http");
    credentials({ MAILERLITE_API_KEY: "ml-key" });

    expect(await connectionAuthHeaders("hooks.zapier.com")).toBeNull();
  });

  // The same domain-boundary rule the OAuth hosts get: a look-alike host must
  // never collect the account's credential.
  it("refuses a look-alike of a configured host", async () => {
    const { connectionAuthHeaders } = await import("./connection-http");
    credentials({ MAILERLITE_API_KEY: "ml-key" });

    expect(await connectionAuthHeaders("evil-connect.mailerlite.com.attacker.test")).toBeNull();
  });
});
