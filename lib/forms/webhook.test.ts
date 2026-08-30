import { describe, expect, it, vi, afterEach } from "vitest";
import { buildFormWebhookPayload, deliverFormWebhook } from "./webhook";
import type { Form, FormResponse } from "@/lib/types";

const form: Form = {
  id: "fm-1",
  slug: "leads",
  name: "Calificador",
  status: "published",
  steps: [
    {
      id: "s1",
      fields: [
        { id: "f-name", type: "text", label: "¿Cómo te llamás?" },
        {
          id: "f-budget",
          type: "single_choice",
          label: "Presupuesto",
          choices: [
            { id: "c-hi", label: "Más de 10k", points: 10 },
            { id: "c-lo", label: "Menos de 1k", points: 0 },
          ],
        },
      ],
    },
  ],
  scoring: { hot: 8, warm: 4 },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as Form;

const response: FormResponse = {
  id: "fr-1",
  formId: "fm-1",
  answers: [
    { fieldId: "f-name", value: "Ada" },
    { fieldId: "f-budget", value: "c-hi" },
  ],
  score: 10,
  temperature: "hot",
  partial: false,
  contactId: "ct-1",
  startedAt: "2026-01-02T10:00:00.000Z",
  updatedAt: "2026-01-02T10:05:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildFormWebhookPayload", () => {
  it("labels every answer so the receiver isn't left with bare field ids", () => {
    const payload = buildFormWebhookPayload(form, response);
    expect(payload.answers).toEqual([
      { fieldId: "f-name", label: "¿Cómo te llamás?", value: "Ada" },
      { fieldId: "f-budget", label: "Presupuesto", value: "c-hi" },
    ]);
  });

  it("carries the response id, its partial flag and the score ceiling", () => {
    const payload = buildFormWebhookPayload(form, response);
    expect(payload.event).toBe("form.response");
    expect(payload.response.id).toBe("fr-1");
    expect(payload.response.partial).toBe(false);
    expect(payload.response.score).toBe(10);
    expect(payload.response.maxScore).toBe(10);
    expect(payload.form.slug).toBe("leads");
  });
});

describe("deliverFormWebhook", () => {
  it("POSTs the payload to the form's URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await deliverFormWebhook({ ...form, webhookUrl: "https://example.com/hook" }, response);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://example.com/hook");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).response.id).toBe("fr-1");
  });

  it("does nothing when no webhook is set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await deliverFormWebhook(form, response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["http://example.com/hook", "plain http"],
    ["https://localhost/hook", "loopback"],
    ["https://169.254.169.254/latest", "link-local metadata"],
    ["https://192.168.1.10/hook", "private range"],
    ["not-a-url", "unparseable"],
  ])("refuses to call %s (%s)", async (webhookUrl) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await deliverFormWebhook({ ...form, webhookUrl }, response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows a failing endpoint so the submission still succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(
      deliverFormWebhook({ ...form, webhookUrl: "https://example.com/hook" }, response),
    ).resolves.toBeUndefined();
  });
});
