// Meta Marketing API client for Steve.
// Proxies requests through the server to avoid CORS and keep tokens private.

import { getCredentialSync } from "./credentials";

/**
 * Graph API version.
 *
 * Meta supports a version for roughly two years and then answers every call
 * with `x-ad-api-version-warning` until it starts failing outright. `v21.0`
 * was already past that line — this is the newest version with a full support
 * window ahead of it, and bumping it is a one-line change on purpose.
 */
const META_API_VERSION = "v25.0";
const META_API_BASE = "https://graph.facebook.com";

export type MetaAdsConfig = {
  accessToken: string;
  adAccountId: string;
  /** Only set when the operator connected a Page. Lead forms live on the
   *  Page node, never on the ad account, so lead reads need it. */
  pageId?: string;
};

export function getMetaAdsConfig(): MetaAdsConfig | null {
  const accessToken = getCredentialSync("META_ACCESS_TOKEN");
  const adAccountId = getCredentialSync("META_AD_ACCOUNT_ID");
  if (!accessToken || !adAccountId) return null;
  const pageId = getCredentialSync("META_PAGE_ID");
  return { accessToken, adAccountId, ...(pageId ? { pageId } : {}) };
}

/** Thrown for anything Meta itself rejected, so callers can tell an upstream
 *  refusal (bad token, missing permission, invalid field) from a bug here. */
export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Meta's own numeric code — 190 is a dead token, 200 a missing
     *  permission. Kept for logs and support, never shown to a user. */
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

type MetaMethod = "GET" | "POST" | "DELETE";

/** Graph accepts form-encoded bodies everywhere; JSON only on some edges.
 *  Arrays and objects (`special_ad_categories`, targeting) ride as JSON
 *  strings inside the form body, which is what Meta's own SDKs send. */
function encodeParams(params: Record<string, unknown>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return body;
}

async function metaFetch<T>(
  path: string,
  params?: Record<string, unknown>,
  method: MetaMethod = "GET",
): Promise<T> {
  const config = getMetaAdsConfig();
  if (!config) throw new Error("Meta Ads credentials not configured");

  const url = new URL(`${META_API_BASE}/${META_API_VERSION}/${path}`);
  // The token rides in the header rather than the query string: a URL param
  // ends up in every proxy and access log between here and Meta.
  const init: RequestInit = {
    method,
    cache: "no-store",
    headers: { Authorization: `Bearer ${config.accessToken}` },
  };

  if (method === "GET" || method === "DELETE") {
    if (params) {
      // `URLSearchParams` is iterable but not a plain object — `Object.entries`
      // on it yields nothing.
      for (const [k, v] of encodeParams(params)) url.searchParams.set(k, v);
    }
  } else if (params) {
    init.body = encodeParams(params);
    init.headers = {
      ...init.headers,
      "content-type": "application/x-www-form-urlencoded",
    };
  }

  const res = await fetch(url.toString(), init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: {
        message?: string;
        code?: number;
        error_subcode?: number;
        error_user_msg?: string;
      };
    };
    const err = body?.error;
    // `error_user_msg` is Meta's own human-readable line ("Your budget is
    // below the minimum") and beats the developer-facing `message` when both
    // are present.
    const msg = err?.error_user_msg ?? err?.message ?? `Meta API ${res.status}`;
    throw new MetaApiError(msg, res.status, err?.code, err?.error_subcode);
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

export const EMPTY_INSIGHTS: MetaInsights = {
  impressions: "0",
  clicks: "0",
  spend: "0",
  reach: "0",
  cpc: "0",
  cpm: "0",
  ctr: "0",
};

/** The six objectives Meta still accepts on a new campaign. The legacy names
 *  (`CONVERSIONS`, `LINK_CLICKS`, …) are read-only now: they come back on old
 *  campaigns but are rejected on create. */
export const CAMPAIGN_OBJECTIVES = [
  "OUTCOME_AWARENESS",
  "OUTCOME_TRAFFIC",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_APP_PROMOTION",
  "OUTCOME_SALES",
] as const;
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

/** Housing, employment, credit, social issues, and elections carry legal
 *  targeting restrictions. Meta requires the field on every create — an empty
 *  array is the "none of these" answer, not a way to skip it. */
export const SPECIAL_AD_CATEGORIES = [
  "HOUSING",
  "EMPLOYMENT",
  "CREDIT",
  "ISSUES_ELECTIONS_POLITICS",
  "ONLINE_GAMBLING_AND_GAMING",
] as const;
export type SpecialAdCategory = (typeof SPECIAL_AD_CATEGORIES)[number];

/** The only statuses this app will write. `DELETED` and `ARCHIVED` are
 *  reachable through their own verbs, not through a status edit. */
export const WRITABLE_STATUSES = ["ACTIVE", "PAUSED"] as const;
export type WritableStatus = (typeof WRITABLE_STATUSES)[number];

// ── Reads ──────────────────────────────────────────────────────────

const CAMPAIGN_FIELDS =
  "id,name,status,objective,daily_budget,lifetime_budget,budget_remaining,created_time,updated_time";

export async function getCampaigns(): Promise<MetaCampaign[]> {
  const config = getMetaAdsConfig();
  if (!config) return [];
  const data = await metaFetch<{ data: MetaCampaign[] }>(
    `act_${config.adAccountId}/campaigns`,
    { fields: CAMPAIGN_FIELDS, limit: "100" },
  );
  return data.data ?? [];
}

export async function getCampaign(campaignId: string): Promise<MetaCampaign> {
  return metaFetch<MetaCampaign>(campaignId, { fields: CAMPAIGN_FIELDS });
}

export async function getAdSets(campaignId?: string): Promise<MetaAdSet[]> {
  const config = getMetaAdsConfig();
  if (!config) return [];
  const data = await metaFetch<{ data: MetaAdSet[] }>(
    campaignId ? `${campaignId}/adsets` : `act_${config.adAccountId}/adsets`,
    {
      fields: "id,name,campaign_id,status,daily_budget,lifetime_budget",
      limit: "100",
    },
  );
  return data.data ?? [];
}

export async function getAds(campaignId?: string): Promise<MetaAd[]> {
  const config = getMetaAdsConfig();
  if (!config) return [];
  const data = await metaFetch<{ data: MetaAd[] }>(
    campaignId ? `${campaignId}/ads` : `act_${config.adAccountId}/ads`,
    {
      fields: "id,name,adset_id,campaign_id,status,creative",
      limit: "100",
    },
  );
  return data.data ?? [];
}

/**
 * Lead forms for the connected Page.
 *
 * These used to be read from `act_{id}/leadgen_forms`, an edge the Ad Account
 * node does not have — the call could only ever 400, which is why the Leads
 * tab never showed anything. Forms belong to the Page that runs the ad.
 */
export async function getLeadForms(): Promise<MetaLeadForm[]> {
  const config = getMetaAdsConfig();
  if (!config?.pageId) return [];
  const data = await metaFetch<{ data: MetaLeadForm[] }>(
    `${config.pageId}/leadgen_forms`,
    {
      fields: "id,name,status,created_time,leads_count",
      limit: "100",
    },
  );
  return data.data ?? [];
}

/**
 * Leads, newest first.
 *
 * Meta exposes leads on the form (`/{form_id}/leads`) and on the ad, and
 * nowhere else — `act_{id}/leads` was never a real edge either. With no form
 * ids given, every form on the Page is walked.
 *
 * Meta drops lead data after 90 days, so nothing older than that comes back
 * however far the caller pages.
 */
export async function getLeads(formIds?: string[]): Promise<MetaLead[]> {
  const config = getMetaAdsConfig();
  if (!config?.pageId) return [];

  const ids = formIds?.length
    ? formIds
    : (await getLeadForms()).map((form) => form.id);
  if (ids.length === 0) return [];

  const perForm = await Promise.all(
    ids.map((formId) =>
      metaFetch<{ data: MetaLead[] }>(`${formId}/leads`, {
        fields: "id,form_id,created_time,field_data",
        limit: "100",
      })
        .then((res) => res.data ?? [])
        // One archived or permission-blocked form must not take the whole
        // tab down with it.
        .catch(() => [] as MetaLead[]),
    ),
  );

  return perForm
    .flat()
    .sort(
      (a, b) =>
        new Date(b.created_time).getTime() - new Date(a.created_time).getTime(),
    );
}

/**
 * Every campaign's insights for the window, in one request, keyed by campaign
 * id.
 *
 * The page used to ask Meta once per campaign — twenty round trips for twenty
 * rows, capped at twenty so campaign 21 silently had no numbers. The account's
 * own insights edge answers all of them at `level=campaign`.
 *
 * A campaign with no delivery in the window is simply absent from the reply,
 * so callers fall back to `EMPTY_INSIGHTS` rather than expecting a row.
 */
export async function getCampaignInsightsMap(
  datePreset?: string,
): Promise<Record<string, MetaInsights>> {
  const config = getMetaAdsConfig();
  if (!config) return {};
  const params: Record<string, unknown> = {
    fields: "campaign_id,impressions,clicks,actions,spend,reach,cpc,cpm,ctr",
    level: "campaign",
    limit: "500",
  };
  if (datePreset) params.date_preset = datePreset;

  const data = await metaFetch<{
    data: Array<MetaInsights & { campaign_id?: string }>;
  }>(`act_${config.adAccountId}/insights`, params);

  const map: Record<string, MetaInsights> = {};
  for (const row of data.data ?? []) {
    if (!row.campaign_id) continue;
    const { campaign_id, ...insights } = row;
    map[campaign_id] = { ...EMPTY_INSIGHTS, ...insights };
  }
  return map;
}

export async function getCampaignInsights(
  campaignId: string,
  datePreset?: string,
): Promise<MetaInsights> {
  const config = getMetaAdsConfig();
  if (!config) return EMPTY_INSIGHTS;
  const params: Record<string, unknown> = {
    fields: "impressions,clicks,actions,spend,reach,cpc,cpm,ctr",
    limit: "1",
  };
  if (datePreset) params.date_preset = datePreset;
  const data = await metaFetch<{ data: MetaInsights[] }>(
    `${campaignId}/insights`,
    params,
  );
  return data.data?.[0] ?? EMPTY_INSIGHTS;
}

// ── Writes ─────────────────────────────────────────────────────────
//
// Everything below spends money. Two rules hold across all of it:
//
//   1. A new campaign is always created PAUSED. Meta's own default is PAUSED
//      and this never overrides it — going live is a second, deliberate act.
//   2. Budgets cross this boundary in *minor* units (cents), because that is
//      what Meta speaks. Converting from what a person typed is the caller's
//      job, and doing it here as well would double-divide.

export type CreateCampaignInput = {
  readonly name: string;
  readonly objective: CampaignObjective;
  /** Minor units. Omit for a campaign whose ad sets carry their own budget. */
  readonly dailyBudgetMinor?: number;
  readonly lifetimeBudgetMinor?: number;
  readonly specialAdCategories?: readonly SpecialAdCategory[];
};

export async function createCampaign(
  input: CreateCampaignInput,
): Promise<{ id: string }> {
  const config = getMetaAdsConfig();
  if (!config) throw new Error("Meta Ads credentials not configured");

  const params: Record<string, unknown> = {
    name: input.name,
    objective: input.objective,
    // Never ACTIVE from here. A campaign that starts spending the moment it
    // is typed is one typo away from a bad afternoon.
    status: "PAUSED",
    special_ad_categories: input.specialAdCategories ?? [],
  };
  if (input.dailyBudgetMinor !== undefined) {
    params.daily_budget = String(input.dailyBudgetMinor);
  }
  if (input.lifetimeBudgetMinor !== undefined) {
    params.lifetime_budget = String(input.lifetimeBudgetMinor);
  }

  return metaFetch<{ id: string }>(
    `act_${config.adAccountId}/campaigns`,
    params,
    "POST",
  );
}

export type UpdateCampaignInput = {
  readonly name?: string;
  readonly status?: WritableStatus;
  readonly dailyBudgetMinor?: number;
  readonly lifetimeBudgetMinor?: number;
};

/** Meta edits a campaign by POSTing the changed fields to its own node.
 *  Only the fields present are touched. */
export async function updateCampaign(
  campaignId: string,
  input: UpdateCampaignInput,
): Promise<{ success: boolean }> {
  const params: Record<string, unknown> = {};
  if (input.name !== undefined) params.name = input.name;
  if (input.status !== undefined) params.status = input.status;
  if (input.dailyBudgetMinor !== undefined) {
    params.daily_budget = String(input.dailyBudgetMinor);
  }
  if (input.lifetimeBudgetMinor !== undefined) {
    params.lifetime_budget = String(input.lifetimeBudgetMinor);
  }
  if (Object.keys(params).length === 0) {
    throw new Error("No campaign fields to update");
  }
  return metaFetch<{ success: boolean }>(campaignId, params, "POST");
}

/**
 * Deletes a campaign, and with it every ad set and ad underneath.
 *
 * Meta does not erase it — the object moves to status `DELETED` and stops
 * appearing in normal listings. Delivery stops, spend stops, and reporting on
 * what it already spent survives. It cannot be undone from the API.
 */
export async function deleteCampaign(
  campaignId: string,
): Promise<{ success: boolean }> {
  return metaFetch<{ success: boolean }>(campaignId, undefined, "DELETE");
}
