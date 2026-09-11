import { describe, expect, it } from "vitest";
import { BUILTIN_SUBAGENTS, getMentionableAgents } from "./chat-agents";

describe("chat-agents", () => {
  it("includes all built-in Eve subagents with handles and roles", () => {
    expect(BUILTIN_SUBAGENTS).toHaveLength(3);
    const handles = BUILTIN_SUBAGENTS.map((a) => a.handle);
    expect(handles).toContain("analista");
    expect(handles).toContain("redactor");
    expect(handles).toContain("revisor");

    for (const agent of BUILTIN_SUBAGENTS) {
      expect(agent.type).toBe("subagent");
      expect(agent.description.length).toBeGreaterThan(10);
      expect(agent.role).toBeDefined();
    }
  });

  it("returns built-in subagents from getMentionableAgents even if store fails", async () => {
    const agents = await getMentionableAgents();
    expect(agents.length).toBeGreaterThanOrEqual(3);
    expect(agents.some((a) => a.handle === "analista")).toBe(true);
    expect(agents.some((a) => a.handle === "redactor")).toBe(true);
    expect(agents.some((a) => a.handle === "revisor")).toBe(true);
  });
});
