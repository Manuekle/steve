import { describe, expect, it } from "vitest";
import { toolAllowed } from "./mcp-client";
import { slugifyServer, validateMcpUrl } from "./mcp-url";

describe("validateMcpUrl", () => {
  it("takes https anywhere", () => {
    expect(validateMcpUrl("https://mcp.linear.app/mcp")).toEqual({
      url: "https://mcp.linear.app/mcp",
    });
  });

  it("takes plain http only on loopback", () => {
    // A connection carries a bearer token on every request. Over plaintext to
    // a host on the internet, that is the token handed to whoever is between.
    expect(validateMcpUrl("http://localhost:3001/mcp")).toHaveProperty("url");
    expect(validateMcpUrl("http://127.0.0.1:3001/mcp")).toHaveProperty("url");
    expect(validateMcpUrl("http://example.com/mcp")).toEqual({
      error: "mcp.urlInsecure",
    });
  });

  it("refuses a scheme that is not http(s), including one that reads files", () => {
    expect(validateMcpUrl("file:///etc/passwd")).toEqual({ error: "mcp.urlScheme" });
    expect(validateMcpUrl("ws://example.com/mcp")).toEqual({ error: "mcp.urlScheme" });
    expect(validateMcpUrl("not a url")).toEqual({ error: "mcp.urlInvalid" });
  });
});

describe("slugifyServer", () => {
  it("produces something usable as half a tool name", () => {
    // The model calls `mcp_<slug>`, and providers reject tool names with
    // dashes or accents in them.
    expect(slugifyServer("Linear")).toBe("linear");
    expect(slugifyServer("Mi Notion Interno")).toBe("mi_notion_interno");
    expect(slugifyServer("Atención al Cliente")).toBe("atencion_al_cliente");
    expect(slugifyServer("  --weird--  ")).toBe("weird");
  });

  it("never returns an empty name", () => {
    expect(slugifyServer("")).toBe("server");
    expect(slugifyServer("!!!")).toBe("server");
  });
});

describe("toolAllowed", () => {
  it("lets everything through when neither list is set", () => {
    expect(toolAllowed({ allow: [], block: [] }, "delete_everything")).toBe(true);
  });

  it("treats a non-empty allow list as the whole permitted surface", () => {
    const server = { allow: ["search_issues", "get_issue"], block: [] };
    expect(toolAllowed(server, "search_issues")).toBe(true);
    expect(toolAllowed(server, "create_issue")).toBe(false);
  });

  it("applies the block list after the allow list", () => {
    const server = { allow: ["a", "b"], block: ["b"] };
    expect(toolAllowed(server, "a")).toBe(true);
    expect(toolAllowed(server, "b")).toBe(false);
  });

  it("blocks by name with no allow list", () => {
    expect(toolAllowed({ allow: [], block: ["danger_delete"] }, "danger_delete")).toBe(false);
    expect(toolAllowed({ allow: [], block: ["danger_delete"] }, "echo")).toBe(true);
  });
});
