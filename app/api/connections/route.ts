import { NextResponse } from "next/server";
import { withApiErrors } from "@/lib/api-error";
import { getConnectionSummaries } from "@/lib/connection-store";

// GET /api/connections — what the Connections page draws.
//
// Status only: whether an account is connected, whose it is, and when it was
// linked. No token, no scope string, no client secret ever crosses this line.

export const GET = withApiErrors(async function GET() {
  const { oauth, manual } = await getConnectionSummaries();
  return NextResponse.json({ connections: oauth, manual });
});
