import { beforeEach, describe, expect, it, vi } from "vitest";

const generateObject = vi.fn();
const getProviderReport = vi.fn();
const languageModelForTask = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => generateObject(...(args as [])),
}));
vi.mock("./provider-catalog", () => ({
  getProviderReport: (...args: unknown[]) => getProviderReport(...(args as [])),
}));
vi.mock("./task-model", () => ({
  languageModelForTask: (...args: unknown[]) => languageModelForTask(...(args as [])),
}));

const web = [{ title: "Acme", url: "https://acme.com", content: "Acme has 200 employees." }];

beforeEach(() => {
  generateObject.mockReset().mockResolvedValue({
    object: { summary: " Runs a mid-size shop. ", companyName: " Acme ", signals: [" 200 employees ", ""] },
  });
  getProviderReport.mockReset().mockResolvedValue({ status: "ok" });
  languageModelForTask.mockReset().mockResolvedValue("model");
});

describe("researchLead", () => {
  it("synthesizes a dossier and records the web sources it used", async () => {
    const { researchLead } = await import("./lead-research");

    const result = await researchLead({ name: "Ana", knowledge: [], webResults: web });

    expect(result).toMatchObject({
      summary: "Runs a mid-size shop.",
      companyName: "Acme",
      signals: ["200 employees"],
      sources: ["https://acme.com"],
    });
    expect(Date.parse(result!.researchedAt)).not.toBeNaN();
  });

  it("passes both the knowledge base and the web results to the model", async () => {
    const { researchLead } = await import("./lead-research");

    await researchLead({ name: "Ana", knowledge: ["Precio base $100"], webResults: web });

    const prompt = generateObject.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("Precio base $100");
    expect(prompt).toContain("Acme has 200 employees.");
  });

  it("returns null when there is no material at all, without calling the model", async () => {
    const { researchLead } = await import("./lead-research");

    expect(await researchLead({ name: "Ana", knowledge: [], webResults: [] })).toBeNull();
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("treats whitespace-only material as no material", async () => {
    const { researchLead } = await import("./lead-research");

    const result = await researchLead({
      knowledge: ["   "],
      webResults: [{ title: "t", url: "https://x.test", content: "  " }],
    });

    expect(result).toBeNull();
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("returns null when the model provider is not configured", async () => {
    const { researchLead } = await import("./lead-research");
    getProviderReport.mockResolvedValue({ status: "missing" });

    expect(await researchLead({ knowledge: ["algo"], webResults: [] })).toBeNull();
    expect(generateObject).not.toHaveBeenCalled();
  });

  // Same contract as assessProspect: a provider failure must not take the
  // conversation down with it.
  it("returns null instead of throwing when the model call fails", async () => {
    const { researchLead } = await import("./lead-research");
    generateObject.mockRejectedValue(new Error("429 rate limited"));

    expect(await researchLead({ knowledge: ["algo"], webResults: [] })).toBeNull();
  });

  it("drops an empty company name rather than storing a blank field", async () => {
    const { researchLead } = await import("./lead-research");
    generateObject.mockResolvedValue({
      object: { summary: "Poco material.", companyName: "  ", signals: [] },
    });

    const result = await researchLead({ notes: "Escribió por Instagram", knowledge: [], webResults: [] });

    expect(result?.companyName).toBeUndefined();
    expect(result?.signals).toEqual([]);
  });
});
