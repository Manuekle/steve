import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FormStep } from "@/lib/types";

/**
 * What the form routes refuse before they touch the store.
 *
 * `PATCH` is the one the builder talks to, and it is the only way a step list
 * reaches the public page — a page that renders whatever it is handed. The
 * rules themselves are `lib/forms/schema`'s and are tested there; these check
 * that the route actually applies them, and that the allowlist still keeps a
 * caller from writing fields no screen owns.
 */

const TEST_DIR = join(tmpdir(), `senka-forms-route-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_DIR };
});

const formRoute = await import("@/app/api/forms/[id]/route");
const formsRoute = await import("@/app/api/forms/route");
const { createForm, getForm } = await import("@/lib/business-store");

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function json(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

type AnyRequest = Parameters<typeof formRoute.PATCH>[0];

const steps: FormStep[] = [
  {
    id: "st-1",
    title: "Where from?",
    fields: [
      {
        id: "fd-source",
        type: "single_choice",
        label: "Where do your leads come from?",
        required: true,
        choices: [
          { id: "ch-none", label: "No leads yet", points: 0 },
          { id: "ch-fb", label: "Facebook", points: 12 },
        ],
      },
    ],
  },
];

async function seed() {
  return createForm({
    name: "Qualifier",
    description: "",
    steps,
    scoring: { hot: 20, warm: 8 },
  });
}

async function patch(id: string, body: unknown) {
  return formRoute.PATCH(json(`http://localhost/api/forms/${id}`, "PATCH", body) as AnyRequest, {
    params: Promise.resolve({ id }),
  });
}

describe("PATCH /api/forms/[id]", () => {
  it("saves a well-formed step list", async () => {
    const form = await seed();
    const next = [
      ...steps,
      {
        id: "st-2",
        showIf: { fieldId: "fd-source", equals: ["ch-fb"] },
        fields: [{ id: "fd-name", type: "text", label: "Your name", required: true, maps: "name" }],
      },
    ];

    const response = await patch(form.id, { steps: next });
    expect(response.status).toBe(200);
    expect((await getForm(form.id))?.steps).toHaveLength(2);
  });

  it("refuses a step list the public page couldn't render", async () => {
    const form = await seed();
    const response = await patch(form.id, { steps: [{ id: "st-1", fields: [] }] });

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_field");
    // The stored form is untouched, not half-written.
    expect((await getForm(form.id))?.steps).toHaveLength(1);
  });

  it("refuses a condition pointing at a question asked later", async () => {
    const form = await seed();
    const response = await patch(form.id, {
      steps: [
        { ...steps[0], showIf: { fieldId: "fd-later", equals: ["ch-x"] } },
        {
          id: "st-2",
          fields: [{ id: "fd-later", type: "single_choice", label: "Later", required: false, choices: [{ id: "ch-x", label: "X", points: 1 }] }],
        },
      ],
    });

    expect(response.status).toBe(400);
    expect((await response.json()).field).toContain("showIf");
  });

  it("refuses thresholds that make warm unreachable", async () => {
    const form = await seed();
    const response = await patch(form.id, { scoring: { hot: 5, warm: 10 } });

    expect(response.status).toBe(400);
    expect((await getForm(form.id))?.scoring).toEqual({ hot: 20, warm: 8 });
  });

  it("strips iconSvg, which the public page renders as raw markup", async () => {
    const form = await seed();
    const response = await patch(form.id, {
      steps: [
        {
          ...steps[0],
          fields: [
            {
              ...steps[0].fields[0],
              choices: [
                { id: "ch-none", label: "No leads yet", points: 0 },
                {
                  id: "ch-fb",
                  label: "Facebook",
                  points: 12,
                  iconSvg: '<svg onload="alert(1)"></svg>',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(response.status).toBe(200);
    const stored = await getForm(form.id);
    expect(stored?.steps[0].fields[0].choices?.[1]).not.toHaveProperty("iconSvg");
  });

  it("ignores fields no screen owns", async () => {
    const form = await seed();
    const response = await patch(form.id, {
      name: "Renamed",
      id: "fm-somebody-elses",
      createdAt: "1999-01-01T00:00:00.000Z",
    });

    expect(response.status).toBe(200);
    const stored = await getForm(form.id);
    expect(stored?.name).toBe("Renamed");
    expect(stored?.id).toBe(form.id);
    expect(stored?.createdAt).toBe(form.createdAt);
  });

  it("refuses a webhook URL the delivery guard would reject", async () => {
    const form = await seed();
    const response = await patch(form.id, { webhookUrl: "http://localhost/hook" });

    expect(response.status).toBe(400);
    expect((await getForm(form.id))?.webhookUrl).toBeUndefined();
  });
});

describe("POST /api/forms", () => {
  it("refuses a template it doesn't have", async () => {
    const response = await formsRoute.POST(
      json("http://localhost/api/forms", "POST", { templateId: "nope" }) as AnyRequest,
    );
    expect(response.status).toBe(400);
  });
});
