import os from "node:os";
import path from "node:path";

export function getConfigDir(): string {
  return path.join(os.homedir(), ".config", "trak");
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.toml");
}

export function getTokenPath(): string {
  return path.join(getConfigDir(), "tokens.json");
}
