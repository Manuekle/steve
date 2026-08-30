import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `steve-medialib-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_DIR };
});

// No embedding model configured: the point of these tests is that the media
// library keeps working — upload, edit, keyword search — on an install that
// has no OpenAI or Gateway key at all.
vi.mock("./ai-provider", () => ({
  resolveEmbeddingModel: () => null,
  EMBEDDING_UNAVAILABLE_MESSAGE: "No embedding credentials.",
}));

const { MediaError, ingestMedia, editMedia, findMedia, MAX_BYTES_BY_KIND } = await import("./media-library");
const { createFolder, getAsset, listFolders } = await import("./media-store");

const bytes = (length: number) => new Uint8Array(length).fill(1);

function reset() {
  rmSync(TEST_DIR, { recursive: true, force: true });
}

beforeEach(reset);
afterEach(reset);

describe("ingestMedia", () => {
  it("stores a photo with its description and folder", async () => {
    const folder = await createFolder({ name: "Sillones" });
    const asset = await ingestMedia({
      name: "sillon.png",
      mime: "image/png",
      bytes: bytes(64),
      folderId: folder.id,
      description: "Sillón de roble macizo",
      tags: ["living"],
    });

    expect(asset.kind).toBe("image");
    expect(asset.folder_id).toBe(folder.id);
    expect(asset.description).toBe("Sillón de roble macizo");
    // No embedding model, so nothing is recorded — and that must not fail
    // the upload.
    expect(asset.embedding_model).toBe("");
  });

  it("rejects a format that can't be sent as media", async () => {
    await expect(
      ingestMedia({ name: "precios.pdf", mime: "application/pdf", bytes: bytes(64) }),
    ).rejects.toBeInstanceOf(MediaError);
  });

  it("rejects an empty file", async () => {
    await expect(
      ingestMedia({ name: "vacio.png", mime: "image/png", bytes: new Uint8Array(0) }),
    ).rejects.toBeInstanceOf(MediaError);
  });

  it("enforces the per-kind cap, not one shared limit", async () => {
    const overSizedImage = MAX_BYTES_BY_KIND.image + 1;
    await expect(
      ingestMedia({ name: "grande.png", mime: "image/png", bytes: bytes(overSizedImage) }),
    ).rejects.toThrow(/5 MB/);

    // The same byte count is fine as a video, where WhatsApp allows 16 MB.
    const video = await ingestMedia({
      name: "clip.mp4",
      mime: "video/mp4",
      bytes: bytes(overSizedImage),
    });
    expect(video.kind).toBe("video");
  });
});

describe("editMedia", () => {
  it("applies the patch and leaves the rest alone", async () => {
    const asset = await ingestMedia({
      name: "foto.png",
      mime: "image/png",
      bytes: bytes(32),
      description: "Sin detalle",
      tags: ["viejo"],
    });

    const [folder] = [await createFolder({ name: "Verano" })];
    const updated = await editMedia(
      asset.id,
      { description: "Remera de algodón, talle M", folder_id: folder.id },
      asset,
    );

    expect(updated?.description).toBe("Remera de algodón, talle M");
    expect(updated?.folder_id).toBe(folder.id);
    expect(updated?.name).toBe("foto.png");
    expect(updated?.tags).toEqual(["viejo"]);
    expect((await getAsset(asset.id))?.description).toBe("Remera de algodón, talle M");
  });
});

describe("findMedia", () => {
  it("still ranks by words when no embedding model is configured", async () => {
    await ingestMedia({
      name: "IMG_1.png",
      mime: "image/png",
      bytes: bytes(16),
      description: "Sillón de roble macizo",
    });
    await ingestMedia({
      name: "IMG_2.png",
      mime: "image/png",
      bytes: bytes(16),
      description: "Mesa ratona de vidrio",
    });

    const matches = await findMedia("fotos del sillón de roble");
    expect(matches[0]?.name).toBe("IMG_1.png");
  });

  it("returns nothing for an empty query rather than the whole library", async () => {
    await ingestMedia({ name: "a.png", mime: "image/png", bytes: bytes(16), description: "algo" });
    expect(await findMedia("   ")).toEqual([]);
  });

  it("can be narrowed to one kind", async () => {
    await ingestMedia({ name: "local.png", mime: "image/png", bytes: bytes(16), description: "el local" });
    await ingestMedia({ name: "local.mp4", mime: "video/mp4", bytes: bytes(16), description: "el local" });

    const videos = await findMedia("el local", { kind: "video" });
    expect(videos.map((m) => m.name)).toEqual(["local.mp4"]);
  });

  it("leaves folders untouched", async () => {
    await createFolder({ name: "Catálogo" });
    await findMedia("cualquier cosa");
    expect((await listFolders()).map((f) => f.name)).toEqual(["Catálogo"]);
  });
});
