import { NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";
import { syncDriveFolder } from "@/lib/drive-import";

// POST /api/knowledge/drive-sync — one-shot import of the configured Drive
// folder (Settings → Google Drive) into Conocimiento. See lib/drive-import.ts.

// Exporting and embedding several files in one run is minutes, not seconds.
export const maxDuration = 300;

export const POST = withApiErrors(async function POST() {
  const result = await syncDriveFolder();
  if (result === null) {
    return apiError("not_configured", {
      message: "No Drive folder is configured. Set GOOGLE_DRIVE_FOLDER_ID in Settings.",
    });
  }
  return NextResponse.json(result);
});
