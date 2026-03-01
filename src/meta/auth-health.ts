import { getRequestedScopes, exchangeLongLivedToken } from "./auth.js";
import { metaRequest } from "./http.js";
import { maskToken } from "../store/token-store.js";
import type {
  AuthRefreshReport,
  LiveDoctorAdsAccess,
  LiveDoctorPageAccess,
  LiveDoctorReport,
  LiveDoctorTokenCheck,
  MetaConfig,
  PermissionSet,
  SecretStore,
  TokenStore,
} from "../types/models.js";

type DebugTokenResponse = {
  data?: {
    is_valid?: boolean;
    expires_at?: number;
    scopes?: string[];
    error?: {
      code?: number;
      message?: string;
    };
  };
};

type PermissionsResponse = {
  data: Array<{
    permission: string;
    status: string;
  }>;
};

type MeAccountsResponse = {
  data: Array<{
    id: string;
    name: string;
    access_token: string;
  }>;
};

type PageCheckResponse = {
  id: string;
  name: string;
};

type AdsAccountResponse = {
  id: string;
  name?: string;
  account_status?: number;
};

type BuildLiveDoctorOptions = {
  pageId?: string;
  adAccountId?: string;
};

type RefreshAuthOptions = {
  force?: boolean;
};

type RefreshAuthResult = {
  nextTokenStore?: TokenStore;
  report: AuthRefreshReport;
};

const refreshWindowMs = 7 * 24 * 60 * 60 * 1000;

export function buildPermissionSet(required: string[], granted: string[]): PermissionSet {
  const grantedSet = new Set(granted);
  const requiredSet = new Set(required);
  return {
    required,
    granted,
    missing: required.filter((scope) => !grantedSet.has(scope)),
    extra: granted.filter((scope) => !requiredSet.has(scope)),
  };
}

export async function inspectUserToken(
  config: MetaConfig,
  secretStore: SecretStore,
  tokenStore: TokenStore,
): Promise<LiveDoctorTokenCheck> {
  if (!config.appId || !secretStore.appSecret || !tokenStore.userAccessToken) {
    return {
      status: "warn",
      isValid: false,
      expiresAt: tokenStore.userTokenExpiresAt,
      errorMessage: "Missing app config or saved user token.",
    };
  }

  try {
    const appToken = `${config.appId}|${secretStore.appSecret}`;
    const url = new URL(`https://graph.facebook.com/${config.defaultApiVersion}/debug_token`);
    url.searchParams.set("input_token", tokenStore.userAccessToken);
    url.searchParams.set("access_token", appToken);

    const response = await fetch(url);
    const payload = (await response.json()) as DebugTokenResponse;
    const debugData = payload.data;
    const expiresAt = toIso(debugData?.expires_at) || tokenStore.userTokenExpiresAt;

    if (!response.ok || !debugData) {
      return {
        status: "warn",
        isValid: false,
        expiresAt,
        errorMessage: "Meta token inspection failed.",
      };
    }

    return {
      status: debugData.is_valid ? "ok" : "warn",
      isValid: Boolean(debugData.is_valid),
      expiresAt,
      errorCode: debugData.error?.code,
      errorMessage: debugData.error?.message,
    };
  } catch (error) {
    return {
      status: "warn",
      isValid: false,
      expiresAt: tokenStore.userTokenExpiresAt,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchGrantedPermissions(
  config: MetaConfig,
  secretStore: SecretStore,
  tokenStore: TokenStore,
): Promise<string[]> {
  const response = await metaRequest<PermissionsResponse>({
    path: "/me/permissions",
    config,
    tokenStore,
    secretStore,
  });

  return response.data
    .filter((permission) => permission.status === "granted")
    .map((permission) => permission.permission)
    .sort();
}

export async function checkPageAccess(
  config: MetaConfig,
  secretStore: SecretStore,
  tokenStore: TokenStore,
  pageId: string,
): Promise<LiveDoctorPageAccess> {
  const pageToken = tokenStore.pageTokens[pageId]?.accessToken;
  try {
    const page = await metaRequest<PageCheckResponse>({
      path: `/${pageId}`,
      accessToken: pageToken || tokenStore.userAccessToken,
      query: {
        fields: "id,name",
      },
      config,
      tokenStore,
      secretStore,
    });

    return {
      status: "ok",
      pageId: page.id,
      pageName: page.name,
      canRead: true,
      hasPageToken: Boolean(pageToken),
      details: pageToken ? "Page token works." : "User token can read this Page.",
    };
  } catch (error) {
    return {
      status: "warn",
      pageId,
      canRead: false,
      hasPageToken: Boolean(pageToken),
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function checkAdsAccess(
  config: MetaConfig,
  secretStore: SecretStore,
  tokenStore: TokenStore,
  adAccountId: string,
): Promise<LiveDoctorAdsAccess> {
  try {
    const account = await metaRequest<AdsAccountResponse>({
      path: `/${normalizeAdAccountId(adAccountId)}`,
      query: {
        fields: "id,name,account_status",
      },
      config,
      tokenStore,
      secretStore,
    });

    return {
      status: "ok",
      adAccountId: account.id || normalizeAdAccountId(adAccountId),
      canRead: true,
      details: account.name ? `Ads account ok: ${account.name}` : "Ads account is readable.",
    };
  } catch (error) {
    return {
      status: "warn",
      adAccountId: normalizeAdAccountId(adAccountId),
      canRead: false,
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function buildLiveDoctorReport(
  config: MetaConfig,
  secretStore: SecretStore,
  tokenStore: TokenStore,
  options: BuildLiveDoctorOptions = {},
): Promise<LiveDoctorReport> {
  const token = await inspectUserToken(config, secretStore, tokenStore);
  const permissions = token.isValid
    ? buildPermissionSet(getRequestedScopes(), await fetchGrantedPermissions(config, secretStore, tokenStore))
    : buildPermissionSet(getRequestedScopes(), []);

  const report: LiveDoctorReport = {
    token,
    permissions,
  };

  const pageId = options.pageId || config.defaultPageId;
  if (pageId && token.isValid) {
    report.pageAccess = await checkPageAccess(config, secretStore, tokenStore, pageId);
  }

  const adAccountId = options.adAccountId || config.defaultAdAccountId;
  if (adAccountId && token.isValid) {
    report.adsAccess = await checkAdsAccess(config, secretStore, tokenStore, adAccountId);
  }

  return report;
}

export async function refreshAuthState(
  config: MetaConfig,
  secretStore: SecretStore,
  tokenStore: TokenStore,
  options: RefreshAuthOptions = {},
): Promise<RefreshAuthResult> {
  const notes: string[] = [];

  if (!tokenStore.userAccessToken) {
    return {
      report: buildRefreshReport(tokenStore, {
        status: "warn",
        action: "relogin_required",
        pagesCount: Object.keys(tokenStore.pageTokens).length,
        rebuilt: false,
        notes,
        nextSteps: ["Run: trak auth login"],
      }),
    };
  }

  const tokenHealth = await inspectUserToken(config, secretStore, tokenStore);
  if (!tokenHealth.isValid) {
    return {
      report: buildRefreshReport(tokenStore, {
        status: "warn",
        action: "relogin_required",
        expiresAt: tokenHealth.expiresAt,
        pagesCount: Object.keys(tokenStore.pageTokens).length,
        rebuilt: false,
        notes: tokenHealth.errorMessage ? [tokenHealth.errorMessage] : notes,
        nextSteps: ["Run: trak auth login"],
      }),
    };
  }

  let nextStore: TokenStore = {
    ...tokenStore,
    userTokenExpiresAt: tokenHealth.expiresAt || tokenStore.userTokenExpiresAt,
  };
  let action: AuthRefreshReport["action"] = "still_valid";

  if (shouldAttemptRefresh(tokenStore.userTokenExpiresAt, tokenHealth.expiresAt, options.force)) {
    try {
      const refreshed = await exchangeLongLivedToken({
        appId: config.appId,
        appSecret: secretStore.appSecret,
        accessToken: tokenStore.userAccessToken,
      });
      nextStore = {
        ...nextStore,
        userAccessToken: refreshed.access_token,
        userTokenExpiresAt: resolveTokenExpiryIso(refreshed.expires_in) || nextStore.userTokenExpiresAt,
      };
      action = "refreshed";
    } catch (error) {
      notes.push(`Token exchange skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    const pages = await metaRequest<MeAccountsResponse>({
      path: "/me/accounts",
      accessToken: nextStore.userAccessToken,
      query: {
        fields: "id,name,access_token",
      },
      config,
      tokenStore: nextStore,
      secretStore,
    });

    nextStore = {
      ...nextStore,
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

    return {
      nextTokenStore: nextStore,
      report: buildRefreshReport(nextStore, {
        status: notes.length > 0 ? "warn" : "ok",
        action,
        pagesCount: pages.data.length,
        rebuilt: true,
        notes,
        nextSteps: notes.length > 0 ? ["Run: trak doctor --live"] : [],
      }),
    };
  } catch (error) {
    notes.push(`Page token rebuild failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      nextTokenStore: nextStore,
      report: buildRefreshReport(nextStore, {
        status: "warn",
        action,
        pagesCount: Object.keys(nextStore.pageTokens).length,
        rebuilt: false,
        notes,
        nextSteps: ["Run: trak doctor --live"],
      }),
    };
  }
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

function buildRefreshReport(
  tokenStore: TokenStore,
  input: {
    status: "ok" | "warn";
    action: AuthRefreshReport["action"];
    expiresAt?: string;
    pagesCount: number;
    rebuilt: boolean;
    notes: string[];
    nextSteps: string[];
  },
): AuthRefreshReport {
  const expiresAt = input.expiresAt ?? tokenStore.userTokenExpiresAt;
  return {
    status: input.status,
    action: input.action,
    token: {
      masked: maskToken(tokenStore.userAccessToken),
      expiresAt,
      isExpired: isExpired(expiresAt),
    },
    pages: {
      count: input.pagesCount,
      rebuilt: input.rebuilt,
    },
    notes: input.notes,
    nextSteps: input.nextSteps,
  };
}

function shouldAttemptRefresh(currentExpiry: string, liveExpiry: string, force = false): boolean {
  if (force) {
    return true;
  }
  const expiry = liveExpiry || currentExpiry;
  if (!expiry) {
    return true;
  }
  const time = new Date(expiry).getTime();
  if (Number.isNaN(time)) {
    return true;
  }
  return time - Date.now() <= refreshWindowMs;
}

function isExpired(value: string): boolean {
  if (!value) {
    return true;
  }
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return true;
  }
  return time <= Date.now();
}

function toIso(unixSeconds?: number): string {
  if (!unixSeconds) {
    return "";
  }
  return new Date(unixSeconds * 1000).toISOString();
}

function normalizeAdAccountId(value: string): string {
  return value.startsWith("act_") ? value : `act_${value}`;
}
