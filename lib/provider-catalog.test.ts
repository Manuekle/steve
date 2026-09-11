import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const credentials = vi.hoisted(() => ({ key: "test-key" }));
vi.mock("./credentials", () => ({
  warmCredentialCache: async () => {},
  getCredentialSync: () => credentials.key,
}));
vi.mock("./ai-provider", () => ({ resolveProvider: () => "openai" }));
vi.mock("./model-access", () => ({
  readAccess: async () => ({ restricted: {} }),
  writeAccess: async () => {},
}));

import { getProviderReport, invalidateProviderReports } from "./provider-catalog";

const response = (id = "gpt-5-mini") => Response.json({ data: [{ id }] });

beforeEach(() => {
  invalidateProviderReports();
  credentials.key = "test-key";
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("provider catalog latency and cache", () => {
  it("shares one request among simultaneous consumers", async () => {
    const fetcher = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetcher);
    const reports = await Promise.all(Array.from({ length: 20 }, () => getProviderReport()));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(reports.every((report) => report.status === "ok")).toBe(true);
  });

  it("does not serve the previous credential's report after key rotation", async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => response());
    vi.stubGlobal("fetch", fetcher);
    await getProviderReport();
    credentials.key = "rotated-key";
    await getProviderReport();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ headers: { Authorization: "Bearer rotated-key" } });
  });

  it("does not let an invalidated in-flight request overwrite a newer report", async () => {
    let finishOld!: (response: Response) => void;
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finishOld = resolve; }))
      .mockResolvedValue(response("gpt-new"));
    vi.stubGlobal("fetch", fetcher);
    const old = getProviderReport();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    invalidateProviderReports("openai");
    expect((await getProviderReport()).models[0].id).toBe("gpt-new");
    finishOld(response("gpt-old"));
    await old;
    expect((await getProviderReport()).models[0].id).toBe("gpt-new");
  });

  it("settles an unresponsive provider after five seconds", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), ms);
      return controller.signal;
    });
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    const report = getProviderReport();
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await report).status).toBe("unreachable");
  });

  it("fetches gateway catalog and balance concurrently", async () => {
    let finishModels!: (response: Response) => void;
    const fetcher = vi.fn((url: string) => url.endsWith("/models")
      ? new Promise<Response>((resolve) => { finishModels = resolve; })
      : Promise.resolve(Response.json({ balance: 10 })));
    vi.stubGlobal("fetch", fetcher);
    const report = getProviderReport("gateway");
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
    const requestsBeforeModelsComplete = fetcher.mock.calls.length;
    finishModels(response("openai/gpt-5-mini"));
    await report;
    expect(requestsBeforeModelsComplete).toBe(2);
  });

  it("takes only the slower of the two gateway reads", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", (url: string) => new Promise<Response>((resolve) => {
      const models = url.endsWith("/models");
      setTimeout(() => resolve(models ? response("openai/gpt-5-mini") : Response.json({ balance: 10 })), models ? 400 : 600);
    }));
    const started = Date.now();
    const result = getProviderReport("gateway");
    await vi.advanceTimersByTimeAsync(600);
    expect((await result).balanceUsd).toBe(10);
    expect(Date.now() - started).toBe(600);
  });

  it("keeps the model catalog usable when the balance endpoint is down", async () => {
    vi.stubGlobal("fetch", (url: string) => url.endsWith("/models")
      ? Promise.resolve(response("openai/gpt-5-mini"))
      : Promise.reject(new TypeError("fetch failed")));
    const result = await getProviderReport("gateway");
    expect(result.models).toHaveLength(1);
    expect(result.billingChecked).toBe(false);
  });

  it("refreshes after expiry and keeps explicit billing probes separate", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetcher);
    await getProviderReport();
    await getProviderReport();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_001);
    await getProviderReport();
    expect(fetcher).toHaveBeenCalledTimes(2);
    await getProviderReport("openai", { probe: true });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
