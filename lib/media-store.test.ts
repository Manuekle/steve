import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Same isolation trick lib/business-store.test.ts uses: the store reads
// homedir() at module scope, so homedir has to point at a temp directory
// before the module is imported. The random suffix keeps parallel vitest
// workers off each other's files.
const TEST_DIR = join(tmpdir(), `steve-media-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_DIR };
});

const {
  addAsset,
  assetSearchText,
  blobPath,
  createFolder,
  deleteAsset,
  deleteFolder,
  getAsset,
  kindForMime,
  listAssets,
  listFolders,
  readAssetBytes,
  searchAssets,
  updateAsset,
  updateFolder,
} = await import("./media-store");

const bytes = (text: string) => new TextEncoder().encode(text);

function reset() {
  rmSync(TEST_DIR, { recursive: true, force: true });
}

beforeEach(reset);
afterEach(reset);

describe("kindForMime", () => {
  it("classifies by mime type first", () => {
    expect(kindForMime("image/png", "whatever.bin")).toBe("image");
    expect(kindForMime("video/mp4", "clip")).toBe("video");
    expect(kindForMime("audio/mpeg", "voice")).toBe("audio");
  });

  it("falls back to the extension when the browser sends no mime", () => {
    expect(kindForMime("", "foto.JPG")).toBe("image");
    expect(kindForMime("application/octet-stream", "clip.mov")).toBe("video");
    expect(kindForMime("", "nota.m4a")).toBe("audio");
    expect(kindForMime("", "contrato.pdf")).toBe("file");
  });
});

describe("folders", () => {
  it("creates, renames, and lists alphabetically", async () => {
    await createFolder({ name: "Sillones" });
    await createFolder({ name: "Alfombras", description: "Fotos de alfombras" });

    expect((await listFolders()).map((f) => f.name)).toEqual(["Alfombras", "Sillones"]);

    const [alfombras] = await listFolders();
    const renamed = await updateFolder(alfombras.id, { name: "Alfombras 2026" });
    expect(renamed?.name).toBe("Alfombras 2026");
    expect(await updateFolder("fld_missing", { name: "x" })).toBeNull();
  });

  it("moves assets to the root instead of deleting them with the folder", async () => {
    const folder = await createFolder({ name: "Verano" });
    const asset = await addAsset({
      name: "remera.png",
      mime: "image/png",
      size: 4,
      bytes: bytes("png!"),
      folderId: folder.id,
    });

    expect(await deleteFolder(folder.id)).toBe(true);

    const survivor = await getAsset(asset.id);
    expect(survivor?.folder_id).toBeNull();
    expect(existsSync(blobPath(survivor!))).toBe(true);
    // The root listing has to pick it up, or the photo is stranded where no
    // screen shows it.
    expect((await listAssets({ folderId: null })).map((a) => a.id)).toContain(asset.id);
  });

  it("reports a folder that no longer exists", async () => {
    expect(await deleteFolder("fld_missing")).toBe(false);
  });
});

describe("assets", () => {
  it("stores bytes under an id-derived name, never the uploaded one", async () => {
    const asset = await addAsset({
      // A name that would escape the media directory if it were used as a path.
      name: "../../escape.png",
      mime: "image/png",
      size: 4,
      bytes: bytes("png!"),
    });

    expect(asset.file.startsWith(asset.id)).toBe(true);
    expect(asset.file).not.toContain("/");
    expect(blobPath(asset)).toBe(join(TEST_DIR, ".steve", "media", asset.file));
    expect(new TextDecoder().decode(await readAssetBytes(asset))).toBe("png!");
  });

  it("filters by folder and by kind", async () => {
    const folder = await createFolder({ name: "Local" });
    await addAsset({ name: "a.png", mime: "image/png", size: 1, bytes: bytes("a"), folderId: folder.id });
    await addAsset({ name: "b.mp4", mime: "video/mp4", size: 1, bytes: bytes("b"), folderId: folder.id });
    await addAsset({ name: "c.png", mime: "image/png", size: 1, bytes: bytes("c") });

    expect((await listAssets({ folderId: folder.id })).length).toBe(2);
    expect((await listAssets({ folderId: null })).map((a) => a.name)).toEqual(["c.png"]);
    expect((await listAssets({ kind: "video" })).map((a) => a.name)).toEqual(["b.mp4"]);
    // No `folderId` at all means every asset, filed or not.
    expect((await listAssets()).length).toBe(3);
  });

  it("deletes the record and the file on disk together", async () => {
    const asset = await addAsset({ name: "x.png", mime: "image/png", size: 1, bytes: bytes("x") });
    const path = blobPath(asset);

    expect(await deleteAsset(asset.id)).toBe(true);
    expect(existsSync(path)).toBe(false);
    expect(await getAsset(asset.id)).toBeNull();
    expect(await deleteAsset(asset.id)).toBe(false);
  });

  it("trims tags and drops the empty ones", async () => {
    const asset = await addAsset({
      name: "y.png",
      mime: "image/png",
      size: 1,
      bytes: bytes("y"),
      tags: [" living ", "", "  ", "oferta"],
    });
    expect(asset.tags).toEqual(["living", "oferta"]);

    const updated = await updateAsset(asset.id, { tags: ["roble", " "] });
    expect(updated?.tags).toEqual(["roble"]);
  });
});

describe("searchAssets", () => {
  it("matches on description and tags without any embedding", async () => {
    const folder = await createFolder({ name: "Sillones" });
    await addAsset({
      name: "IMG_4821.png",
      mime: "image/png",
      size: 1,
      bytes: bytes("a"),
      folderId: folder.id,
      description: "Sillón de roble macizo, tapizado beige",
      tags: ["living"],
    });
    await addAsset({
      name: "IMG_4822.png",
      mime: "image/png",
      size: 1,
      bytes: bytes("b"),
      folderId: folder.id,
      description: "Mesa ratona de vidrio",
    });

    const matches = await searchAssets("tenés fotos del sillón de roble?");
    expect(matches[0]?.name).toBe("IMG_4821.png");
    expect(matches[0]?.folder_name).toBe("Sillones");
  });

  it("ignores accents, so an unaccented question still finds an accented description", async () => {
    await addAsset({
      name: "z.png",
      mime: "image/png",
      size: 1,
      bytes: bytes("z"),
      description: "Camión de reparto",
    });
    expect((await searchAssets("camion")).length).toBe(1);
  });

  it("prefers the embedding when it is stronger than the word overlap", async () => {
    const vague = await addAsset({
      name: "one.png",
      mime: "image/png",
      size: 1,
      bytes: bytes("1"),
      description: "Campera impermeable",
      embedding: [1, 0, 0],
      embeddingModel: "test",
    });
    await addAsset({
      name: "two.png",
      mime: "image/png",
      size: 1,
      bytes: bytes("2"),
      description: "Zapatos de vestir",
      embedding: [0, 1, 0],
      embeddingModel: "test",
    });

    // No word in common with either description — only the vector can rank this.
    const matches = await searchAssets("algo para la lluvia", { embedding: [1, 0, 0] });
    expect(matches[0]?.id).toBe(vague.id);
    expect(matches[0]?.score).toBeCloseTo(1, 5);
  });

  it("drops an asset's embedding when it is cleared", async () => {
    const asset = await addAsset({
      name: "e.png",
      mime: "image/png",
      size: 1,
      bytes: bytes("e"),
      description: "Lámpara",
      embedding: [1, 0],
      embeddingModel: "test",
    });

    await updateAsset(asset.id, { embedding: null });
    expect((await getAsset(asset.id))?.embedding_model).toBe("");
    // With the vector gone, an unrelated query has nothing left to match on.
    expect(await searchAssets("bicicleta", { embedding: [1, 0] })).toEqual([]);
  });
});

describe("assetSearchText", () => {
  it("includes the folder name, so filing a photo makes it findable", () => {
    const text = assetSearchText(
      {
        name: "IMG_1.png",
        description: "Tapizado beige",
        tags: ["living"],
      } as Parameters<typeof assetSearchText>[0],
      "Sillones",
    );
    expect(text).toContain("Sillones");
    expect(text).toContain("Tapizado beige");
    expect(text).toContain("living");
  });
});
