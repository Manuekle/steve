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
    },
  });
});
