import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "eve/tools";

const appendRow = vi.fn();
const getGoogleToken = vi.fn();

vi.mock("../../../lib/google-sheets", () => ({
  appendRow: (...args: unknown[]) => appendRow(...(args as [])),
  SHEETS_SCOPE: "https://www.googleapis.com/auth/spreadsheets",
}));
vi.mock("../../../lib/google-auth", () => ({
  getGoogleToken: (...args: unknown[]) => getGoogleToken(...(args as [])),
}));
vi.mock("../../../lib/agent-scope", () => ({
  assertToolAllowed: async () => undefined,
}));

const logToSheet = (await import("../../../agent/tools/log_to_sheet")).default;

const fakeCtx = { session: { id: "test-session" } } as unknown as ToolContext;

beforeEach(() => {
  appendRow.mockReset().mockResolvedValue(undefined);
  getGoogleToken.mockReset().mockResolvedValue("token");
});

describe("log_to_sheet", () => {
  it("appends the row with the connected account's token", async () => {
    const result = await logToSheet.execute(
      { spreadsheetId: "sheet-1", sheetName: "Leads", values: ["Ana", "+54911"] },
      fakeCtx,
    );

    expect(result).toEqual({ success: true, message: "Row logged." });
    expect(appendRow).toHaveBeenCalledWith({
      accessToken: "token",
      spreadsheetId: "sheet-1",
      sheetName: "Leads",
      values: ["Ana", "+54911"],
    });
  });

  it("defaults to the first tab when no sheet name is given", async () => {
    await logToSheet.execute({ spreadsheetId: "sheet-1", values: ["Ana"] }, fakeCtx);

    expect(appendRow.mock.calls[0][0].sheetName).toBe("Sheet1");
  });

  it("treats a blank sheet name as absent rather than writing to a tab named ' '", async () => {
    await logToSheet.execute({ spreadsheetId: "sheet-1", sheetName: "  ", values: ["Ana"] }, fakeCtx);

    expect(appendRow.mock.calls[0][0].sheetName).toBe("Sheet1");
  });

  // The model gets a sentence it can relay, not an exception that ends the
  // turn, when Google was never connected.
  it("reports the missing connection instead of calling Sheets", async () => {
    getGoogleToken.mockResolvedValue(undefined);

    const result = await logToSheet.execute({ spreadsheetId: "sheet-1", values: ["Ana"] }, fakeCtx);

    expect(result.success).toBe(false);
    expect(result.message).toContain("No Google account is connected");
    expect(appendRow).not.toHaveBeenCalled();
  });
});
