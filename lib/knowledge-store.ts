import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

// Knowledge base for retrieval-augmented generation.
//
// Shared by the Eve agent (the search_knowledge tool) and the Next.js API
// routes, the same way business-store.ts is: both processes run on one host
// and read ~/.steve/knowledge.json.
//
// Documents and chunks are kept in separate arrays so listing the library
// (the common case, hit on every page load) never has to walk the embedding
// vectors, which are by far the bulk of the file.

const STORE_FILE = join(homedir(), ".steve", "knowledge.json");

export type KnowledgeDocument = {
  id: string;
  name: string;
  mime: string;
  /** Folder this document is filed under, from lib/media-store.ts. `null` is
   *  the root. Folders are shared with the media library so the Conocimiento
   *  page shows one tree over documents and photos alike. */
  folder_id: string | null;
  /** Size of the uploaded file in bytes. */
  size: number;
  /** Number of chunks this document was split into. */
  chunks: number;
  /** Characters of extracted text, before chunking. */
  characters: number;
  /** First line or so of the text, for the library list. */
  preview: string;
  embedding_model: string;
  created_at: string;
};

export type KnowledgeChunk = {
  id: string;
  doc_id: string;
  index: number;
  text: string;
  embedding: number[];
};

export type KnowledgeMatch = {
  doc_id: string;
  doc_name: string;
  chunk_index: number;
  text: string;
  score: number;
};

type KnowledgeStore = {
  documents: KnowledgeDocument[];
  chunks: KnowledgeChunk[];
};

function emptyStore(): KnowledgeStore {
  return { documents: [], chunks: [] };
}

function normalize(parsed: Partial<KnowledgeStore>): KnowledgeStore {
  return {
    // `folder_id` landed after the first documents were indexed, so stores
    // written before it exist in the wild — read a missing one as root.
    documents: (parsed.documents ?? []).map((doc) => ({ ...doc, folder_id: doc.folder_id ?? null })),
    chunks: parsed.chunks ?? [],
  };
}

let writeQueue: Promise<void> = Promise.resolve();

// Serializes read-modify-write cycles: two uploads finishing at once would
// otherwise both read the pre-update store and the second write would drop
// the first document entirely.
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readStore(): Promise<KnowledgeStore> {
  try {
    return normalize(JSON.parse(await readFile(STORE_FILE, "utf-8")) as Partial<KnowledgeStore>);
  } catch {
    return emptyStore();
  }
}

function readStoreSync(): KnowledgeStore {
  try {
    if (!existsSync(STORE_FILE)) return emptyStore();
    return normalize(JSON.parse(readFileSync(STORE_FILE, "utf-8")) as Partial<KnowledgeStore>);
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: KnowledgeStore): Promise<void> {
  await mkdir(dirname(STORE_FILE), { recursive: true });
  const tmp = `${STORE_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(store), "utf-8");
  await rename(tmp, STORE_FILE);
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function listDocuments(): Promise<KnowledgeDocument[]> {
  const store = await readStore();
  return [...store.documents].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function listDocumentsSync(): KnowledgeDocument[] {
  return [...readStoreSync().documents].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function countChunks(): Promise<number> {
  return (await readStore()).chunks.length;
}

export async function addDocument(input: {
  name: string;
  mime: string;
  size: number;
  characters: number;
  embedding_model: string;
  folderId?: string | null;
  chunks: ReadonlyArray<{ text: string; embedding: number[] }>;
}): Promise<KnowledgeDocument> {
  return enqueue(async () => {
    const store = await readStore();
    const id = newId("doc");
    const document: KnowledgeDocument = {
      id,
      name: input.name,
      mime: input.mime,
      folder_id: input.folderId ?? null,
      size: input.size,
      chunks: input.chunks.length,
      characters: input.characters,
      preview: input.chunks[0]?.text.slice(0, 180).replace(/\s+/g, " ").trim() ?? "",
      embedding_model: input.embedding_model,
      created_at: new Date().toISOString(),
    };
    store.documents.push(document);
    input.chunks.forEach((chunk, index) => {
      store.chunks.push({
        id: newId("chk"),
        doc_id: id,
        index,
        text: chunk.text,
        embedding: chunk.embedding,
      });
    });
    await writeStore(store);
    return document;
  });
}

/** Move a document into a folder (or to the root with `null`). */
export async function setDocumentFolder(
  id: string,
  folderId: string | null,
): Promise<KnowledgeDocument | null> {
  return enqueue(async () => {
    const store = await readStore();
    const document = store.documents.find((d) => d.id === id);
    if (!document) return null;
    document.folder_id = folderId;
    await writeStore(store);
    return document;
  });
}

export async function deleteDocument(id: string): Promise<boolean> {
  return enqueue(async () => {
    const store = await readStore();
    const before = store.documents.length;
    store.documents = store.documents.filter((d) => d.id !== id);
    if (store.documents.length === before) return false;
    store.chunks = store.chunks.filter((c) => c.doc_id !== id);
    await writeStore(store);
    return true;
  });
}

/** Cosine similarity. Vectors are compared as-is: OpenAI's embeddings are
 *  already unit-normalized, but dividing by the norms keeps this correct if
 *  the embedding model ever changes. */
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

/**
 * Top-k chunks by cosine similarity against a query embedding.
 *
 * A linear scan over every chunk: exact, dependency-free, and fast enough for
 * the size a single business's knowledge base actually reaches. Swapping in
 * pgvector later means replacing this one function.
 */
export async function searchChunks(
  embedding: readonly number[],
  options: { limit?: number; minScore?: number; docIds?: readonly string[] } = {},
): Promise<KnowledgeMatch[]> {
  const { limit = 5, minScore = 0.1, docIds } = options;
  const store = await readStore();
  const names = new Map(store.documents.map((d) => [d.id, d.name]));

  const scored: KnowledgeMatch[] = [];
  for (const chunk of store.chunks) {
    if (docIds && !docIds.includes(chunk.doc_id)) continue;
    const score = cosine(embedding, chunk.embedding);
    if (score < minScore) continue;
    scored.push({
      doc_id: chunk.doc_id,
      doc_name: names.get(chunk.doc_id) ?? "documento",
      chunk_index: chunk.index,
      text: chunk.text,
      score,
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
