import { type NextRequest } from "next/server";
import { getAsset, readAssetBytes } from "@/lib/media-store";
import { apiError, withApiErrors } from "@/lib/api-error";

// GET /api/media/:id/file — the raw bytes, so the library grid can show real
// thumbnails and play videos instead of a generic file icon.
//
// The bytes live in ~/.steve/media and are never served from /public: the id
// is looked up in the store and the on-disk name comes from the record, so a
// crafted path can't reach anything else on the filesystem.

export const GET = withApiErrors(async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const asset = await getAsset(id);
  if (!asset) return apiError("not_found");

  let bytes: Uint8Array;
  try {
    bytes = await readAssetBytes(asset);
  } catch {
    // Metadata without bytes: the store and the blob directory drifted apart
    // (a restored backup, a manual delete).
    return apiError("not_found", { detail: "The stored file is missing on disk." });
  }

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "content-type": asset.mime || "application/octet-stream",
      "content-length": String(bytes.byteLength),
      // Content is immutable per id, and private because a media library is
      // the business's own material.
      "cache-control": "private, max-age=31536000, immutable",
      "content-disposition": `inline; filename="${encodeURIComponent(asset.name)}"`,
      // These bytes were uploaded by a person and are served back from this
      // app's own origin, so the same two headers the business logo carries
      // apply here: nothing this document references may load or run, and the
      // browser may not re-interpret the declared type. `ingestMedia` already
      // refuses anything outside ACCEPTED_MEDIA_EXTENSIONS; this is the second
      // lock, for the rows an older build let in before that check existed.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; media-src data:; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
});
