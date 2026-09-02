import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A throwaway home, so the test never reads or writes the developer's real
// ~/.steve/credentials.json.
const home = vi.hoisted(() => {
  const { mkdtempSync: make } = require("node:fs") as typeof import("node:fs");
  const { tmpdir: temp } = require("node:os") as typeof import("node:os");
  const { join: at } = require("node:path") as typeof import("node:path");
  return make(at(temp(), "steve-credentials-"));
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => home };
});

const { getCredentialSync, invalidateCredentialCache, saveCredentials } = await import("./credentials");

const file = join(home, ".steve", "credentials.json");

function writeStoreDirectly(store: Record<string, string>): void {
  mkdirSync(join(home, ".steve"), { recursive: true });
  writeFileSync(file, JSON.stringify(store, null, 2) + "\n", "utf-8");
}

describe("getCredentialSync", () => {
  beforeEach(() => {
    invalidateCredentialCache();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("falls back to the environment when the store has nothing", () => {
    writeStoreDirectly({});
    process.env.ANTHROPIC_API_KEY = "sk-ant-from-env";
    expect(getCredentialSync("ANTHROPIC_API_KEY")).toBe("sk-ant-from-env");
  });

  it("prefers the store over the environment", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-from-env";
    await saveCredentials({ ANTHROPIC_API_KEY: "sk-ant-from-store" });
    expect(getCredentialSync("ANTHROPIC_API_KEY")).toBe("sk-ant-from-store");
  });

  // The regression this file exists for: the web app writes the store and the
  // Eve host reads it, in two processes over one file. A cache that loaded
  // once meant a key saved in Settings did nothing until the agent restarted.
  it("sees a value another process wrote, with no explicit invalidation", () => {
    writeStoreDirectly({ ANTHROPIC_API_KEY: "sk-ant-first" });
    expect(getCredentialSync("ANTHROPIC_API_KEY")).toBe("sk-ant-first");

    writeStoreDirectly({ ANTHROPIC_API_KEY: "sk-ant-rotated" });
    expect(getCredentialSync("ANTHROPIC_API_KEY")).toBe("sk-ant-rotated");
  });

  it("sees a key another process cleared", () => {
    writeStoreDirectly({ ANTHROPIC_API_KEY: "sk-ant-first" });
    expect(getCredentialSync("ANTHROPIC_API_KEY")).toBe("sk-ant-first");

    writeStoreDirectly({});
    expect(getCredentialSync("ANTHROPIC_API_KEY")).toBeUndefined();
  });

  it("survives a store file that is missing or unparseable", () => {
    writeStoreDirectly({ ANTHROPIC_API_KEY: "sk-ant-first" });
    expect(getCredentialSync("ANTHROPIC_API_KEY")).toBe("sk-ant-first");

    mkdirSync(join(home, ".steve"), { recursive: true });
    writeFileSync(file, "{ not json", "utf-8");
    expect(getCredentialSync("ANTHROPIC_API_KEY")).toBeUndefined();
  });
});
