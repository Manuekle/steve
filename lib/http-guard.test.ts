import { describe, expect, it } from "vitest";
import { assertPublicHttpsUrl, assertSafeUrl, hostAllowed, parseAllowlist } from "./http-guard";

describe("assertPublicHttpsUrl", () => {
  it("accepts an ordinary public HTTPS host", () => {
    expect(assertPublicHttpsUrl("https://api.example.com/hook").hostname).toBe("api.example.com");
  });

  it("refuses plain HTTP and anything that is not http(s)", () => {
    expect(() => assertPublicHttpsUrl("http://api.example.com")).toThrow(/HTTPS is required/);
    expect(() => assertPublicHttpsUrl("file:///etc/passwd")).toThrow(/Only http and https/);
    expect(() => assertPublicHttpsUrl("not a url")).toThrow(/Invalid URL/);
  });

  it("refuses loopback, private ranges and the cloud metadata host", () => {
    for (const url of [
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.0.0.5/x",
      "https://192.168.1.1/x",
      "https://172.16.0.1/x",
      "https://169.254.169.254/x",
      "https://metadata.google.internal/x",
    ]) {
      expect(() => assertPublicHttpsUrl(url), url).toThrow();
    }
  });

  // The dotted-quad regex that used to be the only IP check matched none of
  // these, and every one of them resolves to a loopback or private address.
  it("refuses an IP written in a base other than dotted decimal", () => {
    for (const url of [
      "https://2130706433/x", // 127.0.0.1, decimal
      "https://0x7f000001/x", // 127.0.0.1, hex
      "https://0177.0.0.1/x", // 127.0.0.1, octal first label
      "https://127.1/x", // shortened dotted form
      "https://[::ffff:127.0.0.1]/x", // v6-mapped v4
      "https://[::1]/x",
    ]) {
      expect(() => assertPublicHttpsUrl(url), url).toThrow();
    }
  });

  it("still accepts a hostname that merely contains digits", () => {
    expect(assertPublicHttpsUrl("https://s3.eu-west-1.example.com").hostname).toBe(
      "s3.eu-west-1.example.com",
    );
    expect(assertPublicHttpsUrl("https://api2.example.com").hostname).toBe("api2.example.com");
  });
});

describe("assertSafeUrl", () => {
  it("denies by default: an empty allowlist blocks everything", () => {
    expect(() => assertSafeUrl("https://api.example.com", [])).toThrow(/is empty/);
  });

  it("allows a named host and its subdomains, and nothing else", () => {
    const allow = parseAllowlist("api.example.com");
    expect(assertSafeUrl("https://api.example.com/x", allow).hostname).toBe("api.example.com");
    expect(assertSafeUrl("https://eu.api.example.com/x", allow).hostname).toBe("eu.api.example.com");
    expect(() => assertSafeUrl("https://evil.example/x", allow)).toThrow(/not in HTTP_ALLOWLIST/);
  });

  it("does not let a lookalike suffix pass as a subdomain", () => {
    const allow = parseAllowlist("example.com");
    expect(hostAllowed("notexample.com", allow)).toBe(false);
    expect(hostAllowed("sub.example.com", allow)).toBe(true);
  });

  it("applies the SSRF rules before the allowlist", () => {
    expect(() => assertSafeUrl("https://127.0.0.1", parseAllowlist("127.0.0.1"))).toThrow();
  });
});

describe("parseAllowlist", () => {
  it("strips schemes and paths, lowercases, and splits on commas or whitespace", () => {
    expect(parseAllowlist("https://API.Example.com/hook, other.example.net")).toEqual([
      "api.example.com",
      "other.example.net",
    ]);
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist("")).toEqual([]);
  });
});
