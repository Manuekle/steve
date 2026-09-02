import { defineTool } from "eve/tools";
import { z } from "zod";
import { appendRow, SHEETS_SCOPE } from "../../lib/google-sheets";
import { getGoogleToken } from "../../lib/google-auth";
import { assertToolAllowed } from "../../lib/agent-scope";

export default defineTool({
  description:
    "Append one row to a connected Google Sheet. Use when the user asks to " +
    "log, save, or record something into a spreadsheet mid-conversation.",
  inputSchema: z.object({
    spreadsheetId: z.string().min(1).describe("The Google Sheets spreadsheet id, from its URL."),
    sheetName: z.string().optional().describe("Tab name within the spreadsheet. Defaults to 'Sheet1'."),
    values: z.array(z.string()).min(1).describe("Ordered cell values for the new row."),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  async execute(input, ctx) {
    await assertToolAllowed(ctx.session.id, "log_to_sheet");
    const accessToken = await getGoogleToken(SHEETS_SCOPE);
    if (!accessToken) {
      return {
        success: false,
        message: "No Google account is connected and GOOGLE_SERVICE_ACCOUNT_JSON is not set.",
      };
    }
    await appendRow({
      accessToken,
      spreadsheetId: input.spreadsheetId,
      sheetName: input.sheetName?.trim() || "Sheet1",
      values: input.values,
    });
    return { success: true, message: "Row logged." };
  },
});
