import { describe, expect, it } from "vitest";
import { parseConfigFile, parseEnv } from "./env-file";

describe("parseEnv", () => {
  it("reads quoted, unquoted, and exported assignments", () => {
    expect(
      parseEnv('A="one"\nB=two\nexport C=\'three\'\n'),
    ).toEqual({ A: "one", B: "two", C: "three" });
  });

  it("skips comments, blanks, and malformed lines", () => {
    expect(parseEnv("# comment\n\n  \nnot-an-assignment\n=novalue\nD=ok")).toEqual({ D: "ok" });
  });

  it("keeps '=' inside values", () => {
    expect(parseEnv('URL="postgres://u:p=x@127.0.0.1:5544/db"')).toEqual({
      URL: "postgres://u:p=x@127.0.0.1:5544/db",
    });
  });

  it("unescapes newlines only inside double quotes", () => {
    expect(parseEnv('KEY="a\\nb"').KEY).toBe("a\nb");
    expect(parseEnv("KEY='a\\nb'").KEY).toBe("a\\nb");
  });

  it("preserves an explicitly empty value", () => {
    expect(parseEnv('EMPTY=""')).toEqual({ EMPTY: "" });
  });
});

describe("parseConfigFile", () => {
  it("reads a JSON export", () => {
    expect(parseConfigFile('{"A":"one","N":3}')).toEqual({ A: "one" });
  });

  it("falls back to .env parsing when the JSON is broken", () => {
    expect(parseConfigFile('{ oops\nA="one"')).toEqual({ A: "one" });
  });
});
