import http from "node:http";
import { spawn } from "node:child_process";
import type { MetaConfig, SecretStore, TokenStore } from "../types/models.js";
import { metaRequest } from "./http.js";

const loginScopes = [
  "pages_show_list",
  "pages_read_engagement",
  "read_insights",
  "pages_manage_posts",
  "ads_read",
  "ads_management",
  "business_management",
];

type OAuthTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number | string;
};

type MeAccountsResponse = {
  data: Array<{
    id: string;
    name: string;
    access_token: string;
  }>;
};

export async function login(config: MetaConfig, secretStore: SecretStore): Promise<TokenStore> {
  const appId = config.appId;
  if (!appId) {
    throw new Error("Missing Meta app id. Set auth.app_id in ~/.config/trak/config.toml.");
  }

  const appSecret = secretStore.appSecret;
  if (!appSecret) {
    throw new Error("Missing Meta app secret. Set auth.app_secret in ~/.config/trak/config.toml.");
  }

  const redirectUri = `http://localhost:${config.redirectPort}/callback`;
  const code = await waitForOAuthCode({
    appId,
    redirectUri,
    port: config.redirectPort,
  });

  const shortLived = await exchangeCodeForToken({ appId, appSecret, redirectUri, code });
  const longLived = await exchangeLongLivedToken({
    appId,
    appSecret,
    accessToken: shortLived.access_token,
  });

  const pages = await fetchPages(config, secretStore, longLived.access_token);
  return {
    userAccessToken: longLived.access_token,
    userTokenExpiresAt: resolveTokenExpiryIso(longLived.expires_in),
    scopes: [...loginScopes],
    pageTokens: Object.fromEntries(
      pages.data.map((page) => [
        page.id,
        {
          pageId: page.id,
          pageName: page.name,
          accessToken: page.access_token,
          fetchedAt: new Date().toISOString(),
        },
      ]),
    ),
  };
}

function resolveTokenExpiryIso(expiresIn: number | string | undefined): string {
  const seconds =
    typeof expiresIn === "number"
      ? expiresIn
      : typeof expiresIn === "string" && expiresIn.trim().length > 0
        ? Number(expiresIn)
        : Number.NaN;

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }

  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function getRequestedScopes(): string[] {
  return [...loginScopes];
}

async function fetchPages(
  config: MetaConfig,
  secretStore: SecretStore,
  accessToken: string,
): Promise<MeAccountsResponse> {
  return metaRequest<MeAccountsResponse>({
    path: "/me/accounts",
    accessToken,
    query: {
      fields: "id,name,access_token",
    },
    config,
    tokenStore: {
      userAccessToken: "",
      userTokenExpiresAt: "",
      scopes: [],
      pageTokens: {},
    },
    secretStore,
  });
}

async function exchangeCodeForToken(input: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<OAuthTokenResponse> {
  const url = new URL("https://graph.facebook.com/v25.0/oauth/access_token");
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("client_secret", input.appSecret);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("code", input.code);

  const response = await fetch(url);
  const data = (await response.json()) as OAuthTokenResponse & { error?: { message?: string } };
  if (!response.ok || data.error) {
    throw new Error(data.error?.message ?? "OAuth code exchange failed.");
  }
  return data;
}

export async function exchangeLongLivedToken(input: {
  appId: string;
  appSecret: string;
  accessToken: string;
}): Promise<OAuthTokenResponse> {
  const url = new URL("https://graph.facebook.com/v25.0/oauth/access_token");
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("client_secret", input.appSecret);
  url.searchParams.set("fb_exchange_token", input.accessToken);

  const response = await fetch(url);
  const data = (await response.json()) as OAuthTokenResponse & { error?: { message?: string } };
  if (!response.ok || data.error) {
    throw new Error(data.error?.message ?? "Long-lived token exchange failed.");
  }
  return data;
}

async function waitForOAuthCode(input: {
  appId: string;
  redirectUri: string;
  port: number;
}): Promise<string> {
  const authUrl = new URL("https://www.facebook.com/v25.0/dialog/oauth");
  authUrl.searchParams.set("client_id", input.appId);
  authUrl.searchParams.set("redirect_uri", input.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", loginScopes.join(","));

  console.log("Opening browser for Meta login...");
  openUrl(authUrl.toString());

  return new Promise<string>((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", input.redirectUri);
      if (requestUrl.pathname !== "/callback") {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }

      const code = requestUrl.searchParams.get("code");
      const error = requestUrl.searchParams.get("error_message");
      if (!code) {
        response.statusCode = 400;
        response.end(error ?? "Missing code");
        server.close();
        reject(new Error(error ?? "Meta login did not return a code."));
        return;
      }

      response.end("Meta login complete. You can close this tab.");
      server.close();
      resolve(code);
    });

    server.listen(input.port, "127.0.0.1");
    server.on("error", reject);
  });
}

function openUrl(url: string): void {
  const child = spawn("open", [url], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
