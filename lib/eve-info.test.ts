import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countOf, disabledTools, eveRuntimeUrl, namesOf, SLOT_KEYS } from "./eve-info";

// The snapshot shapes below are copied from a real `GET /eve/v1/info` on this
// app, trimmed to the fields these helpers read. They are the point of the
// file: every one of them was a shape the first version got wrong, and each
// wrong guess showed up as "0 herramientas" on a working runtime.

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.EVE_RUNTIME_URL;
  delete process.env.EVE_SELF_HOSTED;
  delete process.env.EVE_HOST_URL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("eveRuntimeUrl", () => {
  it("takes an explicit override first", () => {
    process.env.EVE_RUNTIME_URL = "https://runtime.example.com/";
    expect(eveRuntimeUrl("http://localhost:3000")).toBe("https://runtime.example.com");
  });

  it("points at the separate runtime process when self-hosted", () => {
    process.env.EVE_SELF_HOSTED = "1";
    expect(eveRuntimeUrl("http://localhost:3001")).toBe("http://127.0.0.1:3000");
  });

  it("prefers the request's own origin over the configured public URL", () => {
    // Under withEve() the runtime is mounted in this same server, so the origin
    // that served the page always serves /eve/v1 — while NEXT_PUBLIC_SITE_URL
    // on a dev machine is routinely unresolvable (`https://senka.localhost`).
    expect(eveRuntimeUrl("http://localhost:3000/")).toBe("http://localhost:3000");
  });
});

describe("namesOf", () => {
  it("reads the tools slot, which is split by origin", () => {
    const tools = {
      available: [{ name: "calendar" }, { name: "plan" }],
      authored: [{ name: "calendar" }],
      framework: [{ name: "load_skill" }],
      disabledFramework: ["web_search", "bash"],
    };
    // `authored` is a subset of `available`; merging must not double-count.
    expect(namesOf(tools, SLOT_KEYS.tools)).toEqual(["calendar", "plan"]);
    expect(countOf(tools, SLOT_KEYS.tools)).toBe(2);
  });

  it("merges both halves of the skills slot", () => {
    // Packaged skills are `static`, authored resolvers are `dynamic`. Reading
    // one and not the other under-reports the agent's real surface.
    const skills = {
      static: [{ name: "react-and-nextjs-data-visualization" }],
      dynamic: [{ slug: "sales-brief" }, { slug: "user-skills" }],
    };
    expect(namesOf(skills, SLOT_KEYS.skills)).toEqual([
      "react-and-nextjs-data-visualization",
      "sales-brief",
      "user-skills",
    ]);
  });

  it("reads subagents from their nested list", () => {
    const subagents = { local: [{ name: "analista" }, { name: "revisor" }], total: 2 };
    expect(namesOf(subagents, SLOT_KEYS.subagents)).toEqual(["analista", "revisor"]);
  });

  it("deduplicates a channel that registers one route per method", () => {
    const channels = {
      authored: [
        { name: "eve", urlPath: "/eve/v1/info" },
        { name: "eve", urlPath: "/eve/v1/session" },
      ],
    };
    expect(namesOf(channels, SLOT_KEYS.channels)).toEqual(["eve"]);
  });

  it("handles a slot that is already a plain array", () => {
    const schedules = [{ name: "reminders" }, { name: "prospect" }];
    expect(namesOf(schedules, SLOT_KEYS.schedules)).toEqual(["prospect", "reminders"]);
  });

  it("is empty rather than throwing on an absent or unexpected slot", () => {
    expect(namesOf(undefined, SLOT_KEYS.tools)).toEqual([]);
    expect(namesOf(null, SLOT_KEYS.tools)).toEqual([]);
    expect(namesOf("nope", SLOT_KEYS.tools)).toEqual([]);
    expect(namesOf({ something: "else" }, SLOT_KEYS.tools)).toEqual([]);
  });
});

describe("disabledTools", () => {
  it("reads the bare string list eve reports there", () => {
    const tools = { available: [{ name: "plan" }], disabledFramework: ["agent", "web_search"] };
    expect(disabledTools(tools)).toEqual(["agent", "web_search"]);
  });

  it("is empty when nothing is switched off", () => {
    expect(disabledTools({ available: [] })).toEqual([]);
  });
});
