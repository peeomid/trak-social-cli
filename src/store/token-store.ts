import fs from "node:fs";
import { chmodSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { ensureConfigDir } from "./config.js";
import { getTokenPath } from "./paths.js";
import type { TokenStore } from "../types/models.js";

const emptyStore: TokenStore = {
  userAccessToken: "",
  userTokenExpiresAt: "",
  scopes: [],
  pageTokens: {},
};

export function loadTokenStore(): TokenStore {
  if (!fs.existsSync(getTokenPath())) {
    return { ...emptyStore };
  }

  const raw = JSON.parse(readFileSync(getTokenPath(), "utf8")) as Partial<TokenStore>;
  return {
    ...emptyStore,
    ...raw,
    pageTokens: raw.pageTokens ?? {},
    scopes: raw.scopes ?? [],
  };
}

export function saveTokenStore(store: TokenStore): void {
  ensureConfigDir();
  writeFileSync(getTokenPath(), `${JSON.stringify(store, null, 2)}\n`, "utf8");
  chmodSync(getTokenPath(), 0o600);
}

export function clearTokenStore(): void {
  rmSync(getTokenPath(), { force: true });
}

export function maskToken(token: string): string {
  if (!token) {
    return "(missing)";
  }
  if (token.length <= 10) {
    return `${token.slice(0, 2)}***`;
  }
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}
