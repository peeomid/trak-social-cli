import fs from "node:fs";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as toml from "smol-toml";
import { getConfigDir, getConfigPath } from "./paths.js";
import type { MetaConfig, SecretStore } from "../types/models.js";

const defaultConfig: MetaConfig = {
  defaultApiVersion: "v25.0",
  defaultPageId: "",
  defaultAdAccountId: "",
  pageAliases: {},
  adAccountAliases: {},
  appId: "",
  redirectPort: 8787,
  output: "table",
};

const emptySecretStore: SecretStore = {
  appSecret: "",
};

type ConfigFile = {
  auth?: {
    app_id?: string;
    app_secret?: string;
    redirect_port?: number;
  };
  defaults?: {
    api_version?: string;
    page_id?: string;
    ad_account_id?: string;
    output?: MetaConfig["output"];
  };
  aliases?: {
    pages?: Record<string, string>;
    ad_accounts?: Record<string, string>;
  };
};

export function ensureConfigDir(): void {
  mkdirSync(getConfigDir(), { recursive: true });
}

export function loadConfig(): MetaConfig {
  if (!fs.existsSync(getConfigPath())) {
    return { ...defaultConfig };
  }

  const raw = loadConfigFile();
  return {
    ...defaultConfig,
    defaultApiVersion: raw.defaults?.api_version ?? defaultConfig.defaultApiVersion,
    defaultPageId: raw.defaults?.page_id ?? defaultConfig.defaultPageId,
    defaultAdAccountId: raw.defaults?.ad_account_id ?? defaultConfig.defaultAdAccountId,
    pageAliases: raw.aliases?.pages ?? defaultConfig.pageAliases,
    adAccountAliases: raw.aliases?.ad_accounts ?? defaultConfig.adAccountAliases,
    appId: raw.auth?.app_id ?? defaultConfig.appId,
    redirectPort: raw.auth?.redirect_port ?? defaultConfig.redirectPort,
    output: raw.defaults?.output ?? defaultConfig.output,
  };
}

export function saveConfig(config: MetaConfig): void {
  const current = loadConfigFile();
  ensureConfigDir();
  writeFileSync(
    getConfigPath(),
    `${toml.stringify({
      auth: {
        app_id: config.appId,
        app_secret: current.auth?.app_secret ?? "",
        redirect_port: config.redirectPort,
      },
      defaults: {
        api_version: config.defaultApiVersion,
        page_id: config.defaultPageId,
        ad_account_id: config.defaultAdAccountId,
        output: config.output,
      },
      aliases: {
        pages: config.pageAliases,
        ad_accounts: config.adAccountAliases,
      },
    })}\n`,
    "utf8",
  );
  chmodSync(getConfigPath(), 0o600);
}

export function loadSecretStore(): SecretStore {
  const raw = loadConfigFile();
  return {
    ...emptySecretStore,
    appSecret: raw.auth?.app_secret ?? "",
  };
}

export function saveSecretStore(store: SecretStore): void {
  const current = loadConfig();
  ensureConfigDir();
  writeFileSync(
    getConfigPath(),
    `${toml.stringify({
      auth: {
        app_id: current.appId,
        app_secret: store.appSecret,
        redirect_port: current.redirectPort,
      },
      defaults: {
        api_version: current.defaultApiVersion,
        page_id: current.defaultPageId,
        ad_account_id: current.defaultAdAccountId,
        output: current.output,
      },
      aliases: {
        pages: current.pageAliases,
        ad_accounts: current.adAccountAliases,
      },
    })}\n`,
    "utf8",
  );
  chmodSync(getConfigPath(), 0o600);
}

export function clearSecretStore(): void {
  saveSecretStore({ appSecret: "" });
}

function loadConfigFile(): ConfigFile {
  if (!fs.existsSync(getConfigPath())) {
    return {};
  }

  const raw = toml.parse(readFileSync(getConfigPath(), "utf8")) as ConfigFile;
  return {
    auth: {
      app_id: raw.auth?.app_id ?? "",
      app_secret: raw.auth?.app_secret ?? "",
      redirect_port: raw.auth?.redirect_port ?? defaultConfig.redirectPort,
    },
    defaults: {
      api_version: raw.defaults?.api_version ?? defaultConfig.defaultApiVersion,
      page_id: raw.defaults?.page_id ?? "",
      ad_account_id: raw.defaults?.ad_account_id ?? "",
      output: raw.defaults?.output ?? defaultConfig.output,
    },
    aliases: {
      pages: sanitizeAliases(raw.aliases?.pages),
      ad_accounts: sanitizeAliases(raw.aliases?.ad_accounts),
    },
  };
}

function sanitizeAliases(aliases: Record<string, string> | undefined): Record<string, string> {
  if (!aliases) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(aliases).filter(
      ([key, value]) => typeof key === "string" && key.length > 0 && typeof value === "string" && value.length > 0,
    ),
  );
}
