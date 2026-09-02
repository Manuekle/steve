import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCredential = vi.fn();

vi.mock("./credentials", () => ({
  getCredential: (...args: unknown[]) => getCredential(...(args as [])),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  getCredential.mockReset().mockResolvedValue("tvly-key");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function json(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
}

describe("searchWeb", () => {
  it("returns the provider's results, keyed to the fields the agent reads", async () => {
    const { searchWeb } = await import("./web-search");
    fetchMock.mockResolvedValue(
      json({ results: [{ title: "Acme", url: "https://acme.com", content: "Acme sells things." }] }),
    );

    const results = await searchWeb("Acme Corp");

    expect(results).toEqual([
      { title: "Acme", url: "https://acme.com", content: "Acme sells things." },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.tavily.com/search");
    expect(JSON.parse(init.body as string).query).toBe("Acme Corp");
  });

  it("sends the key as a bearer token and never in the query", async () => {
    const { searchWeb } = await import("./web-search");
    fetchMock.mockResolvedValue(json({ results: [] }));

    await searchWeb("Acme Corp");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("tvly-key");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tvly-key");
  });

  it("caps a long passage instead of handing the model a whole page", async () => {
    const { searchWeb } = await import("./web-search");
    fetchMock.mockResolvedValue(
      json({ results: [{ title: "t", url: "https://x.test", content: "x".repeat(5000) }] }),
    );

    const [result] = await searchWeb("q");

    expect(result.content).toHaveLength(2000);
  });

  it("drops a malformed result rather than passing partial rows through", async () => {
    const { searchWeb } = await import("./web-search");
    fetchMock.mockResolvedValue(
      json({
        results: [
          { title: "ok", url: "https://x.test", content: "fine" },
          { title: "no url", content: "missing" },
        ],
      }),
    );

    expect(await searchWeb("q")).toHaveLength(1);
  });

  // Every failure is the same answer — an empty list — because a caller
  // composing an answer from several sources should degrade, not fail.
  it("returns nothing, and calls nothing, when no key is configured", async () => {
    const { searchWeb } = await import("./web-search");
    getCredential.mockResolvedValue(undefined);

    expect(await searchWeb("q")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns nothing when the provider answers with an error status", async () => {
    const { searchWeb } = await import("./web-search");
    fetchMock.mockResolvedValue(json({ error: "quota" }, false));

    expect(await searchWeb("q")).toEqual([]);
  });

  it("returns nothing when the request throws", async () => {
    const { searchWeb } = await import("./web-search");
    fetchMock.mockRejectedValue(new Error("timeout"));

    expect(await searchWeb("q")).toEqual([]);
  });
});
