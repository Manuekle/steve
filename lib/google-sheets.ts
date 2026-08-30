// The Sheets REST API, called directly — no googleapis dependency.
//
// Where the token comes from is not this file's business: `getGoogleToken`
// answers with the connected account's token when there is one and the service
// account's otherwise, so the same call works for both kinds of install.

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

/** Append one row to a sheet. */
export async function appendRow(opts: {
  readonly accessToken: string;
  readonly spreadsheetId: string;
  readonly sheetName: string;
  readonly values: readonly string[];
}): Promise<void> {
  const token = opts.accessToken;
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
