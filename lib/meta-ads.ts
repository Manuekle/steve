// Meta Marketing API client for Steve.
// Proxies requests through the server to avoid CORS and keep tokens private.

import { getCredentialSync } from "./credentials";

const META_API_VERSION = "v21.0";
const META_API_BASE = "https://graph.facebook.com";

export type MetaAdsConfig = {
  accessToken: string;
  adAccountId: string;
};

export function getMetaAdsConfig(): MetaAdsConfig | null {
  const accessToken = getCredentialSync("META_ACCESS_TOKEN");
  const adAccountId = getCredentialSync("META_AD_ACCOUNT_ID");
  if (!accessToken || !adAccountId) return null;
  return { accessToken, adAccountId };
}

async function metaFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const config = getMetaAdsConfig();
  if (!config) throw new Error("Meta Ads credentials not configured");

  const url = new URL(`${META_API_BASE}/${META_API_VERSION}/${path}`);
  url.searchParams.set("access_token", config.accessToken);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      (body as { error?: { message?: string } })?.error?.message ??
      `Meta API ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────

export type MetaCampaign = {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  created_time: string;
  updated_time: string;
};

export type MetaAdSet = {
  id: string;
  name: string;
  campaign_id: string;
  status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  targeting?: Record<string, unknown>;
};

export type MetaAd = {
  id: string;
  name: string;
  adset_id: string;
  campaign_id: string;
  status: string;
  creative?: { id: string };
};

export type MetaLead = {
  id: string;
  form_id: string;
  created_time: string;
  field_data: Array<{
    name: string;
    values: string[];
  }>;
};

export type MetaLeadForm = {
  id: string;
  name: string;
  status: string;
  created_time: string;
  leads_count?: number;
};

export type MetaInsights = {
  impressions: string;
  clicks: string;
  actions?: Array<{
    action_type: string;
    value: string;
  }>;
  spend: string;
  reach: string;
  cpc: string;
  cpm: string;
  ctr: string;
};

// ── API methods ────────────────────────────────────────────────────

export async function getCampaigns(): Promise<MetaCampaign[]> {
  const config = getMetaAdsConfig();
  if (!config) return [];
  const data = await metaFetch<{ data: MetaCampaign[] }>(
    `act_${config.adAccountId}/campaigns`,
    {
      fields: "id,name,status,objective,daily_budget,lifetime_budget,budget_remaining,created_time,updated_time",
      limit: "100",
    },
  );
  return data.data ?? [];
}

export async function getAdSets(): Promise<MetaAdSet[]> {
  const config = getMetaAdsConfig();
  if (!config) return [];
  const data = await metaFetch<{ data: MetaAdSet[] }>(
    `act_${config.adAccountId}/adsets`,
    {
      fields: "id,name,campaign_id,status,daily_budget,lifetime_budget",
      limit: "100",
    },
  );
  return data.data ?? [];
}

export async function getAds(): Promise<MetaAd[]> {
  const config = getMetaAdsConfig();
  if (!config) return [];
  const data = await metaFetch<{ data: MetaAd[] }>(
    `act_${config.adAccountId}/ads`,
    {
      fields: "id,name,adset_id,campaign_id,status,creative",
      limit: "100",
    },
  );
  return data.data ?? [];
}

export async function getLeadForms(): Promise<MetaLeadForm[]> {
  const config = getMetaAdsConfig();
  if (!config) return [];
  const data = await metaFetch<{ data: MetaLeadForm[] }>(
    `act_${config.adAccountId}/leadgen_forms`,
    {
      fields: "id,name,status,created_time",
      limit: "100",
    },
  );
  return data.data ?? [];
}

export async function getLeads(formIds?: string[]): Promise<MetaLead[]> {
  const config = getMetaAdsConfig();
  if (!config) return [];

  if (formIds && formIds.length > 0) {
    const allLeads: MetaLead[] = [];
    for (const formId of formIds) {
      const data = await metaFetch<{ data: MetaLead[] }>(formId, {
        fields: "id,form_id,created_time,field_data",
        limit: "100",
      });
      allLeads.push(...(data.data ?? []));
    }
    return allLeads.sort(
      (a, b) =>
        new Date(b.created_time).getTime() - new Date(a.created_time).getTime(),
    );
  }

  const data = await metaFetch<{ data: MetaLead[] }>(
    `act_${config.adAccountId}/leads`,
    {
      fields: "id,form_id,created_time,field_data",
      limit: "100",
    },
  );
  return data.data ?? [];
}

export async function getCampaignInsights(
  campaignId: string,
  datePreset?: string,
): Promise<MetaInsights> {
  const config = getMetaAdsConfig();
  if (!config) {
    return {
      impressions: "0",
      clicks: "0",
      spend: "0",
      reach: "0",
      cpc: "0",
      cpm: "0",
      ctr: "0",
    };
  }
  const params: Record<string, string> = {
    fields: "impressions,clicks,actions,spend,reach,cpc,cpm,ctr",
    limit: "1",
  };
  if (datePreset) params.date_preset = datePreset;
  const data = await metaFetch<{ data: MetaInsights[] }>(
    `${campaignId}/insights`,
    params,
  );
  return (
    data.data?.[0] ?? {
      impressions: "0",
      clicks: "0",
      spend: "0",
      reach: "0",
      cpc: "0",
      cpm: "0",
      ctr: "0",
    }
  );
}
