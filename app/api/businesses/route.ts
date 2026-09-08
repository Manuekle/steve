import { NextResponse, type NextRequest } from "next/server";
import { apiError, missingField, withApiErrors } from "@/lib/api-error";
import {
  createBusiness,
  forgetBusiness,
  listBusinesses,
  renameBusiness,
  setActiveBusiness,
  DEFAULT_BUSINESS_ID,
  type BusinessEntry,
} from "@/lib/business-scope";
import { getBusinessIdentity, getBusinessProfile } from "@/lib/business-profile-store";

// GET    /api/businesses — every business on this installation, and the active one
// POST   /api/businesses — { name } create one and switch to it
// PUT    /api/businesses — { id, name? , active? } rename and/or switch
// DELETE /api/businesses?id= — forget one (its documents are kept)
//
// The active business is a property of the installation, not of the browser
// session, and that is the whole design. The Eve runtime answers WhatsApp in a
// process that has no cookie to read; if "which business" lived in a session,
// the agent would keep answering for the previous one while the owner looked
// at the new one. One number, one inbox, one active business.

export const dynamic = "force-dynamic";

/** The name to show. The pre-existing business has no name of its own — it
 *  predates the registry — so it borrows the one from its business profile
 *  until somebody renames it. */
async function displayName(entry: BusinessEntry, isActive: boolean): Promise<string> {
  if (entry.name.trim()) return entry.name.trim();
  if (!isActive) return "";
  // Only the active business's profile is readable from here: the profile
  // store is itself scoped to whichever business is active.
  const [identity, record] = await Promise.all([getBusinessIdentity(), getBusinessProfile()]);
  return identity.name.trim() || record?.profile.name?.trim() || "";
}

export const GET = withApiErrors(async function GET() {
  const { businesses, activeId } = await listBusinesses();
  const named = await Promise.all(
    businesses.map(async (entry) => ({
      id: entry.id,
      name: await displayName(entry, entry.id === activeId),
      createdAt: entry.createdAt,
      active: entry.id === activeId,
      /** The original business keeps every unsuffixed key and file, which is
       *  worth saying out loud in the one place that could offer to delete it. */
      primary: entry.id === DEFAULT_BUSINESS_ID,
    })),
  );
  return NextResponse.json({ businesses: named, activeId });
});

export const POST = withApiErrors(async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  const input = body as { name?: unknown } | null;
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name) return missingField("name");

  const entry = await createBusiness(name);
  return NextResponse.json({ business: entry, activeId: entry.id });
});

export const PUT = withApiErrors(async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  const input = body as { id?: unknown; name?: unknown; active?: unknown } | null;
  const id = typeof input?.id === "string" ? input.id : "";
  if (!id) return missingField("id");

  if (typeof input?.name === "string") {
    const renamed = await renameBusiness(id, input.name);
    if (!renamed) return apiError("not_found");
  }
  if (input?.active === true) {
    const switched = await setActiveBusiness(id);
    if (!switched) return apiError("not_found");
  }

  const { businesses, activeId } = await listBusinesses();
  return NextResponse.json({ businesses, activeId });
});

export const DELETE = withApiErrors(async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return missingField("id");
  const forgotten = await forgetBusiness(id);
  if (!forgotten) {
    // The two refusals that are not "no such business": the last one, and the
    // one currently being looked at.
    return apiError("invalid_body", {
      detail: "Switch to another business first, and keep at least one.",
    });
  }
  const { businesses, activeId } = await listBusinesses();
  return NextResponse.json({ businesses, activeId });
});
