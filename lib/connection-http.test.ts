import { describe, expect, it } from "vitest";
import { connectionForHost } from "./connection-http";

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
