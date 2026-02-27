import fs from "node:fs";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getConfigDir, getConfigPath, getLegacyConfigPath } from "./paths.js";
import type { MetaConfig } from "../types/models.js";

const defaultConfig: MetaConfig = {
  defaultApiVersion: "v25.0",
  defaultPageId: "",
  defaultAdAccountId: "",
  appId: "",
  appSecretEnvVar: "META_APP_SECRET",
  redirectPort: 8787,
  output: "table",
};

export function ensureConfigDir(): void {
  mkdirSync(getConfigDir(), { recursive: true });
}

export function loadConfig(): MetaConfig {
  const filePath = fs.existsSync(getConfigPath()) ? getConfigPath() : getLegacyConfigPath();
  if (!fs.existsSync(filePath)) {
    return { ...defaultConfig };
  }

  const raw = JSON.parse(readFileSync(filePath, "utf8")) as Partial<MetaConfig>;
  return {
    ...defaultConfig,
    ...raw,
  };
}

export function saveConfig(config: MetaConfig): void {
  ensureConfigDir();
  writeFileSync(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  chmodSync(getConfigPath(), 0o600);
}
