import type { MetaConfig, PagePostScheduleInput, SecretStore, TokenStore } from "../types/models.js";
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
      value?: number;
    }>;
  }>;
};

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
  return metaRequest<Record<string, unknown>>({
    path: `/${input.postId}`,
    accessToken,
    query: {
      fields: "id,message,created_time,permalink_url,scheduled_publish_time,is_published",
    },
    config,
    tokenStore,
    secretStore,
  });
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
  const accessToken = await getPageAccessToken(config, tokenStore, secretStore, input.pageId);
  const posts = await metaRequest<PageFeedResponse>({
    path: `/${input.pageId}/posts`,
    accessToken,
    query: {
      fields: "id,message,created_time,permalink_url,shares",
      limit: input.limit,
    },
    config,
    tokenStore,
    secretStore,
  });

  return Promise.all(
    posts.data.map(async (post) => {
      const postId = String(post.id ?? "");
      const insights = await getPostInsights(config, tokenStore, secretStore, postId, accessToken);
      return {
        id: post.id,
        created_time: post.created_time,
        permalink_url: post.permalink_url,
        message: truncateMessage(post.message),
        share_count: getShareCount(post.shares),
        post_impressions_unique: insights.post_impressions_unique,
        post_clicks: insights.post_clicks,
        post_reactions_like_total: insights.post_reactions_like_total,
        post_video_views: insights.post_video_views,
      };
    }),
  );
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

async function getPostInsights(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  postId: string,
  accessToken: string,
): Promise<Record<string, number | null>> {
  const metrics = [
    "post_impressions_unique",
    "post_clicks",
    "post_reactions_like_total",
    "post_video_views",
  ];

  const response = await metaRequest<PostInsightsResponse>({
    path: `/${postId}/insights`,
    accessToken,
    query: {
      metric: metrics.join(","),
      period: "lifetime",
    },
    config,
    tokenStore,
    secretStore,
  });

  return Object.fromEntries(
    metrics.map((metric) => {
      const entry = response.data.find((row) => row.name === metric);
      const value = entry?.values?.[0]?.value;
      return [metric, typeof value === "number" ? value : null];
    }),
  );
}

function getShareCount(shares: unknown): number | null {
  if (!shares || typeof shares !== "object") {
    return null;
  }
  const count = (shares as { count?: unknown }).count;
  return typeof count === "number" ? count : null;
}

function truncateMessage(message: unknown): string {
  if (typeof message !== "string" || message.length === 0) {
    return "";
  }
  return message.length > 140 ? `${message.slice(0, 137)}...` : message;
}
