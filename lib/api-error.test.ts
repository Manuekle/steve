import { describe, expect, it } from "vitest";
import { apiErrorBody, missingField } from "./api-error";
import { dictionaries } from "./i18n/dictionaries";

// Every code the server can send has to have a sentence in both languages —
// otherwise the UI silently falls back to the generic line and the person is
// told "something went wrong" for a problem the server named precisely.
const CODES = [
  "invalid_json",
  "invalid_body",
  "missing_field",
  "invalid_field",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "unprocessable",
  "too_large",
  "not_configured",
  "rate_limited",
  "upstream_failed",
  "timeout",
  "server_error",
  "method_not_allowed",
  "no_credentials",
  "model_unavailable",
  "generation_failed",
  "no_file",
  "unsupported_format",
  "nothing_to_update",
  "no_recognized_keys",
  "wrong_password",
] as const;

describe("apiErrorBody", () => {
  it("carries the code and a readable fallback under both keys", () => {
    const body = apiErrorBody("not_found");
    expect(body.code).toBe("not_found");
    // `error` is what pre-existing clients read; `message` is the new name.
    expect(body.error).toBe(body.message);
    expect(body.message.length).toBeGreaterThan(0);
  });

  it("keeps the thrown detail out of the sentence a person reads", () => {
    const body = apiErrorBody("upstream_failed", { detail: "ECONNREFUSED 10.0.0.1:443" });
    expect(body.detail).toBe("ECONNREFUSED 10.0.0.1:443");
    expect(body.message).not.toContain("ECONNREFUSED");
  });

  it("names the field it is complaining about", () => {
    const response = missingField("prompt");
    expect(response.status).toBe(400);
  });
});

describe("error dictionaries", () => {
  it("has both locales for every code", () => {
    for (const code of CODES) {
      const key = `apiError.${code}`;
      expect(dictionaries.es[key], `es is missing ${key}`).toBeTruthy();
      expect(dictionaries.en[key], `en is missing ${key}`).toBeTruthy();
    }
  });

  it("never leaves a raw status code in the copy", () => {
    for (const locale of ["es", "en"] as const) {
      for (const code of CODES) {
        expect(dictionaries[locale][`apiError.${code}`]).not.toMatch(/\b[3-5]\d\d\b/);
      }
    }
  });

  it("keeps the two locales in step", () => {
    // A key added to one language and forgotten in the other renders as the
    // raw key ("apiError.timeout") on screen.
    expect(Object.keys(dictionaries.es).sort()).toEqual(Object.keys(dictionaries.en).sort());
  });
});
