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
  getInsights,
  listAdAccounts,
  listBusinesses,
  listBusinessPages,
  listCampaigns,
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
} from "../types/models.js";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("trak")
    .description("Social publishing and marketing CLI. Start with config, then auth, then page or ads commands.")
    .option("--json", "Output JSON");
  program.addHelpText(
    "after",
    `
Setup order:
  1. Edit ~/.config/trak/config.toml
  2. trak auth login
  3. trak business list
  4. trak page resolve --page SahajaVietnam
  5. trak page posts list --limit 5
  6. trak doctor

Common examples:
  trak config show
  trak doctor
  trak auth status
  trak page posts insights --limit 10
  trak page posts insights --page main --limit 10
  trak page posts compare --post PAGE_POST_A --other-post PAGE_POST_B
  trak user posts list --limit 10
  trak ads account list
  trak ads insights --account 1243158725700119 --level campaign --date-preset last_7d
  trak ads insights --account ads1 --level campaign --date-preset last_7d

Tip:
  Use --json when sending output to AI tools like OpenClaw.
`,
  );

  addAuthCommands(program);
  addPageCommands(program);
  addUserCommands(program);
  addAdsCommands(program);
  addBusinessCommands(program);
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

function addPageCommands(program: Command): void {
  const page = program.command("page").description("Facebook Page commands");
  page.addHelpText(
    "after",
    `
Examples:
  trak page list
  trak page resolve --page SahajaVietnam
  trak page resolve --page main
  trak page posts list --page 1548373332058326 --limit 10
  trak page posts stats --page 1548373332058326 --limit 10
  trak page posts insights --page 1548373332058326 --limit 10
  trak page posts schedule --page 1548373332058326 --message "Hello" --at "2026-03-01T09:00:00+07:00"

Step by step:
  1. trak auth login
  2. trak business pages list --business YOUR_BUSINESS_ID --owned
  3. trak page resolve --page YOUR_PAGE_ID_OR_USERNAME
  4. trak page posts list --limit 5
`,
  );

  page
    .command("list")
    .description("List Pages available to the current user")
    .addHelpText(
      "after",
      `
Example:
  trak page list

If your Page is missing:
  trak business pages list --business YOUR_BUSINESS_ID --owned
  trak page resolve --page YOUR_PAGE_ID_OR_USERNAME
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
  trak page resolve --page SahajaVietnam
  trak page resolve --page 1548373332058326
  trak page resolve --page main
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
  trak page posts list --limit 10
  trak page posts stats --limit 10
  trak page posts insights --limit 10
  trak page posts get --post 1548373332058326_1220166893652739
  trak page posts schedule --message "New update" --at "2026-03-01T09:00:00+07:00" --dry-run
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
  trak page posts list --page 1548373332058326 --limit 10
  trak page posts list --page main --limit 10
  trak page posts list --limit 10
  trak page posts list --since 2026-02-01T00:00:00Z --until 2026-02-27T23:59:59Z

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
  trak page posts stats --page 1548373332058326 --limit 10
  trak page posts stats --page main --limit 10
  trak page posts stats --limit 10 --json

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
  trak page posts insights --page 1548373332058326 --post 1548373332058326_1220166893652739
  trak page posts insights --page main --limit 10
  trak page posts insights --limit 10
  trak page posts insights --metrics post_impressions_unique,post_clicks

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
  trak page posts compare --post 123_1 --other-post 123_2
  trak page posts compare --page main --post 123_1 --other-post 123_2
  trak page posts compare --page 1548373332058326 --post 123_1 --other-post 123_2 --metrics post_clicks,post_impressions_unique
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
  trak page posts get --page 1548373332058326 --post 1548373332058326_1220166893652739
  trak page posts get --page main --post 1548373332058326_1220166893652739
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
  trak page posts schedule --page 1548373332058326 --message "Hello" --at "2026-03-01T09:00:00+07:00"
  trak page posts schedule --page main --message "Hello" --at "2026-03-01T09:00:00+07:00"
  trak page posts schedule --message "Hello" --at "2026-03-01T09:00:00+07:00" --dry-run

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
  trak user posts list --limit 10
  trak user posts get --post 123456789

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
  trak user posts list --limit 10
  trak user posts list --since 2026-02-01T00:00:00Z --until 2026-02-28T23:59:59Z
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
  trak user posts get --post 123456789
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
  trak ads account list
  trak ads campaigns list
  trak ads insights --level campaign --date-preset last_7d
  trak ads insights --account ads1 --level campaign --date-preset last_7d
  trak ads create campaign --name "Traffic test" --objective OUTCOME_TRAFFIC

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
  trak ads account list
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
  trak ads insights --level account --date-preset last_7d
  trak ads insights --account ads1 --level account --date-preset last_7d
  trak ads insights --account 1243158725700119 --level campaign --fields spend,impressions,clicks,ctr,cpm --json
  trak ads insights --account 1243158725700119 --level campaign --campaign-id 6908777851014 --date-preset today
  trak ads insights --account 1243158725700119 --level ad --campaign-id 6908777851014 --status ACTIVE --date-preset last_7d --json
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
  trak ads campaigns list
  trak ads campaigns list --account ads1
  trak ads campaigns list --account 1243158725700119 --status ACTIVE
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
  trak ads create campaign --name "Traffic test" --objective OUTCOME_TRAFFIC
  trak ads create campaign --account ads1 --name "Traffic test" --objective OUTCOME_TRAFFIC --dry-run
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
  trak ads create adset --campaign 123 --name "VN ad set" --daily-budget 200000 --billing-event IMPRESSIONS --optimization-goal LINK_CLICKS --targeting-file ./targeting.json
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
  trak ads create creative --account ads1 --name "Creative 1" --page main --message "Check this out" --link "https://example.com"
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
  trak ads create ad --account ads1 --adset 123 --creative 456 --name "Ad 1"
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
  trak business list
  trak business pages list --business 1242778199071505 --owned
  trak business pages list --business 1242778199071505

Use this when:
  A Page does not appear in 'trak page list'.
`,
  );

  business
    .command("list")
    .description("List businesses available to the current user")
    .addHelpText(
      "after",
      `
Example:
  trak business list
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
  trak business pages list --business 1242778199071505 --owned
  trak business pages list --business 1242778199071505 --client
  trak business pages list --business 1242778199071505
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
