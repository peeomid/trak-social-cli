import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { clearSecretStore, loadConfig, loadSecretStore, saveConfig, saveSecretStore } from "../src/store/config.js";
import { loadTokenStore } from "../src/store/token-store.js";

function withTempHome(fn: (homeDir: string) => void): void {
  const previousHome = process.env.HOME;
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "trak-home-"));
  process.env.HOME = homeDir;
  try {
    fn(homeDir);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

test("loadConfig returns defaults when config.toml is missing", () => {
  withTempHome(() => {
    assert.deepEqual(loadConfig(), {
      defaultApiVersion: "v25.0",
      defaultPageId: "",
      defaultAdAccountId: "",
      pageAliases: {},
      adAccountAliases: {},
      appId: "",
      redirectPort: 8787,
      output: "table",
    });
  });
});

test("saveConfig keeps existing app secret in config.toml", () => {
  withTempHome((homeDir) => {
    saveSecretStore({ appSecret: "secret-123" });
    saveConfig({
      defaultApiVersion: "v26.0",
      defaultPageId: "page-1",
      defaultAdAccountId: "act_1",
      pageAliases: { main: "page-1" },
      adAccountAliases: { ads1: "act_1" },
      appId: "app-1",
      redirectPort: 9999,
      output: "json",
    });

    const configPath = path.join(homeDir, ".config", "trak", "config.toml");
    const raw = fs.readFileSync(configPath, "utf8");
    assert.match(raw, /app_secret = "secret-123"/);
    assert.match(raw, /api_version = "v26.0"/);
    assert.match(raw, /\[aliases\.pages\]/);
    assert.match(raw, /main = "page-1"/);
  });
});

test("saveSecretStore keeps existing config values in config.toml", () => {
  withTempHome((homeDir) => {
    saveConfig({
      defaultApiVersion: "v25.0",
      defaultPageId: "page-2",
      defaultAdAccountId: "act_2",
      pageAliases: { main: "page-2" },
      adAccountAliases: { ads2: "act_2" },
      appId: "app-2",
      redirectPort: 8788,
      output: "table",
    });
    saveSecretStore({ appSecret: "secret-456" });

    assert.deepEqual(loadConfig(), {
      defaultApiVersion: "v25.0",
      defaultPageId: "page-2",
      defaultAdAccountId: "act_2",
      pageAliases: { main: "page-2" },
      adAccountAliases: { ads2: "act_2" },
      appId: "app-2",
      redirectPort: 8788,
      output: "table",
    });
    assert.deepEqual(loadSecretStore(), { appSecret: "secret-456" });

    const configPath = path.join(homeDir, ".config", "trak", "config.toml");
    const raw = fs.readFileSync(configPath, "utf8");
    assert.match(raw, /page_id = "page-2"/);
    assert.match(raw, /app_secret = "secret-456"/);
    assert.match(raw, /ads2 = "act_2"/);
  });
});

test("loadConfig reads aliases from config.toml", () => {
  withTempHome((homeDir) => {
    const configDir = path.join(homeDir, ".config", "trak");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.toml"),
      `[auth]
app_id = "app-1"
app_secret = "secret"
redirect_port = 8787

[defaults]
api_version = "v25.0"
page_id = "page-9"
ad_account_id = "act_9"
output = "table"

[aliases.pages]
main = "page-9"

[aliases.ad_accounts]
ads1 = "act_9"
`,
      "utf8",
    );

    assert.deepEqual(loadConfig(), {
      defaultApiVersion: "v25.0",
      defaultPageId: "page-9",
      defaultAdAccountId: "act_9",
      pageAliases: { main: "page-9" },
      adAccountAliases: { ads1: "act_9" },
      appId: "app-1",
      redirectPort: 8787,
      output: "table",
    });
  });
});

test("clearSecretStore blanks app secret instead of deleting config.toml", () => {
  withTempHome((homeDir) => {
    saveSecretStore({ appSecret: "secret-789" });
    clearSecretStore();

    const configPath = path.join(homeDir, ".config", "trak", "config.toml");
    assert.equal(fs.existsSync(configPath), true);
    assert.deepEqual(loadSecretStore(), { appSecret: "" });
  });
});

test("loadTokenStore reads only trak tokens path", () => {
  withTempHome((homeDir) => {
    const trakDir = path.join(homeDir, ".config", "trak");
    const legacyDir = path.join(homeDir, ".config", "meta-cli");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(
      path.join(legacyDir, "tokens.json"),
      JSON.stringify({ userAccessToken: "legacy-token" }, null, 2),
      "utf8",
    );

    assert.equal(loadTokenStore().userAccessToken, "");

    fs.mkdirSync(trakDir, { recursive: true });
    fs.writeFileSync(
      path.join(trakDir, "tokens.json"),
      JSON.stringify({ userAccessToken: "trak-token", pageTokens: {}, scopes: [] }, null, 2),
      "utf8",
    );

    assert.equal(loadTokenStore().userAccessToken, "trak-token");
  });
});
