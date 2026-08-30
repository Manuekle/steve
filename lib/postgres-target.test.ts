import { describe, expect, it } from "vitest";
import { describePostgresTarget } from "./postgres-target";

describe("describePostgresTarget", () => {
  it("reads the local container", () => {
    const target = describePostgresTarget("postgres://world:pw@127.0.0.1:5544/world");
    expect(target).toEqual({ host: "127.0.0.1", port: 5544, kind: "local", isLocal: true });
  });

  it("treats every loopback spelling as local", () => {
    for (const host of ["localhost", "127.0.0.1", "0.0.0.0", "host.docker.internal"]) {
      expect(describePostgresTarget(`postgres://u:p@${host}:5432/db`)?.isLocal).toBe(true);
    }
  });

  it("recognises both Supabase shapes", () => {
    expect(describePostgresTarget("postgres://postgres:p@db.abcdef.supabase.co:5432/postgres")?.kind).toBe(
      "supabase",
    );
    expect(
      describePostgresTarget(
        "postgres://postgres.abcdef:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require",
      )?.kind,
    ).toBe("supabase");
  });

  it("recognises supabase.io endpoints", () => {
    expect(
      describePostgresTarget("postgres://postgres:p@db.abcdef.supabase.io:5432/postgres")?.kind,
    ).toBe("supabase");
  });

  it("is not fooled by a lookalike host", () => {
    expect(describePostgresTarget("postgres://u:p@supabase.co.evil.example/db")?.kind).toBe("remote");
  });

  it("calls any other host remote, and never local", () => {
    const target = describePostgresTarget("postgres://u:p@my-db.eu-west-1.rds.amazonaws.com/app");
    expect(target?.kind).toBe("remote");
    expect(target?.isLocal).toBe(false);
  });

  it("defaults the port to 5432 when the URL omits it", () => {
    expect(describePostgresTarget("postgres://u:p@db.example.com/app")?.port).toBe(5432);
  });

  it("is null for an unset or unparseable URL", () => {
    expect(describePostgresTarget(undefined)).toBeNull();
    expect(describePostgresTarget("not a url")).toBeNull();
  });
});
