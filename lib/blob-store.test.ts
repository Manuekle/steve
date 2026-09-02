import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `steve-blob-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_DIR };
});

const getCredential = vi.fn();
const blobsInDatabase = vi.fn();
const dbWrite = vi.fn();
const dbRead = vi.fn();
const dbDelete = vi.fn();
const dbList = vi.fn();
const awsFetch = vi.fn();

vi.mock("./credentials", () => ({
  getCredential: (...a: unknown[]) => getCredential(...(a as [])),
}));
vi.mock("./doc-store", () => ({
  blobsInDatabase: (...a: unknown[]) => blobsInDatabase(...(a as [])),
  writeBlob: (...a: unknown[]) => dbWrite(...(a as [])),
  readBlob: (...a: unknown[]) => dbRead(...(a as [])),
  deleteBlob: (...a: unknown[]) => dbDelete(...(a as [])),
  listBlobIds: (...a: unknown[]) => dbList(...(a as [])),
}));
vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch(...args: unknown[]) {
      return awsFetch(...(args as []));
    }
  },
}));

const S3_ENV: Record<string, string> = {
  S3_ENDPOINT: "https://proj.storage.supabase.co/storage/v1/s3",
  S3_REGION: "us-east-1",
  S3_BUCKET: "steve",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
};

function configure(values: Record<string, string>): void {
  getCredential.mockImplementation(async (key: string) => values[key]);
}

async function load() {
  vi.resetModules();
  return import("./blob-store");
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  getCredential.mockReset().mockResolvedValue(undefined);
  blobsInDatabase.mockReset().mockResolvedValue(false);
  dbWrite.mockReset().mockResolvedValue(undefined);
  dbRead.mockReset().mockResolvedValue(null);
  dbDelete.mockReset().mockResolvedValue(undefined);
  dbList.mockReset().mockResolvedValue([]);
  awsFetch.mockReset();
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("backend selection", () => {
  it("writes to disk when neither a bucket nor a database is configured", async () => {
    const blobs = await load();

    await blobs.putBlob("media/a.png", new Uint8Array([1, 2]), "image/png");

    expect(await blobs.blobBackend()).toBe("disk");
    expect([...(await readFile(join(TEST_DIR, ".steve", "media", "a.png")))]).toEqual([1, 2]);
    expect(awsFetch).not.toHaveBeenCalled();
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("prefers the database over disk when one is configured", async () => {
    blobsInDatabase.mockResolvedValue(true);
    const blobs = await load();

    await blobs.putBlob("media/a.png", new Uint8Array([1, 2]));

    expect(await blobs.blobBackend()).toBe("database");
    expect(dbWrite).toHaveBeenCalledWith("media/a.png", new Uint8Array([1, 2]));
    expect(existsSync(join(TEST_DIR, ".steve", "media", "a.png"))).toBe(false);
  });

  it("prefers the bucket over both", async () => {
    configure(S3_ENV);
    blobsInDatabase.mockResolvedValue(true);
    awsFetch.mockResolvedValue({ ok: true, status: 200 });
    const blobs = await load();

    await blobs.putBlob("media/a.png", new Uint8Array([1, 2]), "image/png");

    expect(await blobs.blobBackend()).toBe("s3");
    const [url, init] = awsFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://proj.storage.supabase.co/storage/v1/s3/steve/media/a.png");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("image/png");
    expect(dbWrite).not.toHaveBeenCalled();
  });

  // Half a bucket is worse than none: the next upload would land elsewhere
  // and everything already stored would stop being findable.
  it("ignores a half-configured bucket rather than guessing", async () => {
    configure({ S3_ENDPOINT: S3_ENV.S3_ENDPOINT, S3_BUCKET: "steve" });
    const blobs = await load();

    expect(await blobs.blobBackend()).toBe("disk");
  });

  it("defaults the region rather than refusing without one", async () => {
    const { S3_REGION: _omitted, ...noRegion } = S3_ENV;
    configure(noRegion);
    const blobs = await load();

    expect(await blobs.blobBackend()).toBe("s3");
  });
});

describe("reads", () => {
  it("returns null for an object the bucket does not have", async () => {
    configure(S3_ENV);
    awsFetch.mockResolvedValue({ ok: false, status: 404 });
    const blobs = await load();

    expect(await blobs.getBlob("media/missing.png")).toBeNull();
  });

  it("throws on a bucket error that is not a miss", async () => {
    configure(S3_ENV);
    awsFetch.mockResolvedValue({ ok: false, status: 403, text: async () => "denied" });
    const blobs = await load();

    await expect(blobs.getBlob("media/a.png")).rejects.toThrow("403");
  });

  it("returns null, not an error, for a file that is not on disk", async () => {
    const blobs = await load();
    expect(await blobs.getBlob("media/missing.png")).toBeNull();
  });
});

describe("listing", () => {
  it("reads the keys out of the bucket's XML listing", async () => {
    configure(S3_ENV);
    awsFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        "<ListBucketResult><Contents><Key>profile/logo-a.png</Key></Contents>" +
        "<Contents><Key>profile/logo-b.png</Key></Contents></ListBucketResult>",
    });
    const blobs = await load();

    expect(await blobs.listBlobs("profile/logo-")).toEqual([
      "profile/logo-a.png",
      "profile/logo-b.png",
    ]);
  });

  it("lists matching files from disk with their area prefix", async () => {
    const blobs = await load();
    await blobs.putBlob("profile/logo-a.png", new Uint8Array([1]));
    await blobs.putBlob("profile/other.png", new Uint8Array([1]));

    expect(await blobs.listBlobs("profile/logo-")).toEqual(["profile/logo-a.png"]);
  });
});

// Ids are built by this app, never by an uploader — but the disk backend
// joins them into a path, so the one place that could turn a bad id into a
// path traversal checks rather than trusts.
describe("id safety", () => {
  it.each([
    "media/../../.ssh/authorized_keys",
    "../etc/passwd",
    "media/",
    "media",
    "media/nested/deep.png",
    "media/.hidden",
  ])("refuses %s", async (id) => {
    const blobs = await load();
    await expect(blobs.putBlob(id, new Uint8Array([1]))).rejects.toThrow();
  });

  it("refuses an area with no disk location", async () => {
    const blobs = await load();
    await expect(blobs.putBlob("unknown/a.png", new Uint8Array([1]))).rejects.toThrow("disk location");
  });
});

describe("deletes", () => {
  it("never throws, because deleting bytes is cleanup", async () => {
    configure(S3_ENV);
    awsFetch.mockRejectedValue(new Error("network"));
    const blobs = await load();

    await expect(blobs.removeBlob("media/a.png")).resolves.toBeUndefined();
  });
});
