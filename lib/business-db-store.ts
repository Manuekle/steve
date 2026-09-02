import { Pool } from "pg";

/**
 * PostgreSQL backing for the business store.
 *
 * The document, not a schema. Every function in lib/business-store.ts reads
 * the whole store, mutates it in memory, and writes it back — that is what the
 * JSON file made natural, and forty call sites are written that way. Keeping
 * one `jsonb` document preserves all of them unchanged; normalising contacts,
 * chats, automations and the rest into tables would be a rewrite of the entire
 * module, and the shapes are still moving.
 *
 * What it does buy, beyond surviving a read-only filesystem: `updateStore`
 * takes a row lock, so two processes can no longer read the same document,
 * mutate their own copies, and have the second write erase the first. The file
 * mode's `writeQueue` only ever serialised writes inside one process — the Eve
 * runtime and Next.js each had their own.
 *
 * Sized for the workload it actually has: one business, and a store of
 * kilobytes. If a single install ever grows past what is reasonable to read
 * and write whole, that is the signal to normalise, not this file's job to
 * pre-empt.
 */

let pool: Pool | undefined;
let schemaReady: Promise<void> | undefined;

/** Every install keeps exactly one document. The column exists so a future
 *  workspace id has somewhere to go without a migration — see
 *  lib/credit-account.ts, which anticipates the same thing. */
const DOCUMENT_ID = "default";

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.WORKFLOW_POSTGRES_URL;
    if (!connectionString) {
      throw new Error(
        "WORKFLOW_POSTGRES_URL is not set. The business DB store needs the same Postgres connection.",
      );
    }
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

const SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS steve;

CREATE TABLE IF NOT EXISTS steve.business_store (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((error: unknown) => {
        // Let the next call retry: a pool that came up before the database was
        // ready would otherwise cache the failure for the life of the process.
        schemaReady = undefined;
        throw error;
      });
  }
  await schemaReady;
}

/** Whether this database already holds the document. Used to decide between
 *  DB and file mode, and to decide whether a file needs migrating in. */
export async function hasDocument(): Promise<boolean> {
  await ensureSchema();
  const result = await getPool().query("SELECT 1 FROM steve.business_store WHERE id = $1", [
    DOCUMENT_ID,
  ]);
  return (result.rowCount ?? 0) > 0;
}

/** The stored document, or `null` when this install has never written one. */
export async function readDocument<T>(): Promise<T | null> {
  await ensureSchema();
  const result = await getPool().query<{ data: T }>(
    "SELECT data FROM steve.business_store WHERE id = $1",
    [DOCUMENT_ID],
  );
  return result.rows[0]?.data ?? null;
}

/**
 * Read, mutate and write the document under a row lock.
 *
 * `fn` is the same synchronous mutator the file store takes, so a caller
 * cannot tell which backend it is running against. The lock is held for the
 * duration of the transaction, which is one round trip plus whatever `fn`
 * does in memory.
 */
export async function updateDocument<TStore, TResult>(
  empty: () => TStore,
  fn: (store: TStore) => TResult,
): Promise<TResult> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // The insert makes the row exist so `FOR UPDATE` has something to lock;
    // ON CONFLICT DO NOTHING keeps a concurrent first write from failing here.
    await client.query(
      "INSERT INTO steve.business_store (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING",
      [DOCUMENT_ID, JSON.stringify(empty())],
    );
    const locked = await client.query<{ data: TStore }>(
      "SELECT data FROM steve.business_store WHERE id = $1 FOR UPDATE",
      [DOCUMENT_ID],
    );
    const store = locked.rows[0]?.data ?? empty();
    const result = fn(store);
    await client.query(
      "UPDATE steve.business_store SET data = $2::jsonb, updated_at = now() WHERE id = $1",
      [DOCUMENT_ID, JSON.stringify(store)],
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Seed the database from a file store, once, on the first DB access.
 *
 * Does nothing when a document already exists: the database is the source of
 * truth from that point on, and re-importing a stale file would silently undo
 * everything written since.
 */
export async function migrateFromFileStore<T>(store: T): Promise<void> {
  await ensureSchema();
  await getPool().query(
    "INSERT INTO steve.business_store (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING",
    [DOCUMENT_ID, JSON.stringify(store)],
  );
}
