import { defineTool } from "eve/tools";
import { z } from "zod";
import { getCredential } from "../../lib/credentials";
import { assertSafeUrl, parseAllowlist } from "../../lib/http-guard";

export default defineTool({
  description:
    "Call an allowlisted HTTPS API (CRM, calendar, webhook). " +
    "Hosts must be configured in Settings as HTTP_ALLOWLIST. " +
    "Never use this for arbitrary web browsing.",
  inputSchema: z.object({
    method: z.enum(["GET", "POST", "PUT", "PATCH"]),
    url: z.string().min(1).describe("Full https URL on an allowlisted host."),
    body: z.unknown().optional().describe("JSON body for POST/PUT/PATCH."),
    headers: z
      .record(z.string(), z.string())
      .optional()
      .describe("Optional extra headers (e.g. Authorization)."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    status: z.number(),
    body: z.string(),
  }),
  async execute({ method, url: rawUrl, body, headers }) {
    const allowlist = parseAllowlist(await getCredential("HTTP_ALLOWLIST"));
    const url = assertSafeUrl(rawUrl, allowlist);

    const requestHeaders = new Headers();
    requestHeaders.set("accept", "application/json, text/plain;q=0.9, */*;q=0.8");
    if (body !== undefined && method !== "GET") {
      requestHeaders.set("content-type", "application/json");
    }
    for (const [key, value] of Object.entries(headers ?? {})) {
      const lower = key.toLowerCase();
      if (lower === "host" || lower === "cookie" || lower === "set-cookie") continue;
      requestHeaders.set(key, value);
    }

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    const clipped = text.length > 1_048_576 ? `${text.slice(0, 1_048_576)}\n…truncated` : text;
    return { ok: response.ok, status: response.status, body: clipped };
  },
});
