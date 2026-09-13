import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Per-account data that does not belong in credentials.json (which holds
// integration secrets) or auth.json (which holds the auth store):
//   • The Google profile picture URL captured at last Google sign-in.
//   • The uploaded avatar: mime type + file basename (bytes live beside it).
//
// All writes go through a temp+rename to prevent partial reads.

const DIR = join(homedir(), ".senka");
const META_FILE = join(DIR, "account.json");

export type AccountMeta = {
  /** Last Google profile picture URL seen at sign-in. */
  readonly googlePicture?: string;
  /** Uploaded avatar: basename and mime type. */
  readonly avatar?: {
    readonly file: string;
    readonly mime: string;
    readonly updatedAt: string;
  };
};

async function readMeta(): Promise<AccountMeta> {
  try {
    return JSON.parse(await readFile(META_FILE, "utf-8")) as AccountMeta;
  } catch {
    return {};
  }
}

async function writeMeta(meta: AccountMeta): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const tmp = `${META_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(meta, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
  await rename(tmp, META_FILE);
}

/** Store the Google profile picture URL captured during sign-in. */
export async function setGooglePicture(url: string): Promise<void> {
  const meta = await readMeta();
  await writeMeta({ ...meta, googlePicture: url });
}

/** Clear Google picture (e.g. user signed out). */
export async function clearGooglePicture(): Promise<void> {
  const meta = await readMeta();
  const { googlePicture: _, ...rest } = meta;
  await writeMeta(rest);
}

/** Read the current account metadata. */
export async function getAccountMeta(): Promise<AccountMeta> {
  return readMeta();
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_AVATAR_MIMES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Save uploaded avatar bytes, replace any previous one. */
export async function saveAvatar(
  bytes: Uint8Array,
  mime: string,
): Promise<AccountMeta["avatar"]> {
  if (bytes.byteLength > MAX_AVATAR_BYTES) {
    throw new Error(`Avatar must be under ${MAX_AVATAR_BYTES / (1024 * 1024)} MB.`);
  }
  if (!ALLOWED_AVATAR_MIMES.has(mime)) {
    throw new Error(`Unsupported image type: ${mime}`);
  }

  await mkdir(DIR, { recursive: true });

  const ext = mime.split("/")[1].replace("jpeg", "jpg");
  const file = `account-avatar-${randomUUID()}.${ext}`;
  const avatarPath = join(DIR, file);

  // Remove previous avatar file if any.
  const meta = await readMeta();
  if (meta.avatar?.file) {
    const prev = join(DIR, meta.avatar.file);
    if (existsSync(prev)) await rm(prev, { force: true });
  }

  await writeFile(avatarPath, bytes, { mode: 0o600 });

  const avatar: AccountMeta["avatar"] = {
    file,
    mime,
    updatedAt: new Date().toISOString(),
  };
  await writeMeta({ ...meta, avatar });
  return avatar;
}

/** Read the avatar bytes, or null if none. */
export async function readAvatar(): Promise<{ bytes: Buffer; mime: string } | null> {
  const meta = await readMeta();
  if (!meta.avatar?.file) return null;
  const path = join(DIR, meta.avatar.file);
  try {
    const bytes = await readFile(path);
    return { bytes, mime: meta.avatar.mime };
  } catch {
    return null;
  }
}

/** Delete the avatar. */
export async function deleteAvatar(): Promise<void> {
  const meta = await readMeta();
  if (meta.avatar?.file) {
    const path = join(DIR, meta.avatar.file);
    await rm(path, { force: true });
  }
  const { avatar: _, ...rest } = meta;
  await writeMeta(rest);
}
