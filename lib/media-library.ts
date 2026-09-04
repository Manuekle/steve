import { embed } from "ai";
import { EMBEDDING_UNAVAILABLE_MESSAGE, resolveEmbeddingModel } from "./ai-provider";
import {
  addAsset,
  assetSearchText,
  kindForMime,
  listFolders,
  searchAssets,
  updateAsset,
  type MediaAsset,
  type MediaAssetMatch,
  type MediaKind,
} from "./media-store";

// Ingest and retrieval for the media library — the counterpart of lib/rag.ts,
// with one important difference: a photo has no text to chunk. What gets
// embedded is what a person wrote *about* the file (its name, the description
// typed on upload, its tags, its folder), which is also exactly what a
// customer's "¿tenés fotos de X?" is phrased against.
//
// Embeddings are optional here, unlike in RAG. A business with no OpenAI key
// can still upload a catalog of photos and have the agent find them by name
// and tags; the embedding only widens what counts as a match.

export class MediaError extends Error {}

/** Per-kind caps, set by what the WhatsApp Cloud API will actually accept —
 *  storing a 40 MB video the agent can never send is a trap, not a feature.
 *  https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media */
export const MAX_BYTES_BY_KIND: Record<MediaKind, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  file: 25 * 1024 * 1024,
};

export const MAX_MEDIA_BYTES = MAX_BYTES_BY_KIND.file;

export const ACCEPTED_MEDIA_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".mp4",
  ".mov",
  ".webm",
  ".m4v",
  ".3gp",
  ".mp3",
  ".ogg",
  ".wav",
  ".m4a",
  ".aac",
] as const;

export const MEDIA_ACCEPT_ATTRIBUTE = ACCEPTED_MEDIA_EXTENSIONS.join(",");

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** The sentence embedded for an asset, and re-embedded whenever its
 *  description changes. Kept in one place so upload and edit can never drift
 *  into embedding different text for the same file. */
async function embedAssetText(
  text: string,
): Promise<{ vector: number[]; model: string } | null> {
  const embedding = resolveEmbeddingModel();
  if (!embedding || !text.trim()) return null;
  try {
    const { embedding: vector } = await embed({ model: embedding.model, value: text });
    return { vector, model: embedding.modelId };
  } catch {
    // A missing embedding degrades search to keyword matching, which still
    // works. It must never cost the user their upload.
    return null;
  }
}

export async function ingestMedia(input: {
  name: string;
  mime: string;
  bytes: Uint8Array;
  folderId?: string | null;
  description?: string;
  tags?: readonly string[];
}): Promise<MediaAsset> {
  if (input.bytes.byteLength === 0) throw new MediaError("El archivo está vacío.");

  const extension = extensionOf(input.name);
  const kind = kindForMime(input.mime, input.name);
  // Both halves, and the extension one is the half that was missing.
  //
  // `kindForMime` classifies on the MIME prefix, so `image/svg+xml` came back
  // as "image" and sailed through — `extension` was only ever interpolated
  // into the error message, never checked. An SVG is a document that can carry
  // script, and app/api/media/[id]/file serves these bytes back inline under
  // the stored MIME on this app's own origin: an upload was a stored-XSS slot
  // with the whole session-authenticated API behind it, including the
  // plaintext credential export. ACCEPTED_MEDIA_EXTENSIONS holds no format
  // that can execute, so requiring membership closes it at the door — and the
  // response headers on that route close it again on the way out.
  if (kind === "file" || !(ACCEPTED_MEDIA_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new MediaError(
      `Formato no soportado: ${extension || input.mime}. Aceptados: ${ACCEPTED_MEDIA_EXTENSIONS.join(", ")}.`,
    );
  }

  const cap = MAX_BYTES_BY_KIND[kind];
  if (input.bytes.byteLength > cap) {
    throw new MediaError(
      `El archivo supera el límite de ${formatMb(cap)} para ${kind === "image" ? "imágenes" : kind === "video" ? "videos" : "audios"}. WhatsApp no acepta más que eso.`,
    );
  }

  const folders = await listFolders();
  const folderName = input.folderId
    ? (folders.find((f) => f.id === input.folderId)?.name ?? null)
    : null;

  const searchText = assetSearchText(
    {
      name: input.name,
      description: input.description ?? "",
      tags: [...(input.tags ?? [])],
    } as MediaAsset,
    folderName,
  );
  const embedded = await embedAssetText(searchText);

  return addAsset({
    name: input.name,
    mime: input.mime,
    size: input.bytes.byteLength,
    bytes: input.bytes,
    folderId: input.folderId ?? null,
    description: input.description,
    tags: input.tags,
    embedding: embedded?.vector ?? null,
    embeddingModel: embedded?.model,
  });
}

/**
 * Apply an edit and keep the embedding in sync. Anything that changes the
 * searchable text (name, description, tags, folder) re-embeds; a pure move
 * with no text change still re-embeds, because the folder name is part of
 * that text.
 */
export async function editMedia(
  id: string,
  patch: {
    name?: string;
    description?: string;
    tags?: readonly string[];
    folder_id?: string | null;
  },
  current: MediaAsset,
): Promise<MediaAsset | null> {
  const next = {
    name: patch.name ?? current.name,
    description: patch.description ?? current.description,
    tags: patch.tags ?? current.tags,
    folder_id: patch.folder_id !== undefined ? patch.folder_id : current.folder_id,
  };

  const folders = await listFolders();
  const folderName = next.folder_id
    ? (folders.find((f) => f.id === next.folder_id)?.name ?? null)
    : null;
  const embedded = await embedAssetText(
    assetSearchText({ ...current, ...next, tags: [...next.tags] } as MediaAsset, folderName),
  );

  return updateAsset(id, {
    ...patch,
    embedding: embedded?.vector ?? null,
    embeddingModel: embedded?.model,
  });
}

/**
 * Find assets for a natural-language query. Embeds the query when a model is
 * configured and lets `searchAssets` blend that with keyword matching.
 */
export async function findMedia(
  query: string,
  options: { limit?: number; kind?: MediaKind; folderId?: string | null; minScore?: number } = {},
): Promise<MediaAssetMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const embedding = resolveEmbeddingModel();
  let vector: number[] | null = null;
  if (embedding) {
    try {
      vector = (await embed({ model: embedding.model, value: trimmed })).embedding;
    } catch {
      vector = null;
    }
  }

  return searchAssets(trimmed, { ...options, embedding: vector });
}

/** Reported to the Conocimiento page so it can explain why search is only
 *  matching literal words. */
export function embeddingsUnavailableMessage(): string {
  return EMBEDDING_UNAVAILABLE_MESSAGE;
}
