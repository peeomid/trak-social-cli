import fs from "node:fs";
import { Command } from "commander";
import { attachLiveDoctorReport, buildDoctorReport } from "../diagnostics/doctor.js";
import { login, getRequestedScopes } from "../meta/auth.js";
import { buildLiveDoctorReport, refreshAuthState } from "../meta/auth-health.js";
import {
  createAd,
  createAdSet,
  createCampaign,
  createCreative,
  getAd,
  getInsights,
  getAdCreative,
  listAdAccounts,
  listBusinesses,
  listBusinessPages,
  listCampaigns,
  resolveAdCreative,
  resolveAdPost,
} from "../meta/ads.js";
import {
  buildPageInsightsTimeParams,
  comparePagePostInsights,
  getDefaultPagePostInsightMetrics,
  getPagePostInsights,
  getPost,
  getSupportedPagePostInsightMetrics,
  listPagePostInsights,
  listPages,
  listPostStats,
  listPosts,
  resolvePage,
  schedulePost,
  validatePagePostInsightMetrics,
} from "../meta/pages.js";
import { getUserPost, listUserPosts } from "../meta/user-posts.js";
import { dryRunNotice } from "../guards/confirm.js";
import { parsePositiveInteger, requireValue, validateScheduleTime } from "../guards/validate.js";
import { renderOutput } from "../output/render.js";
import { resolveAdAccountRef, resolvePageRef } from "./ref-resolver.js";
import { assertImplementedSource, getSourceCapabilities, resolveSource, supportedSources } from "./source-registry.js";
import { loadConfig, saveConfig } from "../store/config.js";
import { getConfigPath } from "../store/paths.js";
import { clearSecretStore, loadSecretStore, saveSecretStore } from "../store/secret-store.js";
import { clearTokenStore, loadTokenStore, maskToken, saveTokenStore } from "../store/token-store.js";
import type {
  AdCreateInput,
  AdSetCreateInput,
  CampaignCreateInput,
  CreativeCreateInput,
  InsightsLevel,
  MetaConfig,
  SupportedSource,
} from "../types/models.js";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("trak")
    .description("Multi-source tracking CLI for content, campaigns, reports, and publishing.")
    .option("--json", "Output JSON");
  program.addHelpText(
    "after",
    `
Setup order:
  1. Edit ~/.config/trak/config.toml
  2. trak auth login
  3. trak account list --source facebook
  4. trak content list --source facebook --account main --limit 5
  5. trak report top-content --source facebook --account main
  6. trak doctor

Common examples:
  trak source list
  trak config show
  trak doctor
  trak auth status
  trak account list --source facebook
  trak content stats --source facebook --account main --limit 10
  trak content compare --source facebook --account main --id POST_A --other-id POST_B
  trak campaign stats --source facebook --account luan --date-preset last_7d
  trak report daily --source facebook

Tip:
  Use --json when sending output to AI tools like OpenClaw.
`,
  );

  addAuthCommands(program);
  addSourceCommands(program);
  addAccountCommands(program);
  addContentCommands(program);
  addCampaignCommands(program);
  addReportCommands(program);
  addPublishCommands(program);
  addFacebookCommands(program);
  addInstagramCommands(program);
  addThreadsCommands(program);
  addGaCommands(program);
  addConfigCommands(program);
  addDoctorCommand(program);
  return program;
}

function addAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Meta auth commands");
  auth.addHelpText(
    "after",
    `
Examples:
  trak auth login
  trak auth status
  trak auth refresh
  trak auth logout

Run this after:
  Edit ~/.config/trak/config.toml
`,
  );

  auth
    .command("login")
    .description("Login with Meta in browser and store long-lived tokens")
    .addHelpText(
      "after",
      `
Example:
  trak auth login

Before this:
  Put auth.app_id in ~/.config/trak/config.toml
  Put auth.app_secret in ~/.config/trak/config.toml
`,
    )
    .action(async () => {
      const config = loadConfig();
      const secretStore = loadSecretStore();
      const tokenStore = await login(config, secretStore);
      saveTokenStore(tokenStore);
      render(config, {
        status: "logged_in",
        expiresAt: tokenStore.userTokenExpiresAt,
        scopes: tokenStore.scopes,
        pages: Object.values(tokenStore.pageTokens).map((page) => ({
          pageId: page.pageId,
          pageName: page.pageName,
        })),
      });
    });

  auth
    .command("status")
    .description("Show token status")
    .addHelpText(
      "after",
      `
Example:
  trak auth status
`,
    )
    .action(() => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      render(config, {
        appId: config.appId || "(missing)",
        localAppSecret: secretStore.appSecret ? "(saved)" : "(missing)",
        token: maskToken(tokenStore.userAccessToken),
        expiresAt: tokenStore.userTokenExpiresAt || "(missing)",
        scopes: tokenStore.scopes.length > 0 ? tokenStore.scopes : getRequestedScopes(),
        pages: Object.values(tokenStore.pageTokens).map((page) => ({
          pageId: page.pageId,
          pageName: page.pageName,
        })),
      });
    });

  auth
    .command("refresh")
    .option("--force", "Try token exchange even when current token still looks healthy")
    .description("Re-check token health, try refresh, and rebuild cached Page tokens")
    .addHelpText(
      "after",
      `
Examples:
  trak auth refresh
  trak auth refresh --force
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const result = await refreshAuthState(config, secretStore, tokenStore, {
        force: Boolean(options.force),
      });
      if (result.nextTokenStore) {
        saveTokenStore(result.nextTokenStore);
      }
      render(config, result.report);
      if (result.report.action === "relogin_required") {
        process.exitCode = 1;
      }
    });

  auth
    .command("logout")
    .description("Clear stored tokens")
    .addHelpText(
      "after",
      `
Example:
  trak auth logout
`,
    )
    .action(() => {
      const config = loadConfig();
      clearTokenStore();
      clearSecretStore();
      render(config, { status: "logged_out" });
    });
}

function addSourceCommands(program: Command): void {
  const source = program.command("source").description("Inspect supported data sources");

  source
    .command("list")
    .description("List known sources")
    .action(() => {
      render(loadConfig(), supportedSources.map((name) => getSourceCapabilities(name)));
    });

  source
    .command("capabilities")
    .requiredOption("--source <source>", "Source name")
    .description("Show feature support for one source")
    .action((options) => {
      const sourceName = resolveSource(options.source);
      render(loadConfig(), getSourceCapabilities(sourceName));
    });

  source
    .command("status")
    .requiredOption("--source <source>", "Source name")
    .description("Show implementation status for one source")
    .action((options) => {
      const sourceName = resolveSource(options.source);
      const capabilities = getSourceCapabilities(sourceName);
      render(loadConfig(), {
        source: sourceName,
        implemented: capabilities.implemented,
        notes: capabilities.notes,
      });
    });
}

function addAccountCommands(program: Command): void {
  const account = program.command("account").description("Inspect accounts/assets across sources");

  account
    .command("list")
    .option("--source <source>", "Source name", "facebook")
    .description("List connected accounts/assets")
    .action(async (options) => {
      const sourceName = resolveSource(options.source);
      assertImplementedSource(sourceName);
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      render(config, await listFacebookAccountsOutput(config, tokenStore, secretStore));
    });

  account
    .command("get")
    .requiredOption("--id <id>", "Account or asset id")
    .option("--source <source>", "Source name", "facebook")
    .option("--kind <kind>", "page | ad_account")
    .description("Get one account/asset")
    .action(async (options) => {
      const sourceName = resolveSource(options.source);
      assertImplementedSource(sourceName);
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const row = await getFacebookAccountOutput(config, tokenStore, secretStore, options.id, options.kind);
      render(config, row);
    });

  account
    .command("use")
    .argument("<alias>", "Saved alias name")
    .option("--source <source>", "Source name", "facebook")
    .option("--kind <kind>", "page | ad_account")
    .description("Set one saved alias as the default account")
    .action((alias, options) => {
      const sourceName = resolveSource(options.source);
      assertImplementedSource(sourceName);
      const config = loadConfig();
      const kind = options.kind === "ad_account" ? "ad_account" : "page";
      if (kind === "page") {
        const value = config.pageAliases[alias];
        if (!value) {
          throw new Error(`Unknown page alias: ${alias}`);
        }
        const next = { ...config, defaultPageId: value };
        saveConfig(next);
        render(next, { status: "updated", source: sourceName, kind, alias, value });
        return;
      }

      const value = config.adAccountAliases[alias];
      if (!value) {
        throw new Error(`Unknown ad account alias: ${alias}`);
      }
      const next = { ...config, defaultAdAccountId: value };
      saveConfig(next);
      render(next, { status: "updated", source: sourceName, kind, alias, value });
    });
}

function addContentCommands(program: Command): void {
  const content = program.command("content").description("Inspect content across sources");

  content
    .command("list")
    .option("--source <source>", "Source name", "facebook")
    .option("--account <ref>", "Account id or alias")
    .option("--since <iso>", "Start time")
    .option("--until <iso>", "End time")
    .option("--limit <limit>", "Row limit", "20")
    .description("List content items")
    .action(async (options) => {
      const sourceName = resolveSource(options.source);
      assertImplementedSource(sourceName);
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const pageId = await resolveAndCachePageId(config, tokenStore, secretStore, options.account);
      const response = await listPosts(config, tokenStore, secretStore, {
        pageId,
        since: options.since,
        until: options.until,
        limit: parsePositiveInteger(options.limit, "--limit"),
      });
      render(
        config,
        response.data.map((row) => ({
          source: sourceName,
          kind: "post",
          account_id: pageId,
          id: row.id,
          text: row.message ?? "",
          created_at: row.created_time ?? "",
          url: row.permalink_url ?? "",
        })),
      );
    });

  content
    .command("get")
    .requiredOption("--id <id>", "Content id")
    .option("--source <source>", "Source name", "facebook")
    .option("--account <ref>", "Account id or alias")
    .description("Get one content item")
    .action(async (options) => {
      const sourceName = resolveSource(options.source);
      assertImplementedSource(sourceName);
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const pageId = await resolveAndCachePageId(config, tokenStore, secretStore, options.account);
      const response = await getPost(config, tokenStore, secretStore, {
        pageId,
        postId: options.id,
      });
      render(config, {
        source: sourceName,
        kind: "post",
        account_id: pageId,
        id: response.id,
        text: response.message ?? "",
        created_at: response.created_time ?? "",
        url: response.permalink_url ?? "",
        raw: process.argv.includes("--json") ? response : undefined,
      });
    });

  content
    .command("stats")
    .option("--source <source>", "Source name", "facebook")
    .option("--account <ref>", "Account id or alias")
    .option("--limit <limit>", "Row limit", "10")
    .description("Show content performance")
    .action(async (options) => {
      const sourceName = resolveSource(options.source);
      assertImplementedSource(sourceName);
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const pageId = await resolveAndCachePageId(config, tokenStore, secretStore, options.account);
      const rows = await listPostStats(config, tokenStore, secretStore, {
        pageId,
        limit: parsePositiveInteger(options.limit, "--limit"),
      });
      render(
        config,
        rows.map((row) => ({
          source: sourceName,
          kind: "post",
          account_id: pageId,
          ...row,
        })),
      );
    });

  content
    .command("compare")
    .requiredOption("--id <id>", "Left content id")
    .requiredOption("--other-id <id>", "Right content id")
    .option("--source <source>", "Source name", "facebook")
    .option("--account <ref>", "Account id or alias")
    .option("--metrics <metrics>", "Comma-separated metrics")
    .option("--date-preset <preset>", "Date preset")
    .option("--since <iso>", "Start time")
    .option("--until <iso>", "End time")
    .option("--period <period>", "day | week | days_28 | month | lifetime | total_over_range", "lifetime")
    .option("--include-message", "Show full content text")
    .description("Compare two content items")
    .action(async (options) => {
      const sourceName = resolveSource(options.source);
      assertImplementedSource(sourceName);
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const pageId = await resolveAndCachePageId(config, tokenStore, secretStore, options.account);
      const metrics = resolvePageInsightMetrics(options.metrics);
      const period = validatePageInsightsPeriod(options.period);
      const time = buildPageInsightsTimeInput(options);
      const comparison = await comparePagePostInsights(config, tokenStore, secretStore, {
        pageId,
        postId: options.id,
        otherPostId: options.otherId,
        metrics,
        period,
        includeMessage: Boolean(options.includeMessage),
        ...time,
      });
      const output = formatPageComparisonOutput(comparison, metrics, period, time, pageId);
      render(
        config,
        process.argv.includes("--json")
          ? { source: sourceName, ...(output as Record<string, unknown>) }
          : output,
      );
    });
}

function addCampaignCommands(program: Command): void {
  const campaign = program.command("campaign").description("Inspect paid campaigns across sources");

  campaign
    .command("list")
    .option("--source <source>", "Source name", "facebook")
    .option("--account <ref>", "Account id or alias")
    .option("--status <status>", "Filter status")
    .description("List campaigns")
    .action(async (options) => {
      const sourceName = resolveSource(options.source);
      assertImplementedSource(sourceName);
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const adAccountId = resolveAdAccountRef(config, options.account);
      const response = await listCampaigns(config, tokenStore, secretStore, adAccountId, options.status);
      render(
        config,
        response.data.map((row) => ({
          source: sourceName,
          kind: "campaign",
          account_id: adAccountId,
          ...row,
        })),
      );
    });

  campaign
    .command("stats")
    .option("--source <source>", "Source name", "facebook")
    .option("--account <ref>", "Account id or alias")
    .option("--level <level>", "account | campaign | adset | ad", "campaign")
    .option("--date-preset <preset>", "Date preset", "last_7d")
    .option("--fields <fields>", "Comma-separated fields", "spend,impressions,reach,clicks,ctr,cpm,campaign_name")
    .option("--campaign-id <id>", "Filter by campaign id")
    .option("--adset-id <id>", "Filter by ad set id")
    .option("--ad-id <id>", "Filter by ad id")
    .option("--status <status>", "Filter by effective status")
    .option("--limit <limit>", "Row limit", "100")
    .description("Show campaign/ad performance")
    .action(async (options) => {
      const sourceName = resolveSource(options.source);
      assertImplementedSource(sourceName);
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const adAccountId = resolveAdAccountRef(config, options.account);
      const response = await getInsights(config, tokenStore, secretStore, {
        adAccountId,
        level: options.level as InsightsLevel,
        datePreset: options.datePreset,
        fields: String(options.fields)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        campaignId: options.campaignId,
        adSetId: options.adsetId,
        adId: options.adId,
        effectiveStatus: options.status,
        limit: parsePositiveInteger(options.limit, "--limit"),
      });
      render(
        config,
        response.data.map((row) => ({
          source: sourceName,
          level: options.level,
          account_id: adAccountId,
          ...row,
        })),
      );
    });

  campaign
    .command("get")
    .requiredOption("--id <id>", "Campaign id")
    .option("--source <source>", "Source name", "facebook")
    .option("--account <ref>", "Account id or alias")
    .description("Get one campaign")
    .action(async (options) => {
      const sourceName = resolveSource(options.source);
      assertImplementedSource(sourceName);
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const adAccountId = resolveAdAccountRef(config, options.account);
      const response = await listCampaigns(config, tokenStore, secretStore, adAccountId);
      const row = response.data.find((item) => String(item.id) === String(options.id));
      if (!row) {
        throw new Error(`Campaign not found: ${options.id}`);
      }
      render(config, {
        source: sourceName,
        kind: "campaign",
        account_id: adAccountId,
        ...row,
      });
    });

  const ad = campaign.command("ad").description("Campaign ad commands");
  ad
    .command("list")
    .requiredOption("--campaign <id>", "Campaign id")
    .option("--source <source>", "Source name", "facebook")
    .option("--account <ref>", "Account id or alias")
    .option("--with-creative", "Resolve creative and post summary for each ad")
    .option("--date-preset <preset>", "Date preset", "last_7d")
    .option("--status <status>", "Filter by effective status")
    .option(
      "--fields <fields>",
      "Comma-separated fields",
      "campaign_name,adset_name,ad_name,spend,impressions,reach,clicks,ctr,cpm",
    )
    .option("--limit <limit>", "Row limit", "100")
    .description("List ads inside one campaign")
    .addHelpText(
      "after",
      `
Examples:
  trak campaign ad list --source facebook --account luan --campaign CAMPAIGN_ID
  trak campaign ad list --source facebook --account luan --campaign CAMPAIGN_ID --with-creative
`,
    )
    .action(async (options) => {
      const sourceName = resolveSource(options.source);
      assertImplementedSource(sourceName);
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const adAccountId = resolveAdAccountRef(config, options.account);
      const fields = String(options.fields)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (options.withCreative && !fields.includes("ad_id")) {
        fields.push("ad_id");
      }
      const response = await getInsights(config, tokenStore, secretStore, {
        adAccountId,
        level: "ad",
        datePreset: options.datePreset,
        fields,
        campaignId: options.campaign,
        effectiveStatus: options.status,
        limit: parsePositiveInteger(options.limit, "--limit"),
      });
      const rows: Array<Record<string, unknown>> = response.data.map((row) => ({
        source: sourceName,
        level: "ad",
        account_id: adAccountId,
        ...row,
      }));
      if (!options.withCreative) {
        render(config, rows);
        return;
      }

      const enriched = await Promise.all(
        rows.map(async (row) => {
          const adId = typeof row.ad_id === "string" ? row.ad_id : null;
          if (!adId) {
            return {
              ...row,
              creative_resolution: "missing_ad_id",
            };
          }
          const resolved = await resolveAdCreative(config, tokenStore, secretStore, adId);
          return {
            ...row,
            ...resolved.summary,
            message_preview: truncateOutputMessage(resolved.summary.message),
          };
        }),
      );
      render(config, enriched);
    });
}

function addReportCommands(program: Command): void {
  const report = program.command("report").description("Summaries and rollups across sources");

  report
    .command("daily")
    .option("--source <source>", "Source name", "facebook")
    .option("--account <ref>", "Account id or alias")
    .description("Show today summary")
    .action(async (options) => {
      const config = loadConfig();
      render(config, await buildFacebookReport(resolveSource(options.source), options.account, "today"));
    });

  report
    .command("weekly")
    .option("--source <source>", "Source name", "facebook")
    .option("--account <ref>", "Account id or alias")
    .description("Show last 7 days summary")
    .action(async (options) => {
      const config = loadConfig();
      render(config, await buildFacebookReport(resolveSource(options.source), options.account, "last_7d"));
    });

  report
    .command("summary")
    .option("--source <source>", "Source name", "facebook")
    .option("--account <ref>", "Account id or alias")
    .option("--from <date>", "Start date")
    .option("--to <date>", "End date")
    .description("Show summary for a date range")
    .action(async (options) => {
      const sourceName = resolveSource(options.source);
      assertImplementedSource(sourceName);
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const pageId = await resolveAndCachePageId(config, tokenStore, secretStore, options.account);
      const posts = await listPagePostInsights(config, tokenStore, secretStore, {
        pageId,
        limit: 10,
        metrics: getDefaultPagePostInsightMetrics(),
        period: "lifetime",
        since: options.from,
        until: options.to,
      });
      render(config, {
        source: sourceName,
        window: {
          from: options.from ?? null,
          to: options.to ?? null,
        },
        summary: summarizeFacebookContent(posts),
        top_items: posts.slice(0, 5).map((row) => flattenPageInsightsRow(row, getDefaultPagePostInsightMetrics())),
      });
    });

  report
    .command("top-content")
    .option("--source <source>", "Source name", "facebook")
    .option("--account <ref>", "Account id or alias")
    .option("--limit <limit>", "Row limit", "5")
    .description("Show top content by reach/clicks")
    .action(async (options) => {
      const sourceName = resolveSource(options.source);
      assertImplementedSource(sourceName);
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const pageId = await resolveAndCachePageId(config, tokenStore, secretStore, options.account);
      const rows = await listPostStats(config, tokenStore, secretStore, {
        pageId,
        limit: parsePositiveInteger(options.limit, "--limit"),
      });
      const sorted = [...rows].sort(
        (left, right) =>
          Number(right.post_impressions_unique ?? 0) - Number(left.post_impressions_unique ?? 0) ||
          Number(right.post_clicks ?? 0) - Number(left.post_clicks ?? 0),
      );
      render(
        config,
        sorted.map((row, index) => ({
          rank: index + 1,
          source: sourceName,
          account_id: pageId,
          ...row,
        })),
      );
    });
}

function addPublishCommands(program: Command): void {
  const publish = program.command("publish").description("Publishing and scheduling across sources");

  publish
    .command("schedule")
    .option("--source <source>", "Source name", "facebook")
    .option("--account <ref>", "Account id or alias")
    .requiredOption("--message <message>", "Post message")
    .requiredOption("--at <time>", "Scheduled ISO time")
    .option("--link <url>", "Optional link")
    .description("Schedule content")
    .action(async (options) => {
      const sourceName = resolveSource(options.source);
      assertImplementedSource(sourceName);
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const pageId = await resolveAndCachePageId(config, tokenStore, secretStore, options.account);
      const scheduledTime = validateScheduleTime(options.at);
      const payload = {
        pageId,
        message: options.message,
        scheduledPublishTime: scheduledTime.toISOString(),
        link: options.link,
      };
      const response = await schedulePost(config, tokenStore, secretStore, payload);
      render(config, {
        source: sourceName,
        status: "scheduled",
        ...response,
        scheduledPublishTime: payload.scheduledPublishTime,
      });
    });

  publish
    .command("preview")
    .option("--source <source>", "Source name", "facebook")
    .option("--account <ref>", "Account id or alias")
    .requiredOption("--message <message>", "Post message")
    .requiredOption("--at <time>", "Scheduled ISO time")
    .option("--link <url>", "Optional link")
    .description("Preview scheduled publish payload")
    .action(async (options) => {
      const sourceName = resolveSource(options.source);
      assertImplementedSource(sourceName);
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const pageId = await resolveAndCachePageId(config, tokenStore, secretStore, options.account);
      const scheduledTime = validateScheduleTime(options.at);
      render(config, {
        source: sourceName,
        status: "preview",
        pageId,
        message: options.message,
        scheduledPublishTime: scheduledTime.toISOString(),
        link: options.link ?? null,
      });
    });
}

function addFacebookCommands(program: Command): void {
  const facebook = program.command("facebook").description("Facebook provider-specific commands");
  addPageCommands(facebook);
  addUserCommands(facebook);
  addAdsCommands(facebook);
  addBusinessCommands(facebook);
}

function addInstagramCommands(program: Command): void {
  addPlaceholderProviderCommands(program, "instagram", "Instagram provider commands");
}

function addThreadsCommands(program: Command): void {
  addPlaceholderProviderCommands(program, "threads", "Threads provider commands");
}

function addGaCommands(program: Command): void {
  addPlaceholderProviderCommands(program, "ga", "Google Analytics provider commands");
}

function addPlaceholderProviderCommands(program: Command, source: SupportedSource, description: string): void {
  const provider = program.command(source).description(description);
  provider
    .command("capabilities")
    .description("Show planned capabilities")
    .action(() => {
      render(loadConfig(), getSourceCapabilities(source));
    });
}

function addPageCommands(program: Command): void {
  const page = program.command("page").description("Facebook Page commands");
  page.addHelpText(
    "after",
    `
Examples:
  trak facebook page list
  trak facebook page resolve --page SahajaVietnam
  trak facebook page resolve --page main
  trak facebook page posts list --page 1548373332058326 --limit 10
  trak facebook page posts stats --page 1548373332058326 --limit 10
  trak facebook page posts insights --page 1548373332058326 --limit 10
  trak facebook page posts schedule --page 1548373332058326 --message "Hello" --at "2026-03-01T09:00:00+07:00"

Step by step:
  1. trak auth login
  2. trak facebook business pages list --business YOUR_BUSINESS_ID --owned
  3. trak facebook page resolve --page YOUR_PAGE_ID_OR_USERNAME
  4. trak facebook page posts list --limit 5
`,
  );

  page
    .command("list")
    .description("List Pages available to the current user")
    .addHelpText(
      "after",
      `
Example:
  trak facebook page list

If your Page is missing:
  trak facebook business pages list --business YOUR_BUSINESS_ID --owned
  trak facebook page resolve --page YOUR_PAGE_ID_OR_USERNAME
`,
    )
    .action(async () => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const response = await listPages(config, tokenStore, secretStore);
      render(config, response.data);
    });

  page
    .command("resolve")
    .option("--page <pageRef>", "Page id or username")
    .description("Resolve a Page directly and cache its token if available")
    .addHelpText(
      "after",
      `
Examples:
  trak facebook page resolve --page SahajaVietnam
  trak facebook page resolve --page 1548373332058326
  trak facebook page resolve --page main
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const pageRef = resolvePageRef(config, options.page);
      const response = await resolvePage(config, tokenStore, secretStore, pageRef);
      if (response.access_token) {
        tokenStore.pageTokens[response.id] = {
          pageId: response.id,
          pageName: response.name,
          accessToken: response.access_token,
          fetchedAt: new Date().toISOString(),
        };
        saveTokenStore(tokenStore);
      }
      render(config, {
        ...response,
        cachedToken: Boolean(response.access_token),
      });
    });

  const posts = page.command("posts").description("Page post commands");
  posts.addHelpText(
    "after",
    `
Examples:
  trak facebook page posts list --limit 10
  trak facebook page posts stats --limit 10
  trak facebook page posts insights --limit 10
  trak facebook page posts get --post 1548373332058326_1220166893652739
  trak facebook page posts schedule --message "New update" --at "2026-03-01T09:00:00+07:00" --dry-run
`,
  );

  posts
    .command("list")
    .option("--page <pageId>", "Page id")
    .option("--since <iso>", "Start time")
    .option("--until <iso>", "End time")
    .option("--limit <limit>", "Row limit", "20")
    .description("List Page posts")
    .addHelpText(
      "after",
      `
Examples:
  trak facebook page posts list --page 1548373332058326 --limit 10
  trak facebook page posts list --page main --limit 10
  trak facebook page posts list --limit 10
  trak facebook page posts list --since 2026-02-01T00:00:00Z --until 2026-02-27T23:59:59Z

Tip:
  If --page is missing, trak uses defaults.page_id from config.
  If --page matches an alias, trak resolves it from aliases.pages.
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const pageId = await resolveAndCachePageId(config, tokenStore, secretStore, options.page);
      const response = await listPosts(config, tokenStore, secretStore, {
        pageId,
        since: options.since,
        until: options.until,
        limit: parsePositiveInteger(options.limit, "--limit"),
      });
      render(config, response.data);
    });

  posts
    .command("stats")
    .option("--page <pageId>", "Page id")
    .option("--limit <limit>", "Row limit", "10")
    .description("Show stats for recent Page posts")
    .addHelpText(
      "after",
      `
Examples:
  trak facebook page posts stats --page 1548373332058326 --limit 10
  trak facebook page posts stats --page main --limit 10
  trak facebook page posts stats --limit 10 --json

Current output may include blank insight fields for some Page/token combinations.
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const pageId = await resolveAndCachePageId(config, tokenStore, secretStore, options.page);
      const response = await listPostStats(config, tokenStore, secretStore, {
        pageId,
        limit: parsePositiveInteger(options.limit, "--limit"),
      });
      render(config, response);
    });

  posts
    .command("insights")
    .option("--page <pageId>", "Page id")
    .option("--post <postId>", "Single post id")
    .option("--limit <limit>", "Row limit", "10")
    .option("--metrics <metrics>", "Comma-separated metrics")
    .option("--date-preset <preset>", "Date preset")
    .option("--since <iso>", "Start time")
    .option("--until <iso>", "End time")
    .option("--period <period>", "day | week | days_28 | month | lifetime | total_over_range", "lifetime")
    .option("--include-message", "Show full post message")
    .option("--raw", "Return raw API-oriented object even in table mode")
    .description("Show rich insights for one Page post or recent Page posts")
    .addHelpText(
      "after",
      `
Examples:
  trak facebook page posts insights --page 1548373332058326 --post 1548373332058326_1220166893652739
  trak facebook page posts insights --page main --limit 10
  trak facebook page posts insights --limit 10
  trak facebook page posts insights --metrics post_impressions_unique,post_clicks

Supported metrics:
  ${getSupportedPagePostInsightMetrics().join(", ")}
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const pageId = await resolveAndCachePageId(config, tokenStore, secretStore, options.page);
      const metrics = resolvePageInsightMetrics(options.metrics);
      const period = validatePageInsightsPeriod(options.period);
      const time = buildPageInsightsTimeInput(options);

      if (options.post && options.limit && String(options.limit) !== "10") {
        throw new Error("Do not combine --post with --limit. Choose one mode.");
      }

      if (options.post) {
        const row = await getPagePostInsights(config, tokenStore, secretStore, {
          pageId,
          postId: options.post,
          metrics,
          period,
          includeMessage: Boolean(options.includeMessage),
          ...time,
        });
        render(config, formatSinglePageInsightsOutput(row, metrics, period, time, pageId, Boolean(options.raw)));
        return;
      }

      const rows = await listPagePostInsights(config, tokenStore, secretStore, {
        pageId,
        limit: parsePositiveInteger(options.limit, "--limit"),
        metrics,
        period,
        includeMessage: Boolean(options.includeMessage),
        ...time,
      });
      render(config, formatBatchPageInsightsOutput(rows, metrics, period, time, pageId, Boolean(options.raw)));
    });

  posts
    .command("compare")
    .option("--page <pageId>", "Page id")
    .requiredOption("--post <postId>", "Left post id")
    .requiredOption("--other-post <postId>", "Right post id")
    .option("--metrics <metrics>", "Comma-separated metrics")
    .option("--date-preset <preset>", "Date preset")
    .option("--since <iso>", "Start time")
    .option("--until <iso>", "End time")
    .option("--period <period>", "day | week | days_28 | month | lifetime | total_over_range", "lifetime")
    .option("--include-message", "Show full post message")
    .description("Compare two Page posts with the same metric set")
    .addHelpText(
      "after",
      `
Examples:
  trak facebook page posts compare --post 123_1 --other-post 123_2
  trak facebook page posts compare --page main --post 123_1 --other-post 123_2
  trak facebook page posts compare --page 1548373332058326 --post 123_1 --other-post 123_2 --metrics post_clicks,post_impressions_unique
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const pageId = await resolveAndCachePageId(config, tokenStore, secretStore, options.page);
      const metrics = resolvePageInsightMetrics(options.metrics);
      const period = validatePageInsightsPeriod(options.period);
      const time = buildPageInsightsTimeInput(options);
      const comparison = await comparePagePostInsights(config, tokenStore, secretStore, {
        pageId,
        postId: options.post,
        otherPostId: options.otherPost,
        metrics,
        period,
        includeMessage: Boolean(options.includeMessage),
        ...time,
      });
      render(config, formatPageComparisonOutput(comparison, metrics, period, time, pageId));
    });

  posts
    .command("get")
    .option("--page <pageId>", "Page id")
    .requiredOption("--post <postId>", "Post id")
    .description("Get one Page post")
    .addHelpText(
      "after",
      `
Example:
  trak facebook page posts get --page 1548373332058326 --post 1548373332058326_1220166893652739
  trak facebook page posts get --page main --post 1548373332058326_1220166893652739
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const pageId = await resolveAndCachePageId(config, tokenStore, secretStore, options.page);
      const response = await getPost(config, tokenStore, secretStore, {
        pageId,
        postId: options.post,
      });
      render(config, response);
    });

  posts
    .command("schedule")
    .option("--page <pageId>", "Page id")
    .requiredOption("--message <message>", "Post message")
    .requiredOption("--at <time>", "Scheduled ISO time")
    .option("--link <url>", "Optional link")
    .option("--dry-run", "Show payload only")
    .description("Schedule a Page post")
    .addHelpText(
      "after",
      `
Examples:
  trak facebook page posts schedule --page 1548373332058326 --message "Hello" --at "2026-03-01T09:00:00+07:00"
  trak facebook page posts schedule --page main --message "Hello" --at "2026-03-01T09:00:00+07:00"
  trak facebook page posts schedule --message "Hello" --at "2026-03-01T09:00:00+07:00" --dry-run

Meta rule:
  Time must be between 10 minutes and 30 days in the future.
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const pageId = await resolveAndCachePageId(config, tokenStore, secretStore, options.page);
      const scheduledTime = validateScheduleTime(options.at);
      const payload = {
        pageId,
        message: options.message,
        scheduledPublishTime: scheduledTime.toISOString(),
        link: options.link,
      };

      if (options.dryRun) {
        dryRunNotice(payload);
        return;
      }

      const response = await schedulePost(config, tokenStore, secretStore, payload);
      render(config, {
        ...response,
        scheduledPublishTime: payload.scheduledPublishTime,
      });
    });
}

function addUserCommands(program: Command): void {
  const user = program.command("user").description("Personal Facebook user commands");
  user.addHelpText(
    "after",
    `
Examples:
  trak facebook user posts list --limit 10
  trak facebook user posts get --post 123456789

Note:
  Personal posts are read-only in trak.
`,
  );

  const posts = user.command("posts").description("Personal post commands");
  posts
    .command("list")
    .option("--limit <limit>", "Row limit", "10")
    .option("--since <iso>", "Start time")
    .option("--until <iso>", "End time")
    .description("List personal timeline posts")
    .addHelpText(
      "after",
      `
Examples:
  trak facebook user posts list --limit 10
  trak facebook user posts list --since 2026-02-01T00:00:00Z --until 2026-02-28T23:59:59Z
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const rows = await listUserPosts(config, tokenStore, secretStore, {
        limit: parsePositiveInteger(options.limit, "--limit"),
        since: options.since,
        until: options.until,
      });
      render(config, formatUserPostsListOutput(rows));
    });

  posts
    .command("get")
    .requiredOption("--post <postId>", "Post id")
    .description("Get one personal post")
    .addHelpText(
      "after",
      `
Example:
  trak facebook user posts get --post 123456789
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const row = await getUserPost(config, tokenStore, secretStore, options.post);
      render(config, formatUserPostSingleOutput(row));
    });
}

function addAdsCommands(program: Command): void {
  const ads = program.command("ads").description("Meta ads commands");
  ads.addHelpText(
    "after",
    `
Examples:
  trak facebook ads account list
  trak facebook ads campaigns list
  trak facebook ads insights --level campaign --date-preset last_7d
  trak facebook ads insights --account ads1 --level campaign --date-preset last_7d
  trak facebook ads create campaign --name "Traffic test" --objective OUTCOME_TRAFFIC

Safe default:
  Ad creation commands create paused resources first.
`,
  );

  const account = ads.command("account").description("Ad account commands");
  account
    .command("list")
    .description("List ad accounts")
    .addHelpText(
      "after",
      `
Example:
  trak facebook ads account list
`,
    )
    .action(async () => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const response = await listAdAccounts(config, tokenStore, secretStore);
      render(config, response.data);
    });

  ads
    .command("insights")
    .option("--account <accountId>", "Ad account id or alias")
    .option("--level <level>", "account | campaign | adset | ad", "account")
    .option("--date-preset <preset>", "Date preset", "last_7d")
    .option(
      "--fields <fields>",
      "Comma-separated fields",
      "spend,impressions,reach,clicks,ctr,cpm,campaign_name,adset_name,ad_name",
    )
    .option("--action-report-time <mode>", "impression | conversion | mixed")
    .option("--time-increment <value>", "1 | all_days")
    .option("--campaign-id <id>", "Filter by campaign id")
    .option("--adset-id <id>", "Filter by ad set id")
    .option("--ad-id <id>", "Filter by ad id")
    .option("--status <status>", "Filter by effective status")
    .option("--limit <limit>", "Row limit", "100")
    .description("Read insights / performance")
    .addHelpText(
      "after",
      `
Examples:
  trak facebook ads insights --level account --date-preset last_7d
  trak facebook ads insights --account ads1 --level account --date-preset last_7d
  trak facebook ads insights --account 1243158725700119 --level campaign --fields spend,impressions,clicks,ctr,cpm --json
  trak facebook ads insights --account 1243158725700119 --level campaign --campaign-id 6908777851014 --date-preset today
  trak facebook ads insights --account 1243158725700119 --level ad --campaign-id 6908777851014 --status ACTIVE --date-preset last_7d --json
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const adAccountId = resolveAdAccountRef(config, options.account);
      const response = await getInsights(config, tokenStore, secretStore, {
        adAccountId,
        level: options.level as InsightsLevel,
        datePreset: options.datePreset,
        fields: String(options.fields)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        actionReportTime: options.actionReportTime,
        timeIncrement: options.timeIncrement,
        campaignId: options.campaignId,
        adSetId: options.adsetId,
        adId: options.adId,
        effectiveStatus: options.status,
        limit: parsePositiveInteger(options.limit, "--limit"),
      });
      render(config, response.data);
    });

  const campaigns = ads.command("campaigns").description("Campaign commands");
  campaigns
    .command("list")
    .option("--account <accountId>", "Ad account id or alias")
    .option("--status <status>", "Filter status")
    .description("List campaigns")
    .addHelpText(
      "after",
      `
Examples:
  trak facebook ads campaigns list
  trak facebook ads campaigns list --account ads1
  trak facebook ads campaigns list --account 1243158725700119 --status ACTIVE
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const adAccountId = resolveAdAccountRef(config, options.account);
      const response = await listCampaigns(config, tokenStore, secretStore, adAccountId, options.status);
      render(config, response.data);
    });

  const ad = ads.command("ad").description("Single ad inspection");
  ad
    .command("get")
    .option("--account <accountId>", "Ad account id or alias")
    .requiredOption("--id <adId>", "Ad id")
    .description("Get one ad object")
    .addHelpText(
      "after",
      `
Example:
  trak facebook ads ad get --account luan --id AD_ID
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const adAccountId = resolveAdAccountRef(config, options.account);
      const row = await getAd(config, tokenStore, secretStore, options.id);
      render(config, {
        account_id: adAccountId,
        ...row,
        creative_id: row.creative?.id ?? null,
      });
    });

  ad
    .command("creative")
    .option("--account <accountId>", "Ad account id or alias")
    .requiredOption("--id <adId>", "Ad id")
    .description("Resolve creative behind one ad")
    .addHelpText(
      "after",
      `
Example:
  trak facebook ads ad creative --account luan --id AD_ID
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const adAccountId = resolveAdAccountRef(config, options.account);
      const resolved = await resolveAdCreative(config, tokenStore, secretStore, options.id);
      render(config, {
        account_id: adAccountId,
        ...resolved.summary,
        raw: process.argv.includes("--json")
          ? {
              ad: resolved.ad,
              creative: resolved.creative,
            }
          : undefined,
      });
    });

  ad
    .command("post")
    .option("--account <accountId>", "Ad account id or alias")
    .requiredOption("--id <adId>", "Ad id")
    .option("--with-stats", "Load Page post stats when the post can be resolved")
    .description("Resolve source post behind one ad")
    .addHelpText(
      "after",
      `
Examples:
  trak facebook ads ad post --account luan --id AD_ID
  trak facebook ads ad post --account luan --id AD_ID --with-stats
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const adAccountId = resolveAdAccountRef(config, options.account);
      const resolved = await resolveAdPost(config, tokenStore, secretStore, options.id);
      let stats: Record<string, unknown> | undefined;
      if (options.withStats && resolved.summary.post_id && resolved.summary.page_id) {
        const postStats = await getPagePostInsights(config, tokenStore, secretStore, {
          pageId: resolved.summary.page_id,
          postId: resolved.summary.post_id,
          metrics: getDefaultPagePostInsightMetrics(),
          period: "lifetime",
          includeMessage: true,
        });
        stats = flattenPageInsightsRow(postStats, getDefaultPagePostInsightMetrics()) as Record<string, unknown>;
      }
      render(config, {
        account_id: adAccountId,
        ...resolved.summary,
        stats,
        raw: process.argv.includes("--json")
          ? {
              ad: resolved.ad,
              creative: resolved.creative,
              post: resolved.post,
            }
          : undefined,
      });
    });

  const create = ads.command("create").description("Draft ad creation");

  create
    .command("campaign")
    .option("--account <accountId>", "Ad account id or alias")
    .requiredOption("--name <name>", "Campaign name")
    .requiredOption("--objective <objective>", "Meta campaign objective")
    .option("--dry-run", "Show payload only")
    .description("Create paused campaign")
    .addHelpText(
      "after",
      `
Examples:
  trak facebook ads create campaign --name "Traffic test" --objective OUTCOME_TRAFFIC
  trak facebook ads create campaign --account ads1 --name "Traffic test" --objective OUTCOME_TRAFFIC --dry-run
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const adAccountId = resolveAdAccountRef(config, options.account);
      const payload: CampaignCreateInput = {
        adAccountId,
        name: requireValue(options.name, "--name"),
        objective: requireValue(options.objective, "--objective"),
        status: "PAUSED",
      };

      if (options.dryRun) {
        dryRunNotice(payload);
        return;
      }

      const response = await createCampaign(config, tokenStore, secretStore, payload);
      render(config, response);
    });

  create
    .command("adset")
    .option("--account <accountId>", "Ad account id or alias")
    .requiredOption("--campaign <campaignId>", "Campaign id")
    .requiredOption("--name <name>", "Ad set name")
    .requiredOption("--daily-budget <amount>", "Daily budget in minor units")
    .requiredOption("--billing-event <value>", "Billing event")
    .requiredOption("--optimization-goal <value>", "Optimization goal")
    .requiredOption("--targeting-file <path>", "Path to targeting JSON file")
    .option("--start-time <iso>", "Optional start time")
    .option("--end-time <iso>", "Optional end time")
    .option("--dry-run", "Show payload only")
    .description("Create paused ad set")
    .addHelpText(
      "after",
      `
Example:
  trak facebook ads create adset --campaign 123 --name "VN ad set" --daily-budget 200000 --billing-event IMPRESSIONS --optimization-goal LINK_CLICKS --targeting-file ./targeting.json
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const adAccountId = resolveAdAccountRef(config, options.account);
      const targeting = JSON.parse(fs.readFileSync(options.targetingFile, "utf8")) as Record<string, unknown>;
      const payload: AdSetCreateInput = {
        adAccountId,
        campaignId: options.campaign,
        name: requireValue(options.name, "--name"),
        dailyBudget: parsePositiveInteger(options.dailyBudget, "--daily-budget"),
        billingEvent: requireValue(options.billingEvent, "--billing-event"),
        optimizationGoal: requireValue(options.optimizationGoal, "--optimization-goal"),
        targeting,
        startTime: options.startTime,
        endTime: options.endTime,
        status: "PAUSED",
      };

      if (options.dryRun) {
        dryRunNotice(payload);
        return;
      }

      const response = await createAdSet(config, tokenStore, secretStore, payload);
      render(config, response);
    });

  create
    .command("creative")
    .option("--account <accountId>", "Ad account id or alias")
    .requiredOption("--name <name>", "Creative name")
    .option("--page <pageId>", "Page id or alias")
    .requiredOption("--message <message>", "Creative message")
    .requiredOption("--link <url>", "Destination URL")
    .option("--image-hash <hash>", "Existing uploaded image hash")
    .option("--dry-run", "Show payload only")
    .description("Create link ad creative")
    .addHelpText(
      "after",
      `
Example:
  trak facebook ads create creative --account ads1 --name "Creative 1" --page main --message "Check this out" --link "https://example.com"
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const adAccountId = resolveAdAccountRef(config, options.account);
      const payload: CreativeCreateInput = {
        adAccountId,
        name: requireValue(options.name, "--name"),
        pageId: resolvePageRef(config, options.page),
        message: requireValue(options.message, "--message"),
        link: requireValue(options.link, "--link"),
        imageHash: options.imageHash,
      };

      if (options.dryRun) {
        dryRunNotice(payload);
        return;
      }

      const response = await createCreative(config, tokenStore, secretStore, payload);
      render(config, response);
    });

  create
    .command("ad")
    .option("--account <accountId>", "Ad account id or alias")
    .requiredOption("--adset <adsetId>", "Ad set id")
    .requiredOption("--creative <creativeId>", "Creative id")
    .requiredOption("--name <name>", "Ad name")
    .option("--dry-run", "Show payload only")
    .description("Create paused ad")
    .addHelpText(
      "after",
      `
Example:
  trak facebook ads create ad --account ads1 --adset 123 --creative 456 --name "Ad 1"
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const adAccountId = resolveAdAccountRef(config, options.account);
      const payload: AdCreateInput = {
        adAccountId,
        adSetId: options.adset,
        creativeId: options.creative,
        name: requireValue(options.name, "--name"),
        status: "PAUSED",
      };

      if (options.dryRun) {
        dryRunNotice(payload);
        return;
      }

      const response = await createAd(config, tokenStore, secretStore, payload);
      render(config, response);
    });
}

function addBusinessCommands(program: Command): void {
  const business = program.command("business").description("Meta business discovery");
  business.addHelpText(
    "after",
    `
Examples:
  trak facebook business list
  trak facebook business pages list --business 1242778199071505 --owned
  trak facebook business pages list --business 1242778199071505

Use this when:
  A Page does not appear in 'trak facebook page list'.
`,
  );

  business
    .command("list")
    .description("List businesses available to the current user")
    .addHelpText(
      "after",
      `
Example:
  trak facebook business list
`,
    )
    .action(async () => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const response = await listBusinesses(config, tokenStore, secretStore);
      render(config, response.data);
    });

  const pages = business.command("pages").description("Business Page discovery");
  pages
    .command("list")
    .requiredOption("--business <businessId>", "Business id")
    .option("--owned", "Owned Pages only")
    .option("--client", "Client Pages only")
    .description("List Pages under a business")
    .addHelpText(
      "after",
      `
Examples:
  trak facebook business pages list --business 1242778199071505 --owned
  trak facebook business pages list --business 1242778199071505 --client
  trak facebook business pages list --business 1242778199071505
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const rows: Array<Record<string, unknown>> = [];
      const modes: Array<"owned" | "client"> =
        options.client && !options.owned ? ["client"] : options.owned && !options.client ? ["owned"] : ["owned", "client"];

      for (const mode of modes) {
        const response = await listBusinessPages(config, tokenStore, secretStore, options.business, mode);
        rows.push(
          ...response.data.map((row) => ({
            source: mode,
            ...row,
          })),
        );
      }

      render(config, rows);
    });
}

function addConfigCommands(program: Command): void {
  const configCommand = program.command("config").description("Local config");
  configCommand.addHelpText(
    "after",
    `
Examples:
  trak config init
  trak config init --app-id 1493983742290842 --default-page 1548373332058326 --default-ad-account 1243158725700119
  trak config alias set --page sahaja --value 1548373332058326
  trak config alias list
  Edit ~/.config/trak/config.toml
  trak config show

Alias example in config:
  [aliases.pages]
  main = "1548373332058326"
  [aliases.ad_accounts]
  ads1 = "1243158725700119"

Saved files:
  ~/.config/trak/config.toml
  ~/.config/trak/tokens.json
`,
  );

  configCommand
    .command("init")
    .option("--app-id <appId>", "Meta app id")
    .option("--app-secret <appSecret>", "Meta app secret saved locally")
    .option("--default-page <pageId>", "Default page id")
    .option("--default-ad-account <accountId>", "Default ad account id")
    .option("--redirect-port <port>", "Local redirect port")
    .option("--output <format>", "table | json")
    .option("--force", "Overwrite existing config file")
    .description("Create starter config files without putting secrets in shell history")
    .addHelpText(
      "after",
      `
Examples:
  trak config init
  trak config init --app-id 1493983742290842 --default-page 1548373332058326 --default-ad-account 1243158725700119
  trak config init --force

Files created:
  ~/.config/trak/config.toml
`,
    )
    .action((options) => {
      const current = loadConfig();
      const secretStore = loadSecretStore();
      const configPath = getConfigPath();
      const configExists = fs.existsSync(configPath);

      if (!options.force && configExists) {
        throw new Error("Config file already exists. Use --force to overwrite, or edit ~/.config/trak/config.toml manually.");
      }

      const next: MetaConfig = {
        ...current,
        appId: options.appId ?? current.appId,
        defaultPageId: options.defaultPage ?? current.defaultPageId,
        defaultAdAccountId: options.defaultAdAccount ?? current.defaultAdAccountId,
        redirectPort: options.redirectPort
          ? parsePositiveInteger(options.redirectPort, "--redirect-port")
          : current.redirectPort,
        output: options.output === "json" ? "json" : options.output === "table" ? "table" : current.output,
      };

      saveConfig(next);
      saveSecretStore({
        ...secretStore,
        appSecret:
          options.appSecret ?? (options.force || !secretStore.appSecret ? "YOUR_META_APP_SECRET" : secretStore.appSecret),
      });

      render(next, {
        status: "initialized",
        configPath,
        nextSteps: [
          "Edit ~/.config/trak/config.toml and replace YOUR_META_APP_SECRET",
          "Run: trak auth login",
          "Run: trak auth status",
        ],
      });
    });

  configCommand
    .command("show")
    .description("Show current config")
    .addHelpText(
      "after",
      `
Example:
  trak config show
`,
    )
    .action(() => {
      const config = loadConfig();
      const secretStore = loadSecretStore();
      render(config, {
        configPath: getConfigPath(),
        auth: {
          appId: config.appId,
          appSecret: secretStore.appSecret ? "(set)" : "(missing)",
          redirectPort: config.redirectPort,
        },
        defaults: {
          apiVersion: config.defaultApiVersion,
          pageId: config.defaultPageId,
          adAccountId: config.defaultAdAccountId,
          output: config.output,
        },
        aliases: {
          pages: config.pageAliases,
          adAccounts: config.adAccountAliases,
        },
      });
    });

  configCommand
    .command("set")
    .option("--app-id <appId>", "Meta app id")
    .option("--app-secret <appSecret>", "Meta app secret saved locally")
    .option("--default-page <pageId>", "Default page id")
    .option("--default-ad-account <accountId>", "Default ad account id")
    .option("--redirect-port <port>", "Local redirect port")
    .option("--output <format>", "table | json")
    .description("Write local config")
    .addHelpText(
      "after",
      `
Warning:
  Avoid putting secrets in shell history. Prefer editing ~/.config/trak/config.toml directly.

Examples:
  trak config init
  trak config set --app-id 1493983742290842 --default-page 1548373332058326 --default-ad-account 1243158725700119
  trak config set --output json

For aliases:
  trak config alias set --page sahaja --value 1548373332058326
  trak config alias set --account ads1 --value 1243158725700119
`,
    )
    .action((options) => {
      const current = loadConfig();
      const currentSecretStore = loadSecretStore();
      const next: MetaConfig = {
        ...current,
        appId: options.appId ?? current.appId,
        defaultPageId: options.defaultPage ?? current.defaultPageId,
        defaultAdAccountId: options.defaultAdAccount ?? current.defaultAdAccountId,
        redirectPort: options.redirectPort
          ? parsePositiveInteger(options.redirectPort, "--redirect-port")
          : current.redirectPort,
        output: options.output === "json" ? "json" : options.output === "table" ? "table" : current.output,
      };
      saveConfig(next);
      if (options.appSecret) {
        saveSecretStore({
          ...currentSecretStore,
          appSecret: options.appSecret,
        });
      }
      render(next, next);
    });

  const aliasCommand = configCommand.command("alias").description("Manage page and ad account aliases");
  aliasCommand.addHelpText(
    "after",
    `
Examples:
  trak config alias list
  trak config alias list --page
  trak config alias set --page sahaja --value 1548373332058326
  trak config alias set --account ads1 --value 1243158725700119
  trak config alias rename --page sahaja --to sahaja-yoga
  trak config alias remove --page sahaja
`,
  );

  aliasCommand
    .command("list")
    .option("--page", "List page aliases only")
    .option("--account", "List ad account aliases only")
    .description("Show saved aliases")
    .addHelpText(
      "after",
      `
Examples:
  trak config alias list
  trak config alias list --page
  trak config alias list --account
`,
    )
    .action((options) => {
      const config = loadConfig();
      const mode = resolveAliasScope(options);
      render(config, formatAliasList(config, mode));
    });

  aliasCommand
    .command("set")
    .option("--page <alias>", "Set a page alias")
    .option("--account <alias>", "Set an ad account alias")
    .requiredOption("--value <id>", "Target page id or ad account id")
    .description("Save or update one alias")
    .addHelpText(
      "after",
      `
Examples:
  trak config alias set --page sahaja --value 1548373332058326
  trak config alias set --account ads1 --value 1243158725700119
`,
    )
    .action((options) => {
      const current = loadConfig();
      const aliasInput = resolveAliasInput(options);
      const next = {
        ...current,
        pageAliases:
          aliasInput.scope === "page"
            ? {
                ...current.pageAliases,
                [aliasInput.alias]: aliasInput.value,
              }
            : current.pageAliases,
        adAccountAliases:
          aliasInput.scope === "account"
            ? {
                ...current.adAccountAliases,
                [aliasInput.alias]: aliasInput.value,
              }
            : current.adAccountAliases,
      };
      saveConfig(next);
      render(next, {
        status: "saved",
        scope: aliasInput.scope,
        alias: aliasInput.alias,
        value: aliasInput.value,
      });
    });

  aliasCommand
    .command("remove")
    .option("--page <alias>", "Remove a page alias")
    .option("--account <alias>", "Remove an ad account alias")
    .description("Delete one alias")
    .addHelpText(
      "after",
      `
Examples:
  trak config alias remove --page sahaja
  trak config alias remove --account ads1
`,
    )
    .action((options) => {
      const current = loadConfig();
      const aliasInput = resolveAliasInput(options);
      const source = aliasInput.scope === "page" ? current.pageAliases : current.adAccountAliases;
      if (!source[aliasInput.alias]) {
        throw new Error(`Alias not found: ${aliasInput.alias}`);
      }

      const next = {
        ...current,
        pageAliases:
          aliasInput.scope === "page"
            ? Object.fromEntries(Object.entries(current.pageAliases).filter(([key]) => key !== aliasInput.alias))
            : current.pageAliases,
        adAccountAliases:
          aliasInput.scope === "account"
            ? Object.fromEntries(Object.entries(current.adAccountAliases).filter(([key]) => key !== aliasInput.alias))
            : current.adAccountAliases,
      };
      saveConfig(next);
      render(next, {
        status: "removed",
        scope: aliasInput.scope,
        alias: aliasInput.alias,
      });
    });

  aliasCommand
    .command("rename")
    .option("--page <alias>", "Rename a page alias")
    .option("--account <alias>", "Rename an ad account alias")
    .requiredOption("--to <alias>", "New alias name")
    .description("Rename one alias and keep its current target id")
    .addHelpText(
      "after",
      `
Examples:
  trak config alias rename --page sahaja --to sahaja-yoga
  trak config alias rename --account ads1 --to main-ads
`,
    )
    .action((options) => {
      const current = loadConfig();
      const aliasInput = resolveAliasInput({
        page: options.page,
        account: options.account,
        value: options.to,
      });
      const source = aliasInput.scope === "page" ? current.pageAliases : current.adAccountAliases;
      const currentValue = source[aliasInput.alias];
      if (!currentValue) {
        throw new Error(`Alias not found: ${aliasInput.alias}`);
      }

      const nextAlias = aliasInput.value;
      validateAliasName(nextAlias);
      if (source[nextAlias]) {
        throw new Error(`Alias already exists: ${nextAlias}`);
      }

      const nextSource = Object.fromEntries(
        Object.entries(source)
          .filter(([key]) => key !== aliasInput.alias)
          .concat([[nextAlias, currentValue]]),
      );

      const next = {
        ...current,
        pageAliases: aliasInput.scope === "page" ? nextSource : current.pageAliases,
        adAccountAliases: aliasInput.scope === "account" ? nextSource : current.adAccountAliases,
      };
      saveConfig(next);
      render(next, {
        status: "renamed",
        scope: aliasInput.scope,
        from: aliasInput.alias,
        to: nextAlias,
        value: currentValue,
      });
    });
}

function addDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .option("--live", "Check token, permissions, Page access, and Ads access against Meta")
    .option("--page <pageId>", "Specific Page id or alias to validate")
    .option("--account <adAccountId>", "Specific ad account id or alias to validate")
    .description("Check config, secrets, tokens, defaults, and common setup problems")
    .addHelpText(
      "after",
      `
Examples:
  trak doctor
  trak doctor --live
  trak doctor --live --page 1548373332058326
  trak doctor --live --account 1243158725700119
  trak doctor --json

Checks:
  - config file
  - app id
  - app secret
  - default page
  - default ad account
  - token file
  - user token
  - token expiry
  - stored pages
  - saved scopes

Live checks with --live:
  - token validity in Meta
  - granted vs missing permissions
  - Page access
  - ad account access
`,
    )
    .action(async (options) => {
      const config = loadConfig();
      const secretStore = loadSecretStore();
      const tokenStore = loadTokenStore();
      const report = buildDoctorReport(config, secretStore, tokenStore);
      if (!options.live) {
        render(config, report);
        return;
      }
      const live = await buildLiveDoctorReport(config, secretStore, tokenStore, {
        pageId: options.page ? resolvePageRef(config, options.page) : undefined,
        adAccountId: options.account ? resolveAdAccountRef(config, options.account) : undefined,
      });
      render(config, attachLiveDoctorReport(report, live));
    });
}

function render(config: MetaConfig, data: unknown): void {
  const useJson = process.argv.includes("--json");
  renderOutput(data, useJson ? "json" : config.output);
}

function resolveAliasScope(options: { page?: boolean; account?: boolean }): "page" | "account" | "all" {
  if (options.page && options.account) {
    throw new Error("Choose one alias scope: --page or --account.");
  }
  if (options.page) {
    return "page";
  }
  if (options.account) {
    return "account";
  }
  return "all";
}

function resolveAliasInput(options: { page?: string; account?: string; value?: string }): {
  scope: "page" | "account";
  alias: string;
  value: string;
} {
  const hasPage = typeof options.page === "string" && options.page.trim().length > 0;
  const hasAccount = typeof options.account === "string" && options.account.trim().length > 0;
  if (hasPage === hasAccount) {
    throw new Error("Choose exactly one alias target: --page <alias> or --account <alias>.");
  }

  const scope = hasPage ? "page" : "account";
  const alias = String(hasPage ? options.page : options.account).trim();
  validateAliasName(alias);

  return {
    scope,
    alias,
    value: options.value?.trim() ?? "",
  };
}

function validateAliasName(alias: string): void {
  if (!/^[a-z0-9_-]+$/.test(alias)) {
    throw new Error("Invalid alias name. Use lowercase letters, numbers, hyphen, or underscore.");
  }
}

function formatAliasList(config: MetaConfig, scope: "page" | "account" | "all"): unknown {
  if (process.argv.includes("--json")) {
    if (scope === "page") {
      return { scope: "page", aliases: config.pageAliases };
    }
    if (scope === "account") {
      return { scope: "account", aliases: config.adAccountAliases };
    }
    return {
      scope: "all",
      aliases: {
        pages: config.pageAliases,
        adAccounts: config.adAccountAliases,
      },
    };
  }

  if (scope === "page") {
    return toAliasRows("page", config.pageAliases);
  }
  if (scope === "account") {
    return toAliasRows("account", config.adAccountAliases);
  }
  return [...toAliasRows("page", config.pageAliases), ...toAliasRows("account", config.adAccountAliases)];
}

function toAliasRows(scope: "page" | "account", aliases: Record<string, string>): Array<Record<string, string>> {
  return Object.entries(aliases).map(([alias, value]) => ({
    scope,
    alias,
    value,
  }));
}

function resolvePageInsightMetrics(value?: string): string[] {
  const metrics =
    value && value.trim()
      ? value
          .split(",")
          .map((metric) => metric.trim())
          .filter(Boolean)
      : getDefaultPagePostInsightMetrics();

  return validatePagePostInsightMetrics(metrics);
}

function validatePageInsightsPeriod(value: string): "day" | "week" | "days_28" | "month" | "lifetime" | "total_over_range" {
  const supported = new Set(["day", "week", "days_28", "month", "lifetime", "total_over_range"]);
  if (!supported.has(value)) {
    throw new Error("Invalid --period. Use one of: day, week, days_28, month, lifetime, total_over_range");
  }
  return value as "day" | "week" | "days_28" | "month" | "lifetime" | "total_over_range";
}

function buildPageInsightsTimeInput(options: { datePreset?: string; since?: string; until?: string }): {
  datePreset?: string;
  since?: string;
  until?: string;
} {
  return {
    datePreset: options.since || options.until ? undefined : options.datePreset,
    since: options.since,
    until: options.until,
  };
}

function formatSinglePageInsightsOutput(
  row: Awaited<ReturnType<typeof getPagePostInsights>>,
  metrics: string[],
  period: string,
  time: ReturnType<typeof buildPageInsightsTimeInput>,
  pageId: string,
  raw: boolean,
): unknown {
  if (!process.argv.includes("--json") && !raw) {
    return [flattenPageInsightsRow(row, metrics)];
  }

  return {
    object: "page_post_insights",
    pageId,
    mode: "single",
    metrics,
    period,
    time: {
      datePreset: time.datePreset ?? null,
      since: time.since ?? null,
      until: time.until ?? null,
      params: buildPageInsightsTimeParams(time),
    },
    data: [row],
  };
}

function formatBatchPageInsightsOutput(
  rows: Awaited<ReturnType<typeof listPagePostInsights>>,
  metrics: string[],
  period: string,
  time: ReturnType<typeof buildPageInsightsTimeInput>,
  pageId: string,
  raw: boolean,
): unknown {
  if (!process.argv.includes("--json") && !raw) {
    return rows.map((row) => flattenPageInsightsRow(row, metrics));
  }

  return {
    object: "page_post_insights",
    pageId,
    mode: "batch",
    metrics,
    period,
    time: {
      datePreset: time.datePreset ?? null,
      since: time.since ?? null,
      until: time.until ?? null,
      params: buildPageInsightsTimeParams(time),
    },
    data: rows,
  };
}

function formatPageComparisonOutput(
  comparison: Awaited<ReturnType<typeof comparePagePostInsights>>,
  metrics: string[],
  period: string,
  time: ReturnType<typeof buildPageInsightsTimeInput>,
  pageId: string,
): unknown {
  if (!process.argv.includes("--json")) {
    return metrics.map((metric) => ({
      metric,
      left_post: comparison.left.postId,
      left_value: comparison.left.insights[metric],
      right_post: comparison.right.postId,
      right_value: comparison.right.insights[metric],
      delta: comparison.delta[metric],
    }));
  }

  return {
    object: "page_post_compare",
    pageId,
    metrics,
    period,
    time: {
      datePreset: time.datePreset ?? null,
      since: time.since ?? null,
      until: time.until ?? null,
    },
    left: comparison.left,
    right: comparison.right,
    delta: comparison.delta,
  };
}

function flattenPageInsightsRow(
  row: Awaited<ReturnType<typeof getPagePostInsights>>,
  metrics: string[],
): Record<string, unknown> {
  return {
    post_id: row.postId,
    created_time: row.createdTime ?? "",
    permalink_url: row.permalinkUrl ?? "",
    message: row.message ?? "",
    share_count: row.shareCount,
    ...Object.fromEntries(metrics.map((metric) => [metric, row.insights[metric] ?? null])),
    missing_metrics: row.missingMetrics.join(", "),
  };
}

function formatUserPostsListOutput(rows: Awaited<ReturnType<typeof listUserPosts>>): unknown {
  if (!process.argv.includes("--json")) {
    return rows.map((row) => ({
      post_id: row.postId,
      created_time: row.createdTime ?? "",
      message: row.message ?? "",
      permalink_url: row.permalinkUrl ?? "",
      attachments: row.attachments.length,
    }));
  }

  return {
    object: "user_posts",
    data: rows,
  };
}

function formatUserPostSingleOutput(row: Awaited<ReturnType<typeof getUserPost>>): unknown {
  if (!process.argv.includes("--json")) {
    return {
      post_id: row.postId,
      created_time: row.createdTime ?? "",
      message: row.message ?? "",
      permalink_url: row.permalinkUrl ?? "",
      attachments: row.attachments,
    };
  }

  return {
    object: "user_post",
    data: row,
  };
}

function truncateOutputMessage(message: string | null | undefined): string | null {
  if (!message) {
    return null;
  }
  return message.length > 140 ? `${message.slice(0, 137)}...` : message;
}

async function listFacebookAccountsOutput(
  config: MetaConfig,
  tokenStore: ReturnType<typeof loadTokenStore>,
  secretStore: ReturnType<typeof loadSecretStore>,
): Promise<Array<Record<string, unknown>>> {
  const [pages, adAccounts] = await Promise.all([
    listPages(config, tokenStore, secretStore),
    listAdAccounts(config, tokenStore, secretStore),
  ]);

  return [
    ...pages.data.map((row) => ({
      source: "facebook",
      kind: "page",
      id: row.id,
      name: row.name,
      status: "connected",
    })),
    ...adAccounts.data.map((row) => ({
      source: "facebook",
      kind: "ad_account",
      ...row,
    })),
  ];
}

async function getFacebookAccountOutput(
  config: MetaConfig,
  tokenStore: ReturnType<typeof loadTokenStore>,
  secretStore: ReturnType<typeof loadSecretStore>,
  id: string,
  kind?: string,
): Promise<Record<string, unknown>> {
  if (kind === "page") {
    const pageId = await resolveAndCachePageId(config, tokenStore, secretStore, id);
    const page = await resolvePage(config, tokenStore, secretStore, pageId);
    return {
      source: "facebook",
      kind: "page",
      id: page.id,
      name: page.name,
      access_token: process.argv.includes("--json") ? page.access_token ?? null : undefined,
    };
  }

  if (kind === "ad_account") {
    const adAccountId = resolveAdAccountRef(config, id);
    const rows = await listAdAccounts(config, tokenStore, secretStore);
    const row = rows.data.find((item) => String(item.id) === normalizeAdAccountId(adAccountId));
    if (!row) {
      throw new Error(`Ad account not found: ${id}`);
    }
    return {
      source: "facebook",
      kind: "ad_account",
      ...row,
    };
  }

  const rows = await listFacebookAccountsOutput(config, tokenStore, secretStore);
  const matched = rows.find((row) => String(row.id) === id || String(row.id) === normalizeAdAccountId(id));
  if (!matched) {
    throw new Error(`Account not found: ${id}. Pass --kind page or --kind ad_account if needed.`);
  }
  return matched;
}

async function buildFacebookReport(
  source: SupportedSource,
  accountRef: string | undefined,
  datePreset: string,
): Promise<Record<string, unknown>> {
  assertImplementedSource(source);
  const config = loadConfig();
  const tokenStore = loadTokenStore();
  const secretStore = loadSecretStore();
  const pageId = await resolveAndCachePageId(config, tokenStore, secretStore, accountRef);
  const adAccountId = resolveAdAccountRef(config, undefined);
  const [posts, campaignRows] = await Promise.all([
    listPostStats(config, tokenStore, secretStore, {
      pageId,
      limit: 10,
    }),
    getInsights(config, tokenStore, secretStore, {
      adAccountId,
      level: "campaign",
      datePreset,
      fields: ["campaign_name", "spend", "impressions", "reach", "clicks", "ctr", "cpm"],
      limit: 20,
    }),
  ]);

  return {
    source,
    window: datePreset,
    summary: {
      content: summarizeFacebookContent(posts),
      campaigns: summarizeCampaignRows(campaignRows.data),
    },
    top_items: posts
      .sort((left, right) => Number(right.post_impressions_unique ?? 0) - Number(left.post_impressions_unique ?? 0))
      .slice(0, 5),
  };
}

function summarizeFacebookContent(rows: Array<Record<string, unknown>>): Record<string, number> {
  return {
    posts: rows.length,
    impressions_unique: rows.reduce((sum, row) => sum + Number(row.post_impressions_unique ?? 0), 0),
    clicks: rows.reduce((sum, row) => sum + Number(row.post_clicks ?? 0), 0),
    reactions_like: rows.reduce((sum, row) => sum + Number(row.post_reactions_like_total ?? 0), 0),
    shares: rows.reduce((sum, row) => sum + Number(row.share_count ?? 0), 0),
    video_views: rows.reduce((sum, row) => sum + Number(row.post_video_views ?? 0), 0),
  };
}

function summarizeCampaignRows(rows: Array<Record<string, unknown>>): Record<string, number> {
  return {
    campaigns: rows.length,
    spend: rows.reduce((sum, row) => sum + Number(row.spend ?? 0), 0),
    impressions: rows.reduce((sum, row) => sum + Number(row.impressions ?? 0), 0),
    reach: rows.reduce((sum, row) => sum + Number(row.reach ?? 0), 0),
    clicks: rows.reduce((sum, row) => sum + Number(row.clicks ?? 0), 0),
  };
}

function normalizeAdAccountId(value: string): string {
  return value.startsWith("act_") ? value : `act_${value}`;
}

async function resolveAndCachePageId(
  config: MetaConfig,
  tokenStore: ReturnType<typeof loadTokenStore>,
  secretStore: ReturnType<typeof loadSecretStore>,
  pageOption?: string,
): Promise<string> {
  const pageRef = resolvePageRef(config, pageOption);
  if (tokenStore.pageTokens[pageRef]) {
    return pageRef;
  }

  const page = await resolvePage(config, tokenStore, secretStore, pageRef);
  if (page.access_token) {
    tokenStore.pageTokens[page.id] = {
      pageId: page.id,
      pageName: page.name,
      accessToken: page.access_token,
      fetchedAt: new Date().toISOString(),
    };
    saveTokenStore(tokenStore);
  }

  return page.id;
}
