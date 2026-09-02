import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  capabilityForTool,
  isCapabilityId,
  toCapabilityIds,
} from "./agent-capabilities";

describe("capability catalog", () => {
  it("maps every tool it claims to exactly one capability", () => {
    const seen = new Map<string, string>();
    for (const capability of CAPABILITIES) {
      for (const tool of capability.tools) {
        expect(seen.has(tool), `${tool} is claimed twice`).toBe(false);
        seen.set(tool, capability.id);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it("resolves a tool back to its capability", () => {
    expect(capabilityForTool("send_payment_link")).toBe("payments");
    expect(capabilityForTool("calendar")).toBe("calendar");
    expect(capabilityForTool("send_stored_media")).toBe("media");
  });

  // A tool no capability claims stays available to everyone. Returning a
  // capability for it would silently gate something nobody can grant.
  it("returns nothing for an ungated tool", () => {
    expect(capabilityForTool("web_search")).toBeUndefined();
  });

  it("recognises its own ids and nothing else", () => {
    expect(isCapabilityId("payments")).toBe(true);
    expect(isCapabilityId("PAYMENTS")).toBe(false);
    expect(isCapabilityId("bananas")).toBe(false);
  });
});

describe("toCapabilityIds", () => {
  it("reads capability ids as themselves", () => {
    expect(toCapabilityIds(["payments", "calendar"]).sort()).toEqual(["calendar", "payments"]);
  });

  // The field used to hold whatever someone typed. Every agent saved from a
  // template holds tool names, so those must keep working.
  it("upgrades the tool names saved before the catalog existed", () => {
    expect(toCapabilityIds(["upsert_contact", "transfer_human"]).sort()).toEqual([
      "contacts",
      "handoff",
    ]);
  });

  it("collapses several tools of one capability into a single entry", () => {
    expect(toCapabilityIds(["find_media", "send_media", "generate_media"])).toEqual(["media"]);
  });

  it("drops prose rather than guessing at it", () => {
    expect(toCapabilityIds(["clima", "búsqueda", "  "])).toEqual([]);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(toCapabilityIds([" Calendar ", "PAYMENTS"]).sort()).toEqual(["calendar", "payments"]);
  });
});
