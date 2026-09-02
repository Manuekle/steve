import { embed, embedMany } from "ai";
import {
  EMBEDDING_UNAVAILABLE_MESSAGE,
  resolveEmbeddingModel,
} from "./ai-provider";
import {
  addDocument,
  searchChunks,
  type KnowledgeDocument,
  type KnowledgeMatch,
} from "./knowledge-store";

// Retrieval-augmented generation pipeline: extract text from an uploaded
// file, split it into overlapping chunks, embed them, and store them for
// cosine-similarity search at answer time.

/** Roughly 300 tokens of context per chunk — small enough that a match is
 *  specific, big enough that a paragraph survives intact. */
const CHUNK_SIZE = 1200;
/** Overlap so a sentence split across a chunk boundary still matches whole
 *  in one of the two chunks. */
const CHUNK_OVERLAP = 200;
/** Guard against pasting a whole book in: 400 chunks is ~2 MB of text. */
const MAX_CHUNKS_PER_DOCUMENT = 400;
/** Upload cap, matched by the client so the rejection happens before the
 *  bytes travel. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".html",
  ".htm",
  ".xml",
  ".yaml",
  ".yml",
  ".log",
] as const;

export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(",");

export class RagError extends Error {}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function stripMarkup(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

/** Collapse the runs of whitespace that PDF extraction and HTML stripping
 *  leave behind, while keeping paragraph breaks — they're the split points
 *  the chunker prefers. */
export function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Plain text out of an uploaded file. PDFs go through unpdf (pure JS, no
 * native binary); everything else on the accepted list is already text.
 */
export async function extractText(input: {
  name: string;
  mime: string;
  bytes: Uint8Array;
}): Promise<string> {
  const extension = extensionOf(input.name);
  const isPdf = extension === ".pdf" || input.mime === "application/pdf";

  if (isPdf) {
    // Imported lazily: unpdf pulls in PDF.js, which is far too heavy to load
    // on every request that merely lists the library.
    const { extractText: extractPdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(input.bytes);
    const { text } = await extractPdfText(pdf, { mergePages: true });
    const tidied = tidy(text);
    if (!tidied) {
      throw new RagError(
        "El PDF no tiene texto extraíble (probablemente sea un escaneo). Convertilo con OCR y subilo de nuevo.",
      );
    }
    return tidied;
  }

  if (extension && !ACCEPTED_EXTENSIONS.includes(extension as (typeof ACCEPTED_EXTENSIONS)[number])) {
    throw new RagError(`Formato no soportado: ${extension}. Aceptados: ${ACCEPTED_EXTENSIONS.join(", ")}.`);
  }

  const decoded = new TextDecoder("utf-8").decode(input.bytes);
  const text = tidy(
    extension === ".html" || extension === ".htm" || input.mime === "text/html"
      ? stripMarkup(decoded)
      : decoded,
  );

  if (!text) throw new RagError("El archivo está vacío.");
  return text;
}

/**
 * Split into overlapping chunks, preferring paragraph then sentence
 * boundaries so a chunk rarely starts mid-thought. Falls back to a hard cut
 * for text with no breaks at all (minified JSON, one-line CSV).
 */
export function chunkText(
  text: string,
  { size = CHUNK_SIZE, overlap = CHUNK_OVERLAP }: { size?: number; overlap?: number } = {},
): string[] {
  const clean = tidy(text);
  if (clean.length <= size) return clean ? [clean] : [];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < clean.length) {
    let end = Math.min(cursor + size, clean.length);

    if (end < clean.length) {
      // Look for a break in the last third of the window; anything earlier
      // would waste too much of the chunk.
      const window = clean.slice(cursor, end);
      const floor = Math.floor(size * 0.6);
      const paragraph = window.lastIndexOf("\n\n");
      const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("\n"));
      if (paragraph > floor) end = cursor + paragraph;
      else if (sentence > floor) end = cursor + sentence + 1;
    }

    const chunk = clean.slice(cursor, end).trim();
    if (chunk) chunks.push(chunk);
    if (chunks.length >= MAX_CHUNKS_PER_DOCUMENT) break;

    if (end >= clean.length) break;
    // Always move forward, even when the break landed at the cursor.
    cursor = Math.max(end - overlap, cursor + 1);
  }

  return chunks;
}

/**
 * Ingest one file: extract, chunk, embed, persist. Throws `RagError` with a
 * message meant for the user when the file can't be indexed.
 */
export async function ingestFile(input: {
  name: string;
  mime: string;
  bytes: Uint8Array;
  folderId?: string | null;
  /** Set when the bytes came from a Google Drive import — see lib/drive-import.ts. */
  driveSourceId?: string;
}): Promise<KnowledgeDocument> {
  if (input.bytes.byteLength === 0) throw new RagError("El archivo está vacío.");
  if (input.bytes.byteLength > MAX_FILE_BYTES) {
    throw new RagError(`El archivo supera el límite de ${MAX_FILE_BYTES / (1024 * 1024)} MB.`);
  }

  const embedding = resolveEmbeddingModel();
  if (!embedding) throw new RagError(EMBEDDING_UNAVAILABLE_MESSAGE);

  const text = await extractText(input);
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new RagError("No se pudo extraer texto del archivo.");

  const { embeddings } = await embedMany({ model: embedding.model, values: chunks });

  return addDocument({
    name: input.name,
    mime: input.mime,
    folderId: input.folderId ?? null,
    size: input.bytes.byteLength,
    characters: text.length,
    embedding_model: embedding.modelId,
    chunks: chunks.map((chunk, index) => ({ text: chunk, embedding: embeddings[index] })),
    ...(input.driveSourceId ? { driveSourceId: input.driveSourceId } : {}),
  });
}

/** Embed the query and return the closest chunks. */
export async function searchKnowledge(
  query: string,
  options: { limit?: number; minScore?: number } = {},
): Promise<KnowledgeMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const embedding = resolveEmbeddingModel();
  if (!embedding) throw new RagError(EMBEDDING_UNAVAILABLE_MESSAGE);

  const { embedding: vector } = await embed({ model: embedding.model, value: trimmed });
  return searchChunks(vector, options);
}
