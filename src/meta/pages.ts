import type {
  MetaConfig,
  PageInsightsPeriod,
  PageInsightsTimeRange,
  PagePostInsightMetric,
  PagePostInsightRow,
  PagePostScheduleInput,
  SecretStore,
  TokenStore,
} from "../types/models.js";
import { metaRequest } from "./http.js";

type PageListResponse = {
  data: Array<{
    id: string;
    name: string;
    category?: string;
  }>;
};

type PageFeedResponse = {
  data: Array<Record<string, unknown>>;
};

export type ResolvedPage = {
  id: string;
  name: string;
  username?: string;
  category?: string;
  fan_count?: number;
  followers_count?: number;
  access_token?: string;
};

type PostInsightsResponse = {
  data: Array<{
    name: string;
    values?: Array<{
      value?: number | string | Record<string, unknown>;
    }>;
  }>;
};

const defaultPagePostInsightMetrics: PagePostInsightMetric[] = [
  "post_impressions_unique",
  "post_clicks",
  "post_reactions_like_total",
  "post_video_views",
];

const supportedPagePostInsightMetrics = [
  "post_impressions",
  "post_impressions_unique",
  "post_clicks",
  "post_engaged_users",
  "post_reactions_like_total",
  "post_reactions_love_total",
  "post_reactions_wow_total",
  "post_reactions_haha_total",
  "post_reactions_sorry_total",
  "post_reactions_anger_total",
  "post_video_views",
] as const satisfies readonly PagePostInsightMetric[];

export function getDefaultPagePostInsightMetrics(): string[] {
  return [...defaultPagePostInsightMetrics];
}

export function getSupportedPagePostInsightMetrics(): string[] {
  return [...supportedPagePostInsightMetrics];
}

export function validatePagePostInsightMetrics(metrics: string[]): string[] {
  const invalid = metrics.filter((metric) => !supportedPagePostInsightMetrics.includes(metric as PagePostInsightMetric));
  if (invalid.length > 0) {
    throw new Error(`Unsupported Page insight metric(s): ${invalid.join(", ")}`);
  }
  return metrics;
}

export function buildPageInsightsTimeParams(input: PageInsightsTimeRange): Record<string, string | undefined> {
  return {
    date_preset: input.since || input.until ? undefined : input.datePreset,
    since: input.since,
    until: input.until,
  };
}

export async function listPages(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
): Promise<PageListResponse> {
  return metaRequest<PageListResponse>({
    path: "/me/accounts",
    query: {
      fields: "id,name,category",
    },
    config,
    tokenStore,
    secretStore,
  });
}

export async function listPosts(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  input: {
    pageId: string;
    limit: number;
    since?: string;
    until?: string;
  },
): Promise<PageFeedResponse> {
  const accessToken = await getPageAccessToken(config, tokenStore, secretStore, input.pageId);
  return metaRequest<PageFeedResponse>({
    path: `/${input.pageId}/posts`,
    accessToken,
    query: {
      fields: "id,message,created_time,permalink_url",
      limit: input.limit,
      since: input.since,
      until: input.until,
    },
    config,
    tokenStore,
    secretStore,
  });
}

export async function getPost(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  input: { pageId: string; postId: string },
): Promise<Record<string, unknown>> {
  const accessToken = await getPageAccessToken(config, tokenStore, secretStore, input.pageId);
  return getPagePostDetails(config, tokenStore, secretStore, input.postId, accessToken);
}

export async function schedulePost(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  input: PagePostScheduleInput,
): Promise<Record<string, unknown>> {
  const accessToken = await getPageAccessToken(config, tokenStore, secretStore, input.pageId);
  return metaRequest<Record<string, unknown>>({
    method: "POST",
    path: `/${input.pageId}/feed`,
    accessToken,
    body: {
      message: input.message,
      link: input.link,
      published: "false",
      scheduled_publish_time: Math.floor(new Date(input.scheduledPublishTime).getTime() / 1000),
    },
    config,
    tokenStore,
    secretStore,
  });
}

export async function listPostStats(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  input: {
    pageId: string;
    limit: number;
  },
): Promise<Array<Record<string, unknown>>> {
  const rows = await listPagePostInsights(config, tokenStore, secretStore, {
    pageId: input.pageId,
    limit: input.limit,
    metrics: getDefaultPagePostInsightMetrics(),
    period: "lifetime",
  });

  return rows.map((row) => ({
    id: row.postId,
    created_time: row.createdTime,
    permalink_url: row.permalinkUrl,
    message: truncateMessage(row.message),
    share_count: row.shareCount,
    ...row.insights,
  }));
}

export async function listPagePostInsights(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  input: {
    pageId: string;
    limit: number;
    metrics: string[];
    period: PageInsightsPeriod;
    datePreset?: string;
    since?: string;
    until?: string;
    includeMessage?: boolean;
  },
): Promise<PagePostInsightRow[]> {
  const accessToken = await getPageAccessToken(config, tokenStore, secretStore, input.pageId);
  const posts = await metaRequest<PageFeedResponse>({
    path: `/${input.pageId}/posts`,
    accessToken,
    query: {
      fields: "id,message,created_time,permalink_url,shares",
      limit: input.limit,
      since: input.since,
      until: input.until,
    },
    config,
    tokenStore,
    secretStore,
  });

  return Promise.all(
    posts.data.map((post) =>
      getPagePostInsightRow(config, tokenStore, secretStore, {
        post,
        accessToken,
        metrics: input.metrics,
        period: input.period,
        datePreset: input.datePreset,
        since: input.since,
        until: input.until,
        includeMessage: input.includeMessage,
      }),
    ),
  );
}

export async function getPagePostInsights(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  input: {
    pageId: string;
    postId: string;
    metrics: string[];
    period: PageInsightsPeriod;
    datePreset?: string;
    since?: string;
    until?: string;
    includeMessage?: boolean;
  },
): Promise<PagePostInsightRow> {
  const accessToken = await getPageAccessToken(config, tokenStore, secretStore, input.pageId);
  const post = await getPagePostDetails(config, tokenStore, secretStore, input.postId, accessToken);
  return getPagePostInsightRow(config, tokenStore, secretStore, {
    post,
    accessToken,
    metrics: input.metrics,
    period: input.period,
    datePreset: input.datePreset,
    since: input.since,
    until: input.until,
    includeMessage: input.includeMessage,
  });
}

export async function comparePagePostInsights(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  input: {
    pageId: string;
    postId: string;
    otherPostId: string;
    metrics: string[];
    period: PageInsightsPeriod;
    datePreset?: string;
    since?: string;
    until?: string;
    includeMessage?: boolean;
  },
): Promise<{
  left: PagePostInsightRow;
  right: PagePostInsightRow;
  delta: Record<string, number | null>;
}> {
  const [left, right] = await Promise.all([
    getPagePostInsights(config, tokenStore, secretStore, {
      pageId: input.pageId,
      postId: input.postId,
      metrics: input.metrics,
      period: input.period,
      datePreset: input.datePreset,
      since: input.since,
      until: input.until,
      includeMessage: input.includeMessage,
    }),
    getPagePostInsights(config, tokenStore, secretStore, {
      pageId: input.pageId,
      postId: input.otherPostId,
      metrics: input.metrics,
      period: input.period,
      datePreset: input.datePreset,
      since: input.since,
      until: input.until,
      includeMessage: input.includeMessage,
    }),
  ]);

  const delta = Object.fromEntries(
    input.metrics.map((metric) => {
      const leftValue = left.insights[metric];
      const rightValue = right.insights[metric];
      return [metric, typeof leftValue === "number" && typeof rightValue === "number" ? leftValue - rightValue : null];
    }),
  );

  return { left, right, delta };
}

export async function resolvePage(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  pageRef: string,
): Promise<ResolvedPage> {
  return metaRequest<ResolvedPage>({
    path: `/${pageRef}`,
    query: {
      fields: "id,name,username,category,fan_count,followers_count,access_token",
    },
    config,
    tokenStore,
    secretStore,
  });
}

async function getPageAccessToken(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  pageId: string,
): Promise<string> {
  const pageToken = tokenStore.pageTokens[pageId]?.accessToken;
  if (pageToken) {
    return pageToken;
  }

  const resolvedPage = await resolvePage(config, tokenStore, secretStore, pageId);
  if (!resolvedPage.access_token) {
    throw new Error(`No Page token found for ${pageId}. Try auth login again or use a Page you can access.`);
  }
  return resolvedPage.access_token;
}

async function getPagePostDetails(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  postId: string,
  accessToken: string,
): Promise<Record<string, unknown>> {
  return metaRequest<Record<string, unknown>>({
    path: `/${postId}`,
    accessToken,
    query: {
      fields: "id,message,created_time,permalink_url,scheduled_publish_time,is_published,shares",
    },
    config,
    tokenStore,
    secretStore,
  });
}

async function getPagePostInsightRow(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  input: {
    post: Record<string, unknown>;
    accessToken: string;
    metrics: string[];
    period: PageInsightsPeriod;
    datePreset?: string;
    since?: string;
    until?: string;
    includeMessage?: boolean;
  },
): Promise<PagePostInsightRow> {
  const postId = String(input.post.id ?? "");
  const insights = await getPostInsights(config, tokenStore, secretStore, {
    postId,
    accessToken: input.accessToken,
    metrics: input.metrics,
    period: input.period,
    datePreset: input.datePreset,
    since: input.since,
    until: input.until,
  });

  return {
    postId,
    createdTime: getOptionalString(input.post.created_time),
    permalinkUrl: getOptionalString(input.post.permalink_url),
    message: input.includeMessage ? getOptionalString(input.post.message) : truncateMessage(input.post.message),
    shareCount: getShareCount(input.post.shares),
    insights: Object.fromEntries(input.metrics.map((metric) => [metric, insights[metric] ?? null])),
    missingMetrics: input.metrics.filter((metric) => insights[metric] === null || insights[metric] === undefined),
  };
}

async function getPostInsights(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  input: {
    postId: string;
    accessToken: string;
    metrics: string[];
    period: PageInsightsPeriod;
    datePreset?: string;
    since?: string;
    until?: string;
  },
): Promise<Record<string, number | null>> {
  const response = await metaRequest<PostInsightsResponse>({
    path: `/${input.postId}/insights`,
    accessToken: input.accessToken,
    query: {
      metric: input.metrics.join(","),
      period: input.period,
      ...buildPageInsightsTimeParams({
        datePreset: input.datePreset,
        since: input.since,
        until: input.until,
      }),
    },
    config,
    tokenStore,
    secretStore,
  });

  return Object.fromEntries(
    input.metrics.map((metric) => {
      const entry = response.data.find((row) => row.name === metric);
      return [metric, normalizeInsightValue(entry?.values?.[0]?.value)];
    }),
  );
}

function normalizeInsightValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getShareCount(shares: unknown): number | null {
  if (!shares || typeof shares !== "object") {
    return null;
  }
  const count = (shares as { count?: unknown }).count;
  return typeof count === "number" ? count : null;
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function truncateMessage(message: unknown): string {
  if (typeof message !== "string" || message.length === 0) {
    return "";
  }
  return message.length > 140 ? `${message.slice(0, 137)}...` : message;
}
