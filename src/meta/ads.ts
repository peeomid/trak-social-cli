import type {
  AdCreateInput,
  AdSetCreateInput,
  CampaignCreateInput,
  CreativeCreateInput,
  InsightsQuery,
  MetaConfig,
  SecretStore,
  TokenStore,
} from "../types/models.js";
import { metaRequest } from "./http.js";

type DataRows = {
  data: Array<Record<string, unknown>>;
};

type InsightsFilter = {
  field: string;
  operator: "IN";
  value: string[];
};

export async function listBusinesses(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
): Promise<DataRows> {
  return metaRequest<DataRows>({
    path: "/me/businesses",
    query: {
      fields: "id,name",
      limit: 100,
    },
    config,
    tokenStore,
    secretStore,
  });
}

export async function listBusinessPages(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  businessId: string,
  mode: "owned" | "client",
): Promise<DataRows> {
  return metaRequest<DataRows>({
    path: `/${businessId}/${mode}_pages`,
    query: {
      fields: "id,name",
      limit: 100,
    },
    config,
    tokenStore,
    secretStore,
  });
}

export function buildInsightsParams(query: InsightsQuery): Record<string, string | number | undefined> {
  const filters = buildInsightsFiltering(query);
  const params: Record<string, string | number | undefined> = {
    fields: query.fields.join(","),
    level: query.level,
    date_preset: query.datePreset,
    action_report_time: query.actionReportTime,
    time_increment: query.timeIncrement,
    limit: query.limit,
  };
  if (filters.length > 0) {
    params.filtering = JSON.stringify(filters);
  }
  return params;
}

export function buildInsightsFiltering(query: InsightsQuery): InsightsFilter[] {
  validateInsightsFilterCombination(query);

  const filters: InsightsFilter[] = [];
  if (query.campaignId) {
    filters.push({
      field: "campaign.id",
      operator: "IN",
      value: [query.campaignId],
    });
  }
  if (query.adSetId) {
    filters.push({
      field: "adset.id",
      operator: "IN",
      value: [query.adSetId],
    });
  }
  if (query.adId) {
    filters.push({
      field: "ad.id",
      operator: "IN",
      value: [query.adId],
    });
  }
  if (query.effectiveStatus) {
    filters.push({
      field: buildStatusFilterField(query.level),
      operator: "IN",
      value: [query.effectiveStatus],
    });
  }
  return filters;
}

export function validateInsightsFilterCombination(query: InsightsQuery): void {
  if (query.adId && query.adSetId) {
    throw new Error("--ad-id cannot be combined with --adset-id. Choose one filter.");
  }
  if (query.adId && query.campaignId) {
    throw new Error("--ad-id cannot be combined with --campaign-id. Choose one filter.");
  }
  if (query.level === "campaign" && query.adSetId) {
    throw new Error("--adset-id cannot be used with --level campaign. Use --level adset or remove --adset-id.");
  }
  if (query.level === "campaign" && query.adId) {
    throw new Error("--ad-id cannot be used with --level campaign. Use --level ad or remove --ad-id.");
  }
  if (query.level === "adset" && query.adId) {
    throw new Error("--ad-id cannot be used with --level adset. Use --level ad or remove --ad-id.");
  }
}

function buildStatusFilterField(level: InsightsQuery["level"]): string {
  if (level === "ad") {
    return "ad.effective_status";
  }
  if (level === "adset") {
    return "adset.effective_status";
  }
  return "campaign.effective_status";
}

export async function listAdAccounts(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
): Promise<DataRows> {
  return metaRequest<DataRows>({
    path: "/me/adaccounts",
    query: {
      fields: "id,name,account_status,currency,timezone_name",
      limit: 100,
    },
    config,
    tokenStore,
    secretStore,
  });
}

export async function listCampaigns(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  adAccountId: string,
  status?: string,
): Promise<DataRows> {
  return metaRequest<DataRows>({
    path: `/${normalizeAdAccountId(adAccountId)}/campaigns`,
    query: {
      fields: "id,name,status,objective",
      effective_status: status,
      limit: 100,
    },
    config,
    tokenStore,
    secretStore,
  });
}

export async function getInsights(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  query: InsightsQuery,
): Promise<DataRows> {
  return metaRequest<DataRows>({
    path: `/${normalizeAdAccountId(query.adAccountId)}/insights`,
    query: buildInsightsParams(query),
    config,
    tokenStore,
    secretStore,
  });
}

export async function createCampaign(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  input: CampaignCreateInput,
): Promise<Record<string, unknown>> {
  return metaRequest<Record<string, unknown>>({
    method: "POST",
    path: `/${normalizeAdAccountId(input.adAccountId)}/campaigns`,
    body: {
      name: input.name,
      objective: input.objective,
      status: input.status,
      special_ad_categories: "[]",
    },
    config,
    tokenStore,
    secretStore,
  });
}

export function buildAdSetPayload(input: AdSetCreateInput): Record<string, string> {
  return {
    name: input.name,
    campaign_id: input.campaignId,
    daily_budget: String(input.dailyBudget),
    billing_event: input.billingEvent,
    optimization_goal: input.optimizationGoal,
    targeting: JSON.stringify(input.targeting),
    status: input.status,
    start_time: input.startTime ?? "",
    end_time: input.endTime ?? "",
  };
}

export async function createAdSet(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  input: AdSetCreateInput,
): Promise<Record<string, unknown>> {
  const body = buildAdSetPayload(input);
  return metaRequest<Record<string, unknown>>({
    method: "POST",
    path: `/${normalizeAdAccountId(input.adAccountId)}/adsets`,
    body,
    config,
    tokenStore,
    secretStore,
  });
}

export function buildCreativePayload(input: CreativeCreateInput): Record<string, string> {
  return {
    name: input.name,
    object_story_spec: JSON.stringify({
      page_id: input.pageId,
      link_data: {
        message: input.message,
        link: input.link,
        image_hash: input.imageHash,
      },
    }),
  };
}

export async function createCreative(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  input: CreativeCreateInput,
): Promise<Record<string, unknown>> {
  return metaRequest<Record<string, unknown>>({
    method: "POST",
    path: `/${normalizeAdAccountId(input.adAccountId)}/adcreatives`,
    body: buildCreativePayload(input),
    config,
    tokenStore,
    secretStore,
  });
}

export async function createAd(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  input: AdCreateInput,
): Promise<Record<string, unknown>> {
  return metaRequest<Record<string, unknown>>({
    method: "POST",
    path: `/${normalizeAdAccountId(input.adAccountId)}/ads`,
    body: {
      name: input.name,
      adset_id: input.adSetId,
      status: input.status,
      creative: JSON.stringify({ creative_id: input.creativeId }),
    },
    config,
    tokenStore,
    secretStore,
  });
}

function normalizeAdAccountId(adAccountId: string): string {
  return adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
}
