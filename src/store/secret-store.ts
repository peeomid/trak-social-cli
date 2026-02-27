import fs from "node:fs";
import { chmodSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { ensureConfigDir } from "./config.js";
import { getLegacySecretPath, getSecretPath } from "./paths.js";
import type { SecretStore } from "../types/models.js";

const emptyStore: SecretStore = {
  appSecret: "",
};

export function loadSecretStore(): SecretStore {
  const filePath = fs.existsSync(getSecretPath()) ? getSecretPath() : getLegacySecretPath();
  if (!fs.existsSync(filePath)) {
    return { ...emptyStore };
  }

  const raw = JSON.parse(readFileSync(filePath, "utf8")) as Partial<SecretStore>;
  return {
    ...emptyStore,
    ...raw,
  };
}

export function saveSecretStore(store: SecretStore): void {
  ensureConfigDir();
  writeFileSync(getSecretPath(), `${JSON.stringify(store, null, 2)}\n`, "utf8");
  chmodSync(getSecretPath(), 0o600);
}

export function clearSecretStore(): void {
  rmSync(getSecretPath(), { force: true });
}
