import { getCredential } from "./credentials";

// Live web search via Tavily — a search API built for LLM agents: it returns
// pre-extracted JSON passages instead of raw HTML, so there is no page to
// parse and no arbitrary URL for the model to choose (unlike http_request,
// which is allowlist-gated because it fetches whatever URL it's given, this
// hits one fixed, known host with a query string — no SSRF surface).
//
// eve's own `web_search` tool is disabled (see agent/tools/web_search.ts) for
// an unrelated provider-schema bug; this is a separate, working path.

const SEARCH_URL = "https://api.tavily.com/search";
const SEARCH_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 5;
/** Enough for the model to work with, short of a full page dump. */
const MAX_CONTENT_CHARS = 2000;

export type WebSearchResult = {
  readonly title: string;
  readonly url: string;
  readonly content: string;
};

/**
 * Search the live web. Returns an empty array — never throws — when no key
 * is configured or the request fails, so a caller composing a richer answer
 * from multiple sources degrades to whatever else it has instead of failing
 * the whole turn.
 */
export async function searchWeb(query: string): Promise<readonly WebSearchResult[]> {
  const apiKey = await getCredential("TAVILY_API_KEY");
  if (!apiKey) return [];

  try {
    const response = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: MAX_RESULTS,
      }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      results?: ReadonlyArray<{ title?: unknown; url?: unknown; content?: unknown }>;
    };
    return (data.results ?? [])
      .filter(
        (r): r is { title: string; url: string; content: string } =>
          typeof r.title === "string" && typeof r.url === "string" && typeof r.content === "string",
      )
      .map((r) => ({ title: r.title, url: r.url, content: r.content.slice(0, MAX_CONTENT_CHARS) }));
  } catch {
    return [];
  }
}
