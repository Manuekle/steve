// Parsing for imported configuration files.
//
// The Setup page accepts whatever the user already has: a .env from another
// install, a JSON export from this app, or a block pasted out of a terminal.
// Kept out of the route handler so the parsing rules are testable on their own.

/** Strip the wrapping quotes a .env value may carry, and unescape `\n` inside
 *  double-quoted values (Google's service-account JSON needs that). */
function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/g, "\n");
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseEnv(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const withoutExport = trimmed.startsWith("export ") ? trimmed.slice(7) : trimmed;
    const equals = withoutExport.indexOf("=");
    if (equals <= 0) continue;
    const key = withoutExport.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    result[key] = unquote(withoutExport.slice(equals + 1));
  }
  return result;
}

/** JSON object or .env text, whichever the content turns out to be. */
export function parseConfigFile(text: string): Record<string, string> {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string") result[key] = value;
      }
      return result;
    } catch {
      // Not valid JSON after all — fall through and read it as .env, the
      // friendlier failure for a file with a stray brace at the top.
    }
  }
  return parseEnv(trimmed);
}
