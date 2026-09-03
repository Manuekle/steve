import { describe, expect, it } from "vitest";

/**
 * Archivo temporal de verificación: corre el código real de la app contra las
 * credenciales de producción (Supabase + bucket "media"), sin desplegar nada.
 *
 *   set -a; . ./.env.prod; set +a; pnpm exec vitest run tests/prod-credentials.probe.test.ts
 *
 * No está en el nombre `*.test.ts` por accidente — vitest.config sólo incluye
 * ese patrón — pero NO debe quedarse en el repo: toca datos reales y necesita
 * secretos en el entorno. Se borra después de correrlo.
 */

const live = Boolean(process.env.WORKFLOW_POSTGRES_URL?.includes("supabase.com"));

describe.skipIf(!live)("credenciales de producción, desde local", () => {
  it("el backend de blobs resuelve a s3", async () => {
    const { blobBackend } = await import("../lib/blob-store");
    expect(await blobBackend()).toBe("s3");
  });

  it("escribe, lee y borra un blob en el bucket real", async () => {
    const { putBlob, getBlob, removeBlob } = await import("../lib/blob-store");
    const id = `media/steve-probe-${Date.now()}.txt`;
    const bytes = new TextEncoder().encode("probe");

    await putBlob(id, bytes, "text/plain");
    const read = await getBlob(id);
    expect(read).not.toBeNull();
    expect(new TextDecoder().decode(read!)).toBe("probe");

    await removeBlob(id);
    expect(await getBlob(id)).toBeNull();
  });

  // getCredential() y listAutomations() caen al archivo ~/.steve cuando la base
  // no responde, así que verlos pasar no prueba nada por sí solo: existe un
  // ~/.steve/credentials.json en esta máquina. doc-store es solo-Postgres, sin
  // fallback, así que es el que sirve de prueba.
  it("el credential store sale de Postgres, no de ~/.steve", async () => {
    const { readDocument } = await import("../lib/doc-store");
    const store = await readDocument<Record<string, string>>("credentials");
    expect(store).not.toBeNull();
    // En el store de Supabase y NO en ningún .env: si vuelve, salió de la base.
    expect(store!.WHATSAPP_ACCESS_TOKEN).toBeTruthy();
    expect(store!.INSTAGRAM_ACCESS_TOKEN).toBeTruthy();
  });

  it("ese Postgres es el de Supabase, no el contenedor local", async () => {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: process.env.WORKFLOW_POSTGRES_URL });
    await client.connect();
    try {
      const { rows } = await client.query("SELECT inet_server_addr()::text AS host, version()");
      expect(rows[0].version).toContain("PostgreSQL 17");  // el docker local es 16
      expect(process.env.WORKFLOW_POSTGRES_URL).toContain("pooler.supabase.com:5432");
    } finally {
      await client.end();
    }
  });

  it("lee la dependencia dura de /api/health contra la base real", async () => {
    const { listAutomations } = await import("../lib/business-store");
    await expect(listAutomations()).resolves.toBeInstanceOf(Array);
  });
});
