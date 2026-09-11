import { describe, expect, it } from "vitest";
import { aiGenerationErrorCode } from "./ai-generation-error";

describe("AI failure classification", () => {
  it.each([
    [new DOMException("Timed out", "TimeoutError"), "timeout"],
    [new DOMException("Aborted", "AbortError"), "timeout"],
    [{ statusCode: 401 }, "no_credentials"],
    [{ statusCode: 403 }, "model_unavailable"],
    [{ statusCode: 404 }, "model_unavailable"],
    [{ statusCode: 429 }, "rate_limited"],
    [{ statusCode: 503 }, "upstream_failed"],
    [{ lastError: { statusCode: 429 } }, "rate_limited"],
    [{ cause: new DOMException("Timed out", "TimeoutError") }, "timeout"],
    [new Error("Response did not match schema"), "generation_failed"],
  ])("classifies %j as %s", (error, code) => expect(aiGenerationErrorCode(error)).toBe(code));
});
