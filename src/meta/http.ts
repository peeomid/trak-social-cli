import crypto from "node:crypto";
import type { MetaConfig, SecretStore, TokenStore } from "../types/models.js";

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  path: string;
  accessToken?: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, string | number | undefined>;
  config: MetaConfig;
  tokenStore: TokenStore;
  secretStore?: SecretStore;
};

export async function metaRequest<T>(options: RequestOptions): Promise<T> {
  const method = options.method ?? "GET";
  const url = new URL(`https://graph.facebook.com/${options.config.defaultApiVersion}/${stripSlashes(options.path)}`);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const token = options.accessToken ?? options.tokenStore.userAccessToken;
  if (token) {
    url.searchParams.set("access_token", token);
    const appSecret = options.secretStore?.appSecret || process.env[options.config.appSecretEnvVar];
    if (appSecret) {
      url.searchParams.set("appsecret_proof", buildAppSecretProof(token, appSecret));
    }
  }

  const init: RequestInit = { method };
  if (method !== "GET" && options.body) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(options.body)) {
      if (value !== undefined) {
        body.set(key, String(value));
      }
    }
    init.body = body;
    init.headers = {
      "content-type": "application/x-www-form-urlencoded",
    };
  }

  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: { message?: string; type?: string; code?: number } };
  if (!response.ok || data.error) {
    const message = data.error?.message ?? `Meta API request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

function stripSlashes(value: string): string {
  return value.replace(/^\/+/, "");
}

function buildAppSecretProof(accessToken: string, appSecret: string): string {
  return crypto.createHmac("sha256", appSecret).update(accessToken).digest("hex");
}
