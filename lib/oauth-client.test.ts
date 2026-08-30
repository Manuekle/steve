import { describe, expect, it } from "vitest";
import { OAUTH_CONNECTIONS, getConnectionDefinition } from "./connections";
import { buildAuthorizeUrl, challengeFor, createVerifier, redirectUriFor } from "./oauth-client";

const ORIGIN = "https://steve.example";

describe("buildAuthorizeUrl", () => {
  it("sends Google offline so a refresh token comes back", () => {
    const definition = getConnectionDefinition("google");
    const verifier = createVerifier();
    const url = new URL(
      buildAuthorizeUrl({
        definition,
        clientId: "client-123",
        redirectUri: redirectUriFor(ORIGIN, "google"),
        state: "state-abc",
        codeChallenge: challengeFor(verifier),
      }),
    );

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://steve.example/api/connections/google/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-abc");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/calendar");
  });

  it("joins Slack's scopes with commas, not spaces", () => {
    const url = new URL(
      buildAuthorizeUrl({
        definition: getConnectionDefinition("slack"),
        clientId: "c",
        redirectUri: redirectUriFor(ORIGIN, "slack"),
        state: "s",
      }),
    );
    expect(url.searchParams.get("scope")).toBe("chat:write,channels:read,chat:write.public");
  });

  it("omits the PKCE challenge for providers that don't use it", () => {
    const url = new URL(
      buildAuthorizeUrl({
        definition: getConnectionDefinition("hubspot"),
        clientId: "c",
        redirectUri: redirectUriFor(ORIGIN, "hubspot"),
        state: "s",
        codeChallenge: "ignored",
      }),
    );
    expect(url.searchParams.get("code_challenge")).toBeNull();
  });

  it("carries a challenge for every provider that requires PKCE", () => {
    for (const definition of OAUTH_CONNECTIONS.filter((c) => c.oauth.pkce)) {
      const url = new URL(
        buildAuthorizeUrl({
          definition,
          clientId: "c",
          redirectUri: redirectUriFor(ORIGIN, definition.id),
          state: "s",
          codeChallenge: challengeFor(createVerifier()),
        }),
      );
      expect(url.searchParams.get("code_challenge"), definition.id).toBeTruthy();
    }
  });
});

describe("challengeFor", () => {
  it("is the URL-safe SHA-256 of the verifier, and stable for it", () => {
    const verifier = createVerifier();
    expect(challengeFor(verifier)).toBe(challengeFor(verifier));
    expect(challengeFor(verifier)).not.toMatch(/[+/=]/);
    expect(challengeFor(createVerifier())).not.toBe(challengeFor(verifier));
  });
});
