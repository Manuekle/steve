import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { deleteFromDrive, downloadFromDrive, isDriveConfigured, uploadToDrive } from "./google-drive";

// Media library: the photos, videos, and audio the business wants the agent
// to be able to *send*, organized in folders.
//
// This is the sibling of knowledge-store.ts. Knowledge holds text the agent
// reads out; this holds files the agent hands over — "¿tenés fotos de la
// mesa de roble?" is answered by finding the asset and pushing the bytes to
// WhatsApp, not by quoting a chunk.
//
// Folders live here rather than in knowledge-store because they organize
// both: a knowledge document carries a `folder_id` pointing at this list, so
// the Conocimiento page shows one folder tree over documents and media.
//
// Metadata always sits in ~/.steve/media.json. The bytes sit in the
// connected Google account's Drive when one is connected (see
// lib/google-drive.ts — `drive.file` scope, so it only ever sees files this
// app created), and in ~/.steve/media/ otherwise. An asset already on disk
// stays on disk even after Google gets connected; only new uploads move.
// Embeddings are kept in their own array so listing a folder (every page
// load) never walks the vectors.

const STORE_FILE = join(homedir(), ".steve", "media.json");
const BLOB_DIR = join(homedir(), ".steve", "media");

export type MediaKind = "image" | "video" | "audio" | "file";

export type MediaFolder = {
  id: string;
  name: string;
  /** Free text the owner writes so the agent knows what lives in here. */
  description: string;
  created_at: string;
};

export type MediaAsset = {
  id: string;
  folder_id: string | null;
  name: string;
  mime: string;
  kind: MediaKind;
  size: number;
  /** What the file shows. This is the main thing the agent searches on, so
   *  the UI pushes hard for it on upload. */
  description: string;
  tags: string[];
  /** Basename inside BLOB_DIR. Never a path — joined here, never by callers.
   *  Kept even for a Drive-backed asset (nothing reads it then), so the
   *  field never has to be conditionally present. */
  file: string;
  /** Set when the bytes live on the connected Google Drive instead of
   *  BLOB_DIR — the file id `alt=media` reads back. */
  drive_file_id?: string;
  /** Model that produced this asset's embedding, or "" when none was made. */
  embedding_model: string;
  created_at: string;
};

export type MediaAssetMatch = MediaAsset & {
  score: number;
  folder_name: string | null;
};

type MediaEmbedding = { asset_id: string; vector: number[] };

type MediaStore = {
  folders: MediaFolder[];
  assets: MediaAsset[];
  embeddings: MediaEmbedding[];
};

function emptyStore(): MediaStore {
  return { folders: [], assets: [], embeddings: [] };
}

function normalize(parsed: Partial<MediaStore>): MediaStore {
  return {
    folders: parsed.folders ?? [],
    assets: parsed.assets ?? [],
    embeddings: parsed.embeddings ?? [],
  };
}

let writeQueue: Promise<void> = Promise.resolve();

// Same reason knowledge-store serializes: two uploads landing together would
// otherwise both read the pre-update store and the second write would drop
// the first asset.
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readStore(): Promise<MediaStore> {
  try {
    return normalize(JSON.parse(await readFile(STORE_FILE, "utf-8")) as Partial<MediaStore>);
  } catch {
    return emptyStore();
  }
}

function readStoreSync(): MediaStore {
  try {
    if (!existsSync(STORE_FILE)) return emptyStore();
    return normalize(JSON.parse(readFileSync(STORE_FILE, "utf-8")) as Partial<MediaStore>);
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: MediaStore): Promise<void> {
  await mkdir(dirname(STORE_FILE), { recursive: true });
  const tmp = `${STORE_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(store), "utf-8");
  await rename(tmp, STORE_FILE);
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function kindForMime(mime: string, name = ""): MediaKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"].includes(extension)) return "image";
  if ([".mp4", ".mov", ".webm", ".m4v", ".3gp"].includes(extension)) return "video";
  if ([".mp3", ".ogg", ".wav", ".m4a", ".aac"].includes(extension)) return "audio";
  return "file";
}

// ── Folders ─────────────────────────────────────────────────────────

export async function listFolders(): Promise<MediaFolder[]> {
  const store = await readStore();
  return [...store.folders].sort((a, b) => a.name.localeCompare(b.name));
}

export function listFoldersSync(): MediaFolder[] {
  return [...readStoreSync().folders].sort((a, b) => a.name.localeCompare(b.name));
}

export async function createFolder(input: {
  name: string;
  description?: string;
}): Promise<MediaFolder> {
  return enqueue(async () => {
    const store = await readStore();
    const folder: MediaFolder = {
      id: newId("fld"),
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      created_at: new Date().toISOString(),
    };
    store.folders.push(folder);
    await writeStore(store);
    return folder;
  });
}

export async function updateFolder(
  id: string,
  patch: { name?: string; description?: string },
): Promise<MediaFolder | null> {
  return enqueue(async () => {
    const store = await readStore();
    const folder = store.folders.find((f) => f.id === id);
    if (!folder) return null;
    if (patch.name !== undefined) folder.name = patch.name.trim();
    if (patch.description !== undefined) folder.description = patch.description.trim();
    await writeStore(store);
    return folder;
  });
}

/**
 * Delete a folder. Its assets are moved to the root rather than deleted —
 * losing a photo because a folder was renamed away is not a trade the owner
 * of a catalog would ever want. Knowledge documents pointing at this folder
 * are orphaned the same way, handled by `listDocuments` treating an unknown
 * `folder_id` as root.
 */
export async function deleteFolder(id: string): Promise<boolean> {
  return enqueue(async () => {
    const store = await readStore();
    const before = store.folders.length;
    store.folders = store.folders.filter((f) => f.id !== id);
    if (store.folders.length === before) return false;
    for (const asset of store.assets) {
      if (asset.folder_id === id) asset.folder_id = null;
    }
    await writeStore(store);
    return true;
  });
}

// ── Assets ──────────────────────────────────────────────────────────

export async function listAssets(
  options: { folderId?: string | null; kind?: MediaKind } = {},
): Promise<MediaAsset[]> {
  const store = await readStore();
  const known = new Set(store.folders.map((f) => f.id));
  return store.assets
    .filter((asset) => {
      if (options.kind && asset.kind !== options.kind) return false;
      if (options.folderId === undefined) return true;
      // An asset whose folder was deleted mid-flight reads as root.
      const folder = asset.folder_id && known.has(asset.folder_id) ? asset.folder_id : null;
      return folder === options.folderId;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getAsset(id: string): Promise<MediaAsset | null> {
  return (await readStore()).assets.find((a) => a.id === id) ?? null;
}

export function blobPath(asset: Pick<MediaAsset, "file">): string {
  return join(BLOB_DIR, asset.file);
}

export async function readAssetBytes(
  asset: Pick<MediaAsset, "file" | "drive_file_id">,
): Promise<Uint8Array> {
  if (asset.drive_file_id) return downloadFromDrive(asset.drive_file_id);
  return new Uint8Array(await readFile(blobPath(asset)));
}

export async function addAsset(input: {
  name: string;
  mime: string;
  size: number;
  bytes: Uint8Array;
  folderId?: string | null;
  description?: string;
  tags?: readonly string[];
  embedding?: readonly number[] | null;
  embeddingModel?: string;
}): Promise<MediaAsset> {
  const id = newId("med");
  const dot = input.name.lastIndexOf(".");
  const extension = dot > 0 ? input.name.slice(dot).toLowerCase() : "";
  // The stored basename is derived from the id, never from the uploaded
  // name: an uploaded "../../.ssh/authorized_keys" must not escape BLOB_DIR.
  const file = `${id}${extension.replace(/[^a-z0-9.]/g, "")}`;

  // Connected Google account wins, same as Sheets and Calendar: try Drive
  // first, and only write to disk if it isn't connected or the upload fails
  // — a token that exists but was granted before `drive.file` was added to
  // the scope list would otherwise silently drop the file.
  let driveFileId: string | undefined;
  if (await isDriveConfigured()) {
    try {
      const uploaded = await uploadToDrive({ name: input.name, mime: input.mime, bytes: input.bytes });
      driveFileId = uploaded?.fileId;
    } catch {
      driveFileId = undefined;
    }
  }

  if (!driveFileId) {
    await mkdir(BLOB_DIR, { recursive: true });
    await writeFile(join(BLOB_DIR, file), input.bytes);
  }

  return enqueue(async () => {
    const store = await readStore();
    const asset: MediaAsset = {
      id,
      folder_id: input.folderId ?? null,
      name: input.name,
      mime: input.mime,
      kind: kindForMime(input.mime, input.name),
      size: input.size,
      description: input.description?.trim() ?? "",
      tags: (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
      file,
      ...(driveFileId ? { drive_file_id: driveFileId } : {}),
      embedding_model: input.embedding ? (input.embeddingModel ?? "") : "",
      created_at: new Date().toISOString(),
    };
    store.assets.push(asset);
    if (input.embedding) {
      store.embeddings.push({ asset_id: id, vector: [...input.embedding] });
    }
    await writeStore(store);
    return asset;
  });
}

/**
 * Register a file that already lives on Drive — a folder import (see
 * lib/drive-import.ts) — without re-uploading its bytes. `readAssetBytes`
 * fetches from Drive on demand, exactly as it does for an asset this app
 * uploaded itself; the only difference is nothing was ever written locally.
 */
export async function addAssetFromDrive(input: {
  name: string;
  mime: string;
  size: number;
  driveFileId: string;
  folderId?: string | null;
  description?: string;
}): Promise<MediaAsset> {
  return enqueue(async () => {
    const store = await readStore();
    const asset: MediaAsset = {
      id: newId("med"),
      folder_id: input.folderId ?? null,
      name: input.name,
      mime: input.mime,
      kind: kindForMime(input.mime, input.name),
      size: input.size,
      description: input.description?.trim() ?? "",
      tags: [],
      // No local basename: nothing was ever written to BLOB_DIR for this
      // asset, and `drive_file_id` below is what readAssetBytes checks first.
      file: "",
      drive_file_id: input.driveFileId,
      embedding_model: "",
      created_at: new Date().toISOString(),
    };
    store.assets.push(asset);
    await writeStore(store);
    return asset;
  });
}

export async function updateAsset(
  id: string,
  patch: {
    name?: string;
    description?: string;
    tags?: readonly string[];
    folder_id?: string | null;
    embedding?: readonly number[] | null;
    embeddingModel?: string;
  },
): Promise<MediaAsset | null> {
  return enqueue(async () => {
    const store = await readStore();
    const asset = store.assets.find((a) => a.id === id);
    if (!asset) return null;
    if (patch.name !== undefined) asset.name = patch.name.trim() || asset.name;
    if (patch.description !== undefined) asset.description = patch.description.trim();
    if (patch.tags !== undefined) asset.tags = patch.tags.map((t) => t.trim()).filter(Boolean);
    if (patch.folder_id !== undefined) asset.folder_id = patch.folder_id;
    if (patch.embedding !== undefined) {
      store.embeddings = store.embeddings.filter((e) => e.asset_id !== id);
      if (patch.embedding) {
        store.embeddings.push({ asset_id: id, vector: [...patch.embedding] });
        asset.embedding_model = patch.embeddingModel ?? asset.embedding_model;
      } else {
        asset.embedding_model = "";
      }
    }
    await writeStore(store);
    return asset;
  });
}

export async function deleteAsset(id: string): Promise<boolean> {
  const removed = await enqueue(async () => {
    const store = await readStore();
    const asset = store.assets.find((a) => a.id === id);
    if (!asset) return null;
    store.assets = store.assets.filter((a) => a.id !== id);
    store.embeddings = store.embeddings.filter((e) => e.asset_id !== id);
    await writeStore(store);
    return asset;
  });
  if (!removed) return false;
  // Best-effort: a stranded blob (or Drive file) costs storage, a failed
  // delete costs the user their action.
  if (removed.drive_file_id) {
    await deleteFromDrive(removed.drive_file_id).catch(() => undefined);
  } else {
    await rm(join(BLOB_DIR, removed.file), { force: true }).catch(() => undefined);
  }
  return true;
}

// ── Search ──────────────────────────────────────────────────────────

function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** The text an asset is matched against: everything a person would have
 *  typed about it, including the folder it was filed under. */
export function assetSearchText(asset: MediaAsset, folderName?: string | null): string {
  return [asset.name, asset.description, asset.tags.join(" "), folderName ?? ""]
    .filter(Boolean)
    .join(" · ");
}

/** Share of the query's words that appear in the asset's text. Cheap, and
 *  the only thing that works before embeddings are configured — a catalog
 *  named "remera-negra-M.jpg" is findable by literal words alone. */
function keywordScore(query: string, haystack: string): number {
  const words = fold(query)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
  if (words.length === 0) return 0;
  const text = fold(haystack);
  const hits = words.filter((word) => text.includes(word)).length;
  return hits / words.length;
}

/**
 * Rank assets against a query.
 *
 * Hybrid on purpose: the embedding half catches "algo para la lluvia" →
 * "campera impermeable", the keyword half catches exact SKUs and file names
 * that embeddings blur away. The two are combined by taking the stronger
 * signal, so neither can drag a good match down.
 */
export async function searchAssets(
  query: string,
  options: {
    embedding?: readonly number[] | null;
    limit?: number;
    minScore?: number;
    kind?: MediaKind;
    folderId?: string | null;
  } = {},
): Promise<MediaAssetMatch[]> {
  const { limit = 5, minScore = 0.15, kind, folderId, embedding } = options;
  const store = await readStore();
  const folders = new Map(store.folders.map((f) => [f.id, f.name]));
  const vectors = new Map(store.embeddings.map((e) => [e.asset_id, e.vector]));

  const scored: MediaAssetMatch[] = [];
  for (const asset of store.assets) {
    if (kind && asset.kind !== kind) continue;
    if (folderId !== undefined && (asset.folder_id ?? null) !== folderId) continue;

    const folderName = asset.folder_id ? (folders.get(asset.folder_id) ?? null) : null;
    const lexical = keywordScore(query, assetSearchText(asset, folderName));
    const vector = embedding ? vectors.get(asset.id) : undefined;
    const semantic = vector && embedding ? cosine(embedding, vector) : 0;

    const score = Math.max(lexical, semantic);
    if (score < minScore) continue;
    scored.push({ ...asset, score, folder_name: folderName });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function countAssets(): Promise<number> {
  return (await readStore()).assets.length;
}
