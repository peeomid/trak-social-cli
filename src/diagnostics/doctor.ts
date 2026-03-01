import fs from "node:fs";
import { getRequestedScopes } from "../meta/auth.js";
import { getConfigPath, getTokenPath } from "../store/paths.js";
import type { DoctorCheck, DoctorReport, LiveDoctorReport, MetaConfig, SecretStore, TokenStore } from "../types/models.js";

export function buildDoctorReport(
  config: MetaConfig,
  secretStore: SecretStore,
  tokenStore: TokenStore,
): DoctorReport {
  const configPath = getConfigPath();
  const tokenPath = getTokenPath();
  const checks: DoctorCheck[] = [];

  checks.push({
    name: "config file",
    status: fs.existsSync(configPath) ? "ok" : "warn",
    details: fs.existsSync(configPath) ? configPath : "Missing ~/.config/trak/config.toml",
  });

  checks.push({
    name: "app id",
    status: config.appId ? "ok" : "warn",
    details: config.appId ? config.appId : "Missing auth.app_id in config.toml",
  });

  const hasRealSecret = Boolean(secretStore.appSecret && secretStore.appSecret !== "YOUR_META_APP_SECRET");
  checks.push({
    name: "app secret",
    status: hasRealSecret ? "ok" : "warn",
    details: hasRealSecret ? "Saved in config.toml" : "Missing real auth.app_secret in config.toml",
  });

  checks.push({
    name: "default page",
    status: config.defaultPageId ? "ok" : "warn",
    details: config.defaultPageId || "No defaultPageId set",
  });

  checks.push({
    name: "default ad account",
    status: config.defaultAdAccountId ? "ok" : "warn",
    details: config.defaultAdAccountId || "No defaultAdAccountId set",
  });

  checks.push({
    name: "token file",
    status: fs.existsSync(tokenPath) ? "ok" : "warn",
    details: fs.existsSync(tokenPath) ? tokenPath : "Missing ~/.config/trak/tokens.json",
  });

  checks.push({
    name: "user token",
    status: tokenStore.userAccessToken ? "ok" : "warn",
    details: tokenStore.userAccessToken ? "Saved" : "Run: trak auth login",
  });

  checks.push({
    name: "token expiry",
    status: isFutureIsoDate(tokenStore.userTokenExpiresAt) ? "ok" : "warn",
    details: tokenStore.userTokenExpiresAt || "Missing token expiry",
  });

  checks.push({
    name: "stored pages",
    status: Object.keys(tokenStore.pageTokens).length > 0 ? "ok" : "warn",
    details:
      Object.keys(tokenStore.pageTokens).length > 0
        ? `${Object.keys(tokenStore.pageTokens).length} Pages cached`
        : "No cached Page tokens",
  });

  checks.push({
    name: "saved scopes",
    status: tokenStore.scopes.length > 0 ? "ok" : "warn",
    details:
      tokenStore.scopes.length > 0
        ? tokenStore.scopes.join(", ")
        : `No saved scopes. Expected: ${getRequestedScopes().join(", ")}`,
  });

  const nextSteps = buildNextSteps(config, secretStore, tokenStore);
  return {
    summary: {
      ok: checks.filter((check) => check.status === "ok").length,
      warn: checks.filter((check) => check.status === "warn").length,
    },
    paths: {
      configPath,
      tokenPath,
    },
    checks,
    nextSteps,
  };
}

export function attachLiveDoctorReport(report: DoctorReport, live: LiveDoctorReport): DoctorReport {
  const checks = [...report.checks];
  checks.push({
    name: "live token",
    status: live.token.status,
    details: live.token.isValid ? `Valid until ${live.token.expiresAt || "(unknown)"}` : live.token.errorMessage || "Invalid token",
  });
  checks.push({
    name: "live permissions",
    status: live.permissions.missing.length === 0 ? "ok" : "warn",
    details:
      live.permissions.missing.length === 0
        ? "All required permissions granted"
        : `Missing: ${live.permissions.missing.join(", ")}`,
  });
  if (live.pageAccess) {
    checks.push({
      name: "live page access",
      status: live.pageAccess.status,
      details: live.pageAccess.details,
    });
  }
  if (live.adsAccess) {
    checks.push({
      name: "live ads access",
      status: live.adsAccess.status,
      details: live.adsAccess.details,
    });
  }

  return {
    ...report,
    summary: {
      ok: checks.filter((check) => check.status === "ok").length,
      warn: checks.filter((check) => check.status === "warn").length,
    },
    checks,
    nextSteps: mergeNextSteps(report.nextSteps, buildLiveNextSteps(live)),
    live,
  };
}

function buildNextSteps(config: MetaConfig, secretStore: SecretStore, tokenStore: TokenStore): string[] {
  const nextSteps: string[] = [];
  if (!config.appId) {
    nextSteps.push("Edit ~/.config/trak/config.toml and set auth.app_id");
  }
  if (!secretStore.appSecret || secretStore.appSecret === "YOUR_META_APP_SECRET") {
    nextSteps.push("Edit ~/.config/trak/config.toml and set auth.app_secret");
  }
  if (!tokenStore.userAccessToken) {
    nextSteps.push("Run: trak auth login");
  }
  if (!config.defaultPageId) {
    nextSteps.push("Set defaults.page_id in ~/.config/trak/config.toml or use trak config set --default-page ...");
  }
  if (!config.defaultAdAccountId) {
    nextSteps.push("Set defaults.ad_account_id in ~/.config/trak/config.toml or use trak config set --default-ad-account ...");
  }
  if (nextSteps.length === 0) {
    nextSteps.push("Setup looks good. Try: trak page posts list --limit 5");
    nextSteps.push(
      "Try: trak ads insights --account 1243158725700119 --level campaign --campaign-id 6908777851014 --date-preset today",
    );
  }
  return nextSteps;
}

function buildLiveNextSteps(live: LiveDoctorReport): string[] {
  const nextSteps: string[] = [];
  if (!live.token.isValid) {
    nextSteps.push("Run: trak auth login");
    return nextSteps;
  }
  if (live.permissions.missing.length > 0) {
    nextSteps.push(`Log in again and approve: ${live.permissions.missing.join(", ")}`);
  }
  if (live.pageAccess && !live.pageAccess.canRead) {
    nextSteps.push("Check that your Facebook account has real access to this Page");
  }
  if (live.adsAccess && !live.adsAccess.canRead) {
    nextSteps.push("Check that your Facebook account has access to this ad account in Meta Business Manager");
  }
  return nextSteps;
}

function mergeNextSteps(...groups: string[][]): string[] {
  return [...new Set(groups.flat())];
}

function isFutureIsoDate(value: string): boolean {
  if (!value) {
    return false;
  }
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return false;
  }
  return time > Date.now();
}
