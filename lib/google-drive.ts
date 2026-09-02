import { getGoogleToken } from "./google-auth";

// Google Drive storage for the media library — see lib/media-store.ts.
//
// `drive.file` (not full Drive access) is the scope already granted when
// Google is connected: it only ever sees files this app itself created, so
// connecting Google to book a meeting or log a sheet never hands the agent
// a look into the rest of someone's Drive.

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
/** Covers reading anything the account can see — its own uploads and files
 *  it never touched alike — unlike `drive.file`, which only ever sees files
 *  this app created. Needed to list and read an existing folder someone
 *  points Conocimiento at. See lib/drive-import.ts. */
const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export async function isDriveConfigured(): Promise<boolean> {
  return Boolean(await getGoogleToken(DRIVE_SCOPE));
}

export type DriveFile = {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size?: string;
};

/** Every file directly inside a folder (no subfolders — see the field's
 *  own help text in Settings). Throws when Drive read access isn't there
 *  at all; the caller decides what "not configured" means for its UI. */
export async function listDriveFolderFiles(folderId: string): Promise<DriveFile[]> {
  const token = await getGoogleToken(DRIVE_READONLY_SCOPE);
  if (!token) throw new Error("No Google account connected with Drive access.");

  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size)",
      pageSize: "200",
      ...(pageToken ? { pageToken } : {}),
    });
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Drive API ${response.status}: ${await response.text()}`);
    }
    const data = (await response.json()) as { files?: DriveFile[]; nextPageToken?: string };
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

/** Google Docs, Sheets and Slides have no raw bytes of their own — this is
 *  how the API hands them over in a real format (text/plain, text/csv, …). */
export async function exportDriveFile(fileId: string, mimeType: string): Promise<Uint8Array> {
  const token = await getGoogleToken(DRIVE_READONLY_SCOPE);
  if (!token) throw new Error("No Google account connected with Drive access.");
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(mimeType)}`,
    { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) },
  );
  if (!response.ok) {
    throw new Error(`Drive API ${response.status}: ${await response.text()}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** `null` means no Google account is connected — the caller falls back to
 *  local storage rather than treating this as a failure. */
export async function uploadToDrive(opts: {
  readonly name: string;
  readonly mime: string;
  readonly bytes: Uint8Array;
}): Promise<{ readonly fileId: string } | null> {
  const token = await getGoogleToken(DRIVE_SCOPE);
  if (!token) return null;

  // The multipart/related shape Drive's upload endpoint wants: a JSON part
  // naming the file, then the raw bytes, split by one boundary neither part
  // is likely to contain — the same trick Gmail's raw message uses.
  const boundary = `steve_${Date.now()}`;
  const metadata = JSON.stringify({ name: opts.name });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${opts.mime}\r\n\r\n`,
    // `Buffer.from` rather than the `Uint8Array` as-is: its `buffer` is
    // typed `ArrayBufferLike` (could be a `SharedArrayBuffer`), which isn't
    // a valid `BlobPart` — a real `Buffer` is backed by a concrete `ArrayBuffer`.
    Buffer.from(opts.bytes),
    `\r\n--${boundary}--`,
  ]);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body,
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Drive API ${response.status}: ${await response.text()}`);
  }
  const data = (await response.json()) as { id?: string };
  return data.id ? { fileId: data.id } : null;
}

export async function downloadFromDrive(fileId: string): Promise<Uint8Array> {
  // Readonly, not `drive.file`: this reads back both an asset Steve
  // uploaded itself and one imported from an existing folder — see
  // readAssetBytes in lib/media-store.ts and lib/drive-import.ts.
  const token = await getGoogleToken(DRIVE_READONLY_SCOPE);
  if (!token) throw new Error("No Google account connected with Drive access.");
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) },
  );
  if (!response.ok) {
    throw new Error(`Drive API ${response.status}: ${await response.text()}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Best-effort: a Drive file Steve can no longer reach to delete costs
 *  storage quota, not correctness — the library entry is gone either way. */
export async function deleteFromDrive(fileId: string): Promise<void> {
  const token = await getGoogleToken(DRIVE_SCOPE);
  if (!token) return;
  await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}
