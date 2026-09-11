import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * `PUT /api/automations` used to spread the request body straight into the
 * stored record. Everything here is about what that let through: a rewritten
 * `createdAt`, a reset `responseCount`, a trigger the runner has no branch
 * for, and arbitrary keys riding along on every later read.
 */

const TEST_DIR = join(tmpdir(), `senka-automations-route-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_DIR };
});

const route = await import("@/app/api/automations/route");
const { createAutomation, listAutomations } = await import("@/lib/business-store");

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function json(method: string, body: unknown) {
  return new Request("http://localhost/api/automations", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

type AnyRequest = Parameters<typeof route.PUT>[0];

async function seed() {
  const [automation] = await createAutomation({
    name: "Welcome",
    description: "",
    trigger: "keyword",
    triggerValue: "hola",
    channel: "all",
    steps: [],
  });
  return automation;
}

describe("PUT /api/automations", () => {
  it("round-trips manual node positions and incoming connection anchors", async () => {
    const seeded = await seed();
    const steps = [
      { id: "source", type: "message", config: {}, position: { x: 80, y: -20 } },
      { id: "target", type: "wait", config: { duration: "5min" }, disabled: true, connector: "dashed", connection: {
        sourceId: "source", from: { side: "right", offset: 0.25 }, to: { side: "left", offset: 0.75 }, waypoint: { x: 240, y: 150 },
      } },
    ];
    const response = await route.PUT(json("PUT", { id: seeded.id, steps }) as AnyRequest);
    expect(response.status).toBe(200);
    expect((await listAutomations())[0].steps).toEqual(steps);
  });
  it("saves the fields a screen owns", async () => {
    const seeded = await seed();
    const response = await route.PUT(
      json("PUT", { id: seeded.id, name: "Renamed", status: "paused" }) as AnyRequest,
    );

    expect(response.status).toBe(200);
    const [stored] = await listAutomations();
    expect(stored.name).toBe("Renamed");
    expect(stored.status).toBe("paused");
  });

  it("ignores fields no screen owns", async () => {
    const seeded = await seed();
    await route.PUT(
      json("PUT", {
        id: seeded.id,
        name: "Renamed",
        createdAt: "1999-01-01T00:00:00.000Z",
        responseCount: 9999,
        lastTriggeredAt: "1999-01-01T00:00:00.000Z",
        smuggled: "nope",
      }) as AnyRequest,
    );

    const [stored] = await listAutomations();
    expect(stored.createdAt).toBe(seeded.createdAt);
    expect(stored.responseCount).toBe(seeded.responseCount);
    expect(stored.lastTriggeredAt).toBeUndefined();
    expect(stored).not.toHaveProperty("smuggled");
  });

  it("refuses a trigger, channel or status the app has no branch for", async () => {
    const seeded = await seed();
    for (const patch of [
      { trigger: "when_i_feel_like_it" },
      { channel: "telegram" },
      { status: "on_fire" },
    ]) {
      const response = await route.PUT(json("PUT", { id: seeded.id, ...patch }) as AnyRequest);
      expect(response.status).toBe(400);
    }
    const [stored] = await listAutomations();
    expect(stored.trigger).toBe("keyword");
    expect(stored.channel).toBe("all");
    expect(stored.status).toBe(seeded.status);
  });

  it("mints a webhook token when an automation switches to that trigger", async () => {
    const seeded = await seed();
    await route.PUT(json("PUT", { id: seeded.id, trigger: "webhook" }) as AnyRequest);

    const [stored] = await listAutomations();
    expect(stored.trigger).toBe("webhook");
    expect(stored.triggerValue).toMatch(/^[0-9a-f]{48}$/);
  });

  it("never turns the old trigger's keyword into the webhook secret", async () => {
    const seeded = await seed();
    // What the dialog used to send: one triggerValue box for every trigger
    // type, so the keyword rode along unchanged into the token field. A
    // keyword is printed in ads — it is the opposite of a shared secret.
    await route.PUT(
      json("PUT", { id: seeded.id, trigger: "webhook", triggerValue: "hola" }) as AnyRequest,
    );

    const [stored] = await listAutomations();
    expect(stored.triggerValue).not.toBe("hola");
    expect(stored.triggerValue).toMatch(/^[0-9a-f]{48}$/);
  });

  it("keeps a token the operator actually typed", async () => {
    const seeded = await seed();
    await route.PUT(json("PUT", { id: seeded.id, trigger: "webhook" }) as AnyRequest);
    const minted = (await listAutomations())[0].triggerValue;

    await route.PUT(
      json("PUT", {
        id: seeded.id,
        trigger: "webhook",
        triggerValue: "my-own-long-secret-token",
      }) as AnyRequest,
    );

    const [stored] = await listAutomations();
    expect(stored.triggerValue).toBe("my-own-long-secret-token");
    expect(stored.triggerValue).not.toBe(minted);
  });
});

describe("POST /api/automations", () => {
  it("refuses a trigger the runner has no branch for", async () => {
    const response = await route.POST(
      json("POST", { name: "Bad", trigger: "when_i_feel_like_it" }) as AnyRequest,
    );
    expect(response.status).toBe(400);
    expect((await response.json()).field).toBe("trigger");
  });

  it("refuses a channel that isn't one", async () => {
    const response = await route.POST(json("POST", { name: "Bad", channel: "telegram" }) as AnyRequest);
    expect(response.status).toBe(400);
    expect((await response.json()).field).toBe("channel");
  });
});

describe("step validation", () => {
  const step = {
    id: "step-1",
    type: "message",
    config: { message: "Hola" },
  };

  it("stores a well-formed step list", async () => {
    const response = await route.POST(json("POST", { name: "Flow", steps: [step] }) as AnyRequest);
    expect(response.status).toBe(200);
    const [saved] = await listAutomations();
    expect(saved.steps).toEqual([step]);
  });

  it("rejects a step type the runner has no branch for", async () => {
    const response = await route.POST(
      json("POST", { name: "Flow", steps: [{ ...step, type: "drop_database" }] }) as AnyRequest,
    );
    expect(response.status).toBe(400);
    expect(await listAutomations()).toHaveLength(0);
  });

  it("rejects steps that are not the stored shape at all", async () => {
    const response = await route.POST(
      json("POST", { name: "Flow", steps: ["just a string"] }) as AnyRequest,
    );
    expect(response.status).toBe(400);
  });

  it("keeps arbitrary keys out of a saved step", async () => {
    const response = await route.POST(
      json("POST", { name: "Flow", steps: [{ ...step, sneaky: true }] }) as AnyRequest,
    );
    // Dropped rather than rejected: an extra key is usually a newer editor
    // talking to an older server, and refusing the save would lose the flow.
    // What matters is that it never reaches the store.
    expect(response.status).toBe(200);
    const [saved] = await listAutomations();
    expect(saved.steps).toEqual([step]);
    expect(saved.steps?.[0]).not.toHaveProperty("sneaky");
  });

  it("validates on update too, and leaves the stored steps alone when it refuses", async () => {
    const seeded = await seed();
    await route.PUT(json("PUT", { id: seeded.id, steps: [step] }) as AnyRequest);

    const response = await route.PUT(
      json("PUT", { id: seeded.id, steps: [{ id: "x", type: "nope", config: {} }] }) as AnyRequest,
    );

    expect(response.status).toBe(400);
    const [saved] = await listAutomations();
    expect(saved.steps).toEqual([step]);
  });

  it("treats an absent steps field as no change", async () => {
    const seeded = await seed();
    await route.PUT(json("PUT", { id: seeded.id, steps: [step] }) as AnyRequest);
    await route.PUT(json("PUT", { id: seeded.id, name: "Renamed" }) as AnyRequest);

    const [saved] = await listAutomations();
    expect(saved.name).toBe("Renamed");
    expect(saved.steps).toEqual([step]);
  });
});
