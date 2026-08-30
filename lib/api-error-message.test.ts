import { describe, expect, it } from "vitest";
import {
  networkUiError,
  readApiError,
  translateApiError,
  uiErrorMessage,
} from "./api-error-message";
import { dictionaries } from "./i18n/dictionaries";

const t = (key: string, params?: Record<string, string | number>) => {
  const template = dictionaries.es[key];
  if (!template) return key;
  return params
    ? Object.entries(params).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), template)
    : template;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("readApiError", () => {
  it("translates the server's code", async () => {
    const info = await readApiError(json({ code: "not_found", error: "That item…" }, 404), t);
    expect(info.code).toBe("not_found");
    expect(info.message).toBe(dictionaries.es["apiError.not_found"]);
  });

  it("fills the field name into the sentence", async () => {
    const info = await readApiError(
      json({ code: "missing_field", field: "prompt" }, 400),
      t,
    );
    expect(info.message).toContain("prompt");
  });

  it("falls back to the status when the body carries no code", async () => {
    // A proxy or a crashed route answers with HTML, or with nothing at all.
    const html = new Response("<html>502 Bad Gateway</html>", { status: 502 });
    const info = await readApiError(html, t);
    expect(info.code).toBe("upstream_failed");
    expect(info.message).toBe(dictionaries.es["apiError.upstream_failed"]);
  });

  it("says something useful for an empty body", async () => {
    const info = await readApiError(new Response(null, { status: 500 }), t);
    expect(info.code).toBe("server_error");
    expect(info.message).toBe(dictionaries.es["apiError.server_error"]);
  });

  it("keeps the server's English wording as detail, never as the message", async () => {
    const info = await readApiError(
      json({ code: "upstream_failed", error: "Meta API 400: bad token" }, 502),
      t,
    );
    expect(info.detail).toBe("Meta API 400: bad token");
    expect(info.message).not.toContain("Meta API");
  });

  it("treats a redirect the browser could not follow as a missing page", async () => {
    const info = await readApiError(new Response(null, { status: 302 }), t);
    expect(info.code).toBe("not_found");
  });
});

describe("translateApiError", () => {
  it("falls back to the generic line for a code it does not know", () => {
    expect(translateApiError(t, "something_new")).toBe(dictionaries.es["apiError.unknown"]);
  });
});

describe("uiErrorMessage", () => {
  const en = (key: string) => dictionaries.en[key] ?? key;

  it("re-translates the same failure into whichever language is active", async () => {
    // The point of holding a code instead of a sentence: switching language
    // has to change what an error already on screen says.
    const info = await readApiError(json({ code: "rate_limited" }, 429), t);
    expect(uiErrorMessage(t, info)).toBe(dictionaries.es["apiError.rate_limited"]);
    expect(uiErrorMessage(en, info)).toBe(dictionaries.en["apiError.rate_limited"]);
  });

  it("resolves a local failure through its dictionary key", () => {
    const local = { messageKey: "knowledge.loadFailed" } as const;
    expect(uiErrorMessage(t, local)).toBe(dictionaries.es["knowledge.loadFailed"]);
    expect(uiErrorMessage(en, local)).toBe(dictionaries.en["knowledge.loadFailed"]);
  });
});

describe("networkUiError", () => {
  it("separates a timeout from being offline from a plain failure", () => {
    const aborted = new DOMException("aborted", "AbortError");
    expect(networkUiError(aborted)).toEqual({ messageKey: "apiError.timeout" });
    expect(networkUiError(new TypeError("Failed to fetch"))).toEqual({
      messageKey: "apiError.network",
    });
  });
});
