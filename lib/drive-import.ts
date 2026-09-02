import { getCredential } from "./credentials";
import { downloadFromDrive, exportDriveFile, listDriveFolderFiles, type DriveFile } from "./google-drive";
import { ingestFile, RagError } from "./rag";
import { listDocuments } from "./knowledge-store";
import { addAssetFromDrive, kindForMime, listAssets } from "./media-store";

// One-shot import of an existing Drive folder into Conocimiento — the other
// direction from lib/google-drive.ts's upload path, which only ever sees
// files this app created. Triggered by hand (the "Sincronizar con Drive"
// button), not on a timer: a folder someone edits daily is exactly the case
// where a silent background sync would surprise them with new documents.
//
// Google's own file types (Docs, Sheets, Slides, …) have no raw bytes; each
// is exported to a real format first. Everything else — images, video,
// audio, PDFs, plain text — goes in as-is.

const GOOGLE_DOC = "application/vnd.google-apps.document";
const GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const GOOGLE_NATIVE_PREFIX = "application/vnd.google-apps.";

/** Mime types `ingestFile` already knows how to turn into searchable text,
 *  beyond what needs exporting first. */
function isTextIngestible(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    mime === "application/pdf" ||
    mime === "application/json" ||
    mime === "application/xml"
  );
}

export type DriveSyncSkip = { readonly name: string; readonly reason: string };
export type DriveSyncFailure = { readonly name: string; readonly error: string };

export type DriveSyncResult = {
  readonly imported: number;
  readonly skipped: readonly DriveSyncSkip[];
  readonly errors: readonly DriveSyncFailure[];
};

/** `null` means no folder is configured — GET /api/knowledge/drive-sync
 *  turns that into `not_configured` rather than an empty success. */
export async function syncDriveFolder(): Promise<DriveSyncResult | null> {
  const folderId = (await getCredential("GOOGLE_DRIVE_FOLDER_ID"))?.trim();
  if (!folderId) return null;

  const files = await listDriveFolderFiles(folderId);
  const [existingDocs, existingAssets] = await Promise.all([listDocuments(), listAssets()]);
  const alreadyImported = new Set([
    ...existingDocs.map((d) => d.drive_source_id).filter((id): id is string => Boolean(id)),
    ...existingAssets.map((a) => a.drive_file_id).filter((id): id is string => Boolean(id)),
  ]);

  let imported = 0;
  const skipped: DriveSyncSkip[] = [];
  const errors: DriveSyncFailure[] = [];

  for (const file of files) {
    if (file.mimeType === "application/vnd.google-apps.folder") continue; // subfolders: not walked, not an error
    if (alreadyImported.has(file.id)) continue;

    try {
      if (await importOne(file)) imported++;
      else skipped.push({ name: file.name, reason: unsupportedReason(file.mimeType) });
    } catch (error) {
      errors.push({
        name: file.name,
        error: error instanceof RagError ? error.message : error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { imported, skipped, errors };
}

/** `true` when the file was actually brought in; `false` when its type has
 *  no supported path (reported as skipped, not thrown as an error). */
async function importOne(file: DriveFile): Promise<boolean> {
  if (file.mimeType === GOOGLE_DOC) {
    const bytes = await exportDriveFile(file.id, "text/plain");
    await ingestFile({ name: `${file.name}.txt`, mime: "text/plain", bytes, driveSourceId: file.id });
    return true;
  }

  if (file.mimeType === GOOGLE_SHEET) {
    const bytes = await exportDriveFile(file.id, "text/csv");
    await ingestFile({ name: `${file.name}.csv`, mime: "text/csv", bytes, driveSourceId: file.id });
    return true;
  }

  if (file.mimeType.startsWith(GOOGLE_NATIVE_PREFIX)) return false; // Slides, Forms, Drawings, …

  const kind = kindForMime(file.mimeType, file.name);
  if (kind === "image" || kind === "video" || kind === "audio") {
    // No download here: the asset just points at the Drive file id, and
    // readAssetBytes fetches it lazily the first time something needs the
    // bytes — a folder of videos shouldn't mean downloading all of them
    // during a sync nobody is waiting to send yet.
    await addAssetFromDrive({
      name: file.name,
      mime: file.mimeType,
      size: Number(file.size ?? 0),
      driveFileId: file.id,
    });
    return true;
  }

  if (isTextIngestible(file.mimeType)) {
    const bytes = await downloadFromDrive(file.id);
    await ingestFile({ name: file.name, mime: file.mimeType, bytes, driveSourceId: file.id });
    return true;
  }

  return false;
}

function unsupportedReason(mimeType: string): string {
  if (mimeType.startsWith(GOOGLE_NATIVE_PREFIX)) {
    return "Tipo de Google Workspace sin exportación soportada (Slides, Forms, Dibujos, etc.).";
  }
  return `Formato no soportado (${mimeType}).`;
}
