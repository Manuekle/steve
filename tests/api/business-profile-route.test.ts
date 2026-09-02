import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * The routes behind the "Mi negocio" card. What matters here is what each one
 * refuses before it touches the store: a website without a scheme, a logo in a
 * format the browser can't render, an edit to a profile that was never
 * generated.
 *
 * The store writes to a temp home; indexing is mocked, because whether the
 * legal text reaches the knowledge base is `lib/rag`'s business, not the
 * route's.
 */

const TEST_DIR = join(tmpdir(), `steve-bp-route-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_DIR };
});

const rag = vi.hoisted(() => ({
  ingestFile: vi.fn(async () => ({ id: "doc-1" })),
}));

vi.mock("@/lib/rag", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rag")>("@/lib/rag");
  return { ...actual, ingestFile: rag.ingestFile };
});

const knowledge = vi.hoisted(() => ({ deleteDocument: vi.fn(async () => true) }));

vi.mock("@/lib/knowledge-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/knowledge-store")>("@/lib/knowledge-store");
  return { ...actual, deleteDocument: knowledge.deleteDocument };
});

const identityRoute = await import("@/app/api/business-profile/identity/route");
const logoRoute = await import("@/app/api/business-profile/logo/route");
const legalRoute = await import("@/app/api/business-profile/legal/route");
const profileRoute = await import("@/app/api/business-profile/route");
const { saveBusinessProfile } = await import("@/lib/business-profile-store");

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  vi.clearAllMocks();
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

// The route handlers are typed against NextRequest; a plain Request carries
// everything they actually read.
type AnyRequest = Parameters<typeof identityRoute.PATCH>[0];

describe("PATCH /api/business-profile/identity", () => {
  it("saves the fields it recognizes, trimmed", async () => {
    const response = await identityRoute.PATCH(
      json("http://localhost/api/business-profile/identity", "PATCH", {
        name: "  La Esquina  ",
        phone: "+54 11 5555 5555",
        ignored: "nope",
      }) as AnyRequest,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { identity: { name: string; phone: string } };
    expect(body.identity.name).toBe("La Esquina");
    expect(body.identity.phone).toBe("+54 11 5555 5555");
  });

  it("refuses a website with no scheme", async () => {
    const response = await identityRoute.PATCH(
      json("http://localhost/api/business-profile/identity", "PATCH", {
        websiteUrl: "laesquina.com",
      }) as AnyRequest,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).field).toBe("websiteUrl");
  });

  it("refuses something that isn't an email address", async () => {
    const response = await identityRoute.PATCH(
      json("http://localhost/api/business-profile/identity", "PATCH", {
        email: "hola-arroba-nada",
      }) as AnyRequest,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).field).toBe("email");
  });

  it("accepts an empty value as clearing the field", async () => {
    await identityRoute.PATCH(
      json("http://localhost/api/business-profile/identity", "PATCH", {
        email: "hola@laesquina.com",
      }) as AnyRequest,
    );
    const response = await identityRoute.PATCH(
      json("http://localhost/api/business-profile/identity", "PATCH", { email: "" }) as AnyRequest,
    );

    expect(response.status).toBe(200);
    expect((await response.json()).identity.email).toBe("");
  });

  it("says so when the body asks for no change at all", async () => {
    const response = await identityRoute.PATCH(
      json("http://localhost/api/business-profile/identity", "PATCH", { nothing: 1 }) as AnyRequest,
    );

    expect((await response.json()).code).toBe("nothing_to_update");
  });
});

describe("/api/business-profile/logo", () => {
  function upload(file: File) {
    const form = new FormData();
    form.append("file", file);
    return new Request("http://localhost/api/business-profile/logo", { method: "POST", body: form });
  }

  it("stores a PNG and serves it back with its own type", async () => {
    const png = new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" });
    const posted = await logoRoute.POST(upload(png) as AnyRequest);
    expect(posted.status).toBe(200);

    const served = await logoRoute.GET();
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    // An uploaded SVG is a script on this origin unless the response says
    // otherwise — the guard is worth a test of its own.
    expect(served.headers.get("content-security-policy")).toContain("sandbox");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("refuses a format the browser wouldn't render as an image", async () => {
    const pdf = new File([new Uint8Array([1, 2, 3])], "logo.pdf", { type: "application/pdf" });
    const response = await logoRoute.POST(upload(pdf) as AnyRequest);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("unsupported_format");
  });

  it("answers not_found before anything has been uploaded", async () => {
    expect((await logoRoute.GET()).status).toBe(404);
  });
});

describe("PUT /api/business-profile/legal", () => {
  it("indexes the text and remembers the document it became", async () => {
    const response = await legalRoute.PUT(
      json("http://localhost/api/business-profile/legal", "PUT", {
        kind: "terms",
        url: "https://laesquina.com/terminos",
        text: "Devoluciones dentro de 30 días.",
      }) as AnyRequest,
    );

    expect(response.status).toBe(200);
    expect(rag.ingestFile).toHaveBeenCalledOnce();
    const body = (await response.json()) as { identity: { terms: { documentId: string } } };
    expect(body.identity.terms.documentId).toBe("doc-1");
  });

  it("keeps the page when indexing fails, and says why", async () => {
    const { RagError } = await import("@/lib/rag");
    rag.ingestFile.mockRejectedValueOnce(new RagError("Sin credencial de embeddings."));

    const response = await legalRoute.PUT(
      json("http://localhost/api/business-profile/legal", "PUT", {
        kind: "privacy",
        text: "No vendemos tus datos.",
      }) as AnyRequest,
    );

    const body = (await response.json()) as {
      identity: { privacy: { text: string; documentId: string | null } };
      indexWarning?: string;
    };
    expect(body.identity.privacy.text).toBe("No vendemos tus datos.");
    expect(body.identity.privacy.documentId).toBeNull();
    expect(body.indexWarning).toContain("embeddings");
  });

  it("drops the stale indexed copy when the new text can't be indexed", async () => {
    const { RagError } = await import("@/lib/rag");
    await legalRoute.PUT(
      json("http://localhost/api/business-profile/legal", "PUT", {
        kind: "terms",
        text: "Devoluciones dentro de 30 días.",
      }) as AnyRequest,
    );
    rag.ingestFile.mockRejectedValueOnce(new RagError("Sin credencial de embeddings."));

    const response = await legalRoute.PUT(
      json("http://localhost/api/business-profile/legal", "PUT", {
        kind: "terms",
        text: "Devoluciones dentro de 15 días.",
      }) as AnyRequest,
    );

    // Nothing searchable beats the agent quoting the 30-day version that the
    // owner has just replaced.
    expect(knowledge.deleteDocument).toHaveBeenCalledWith("doc-1");
    expect((await response.json()).identity.terms.documentId).toBeNull();
  });

  it("refuses a kind it doesn't know", async () => {
    const response = await legalRoute.PUT(
      json("http://localhost/api/business-profile/legal", "PUT", {
        kind: "cookies",
        text: "…",
      }) as AnyRequest,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).field).toBe("kind");
  });

  it("removes the indexed copy along with the page", async () => {
    await legalRoute.PUT(
      json("http://localhost/api/business-profile/legal", "PUT", {
        kind: "terms",
        text: "Devoluciones dentro de 30 días.",
      }) as AnyRequest,
    );
    const response = await legalRoute.DELETE(
      new Request("http://localhost/api/business-profile/legal?kind=terms", {
        method: "DELETE",
      }) as AnyRequest,
    );

    expect(knowledge.deleteDocument).toHaveBeenCalledWith("doc-1");
    expect((await response.json()).identity.terms).toBeNull();
  });
});

describe("PATCH /api/business-profile", () => {
  const RECORD = {
    profile: {
      name: "Panadería La Esquina",
      industry: "Panadería",
      description: "Pan de masa madre.",
      services: ["Pan"],
      location: null,
      hours: null,
      tone: "cercano",
      highlights: [],
      faqs: [],
    },
    sources: { documentsUsed: 0 },
    generatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("has nothing to edit until a profile has been generated", async () => {
    const response = await profileRoute.PATCH(
      json("http://localhost/api/business-profile", "PATCH", { industry: "Otra" }) as AnyRequest,
    );

    expect(response.status).toBe(404);
  });

  it("rewrites the lists and clears an emptied optional field", async () => {
    await saveBusinessProfile(RECORD);
    const response = await profileRoute.PATCH(
      json("http://localhost/api/business-profile", "PATCH", {
        services: ["Pan", "  ", "Facturas"],
        hours: "   ",
      }) as AnyRequest,
    );

    const body = (await response.json()) as {
      record: { profile: { services: string[]; hours: string | null }; editedAt: string };
    };
    expect(body.record.profile.services).toEqual(["Pan", "Facturas"]);
    expect(body.record.profile.hours).toBeNull();
    expect(body.record.editedAt).toBeTruthy();
  });

  it("refuses to blank the name", async () => {
    await saveBusinessProfile(RECORD);
    const response = await profileRoute.PATCH(
      json("http://localhost/api/business-profile", "PATCH", { name: "  " }) as AnyRequest,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).field).toBe("name");
  });
});
