import { apiError, type ApiErrorCode } from "./api-error";

/** Keep provider failures actionable without exposing provider payloads or keys. */
export function aiGenerationErrorCode(error: unknown): ApiErrorCode {
  let current = error;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth++) {
    const value = current as { name?: string; statusCode?: number; cause?: unknown; lastError?: unknown };
    if (value.name === "TimeoutError" || value.name === "AbortError" || value.statusCode === 408 || value.statusCode === 504) return "timeout";
    if (value.statusCode === 401) return "no_credentials";
    if (value.statusCode === 403 || value.statusCode === 404) return "model_unavailable";
    if (value.statusCode === 429) return "rate_limited";
    if (value.statusCode && value.statusCode >= 500) return "upstream_failed";
    current = value.lastError ?? value.cause;
  }
  return "generation_failed";
}

export function aiGenerationFailure(error: unknown, feature: string): Response {
  const code = aiGenerationErrorCode(error);
  // Never log request bodies or the SDK error object: they may contain secrets.
  console.error(`[${feature}] ${code}`, { name: error instanceof Error ? error.name : "UnknownError" });
  return apiError(code, process.env.NODE_ENV === "production" ? {} : {
    detail: error instanceof Error ? error.message : String(error),
  });
}
