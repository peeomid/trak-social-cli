import type { MetaConfig, SecretStore, TokenStore, UserPostAttachment, UserPostRow } from "../types/models.js";
import { metaRequest } from "./http.js";

type UserPostsResponse = {
  data: Array<Record<string, unknown>>;
};

export async function listUserPosts(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  input: {
    limit: number;
    since?: string;
    until?: string;
  },
): Promise<UserPostRow[]> {
  const response = await metaRequest<UserPostsResponse>({
    path: "/me/posts",
    query: {
      fields: buildUserPostFields(),
      limit: input.limit,
      since: input.since,
      until: input.until,
    },
    config,
    tokenStore,
    secretStore,
  });

  return response.data.map(mapUserPost);
}

export async function getUserPost(
  config: MetaConfig,
  tokenStore: TokenStore,
  secretStore: SecretStore,
  postId: string,
): Promise<UserPostRow> {
  const response = await metaRequest<Record<string, unknown>>({
    path: `/${postId}`,
    query: {
      fields: buildUserPostFields(),
    },
    config,
    tokenStore,
    secretStore,
  });

  return mapUserPost(response);
}

function buildUserPostFields(): string {
  return "id,message,created_time,permalink_url,attachments{media_type,type,url,target,media}";
}

function mapUserPost(post: Record<string, unknown>): UserPostRow {
  return {
    postId: getOptionalString(post.id) ?? "",
    createdTime: getOptionalString(post.created_time),
    message: getOptionalString(post.message),
    permalinkUrl: getOptionalString(post.permalink_url),
    attachments: getAttachments(post.attachments),
  };
}

function getAttachments(value: unknown): UserPostAttachment[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((item) => {
    const row = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
    const target = typeof row.target === "object" && row.target !== null ? (row.target as Record<string, unknown>) : undefined;
    return {
      type: getOptionalString(row.type),
      mediaType: getOptionalString(row.media_type),
      url: getOptionalString(row.url),
      target:
        target && (getOptionalString(target.id) || getOptionalString(target.url))
          ? {
              id: getOptionalString(target.id),
              url: getOptionalString(target.url),
            }
          : undefined,
    };
  });
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
