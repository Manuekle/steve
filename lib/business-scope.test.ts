import { beforeEach, describe, expect, it, vi } from "vitest";

// The registry is a document store like any other, so the backend is stubbed
// with an in-memory one: these tests are about the scoping rules, not about
// whether Postgres or a file is answering.
type Registry = { businesses: { id: string; name: string; createdAt: string }[]; activeId: string };
let document: Registry | null = null;

vi.mock("./doc-store", () => ({
  createDocumentStore: <T,>(options: { empty: () => T; normalize: (parsed: Partial<T>) => T }) => ({
    read: async () => (document ? options.normalize(document as unknown as Partial<T>) : options.empty()),
    update: async <R,>(fn: (store: T) => R) => {
      const store = document ? options.normalize(document as unknown as Partial<T>) : options.empty();
      const result = fn(store);
      document = store as unknown as Registry;
      return result;
    },
    usingDatabase: async () => false,
  }),
}));

async function load() {
  vi.resetModules();
  document = null;
  return import("./business-scope");
}

let scope: Awaited<ReturnType<typeof load>>;

beforeEach(async () => {
  scope = await load();
});

describe("the first business", () => {
  it("keeps the row keys and file paths it already had", async () => {
    expect(await scope.scopedDocumentId("business")).toBe("business");
    expect(await scope.scopedFile("/home/x/.steve/business.json")).toBe("/home/x/.steve/business.json");
    expect(await scope.blobPrefix()).toBe("");
  });

  it("is what an installation with no registry yet reports", async () => {
    const { businesses, activeId } = await scope.listBusinesses();
    expect(activeId).toBe(scope.DEFAULT_BUSINESS_ID);
    expect(businesses).toHaveLength(1);
  });
});

describe("a second business", () => {
  it("suffixes every namespace, and becomes the active one", async () => {
    const entry = await scope.createBusiness("Clínica Norte");

    expect(await scope.activeBusinessId()).toBe(entry.id);
    expect(await scope.scopedDocumentId("business")).toBe(`business::${entry.id}`);
    expect(await scope.scopedFile("/home/x/.steve/knowledge.json")).toBe(
      `/home/x/.steve/businesses/${entry.id}/knowledge.json`,
    );
    // Two segments, not three: blob ids are `<area>/<name>` and no deeper.
    expect(await scope.blobPrefix()).toBe(`${entry.id}__`);
  });

  it("hands the namespaces back when you switch to the first one", async () => {
    await scope.createBusiness("Clínica Norte");
    expect(await scope.setActiveBusiness(scope.DEFAULT_BUSINESS_ID)).toBe(true);
    expect(await scope.scopedDocumentId("media")).toBe("media");
    expect(await scope.blobPrefix()).toBe("");
  });

  it("cannot be switched to by an id that does not exist", async () => {
    expect(await scope.setActiveBusiness("b-nope")).toBe(false);
    expect(await scope.activeBusinessId()).toBe(scope.DEFAULT_BUSINESS_ID);
  });
});

describe("renaming and forgetting", () => {
  it("renames the entry the switcher shows", async () => {
    const entry = await scope.createBusiness("Norte");
    expect(await scope.renameBusiness(entry.id, "  Clínica Norte  ")).toBe(true);
    const { businesses } = await scope.listBusinesses();
    expect(businesses.find((business) => business.id === entry.id)?.name).toBe("Clínica Norte");
  });

  it("refuses to forget the last business, or the active one", async () => {
    expect(await scope.forgetBusiness(scope.DEFAULT_BUSINESS_ID)).toBe(false);

    const entry = await scope.createBusiness("Norte");
    // createBusiness switched to it, so it is the active one now.
    expect(await scope.forgetBusiness(entry.id)).toBe(false);

    await scope.setActiveBusiness(scope.DEFAULT_BUSINESS_ID);
    expect(await scope.forgetBusiness(entry.id)).toBe(true);
    expect((await scope.listBusinesses()).businesses).toHaveLength(1);
  });

  it("falls back to a business that exists when the stored active id is gone", async () => {
    const entry = await scope.createBusiness("Norte");
    // A registry hand-edited (or written by an older version) into naming a
    // business nobody has: every store would otherwise be scoped to something
    // the switcher cannot show or leave.
    document = { businesses: [{ id: entry.id, name: "Norte", createdAt: "" }], activeId: "b-gone" };
    scope.invalidateActiveBusiness();
    expect(await scope.activeBusinessId()).toBe(entry.id);
  });
});
