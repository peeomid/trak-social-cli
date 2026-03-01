import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadConfig } from "../src/store/config.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function withTempHome(fn: (homeDir: string) => void): void {
  const previousHome = process.env.HOME;
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "trak-alias-home-"));
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

function runCli(homeDir: string, args: string[]): string {
  return execFileSync("node", ["--import", "tsx", "src/index.ts", ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: homeDir,
    },
    encoding: "utf8",
  });
}

test("config alias set saves page alias", () => {
  withTempHome((homeDir) => {
    runCli(homeDir, ["config", "alias", "set", "--page", "sahaja", "--value", "1548373332058326"]);

    assert.deepEqual(loadConfig().pageAliases, {
      sahaja: "1548373332058326",
    });
  });
});

test("config alias remove deletes saved alias", () => {
  withTempHome((homeDir) => {
    runCli(homeDir, ["config", "alias", "set", "--account", "ads1", "--value", "1243158725700119"]);
    runCli(homeDir, ["config", "alias", "remove", "--account", "ads1"]);

    assert.deepEqual(loadConfig().adAccountAliases, {});
  });
});

test("config alias rename changes alias key and keeps value", () => {
  withTempHome((homeDir) => {
    runCli(homeDir, ["config", "alias", "set", "--page", "sahaja", "--value", "1548373332058326"]);
    runCli(homeDir, ["config", "alias", "rename", "--page", "sahaja", "--to", "sahaja-yoga"]);

    assert.deepEqual(loadConfig().pageAliases, {
      "sahaja-yoga": "1548373332058326",
    });
  });
});

test("config alias list prints alias rows", () => {
  withTempHome((homeDir) => {
    runCli(homeDir, ["config", "alias", "set", "--page", "sahaja", "--value", "1548373332058326"]);

    const output = runCli(homeDir, ["config", "alias", "list", "--page"]);
    assert.match(output, /scope\s+alias\s+value/);
    assert.match(output, /page\s+sahaja\s+1548373332058326/);
  });
});
