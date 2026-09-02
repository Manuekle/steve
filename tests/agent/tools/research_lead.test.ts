import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "eve/tools";

const searchWeb = vi.fn();
const searchKnowledge = vi.fn();
const researchLead = vi.fn();
const getContactBySession = vi.fn();
const setContactResearch = vi.fn();

vi.mock("../../../lib/web-search", () => ({
  searchWeb: (...args: unknown[]) => searchWeb(...(args as [])),
}));
vi.mock("../../../lib/rag", () => ({
  searchKnowledge: (...args: unknown[]) => searchKnowledge(...(args as [])),
}));
vi.mock("../../../lib/lead-research", () => ({
  researchLead: (...args: unknown[]) => researchLead(...(args as [])),
}));
vi.mock("../../../lib/business-store", () => ({
  getContactBySession: (...args: unknown[]) => getContactBySession(...(args as [])),
  setContactResearch: (...args: unknown[]) => setContactResearch(...(args as [])),
}));
vi.mock("../../../lib/agent-scope", () => ({
  assertToolAllowed: async () => undefined,
}));

const researchLeadTool = (await import("../../../agent/tools/research_lead")).default;

const fakeCtx = { session: { id: "test-session" } } as unknown as ToolContext;

const dossier = {
  summary: "Compra al por mayor.",
  companyName: "Acme",
  signals: ["200 empleados"],
  sources: ["https://acme.com"],
  researchedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  searchWeb.mockReset().mockResolvedValue([{ title: "Acme", url: "https://acme.com", content: "..." }]);
  searchKnowledge.mockReset().mockResolvedValue([{ text: "Precio mayorista" }]);
  researchLead.mockReset().mockResolvedValue(dossier);
  getContactBySession.mockReset().mockResolvedValue({ id: "c1", name: "Ana", notes: "Pidió precios" });
  setContactResearch.mockReset().mockResolvedValue(undefined);
});

describe("research_lead", () => {
  it("composes the knowledge base with the web and saves the dossier on the contact", async () => {
    const result = await researchLeadTool.execute({ query: "Acme Corp" }, fakeCtx);

    expect(researchLead).toHaveBeenCalledWith({
      name: "Ana",
      notes: "Pidió precios",
      knowledge: ["Precio mayorista"],
      webResults: [{ title: "Acme", url: "https://acme.com", content: "..." }],
    });
    expect(setContactResearch).toHaveBeenCalledWith("c1", dossier);
    expect(result).toMatchObject({ found: true, companyName: "Acme", signals: ["200 empleados"] });
  });

  // The internal and external lookups are independent, so one failing must
  // not cost the other — the dossier is still built from whatever came back.
  it("still researches when the knowledge base lookup fails", async () => {
    searchKnowledge.mockRejectedValue(new Error("no index"));

    const result = await researchLeadTool.execute({ query: "Acme Corp" }, fakeCtx);

    expect(researchLead.mock.calls[0][0].knowledge).toEqual([]);
    expect(result.found).toBe(true);
  });

  it("reports that nothing was found rather than saving an empty dossier", async () => {
    researchLead.mockResolvedValue(null);

    const result = await researchLeadTool.execute({ query: "Nadie" }, fakeCtx);

    expect(result).toEqual({ found: false, message: "Not enough material to research this lead yet." });
    expect(setContactResearch).not.toHaveBeenCalled();
  });

  it("returns the research even when there is no contact to save it on", async () => {
    getContactBySession.mockResolvedValue(undefined);

    const result = await researchLeadTool.execute({ query: "Acme Corp" }, fakeCtx);

    expect(setContactResearch).not.toHaveBeenCalled();
    expect(result.found).toBe(true);
    expect(result.message).toContain("no contact yet");
  });
});
