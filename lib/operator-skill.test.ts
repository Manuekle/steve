import { describe, expect, it } from "vitest";
import { isOperatorSession } from "./operator-skill";

describe("isOperatorSession", () => {
  // The two customer transports are the only ones this has to get right: a
  // sales procedure advertised while the agent answers a stranger on WhatsApp
  // is tokens spent inviting a misroute.
  it.each(["whatsapp", "channel:whatsapp", "instagram", "channel:instagram"])(
    "withholds operator skills on %s",
    (kind) => {
      expect(isOperatorSession(kind)).toBe(false);
    },
  );

  // Deliberately permissive elsewhere. An unrecognised kind — a channel eve
  // renames, a transport added later — keeps the owner's own console working;
  // the CRM itself is guarded by agent/tools/pipeline.ts, not by this.
  it.each(["eve", "channel:eve", "http", undefined])("serves them on %s", (kind) => {
    expect(isOperatorSession(kind)).toBe(true);
  });
});
