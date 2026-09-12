import { describe, expect, it, vi } from "vitest";
import { MetaApiError } from "./meta-ads";
import {
  buildBusinessLoginUrl,
  exchangeForLongLivedToken,
  exchangeIgCode,
  getIgAccount,
  refreshLongLivedToken,
  subscribeIgApp,
} from "./meta-instagram";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("buildBusinessLoginUrl", () => {
  it("points at instagram authorize with the messaging scopes", () => {
    const url = new URL(
      buildBusinessLoginUrl({
        igAppId: "ig-app",
        redirectUri: "https://app.example/api/callback",
        state: "state-123",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("ig-app");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toContain("instagram_business_manage_messages");
    expect(url.searchParams.get("state")).toBe("state-123");
  });
});

describe("exchangeIgCode", () => {
  it("posts the code form-encoded and reads the short token", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ access_token: "short", user_id: 123, permissions: "instagram_business_basic" }),
    );
    const result = await exchangeIgCode(
      {
        igAppId: "ig-app",
        igSecret: "secret",
        redirectUri: "https://app.example/api/callback",
        code: "auth-code",
      },
      fetchFn as unknown as typeof fetch,
    );
    expect(result).toEqual({
      accessToken: "short",
      userId: "123",
      permissions: "instagram_business_basic",
    });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.instagram.com/oauth/access_token");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("grant_type=authorization_code");
    // The secret rides in the POST body, never in the URL.
    expect(url).not.toContain("secret");
  });

  it("rejects an empty code before any network call", async () => {
    const fetchFn = vi.fn();
    await expect(
      exchangeIgCode(
        { igAppId: "a", igSecret: "s", redirectUri: "https://x", code: "  " },
        fetchFn as unknown as typeof fetch,
      ),
    ).rejects.toThrow("code is required");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("surfaces Meta's refusal as a MetaApiError", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ error: { message: "Invalid code", code: 100 } }, 400),
    );
    const error = await exchangeIgCode(
      { igAppId: "a", igSecret: "s", redirectUri: "https://x", code: "bad" },
      fetchFn as unknown as typeof fetch,
    ).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(MetaApiError);
  });
});

describe("long-lived tokens", () => {
  it("exchanges a short token with ig_exchange_token", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ access_token: "long", expires_in: 5183944 }),
    );
    const result = await exchangeForLongLivedToken(
      { igSecret: "secret", shortToken: "short" },
      fetchFn as unknown as typeof fetch,
    );
    expect(result.accessToken).toBe("long");
    expect(result.expiresIn).toBe(5183944);
    expect(String(fetchFn.mock.calls[0]?.[0] ?? "")).toContain("grant_type=ig_exchange_token");
  });

  it("refreshes with ig_refresh_token", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ access_token: "refreshed", expires_in: 5183944 }),
    );
    const result = await refreshLongLivedToken(
      { longToken: "old-long" },
      fetchFn as unknown as typeof fetch,
    );
    expect(result.accessToken).toBe("refreshed");
    expect(String(fetchFn.mock.calls[0]?.[0] ?? "")).toContain("grant_type=ig_refresh_token");
  });
});

describe("account and subscription", () => {
  it("resolves the professional account id and username", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ id: "987", username: "acme" }));
    const result = await getIgAccount(
      { accessToken: "long" },
      fetchFn as unknown as typeof fetch,
    );
    expect(result).toEqual({ id: "987", username: "acme" });
    expect(String(fetchFn.mock.calls[0]?.[0] ?? "")).toContain("/me?fields=id,username");
  });

  it("subscribes the account to the messaging fields", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ success: true }));
    await subscribeIgApp(
      { accessToken: "long" },
      fetchFn as unknown as typeof fetch,
    );
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/me/subscribed_apps");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("subscribed_fields=");
    expect(String(init.body)).toContain("messages");
  });
});
