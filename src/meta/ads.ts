import type {
  AdCreateInput,
  AdCreativeObject,
  AdObject,
  AdSetCreateInput,
  CampaignCreateInput,
  CreativeCreateInput,
  InsightsQuery,
  MetaConfig,
  ResolvedAdCreative,
  ResolvedAdPost,
  SecretStore,
  TokenStore,
} from "../types/models.js";
import { metaRequest } from "./http.js";
import { getPost } from "./pages.js";

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
      effective_status: status ? JSON.stringify([status]) : undefined,
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

export async function getAd(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  adId: string,
): Promise<AdObject> {
  return metaRequest<AdObject>({
    path: `/${adId}`,
    query: {
      fields: "id,name,status,effective_status,creative{id,name}",
    },
    config,
    tokenStore,
    secretStore,
  });
}

export async function getAdCreative(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  creativeId: string,
): Promise<AdCreativeObject> {
  const response = await metaRequest<Record<string, unknown>>({
    path: `/${creativeId}`,
    query: {
      fields:
        "id,name,title,body,object_story_id,effective_object_story_id,object_story_spec,image_hash,thumbnail_url,url_tags,asset_feed_spec",
    },
    config,
    tokenStore,
    secretStore,
  });

  return {
    id: String(response.id ?? creativeId),
    name: getString(response.name),
    title: getString(response.title),
    body: getString(response.body),
    object_story_id: getString(response.object_story_id),
    effective_object_story_id: getString(response.effective_object_story_id),
    object_story_spec: normalizeObjectStorySpec(response.object_story_spec),
    image_hash: getString(response.image_hash),
    thumbnail_url: getString(response.thumbnail_url),
    url_tags: getString(response.url_tags),
    asset_feed_spec: asRecord(response.asset_feed_spec),
  };
}

export async function resolveAdCreative(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  adId: string,
): Promise<{ ad: AdObject; creative: AdCreativeObject | null; summary: ResolvedAdCreative }> {
  const ad = await getAd(config, tokenStore, secretStore, adId);
  const creativeId = ad.creative?.id ?? null;
  if (!creativeId) {
    return {
      ad,
      creative: null,
      summary: {
        ad_id: ad.id,
        ad_name: ad.name,
        creative_id: null,
        creative_type: "unknown",
        page_id: null,
        post_id: null,
        effective_object_story_id: null,
        message: null,
        headline: null,
        link_url: null,
        image_hash: null,
        thumbnail_url: null,
        is_dark_post: false,
      },
    };
  }

  const creative = await getAdCreative(config, tokenStore, secretStore, creativeId);
  return {
    ad,
    creative,
    summary: extractAdCreativeSummary(ad, creative),
  };
}

export async function resolveAdPost(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  adId: string,
): Promise<{ ad: AdObject; creative: AdCreativeObject | null; post: Record<string, unknown> | null; summary: ResolvedAdPost }> {
  const resolved = await resolveAdCreative(config, tokenStore, secretStore, adId);
  const postId = resolved.summary.post_id;
  const pageId = resolved.summary.page_id;
  if (!postId) {
    return {
      ...resolved,
      post: null,
      summary: {
        ...resolved.summary,
        post_resolution: "unresolved",
        created_time: null,
        permalink_url: null,
      },
    };
  }

  try {
    const post = pageId
      ? await getPost(config, tokenStore, secretStore, { pageId, postId })
      : await metaRequest<Record<string, unknown>>({
          path: `/${postId}`,
          query: {
            fields: "id,message,created_time,permalink_url",
          },
          config,
          tokenStore,
          secretStore,
        });
    return {
      ...resolved,
      post,
      summary: {
        ...resolved.summary,
        post_resolution: "resolved",
        message: getString(post.message) ?? resolved.summary.message,
        created_time: getString(post.created_time) ?? null,
        permalink_url: getString(post.permalink_url) ?? null,
      },
    };
  } catch {
    return {
      ...resolved,
      post: null,
      summary: {
        ...resolved.summary,
        post_resolution: "unresolved",
        created_time: null,
        permalink_url: null,
      },
    };
  }
}

export function extractAdCreativeSummary(ad: AdObject, creative: AdCreativeObject): ResolvedAdCreative {
  const objectStorySpec = creative.object_story_spec ?? {};
  const postId = extractPostIdFromCreative(creative);
  const pageId = getString(objectStorySpec.page_id) ?? getPageIdFromPostId(postId);
  const linkData = asRecord(objectStorySpec.link_data);
  const videoData = asRecord(objectStorySpec.video_data);
  const photoData = asRecord(objectStorySpec.photo_data);
  const templateData = asRecord(objectStorySpec.template_data);
  const message =
    creative.body ??
    getString(linkData?.message) ??
    getString(videoData?.message) ??
    getString(photoData?.message) ??
    getString(templateData?.message) ??
    null;
  const headline =
    creative.title ??
    getString(linkData?.name) ??
    getString(videoData?.title) ??
    getString(photoData?.caption) ??
    getString(templateData?.name) ??
    null;
  const linkUrl =
    getString(linkData?.link) ??
    getNestedString(videoData, ["call_to_action", "value", "link"]) ??
    getNestedString(photoData, ["call_to_action", "value", "link"]) ??
    getNestedString(templateData, ["link"]) ??
    null;
  const creativeType = resolveCreativeType(creative);

  return {
    ad_id: ad.id,
    ad_name: ad.name,
    creative_id: creative.id,
    creative_name: creative.name,
    creative_type: creativeType,
    page_id: pageId ?? null,
    post_id: postId,
    effective_object_story_id: creative.effective_object_story_id ?? null,
    message,
    headline,
    link_url: linkUrl,
    image_hash: creative.image_hash ?? null,
    thumbnail_url: creative.thumbnail_url ?? null,
    is_dark_post: Boolean(creative.object_story_spec && !creative.object_story_id),
  };
}

export function extractPostIdFromCreative(creative: Pick<AdCreativeObject, "effective_object_story_id" | "object_story_id">): string | null {
  const candidate = creative.effective_object_story_id ?? creative.object_story_id ?? null;
  if (!candidate || !candidate.includes("_")) {
    return candidate;
  }
  return candidate;
}

export function normalizeAdAccountId(adAccountId: string): string {
  return adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
}

function normalizeObjectStorySpec(value: unknown): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return asRecord(parsed);
    } catch {
      return undefined;
    }
  }
  return asRecord(value);
}

function resolveCreativeType(creative: AdCreativeObject): ResolvedAdCreative["creative_type"] {
  const objectStorySpec = creative.object_story_spec ?? {};
  if (creative.object_story_id || creative.effective_object_story_id) {
    return "page_post";
  }
  if (objectStorySpec.link_data) {
    return "link";
  }
  if (objectStorySpec.video_data) {
    return "video";
  }
  if (objectStorySpec.photo_data) {
    return "photo";
  }
  return "unknown";
}

function getPageIdFromPostId(postId: string | null): string | null {
  if (!postId || !postId.includes("_")) {
    return null;
  }
  return postId.split("_")[0] ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function getNestedString(record: Record<string, unknown> | undefined, path: string[]): string | undefined {
  let current: unknown = record;
  for (const key of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return getString(current);
}
