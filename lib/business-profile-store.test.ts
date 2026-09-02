import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Same trick as business-store.test.ts: point homedir() at a temp dir so the
// store writes there instead of the developer's real ~/.steve.
const TEST_DIR = join(tmpdir(), `steve-profile-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_DIR };
});

const {
  clearBusinessProfile,
  deleteBusinessLogo,
  getBusinessIdentity,
  getBusinessProfile,
  readBusinessLogo,
  saveBusinessIdentity,
  saveBusinessLogo,
  saveBusinessProfile,
  setLegalPage,
  updateBusinessProfile,
} = await import("./business-profile-store");

const RECORD = {
  profile: {
    name: "Panadería La Esquina",
    industry: "Panadería",
    description: "Pan de masa madre.",
    services: ["Pan", "Facturas"],
    location: null,
    hours: null,
    tone: "cercano",
    highlights: ["Horno a leña"],
    faqs: [],
  },
  sources: { documentsUsed: 0 },
  generatedAt: "2026-01-01T00:00:00.000Z",
} as const;

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("business identity", () => {
  it("reads as blank before anything is saved", async () => {
    const identity = await getBusinessIdentity();
    expect(identity.name).toBe("");
    expect(identity.logo).toBeNull();
    expect(identity.terms).toBeNull();
  });

  it("merges a partial save instead of replacing the whole identity", async () => {
    await saveBusinessIdentity({ name: "La Esquina", email: "hola@laesquina.com" });
    await saveBusinessIdentity({ phone: "+54 11 5555 5555" });

    const identity = await getBusinessIdentity();
    expect(identity.name).toBe("La Esquina");
    expect(identity.email).toBe("hola@laesquina.com");
    expect(identity.phone).toBe("+54 11 5555 5555");
    expect(identity.updatedAt).not.toBeNull();
  });

  it("keeps the identity when the generated profile is cleared", async () => {
    await saveBusinessIdentity({ name: "La Esquina" });
    await saveBusinessProfile(RECORD);
    await clearBusinessProfile();

    expect(await getBusinessProfile()).toBeNull();
    expect((await getBusinessIdentity()).name).toBe("La Esquina");
  });
});

describe("hand-editing the generated profile", () => {
  it("patches only the fields given and stamps editedAt", async () => {
    await saveBusinessProfile(RECORD);
    const updated = await updateBusinessProfile({ industry: "Panadería artesanal", hours: "9 a 18" });

    expect(updated?.profile.industry).toBe("Panadería artesanal");
    expect(updated?.profile.hours).toBe("9 a 18");
    expect(updated?.profile.name).toBe(RECORD.profile.name);
    expect(updated?.editedAt).toBeTruthy();
  });

  it("reports nothing to edit when no profile was generated", async () => {
    expect(await updateBusinessProfile({ industry: "Otra cosa" })).toBeNull();
  });
});

describe("logo", () => {
  const bytes = new Uint8Array([137, 80, 78, 71]);

  it("stores the bytes and reads them back", async () => {
    const logo = await saveBusinessLogo({ bytes, mime: "image/png", extension: ".png" });
    expect(logo.size).toBe(4);

    const stored = await readBusinessLogo();
    expect(stored?.logo.mime).toBe("image/png");
    expect(Array.from(stored?.bytes ?? [])).toEqual([137, 80, 78, 71]);
  });

  it("drops the replaced file rather than leaving it behind", async () => {
    const first = await saveBusinessLogo({ bytes, mime: "image/png", extension: ".png" });
    await saveBusinessLogo({ bytes, mime: "image/webp", extension: ".webp" });

    expect(existsSync(join(TEST_DIR, ".steve", "business", first.file))).toBe(false);
    expect((await getBusinessIdentity()).logo?.mime).toBe("image/webp");
  });

  it("reads as absent once deleted", async () => {
    await saveBusinessLogo({ bytes, mime: "image/png", extension: ".png" });
    await deleteBusinessLogo();

    expect(await readBusinessLogo()).toBeNull();
    expect((await getBusinessIdentity()).logo).toBeNull();
  });
});

describe("legal pages", () => {
  it("stores each kind separately", async () => {
    await setLegalPage("terms", {
      url: "https://laesquina.com/terminos",
      text: "Devoluciones dentro de 30 días.",
      documentId: "doc-1",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    const identity = await getBusinessIdentity();
    expect(identity.terms?.documentId).toBe("doc-1");
    expect(identity.privacy).toBeNull();
  });
});
