import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ warm: false, billing: vi.fn(), record: vi.fn() }));
vi.mock("./credentials", () => ({
  warmCredentialCache: async () => { state.warm = true; },
  getCredentialSync: (key: string) => state.warm ? ({ AI_PROVIDER: "openai", OPENAI_API_KEY: "test-key" } as Record<string, string>)[key] : undefined,
}));
vi.mock("./model-access", () => ({ readAccess: async () => ({ restricted: {} }), writeAccess: vi.fn() }));
vi.mock("./credit-gate", () => ({ billingSourceForProvider: state.billing, checkCreditGate: async () => ({ allowed: true }) }));
vi.mock("./ai-usage", () => ({ recordUsage: state.record }));
vi.mock("./license/installation", () => ({ getInstallationId: async () => "test" }));
vi.mock("./rate-limit", () => ({ rateLimit: () => ({ allowed: true }) }));

const { modelIdForTask } = await import("./task-model");
const { getProviderReport, invalidateProviderReports } = await import("./provider-catalog");
const { guardAiRoute } = await import("./ai-route-guard");

beforeEach(() => {
  state.warm = false;
  state.billing.mockReset().mockResolvedValue("BYOK");
  invalidateProviderReports();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    expect(url).toBe("https://api.openai.com/v1/models");
    return Response.json({ data: [{ id: "gpt-5", object: "model" }] });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("cold database-backed AI configuration", () => {
  it("selects the provider only after loading stored credentials", async () => {
    expect(await modelIdForTask("automation")).toBe("gpt-5");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("checks the stored provider rather than reporting Gateway missing", async () => {
    expect(await getProviderReport()).toMatchObject({ provider: "openai", status: "ok" });
  });
  it("checks billing for the same provider the generation will use", async () => {
    const request = new Request("http://localhost/api/assistant");
    await guardAiRoute(request as Parameters<typeof guardAiRoute>[0], "test");
    expect(state.billing).toHaveBeenCalledWith("openai");
  });
});
