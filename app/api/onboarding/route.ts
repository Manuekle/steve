import { NextResponse, type NextRequest } from "next/server";
import { getCredential, saveCredentials } from "@/lib/credentials";
import {
  CRMS,
  GOALS,
  INDUSTRIES,
  VOLUMES,
  crmHost,
  getProfile,
  isSettled,
  saveProfile,
  skip,
} from "@/lib/onboarding/store";

/** Whether to show the flow, and the answers if it has already been done. */
export async function GET() {
  return NextResponse.json({ profile: await getProfile(), settled: await isSettled() });
}

const oneOf = (value: unknown, allowed: readonly string[]) =>
  typeof value === "string" && allowed.includes(value);

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (body?.skip === true) {
    await skip();
    return NextResponse.json({ ok: true });
  }

  // Validated here rather than trusted from the form: this route is reachable
  // by anything holding a session, and a stored value outside these sets would
  // resurface as an unknown translation key on the settings screen.
  if (
    typeof body?.businessName !== "string" ||
    typeof body?.phone !== "string" ||
    !oneOf(body?.industry, INDUSTRIES) ||
    !oneOf(body?.contactVolume, VOLUMES) ||
    !oneOf(body?.crm, CRMS.map((crm) => crm.id)) ||
    !Array.isArray(body?.goals) ||
    !body.goals.every((goal) => oneOf(goal, GOALS))
  ) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  await saveProfile({
    businessName: body.businessName.trim().slice(0, 120),
    contactVolume: body.contactVolume as string,
    crm: body.crm as string,
    goals: body.goals as string[],
    industry: body.industry as string,
    phone: body.phone.trim().slice(0, 40),
  });

  // The one answer that changes the machine. `http_request` refuses any host
  // that is not on this list, so picking a CRM here saves the owner finding
  // its API hostname themselves later.
  const host = crmHost(body.crm as string);
  if (host) {
    const current = (await getCredential("HTTP_ALLOWLIST")) ?? "";
    const hosts = current.split(",").map((entry) => entry.trim()).filter(Boolean);
    if (!hosts.includes(host)) {
      await saveCredentials({ HTTP_ALLOWLIST: [...hosts, host].join(", ") });
    }
  }

  return NextResponse.json({ ok: true });
}
