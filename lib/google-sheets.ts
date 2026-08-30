import { parseServiceAccount, getAccessToken } from "./google-auth";

// Google Sheets API access with no OAuth flow and no googleapis dependency:
// sign a short-lived JWT with the service account's private key (Node's
// built-in crypto covers RS256, so no extra package is needed), trade it
// for an access token, then call the Sheets REST API directly.

/** Append one row to a sheet. `serviceAccountJson` is the raw JSON key file contents. */
export async function appendRow(opts: {
  readonly serviceAccountJson: string;
  readonly spreadsheetId: string;
  readonly sheetName: string;
  readonly values: readonly string[];
}): Promise<void> {
  const account = parseServiceAccount(opts.serviceAccountJson);
  const token = await getAccessToken(account, "https://www.googleapis.com/auth/spreadsheets");
  const range = encodeURIComponent(opts.sheetName);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${opts.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ values: [opts.values] }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Sheets API ${response.status}: ${await response.text()}`);
  }
}
