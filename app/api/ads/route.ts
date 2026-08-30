import { NextResponse } from "next/server";
import { apiError, apiErrorBody, apiFailure, withApiErrors } from "@/lib/api-error";
import {
  getMetaAdsConfig,
  getCampaigns,
  getLeads,
  getLeadForms,
  getCampaignInsights,
  type MetaCampaign,
  type MetaLead,
  type MetaLeadForm,
  type MetaInsights,
} from "@/lib/meta-ads";

export const dynamic = "force-dynamic";

export const GET = withApiErrors(async function GET(request: Request) {
  const config = getMetaAdsConfig();
  if (!config) {
    // Not an error: an install without Meta credentials is a normal state, and
    // answering 400 made every page load log a failure that nothing could fix.
    // 200 + `code` lets the page render its "connect Meta Ads" panel instead.
    return NextResponse.json(
      apiErrorBody("not_configured", {
        message: "Meta Ads isn't configured. Set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID in Settings.",
      }),
      { status: 200 },
    );
  }

  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") ?? "campaigns";
  const datePreset = url.searchParams.get("date_preset") ?? "last_30d";

  try {
    if (tab === "campaigns") {
      const campaigns = await getCampaigns();
      const insights = await Promise.all(
        campaigns.slice(0, 20).map((c) =>
          getCampaignInsights(c.id, datePreset).catch(
            (): MetaInsights => ({
              impressions: "0",
              clicks: "0",
              spend: "0",
              reach: "0",
              cpc: "0",
              cpm: "0",
              ctr: "0",
            }),
          ),
        ),
      );
      return NextResponse.json({ campaigns, insights });
    }

    if (tab === "leads") {
      const forms = await getLeadForms();
      const leads = await getLeads();
      return NextResponse.json({ leads, forms });
    }

    return apiError("invalid_field", { field: "tab" });
  } catch (err) {
    // Meta's own failures are upstream failures: the detail goes to logs and
    // support, never into the sentence the page prints.
    return apiFailure(err, "upstream_failed");
  }
});
