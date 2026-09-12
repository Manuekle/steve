import { describe, expect, it, vi } from "vitest";
import { MetaApiError } from "./meta-ads";
import {
  exchangeEmbeddedSignupCode,
  getWabaPhoneNumber,
  listWabaPhoneNumbers,
  registerWabaPhoneNumber,
  subscribeAppToWaba,
} from "./meta-whatsapp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("exchangeEmbeddedSignupCode", () => {
  it("trades the code for a token without leaking the secret into the URL path", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ access_token: "tok", token_type: "bearer" }));
    const result = await exchangeEmbeddedSignupCode(
      { appId: "app", appSecret: "secret", code: "signup-code" },
      fetchFn as unknown as typeof fetch,
    );
    expect(result.accessToken).toBe("tok");
    const url = String(fetchFn.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("/oauth/access_token");
    expect(url).toContain("code=signup-code");
    expect(url).not.toContain("/secret");
  });

  it("rejects an empty code before any network call", async () => {
    const fetchFn = vi.fn();
    await expect(
      exchangeEmbeddedSignupCode(
        { appId: "app", appSecret: "secret", code: "  " },
        fetchFn as unknown as typeof fetch,
      ),
    ).rejects.toThrow("code is required");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("surfaces Meta's refusal as a MetaApiError", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: { message: "Invalid code", code: 100 } }, 400),
    );
    const error = await exchangeEmbeddedSignupCode(
      { appId: "app", appSecret: "secret", code: "bad" },
      fetchFn as unknown as typeof fetch,
    ).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(MetaApiError);
    expect((error as MetaApiError).message).toBe("Invalid code");
  });

  it("fails when Meta answers without a token", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ token_type: "bearer" }));
    await expect(
      exchangeEmbeddedSignupCode(
        { appId: "app", appSecret: "secret", code: "code" },
        fetchFn as unknown as typeof fetch,
      ),
    ).rejects.toThrow("no access token");
  });
});

describe("waba lookups", () => {
  it("lists phone numbers on the WABA", async () => {
    const numbers = [
      { id: "111", display_phone_number: "+5491100000001", verified_name: "Acme" },
    ];
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ data: numbers }));
    const result = await listWabaPhoneNumbers(
      { accessToken: "tok", wabaId: "waba" },
      fetchFn as unknown as typeof fetch,
    );
    expect(result).toEqual(numbers);
    expect(String(fetchFn.mock.calls[0]?.[0] ?? "")).toContain("waba/phone_numbers");
  });

  it("fetches a single number for verification", async () => {
    const number = { id: "111", display_phone_number: "+5491100000001", verified_name: "Acme" };
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(number));
    const result = await getWabaPhoneNumber(
      { accessToken: "tok", phoneNumberId: "111" },
      fetchFn as unknown as typeof fetch,
    );
    expect(result.id).toBe("111");
  });

  it("subscribes the app with a POST and no body", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ success: true }));
    await subscribeAppToWaba(
      { accessToken: "tok", wabaId: "waba" },
      fetchFn as unknown as typeof fetch,
    );
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("registers a number with the PIN form-encoded", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ success: true }));
    await registerWabaPhoneNumber(
      { accessToken: "tok", phoneNumberId: "111", pin: "123456" },
      fetchFn as unknown as typeof fetch,
    );
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("pin=123456");
    expect(String(init.body)).toContain("messaging_product=whatsapp");
  });
});
