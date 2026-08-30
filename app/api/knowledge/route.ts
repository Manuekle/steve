import { NextResponse, type NextRequest } from "next/server";
import { resolveEmbeddingModel } from "@/lib/ai-provider";
import { deleteDocument, listDocuments } from "@/lib/knowledge-store";
import { ACCEPT_ATTRIBUTE, MAX_FILE_BYTES, RagError, ingestFile } from "@/lib/rag";
import { apiError, missingField, withApiErrors } from "@/lib/api-error";

// GET    /api/knowledge      — list indexed documents + embedding status
// POST   /api/knowledge      — multipart upload; indexes each file
// DELETE /api/knowledge?id=  — remove a document and its chunks

// Embedding a large PDF is a few seconds of model calls, well past the
// default for a static route.
export const maxDuration = 300;

export const GET = withApiErrors(async function GET() {
  const documents = await listDocuments();
  const embedding = resolveEmbeddingModel();
  return NextResponse.json({
    documents,
    embeddings: embedding
      ? { available: true, model: embedding.modelId, route: embedding.route }
      : { available: false },
    limits: { maxFileBytes: MAX_FILE_BYTES, accept: ACCEPT_ATTRIBUTE },
  });
});

export const POST = withApiErrors(async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("unsupported_format", { message: "A multipart form was expected." });
  }

  const files = [...form.getAll("file"), ...form.getAll("files")].filter(
    (entry): entry is File => entry instanceof File,
  );
  if (files.length === 0) {
    return apiError("no_file");
  }

  // Per-file results rather than all-or-nothing: one unreadable PDF in a
  // batch shouldn't discard the documents that indexed cleanly.
  const indexed = [];
  const failed = [];
  for (const file of files) {
    try {
      const document = await ingestFile({
        name: file.name,
        mime: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      indexed.push(document);
    } catch (error) {
      failed.push({
        name: file.name,
        error:
          error instanceof RagError
            ? error.message
            : "No se pudo indexar el archivo. Revisá las credenciales del modelo.",
      });
      if (!(error instanceof RagError)) console.error("[knowledge] ingest failed", error);
    }
  }

  return NextResponse.json(
    { documents: indexed, failed },
    { status: indexed.length === 0 ? 422 : 200 },
  );
});

export const DELETE = withApiErrors(async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return missingField("id");

  const deleted = await deleteDocument(id);
  if (!deleted) return apiError("not_found");
  return NextResponse.json({ success: true });
});
