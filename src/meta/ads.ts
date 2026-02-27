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
  return {
    fields: query.fields.join(","),
    level: query.level,
    date_preset: query.datePreset,
    action_report_time: query.actionReportTime,
    time_increment: query.timeIncrement,
    limit: query.limit,
  };
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
