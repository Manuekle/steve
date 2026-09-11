import { describe, expect, it } from "vitest";
import { getAgentTemplate } from "./agent-templates";

describe("agent templates", () => {
  it("resolves persisted icon keys and keeps unknown agents on fallback", () => {
    expect(getAgentTemplate("support")?.id).toBe("support");
    expect(getAgentTemplate(undefined)).toBeUndefined();
    expect(getAgentTemplate("missing")).toBeUndefined();
  });
});
