import { afterEach, describe, expect, it } from "vitest";
import { resetSharedPool, sharedPool } from "./postgres-pool";

const original = process.env.WORKFLOW_POSTGRES_URL;

afterEach(async () => {
  await resetSharedPool();
  if (original === undefined) delete process.env.WORKFLOW_POSTGRES_URL;
  else process.env.WORKFLOW_POSTGRES_URL = original;
});

describe("sharedPool", () => {
  // The whole point of the module: four call sites, one pool. Four separate
  // pools at max 5 each drew 20 connections per instance against Supabase's
  // 40-client session-pooler cap, and two warm instances exhausted it.
  it("hands every caller the same pool", () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://u:p@127.0.0.1:5432/db";
    expect(sharedPool()).toBe(sharedPool());
  });

  it("says which variable is missing rather than failing at query time", () => {
    delete process.env.WORKFLOW_POSTGRES_URL;
    expect(() => sharedPool()).toThrow(/WORKFLOW_POSTGRES_URL/);
  });

  // An unhandled `error` event on a pg Pool is an uncaught exception, not a
  // rejected promise — it takes the process down. Every pool must carry a
  // listener, and now there is only one pool to get that right on.
  it("attaches an error listener, so a dropped idle connection cannot kill the process", () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://u:p@127.0.0.1:5432/db";
    expect(sharedPool().listenerCount("error")).toBeGreaterThan(0);
  });
});
