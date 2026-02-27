import os from "node:os";
import path from "node:path";

export function getConfigDir(): string {
  return path.join(os.homedir(), ".config", "trak");
}

function getLegacyConfigDir(): string {
  return path.join(os.homedir(), ".config", "meta-cli");
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export function getLegacyConfigPath(): string {
  return path.join(getLegacyConfigDir(), "config.json");
}

export function getTokenPath(): string {
  return path.join(getConfigDir(), "tokens.json");
}

export function getLegacyTokenPath(): string {
  return path.join(getLegacyConfigDir(), "tokens.json");
}

export function getSecretPath(): string {
  return path.join(getConfigDir(), "secrets.json");
}

export function getLegacySecretPath(): string {
  return path.join(getLegacyConfigDir(), "secrets.json");
}
