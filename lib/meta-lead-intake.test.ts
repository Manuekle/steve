import { describe, expect, it } from "vitest";
import type { MetaLead } from "./meta-ads";
import type { Contact } from "./types";
import {
  LEAD_FRESHNESS_MS,
  META_LEAD_ID,
  ingestedLeadIds,
  metaLeadToInput,
  selectNewLeads,
} from "./meta-lead-intake";

function lead(overrides: Partial<MetaLead> = {}): MetaLead {
  return {
    id: "l1",
    form_id: "f1",
    created_time: new Date().toISOString(),
    field_data: [
      { name: "full_name", values: ["Ana Pérez"] },
      { name: "email", values: ["ana@example.com"] },
      { name: "phone_number", values: ["+5491100000000"] },
    ],
    ...overrides,
  };
}

describe("metaLeadToInput", () => {
  it("maps Meta's field_data onto a lead", () => {
    const input = metaLeadToInput(lead(), "Campaña verano");
    expect(input.name).toBe("Ana Pérez");
    expect(input.email).toBe("ana@example.com");
    expect(input.phone).toBe("+5491100000000");
    expect(input.source).toBe("meta-ads:Campaña verano");
  });

  it("marks a lead that left a phone number as reachable on WhatsApp", () => {
    expect(metaLeadToInput(lead()).channel).toBe("whatsapp");
  });

  it("leaves an email-only lead on the form channel", () => {
    const input = metaLeadToInput(
      lead({ field_data: [{ name: "email", values: ["ana@example.com"] }] }),
    );
    expect(input.channel).toBe("form");
    expect(input.phone).toBeUndefined();
  });

  it("builds a name from first and last when there is no full_name", () => {
    const input = metaLeadToInput(
      lead({
        field_data: [
          { name: "first_name", values: ["Ana"] },
          { name: "last_name", values: ["Pérez"] },
        ],
      }),
    );
    expect(input.name).toBe("Ana Pérez");
  });

  it("keeps custom form answers as attributes a message can interpolate", () => {
    const input = metaLeadToInput(
      lead({ field_data: [{ name: "que_necesitas", values: ["Presupuesto"] }] }),
    );
    expect(input.attributes?.que_necesitas).toBe("Presupuesto");
    expect(input.attributes?.[META_LEAD_ID]).toBe("l1");
    expect(input.attributes?.meta_form_id).toBe("f1");
  });

  it("survives a lead with no usable fields at all", () => {
    const input = metaLeadToInput(lead({ field_data: [] }));
    expect(input.name).toBeUndefined();
    expect(input.channel).toBe("form");
  });
});

describe("selectNewLeads", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("skips a lead already taken in", () => {
    expect(selectNewLeads([lead({ created_time: now.toISOString() })], new Set(["l1"]), now)).toEqual([]);
  });

  it("skips history so connecting a Page does not replay 90 days of leads", () => {
    const old = new Date(now.getTime() - LEAD_FRESHNESS_MS - 60_000).toISOString();
    expect(selectNewLeads([lead({ created_time: old })], new Set(), now)).toEqual([]);
  });

  it("takes a fresh, unseen lead", () => {
    const recent = new Date(now.getTime() - 60_000).toISOString();
    expect(selectNewLeads([lead({ created_time: recent })], new Set(), now)).toHaveLength(1);
  });

  it("ignores a lead whose timestamp Meta sent unparseable", () => {
    expect(selectNewLeads([lead({ created_time: "not a date" })], new Set(), now)).toEqual([]);
  });
});

describe("ingestedLeadIds", () => {
  it("collects the ids already on contacts and ignores contacts without one", () => {
    const contacts = [
      { attributes: { [META_LEAD_ID]: "l1" } },
      { attributes: {} },
      { attributes: { [META_LEAD_ID]: "l2" } },
    ] as unknown as Contact[];
    expect([...ingestedLeadIds(contacts)].sort()).toEqual(["l1", "l2"]);
  });
});
