import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FormStep } from "@/lib/types";
import QRCode from "qrcode";
import { NextRequest } from "next/server";
import { SITE_URL, SITE_URL_IS_CONFIGURED } from "@/lib/site";
import { advanceQrClock, CELL, createQrScene, drawQrFrame, FADE, isQrMatrix, TOTAL } from "@/components/motion/qr-canvas";

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
const qrRoute = await import("@/app/api/forms/[id]/qr/route");
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

describe("form QR", () => {
  async function qrResponse(download = false) {
    const form = await seed();
    const request = new NextRequest(`http://localhost:3000/api/forms/${form.id}/qr?${download ? "download" : "json"}`);
    const response = await qrRoute.GET(request, { params: Promise.resolve({ id: form.id }) });
    const origin = SITE_URL_IS_CONFIGURED ? SITE_URL : request.nextUrl.origin;
    const expected = QRCode.create(`${origin}/f/${form.slug}`, { errorCorrectionLevel: "M" });
    return { response, expected };
  }

  it("serializes the complete URL matrix as boolean rows, including modules beyond 21", async () => {
    const { response, expected } = await qrResponse();
    expect(response.status).toBe(200);
    const { modules } = await response.json();
    expect(isQrMatrix(modules)).toBe(true);
    expect(modules.length).toBeGreaterThan(21);
    expect(modules).toHaveLength(expected.modules.size);
    for (let row = 0; row < modules.length; row++) {
      for (let column = 0; column < modules.length; column++) {
        expect(modules[row][column]).toBe(Boolean(expected.modules.get(row, column)));
      }
    }
    expect(response.headers.get("cache-control")).toBe("no-cache");
  });

  it("lands every dark module by 1320ms without replacing the canvas DPR transform", async () => {
    const { response } = await qrResponse();
    const { modules } = await response.json();
    const scene = createQrScene(modules);
    const ctx = {
      save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(),
      translate: vi.fn(), rotate: vi.fn(), setTransform: vi.fn(),
    };
    drawQrFrame(ctx as unknown as CanvasRenderingContext2D, scene, TOTAL, false);
    const darkCells = modules.flat().filter(Boolean).length;
    expect(scene.marks).toHaveLength(darkCells);
    expect(Math.min(...scene.marks.map((mark) => mark.start))).toBe(0);
    expect(Math.max(...scene.marks.map((mark) => mark.start))).toBe(700);
    expect(ctx.fillRect).toHaveBeenCalledTimes(darkCells + 1);
    expect(ctx.translate).not.toHaveBeenCalled();
    expect(ctx.rotate).not.toHaveBeenCalled();
    expect(ctx.setTransform).not.toHaveBeenCalled();
    for (const mark of scene.marks) {
      expect(ctx.fillRect).toHaveBeenCalledWith(mark.x, mark.y, CELL, CELL);
      expect(Number.isInteger(mark.x)).toBe(true);
      expect(Number.isInteger(mark.y)).toBe(true);
    }
    ctx.fillRect.mockClear();
    drawQrFrame(ctx as unknown as CanvasRenderingContext2D, scene, 0, false);
    expect(ctx.fillRect).toHaveBeenCalledTimes(1); // Only the background.
  });

  it("reverses from the current millisecond clock and reopens after reaching zero", () => {
    const entered = advanceQrClock(0, 500, true, false);
    expect(entered).toBe(500);
    const reversed = advanceQrClock(entered, 100, false, false);
    expect(reversed).toBe(330);
    expect(advanceQrClock(reversed, 100, true, false)).toBe(430);
    const hidden = advanceQrClock(reversed, 1000, false, false);
    expect(hidden).toBe(0);
    expect(advanceQrClock(hidden, 1320, true, false)).toBe(TOTAL);
  });

  it("uses only opacity for reduced motion, with a 200ms fade both ways", async () => {
    const { response } = await qrResponse();
    const scene = createQrScene((await response.json()).modules);
    const alphas: number[] = [];
    const ctx = {
      globalAlpha: 1,
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
      fillRect: vi.fn(() => alphas.push(ctx.globalAlpha)),
    };
    drawQrFrame(ctx as unknown as CanvasRenderingContext2D, scene, FADE / 2, true);
    expect(alphas[0]).toBe(1);
    expect(alphas.slice(1).every((alpha) => alpha === 0.5)).toBe(true);
    expect(ctx.translate).not.toHaveBeenCalled();
    expect(ctx.rotate).not.toHaveBeenCalled();
    expect(advanceQrClock(0, 200, true, true)).toBe(FADE);
    expect(advanceQrClock(FADE, 100, false, true)).toBe(100);
    expect(advanceQrClock(FADE, 200, false, true)).toBe(0);
  });

  it("keeps the SVG download and missing-form response working", async () => {
    const { response } = await qrResponse(true);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(await response.text()).toContain("<svg");
    const missing = await qrRoute.GET(new NextRequest("http://localhost:3000/api/forms/missing/qr?json"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(missing.status).toBe(404);
  });
});
