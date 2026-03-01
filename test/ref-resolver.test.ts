import assert from "node:assert/strict";
import test from "node:test";
import { resolveAdAccountRef, resolvePageRef } from "../src/cli/ref-resolver.js";
import type { MetaConfig } from "../src/types/models.js";

function buildConfig(overrides: Partial<MetaConfig> = {}): MetaConfig {
  return {
    defaultApiVersion: "v25.0",
    defaultPageId: "",
    defaultAdAccountId: "",
    pageAliases: {},
    adAccountAliases: {},
    appId: "app-1",
    redirectPort: 8787,
    output: "table",
    ...overrides,
  };
}

test("resolvePageRef returns page alias target", () => {
  assert.equal(
    resolvePageRef(
      buildConfig({
        pageAliases: { main: "1548373332058326" },
      }),
      "main",
    ),
    "1548373332058326",
  );
});

test("resolvePageRef falls back to default page", () => {
  assert.equal(
    resolvePageRef(
      buildConfig({
        defaultPageId: "1548373332058326",
      }),
    ),
    "1548373332058326",
  );
});

test("resolveAdAccountRef returns account alias target", () => {
  assert.equal(
    resolveAdAccountRef(
      buildConfig({
        adAccountAliases: { ads1: "1243158725700119" },
      }),
      "ads1",
    ),
    "1243158725700119",
  );
});

test("resolveAdAccountRef keeps raw account id", () => {
  assert.equal(resolveAdAccountRef(buildConfig(), "act_123"), "act_123");
});

test("resolvePageRef throws when page is missing", () => {
  assert.throws(() => resolvePageRef(buildConfig()), /Missing Page id/);
});

test("resolveAdAccountRef throws when account is missing", () => {
  assert.throws(() => resolveAdAccountRef(buildConfig()), /Missing ad account id/);
});
