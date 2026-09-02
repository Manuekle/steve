import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { AwsClient } from "aws4fetch";
import { getCredential } from "./credentials";
import {
  blobsInDatabase,
  deleteBlob as dbDeleteBlob,
  listBlobIds as dbListBlobIds,
  readBlob as dbReadBlob,
  writeBlob as dbWriteBlob,
} from "./doc-store";

// Where the bytes go: media assets and the business logo.
//
// Three backends, first one configured wins.
//
//   S3        an S3-compatible bucket (Supabase Storage, R2, MinIO, AWS).
//             Where bytes belong: object storage is priced and shaped for
//             them, and a database is not.
//   Postgres  `steve.blobs`. Correct, and fine for a few PDFs and logos, but
//             a database row is an expensive place to keep a video, and
//             Supabase's own free tier gives a 500 MB database against 1 GB
//             of storage. It stays as the fallback that makes a
//             database-only deploy work at all.
//   Disk      ~/.steve. The original, and still right for one host.
//
// Callers do not choose. media-store and business-profile-store used to carry
// their own `if (database) … else disk` branch each, which is how a third
// option turns into two divergent copies of the same decision.
//
// Not a public bucket: reads come back through the app, the same way the disk
// backend always served them. Nothing here mints a public URL, so moving a
// deployment to object storage does not quietly publish a customer's files.

export type BlobBackend = "s3" | "database" | "disk";

type S3Config = {
  readonly client: AwsClient;
  readonly endpoint: string;
  readonly bucket: string;
};

/** Root for the disk backend. Ids are `<area>/<basename>`, and the areas map
 *  to the directories the file layout already used. */
const DISK_ROOTS: Readonly<Record<string, string>> = {
  media: join(homedir(), ".steve", "media"),
  profile: join(homedir(), ".steve", "business"),
};

let s3Config: S3Config | null | undefined;

/**
 * The S3 client, or `null` when this install has no bucket configured.
 *
 * Resolved once. All five values are required: a half-configured bucket must
 * not silently become "no bucket", because that would put the next upload
 * somewhere else and leave the earlier ones unreachable.
 */
async function getS3(): Promise<S3Config | null> {
  if (s3Config !== undefined) return s3Config;

  const [endpoint, region, bucket, accessKeyId, secretAccessKey] = await Promise.all([
    getCredential("S3_ENDPOINT"),
    getCredential("S3_REGION"),
    getCredential("S3_BUCKET"),
    getCredential("S3_ACCESS_KEY_ID"),
    getCredential("S3_SECRET_ACCESS_KEY"),
  ]);

  if (!endpoint?.trim() || !bucket?.trim() || !accessKeyId?.trim() || !secretAccessKey?.trim()) {
    s3Config = null;
    return null;
  }

  s3Config = {
    client: new AwsClient({
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
      service: "s3",
      region: region?.trim() || "us-east-1",
    }),
    endpoint: endpoint.trim().replace(/\/+$/, ""),
    bucket: bucket.trim(),
  };
  return s3Config;
}

/** Drop the resolved client so the next call re-reads Settings. Called when
 *  credentials change, and by tests. */
export function invalidateBlobBackend(): void {
  s3Config = undefined;
}

/** Which backend this install writes to. For messages and diagnostics. */
export async function blobBackend(): Promise<BlobBackend> {
  if (await getS3()) return "s3";
  return (await blobsInDatabase()) ? "database" : "disk";
}

/** Ids are `<area>/<basename>` and both halves are ours, never a filename a
 *  person supplied — see how media-store derives the basename from the asset
 *  id. This refuses anything else rather than trusting that. */
function assertSafeId(id: string): { area: string; name: string } {
  const [area, ...rest] = id.split("/");
  const name = rest.join("/");
  if (!area || !name || rest.length !== 1 || name.includes("..") || name.startsWith(".")) {
    throw new Error(`Unsafe blob id: ${JSON.stringify(id)}`);
  }
  return { area, name };
}

function diskPath(id: string): string {
  const { area, name } = assertSafeId(id);
  const root = DISK_ROOTS[area];
  if (!root) throw new Error(`No disk location for blob area ${JSON.stringify(area)}`);
  return join(root, name);
}

function objectUrl(s3: S3Config, id: string): string {
  assertSafeId(id);
  return `${s3.endpoint}/${s3.bucket}/${id}`;
}

export async function putBlob(
  id: string,
  bytes: Uint8Array,
  contentType = "application/octet-stream",
): Promise<void> {
  const s3 = await getS3();
  if (s3) {
    const response = await s3.client.fetch(objectUrl(s3, id), {
      method: "PUT",
      body: bytes as unknown as BodyInit,
      headers: { "content-type": contentType },
    });
    if (!response.ok) {
      throw new Error(`S3 PUT ${id} failed with ${response.status}: ${await response.text()}`);
    }
    return;
  }

  if (await blobsInDatabase()) {
    await dbWriteBlob(id, bytes);
    return;
  }

  const path = diskPath(id);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

/** The bytes, or `null` when nothing is stored under that id. */
export async function getBlob(id: string): Promise<Uint8Array | null> {
  const s3 = await getS3();
  if (s3) {
    const response = await s3.client.fetch(objectUrl(s3, id));
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`S3 GET ${id} failed with ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  if (await blobsInDatabase()) return dbReadBlob(id);

  try {
    return new Uint8Array(await readFile(diskPath(id)));
  } catch {
    return null;
  }
}

/** Never throws: deleting bytes is cleanup, and a stranded object costs
 *  storage while a failed delete costs the user their action. */
export async function removeBlob(id: string): Promise<void> {
  try {
    const s3 = await getS3();
    if (s3) {
      await s3.client.fetch(objectUrl(s3, id), { method: "DELETE" });
      return;
    }
    if (await blobsInDatabase()) {
      await dbDeleteBlob(id);
      return;
    }
    await rm(diskPath(id), { force: true });
  } catch {
    // Cleanup only.
  }
}

/** Every id under a prefix, for the passes that used to walk a directory. */
export async function listBlobs(prefix: string): Promise<string[]> {
  const s3 = await getS3();
  if (s3) {
    const url = `${s3.endpoint}/${s3.bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}`;
    const response = await s3.client.fetch(url);
    if (!response.ok) return [];
    const xml = await response.text();
    // The response is XML and the only field wanted is the key. A parser
    // dependency for one tag is not worth it; the keys are ours, and the
    // regex is anchored to the element rather than scanning free text.
    return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => match[1]);
  }

  if (await blobsInDatabase()) return dbListBlobIds(prefix);

  const { area, name } = { area: prefix.split("/")[0], name: prefix.split("/").slice(1).join("/") };
  const root = DISK_ROOTS[area];
  if (!root) return [];
  try {
    return (await readdir(root))
      .filter((entry) => entry.startsWith(name))
      .map((entry) => `${area}/${entry}`);
  } catch {
    return [];
  }
}
