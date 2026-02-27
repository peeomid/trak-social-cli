import fs from "node:fs";
import { Command } from "commander";
import { login, getRequestedScopes } from "../meta/auth.js";
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
import { getPost, listPages, listPostStats, listPosts, resolvePage, schedulePost } from "../meta/pages.js";
import { dryRunNotice } from "../guards/confirm.js";
import { parsePositiveInteger, requireValue, validateScheduleTime } from "../guards/validate.js";
import { renderOutput } from "../output/render.js";
import { loadConfig, saveConfig } from "../store/config.js";
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
    .description("CLI for Meta Page posts, scheduling, ads stats, and draft ad creation.")
    .option("--json", "Output JSON");

  addAuthCommands(program);
  addPageCommands(program);
  addAdsCommands(program);
  addBusinessCommands(program);
  addConfigCommands(program);
  return program;
}

function addAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Meta auth commands");

  auth
    .command("login")
    .description("Login with Meta in browser and store long-lived tokens")
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
    .action(() => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      render(config, {
        appId: config.appId || process.env.META_APP_ID || "(missing)",
        appSecretEnvVar: config.appSecretEnvVar,
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
    .command("logout")
    .description("Clear stored tokens")
    .action(() => {
      const config = loadConfig();
      clearTokenStore();
      clearSecretStore();
      render(config, { status: "logged_out" });
    });
}

function addPageCommands(program: Command): void {
  const page = program.command("page").description("Facebook Page commands");

  page
    .command("list")
    .description("List Pages available to the current user")
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

  posts
    .command("list")
    .option("--page <pageId>", "Page id")
    .option("--since <iso>", "Start time")
    .option("--until <iso>", "End time")
    .option("--limit <limit>", "Row limit", "20")
    .description("List Page posts")
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
    .command("get")
    .option("--page <pageId>", "Page id")
    .requiredOption("--post <postId>", "Post id")
    .description("Get one Page post")
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

function addAdsCommands(program: Command): void {
  const ads = program.command("ads").description("Meta ads commands");

  const account = ads.command("account").description("Ad account commands");
  account
    .command("list")
    .description("List ad accounts")
    .action(async () => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const response = await listAdAccounts(config, tokenStore, secretStore);
      render(config, response.data);
    });

  ads
    .command("insights")
    .requiredOption("--account <accountId>", "Ad account id")
    .option("--level <level>", "account | campaign | adset | ad", "account")
    .option("--date-preset <preset>", "Date preset", "last_7d")
    .option(
      "--fields <fields>",
      "Comma-separated fields",
      "spend,impressions,reach,clicks,ctr,cpm,campaign_name,adset_name,ad_name",
    )
    .option("--action-report-time <mode>", "impression | conversion | mixed")
    .option("--time-increment <value>", "1 | all_days")
    .option("--limit <limit>", "Row limit", "100")
    .description("Read insights / performance")
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const response = await getInsights(config, tokenStore, secretStore, {
        adAccountId: options.account,
        level: options.level as InsightsLevel,
        datePreset: options.datePreset,
        fields: String(options.fields)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        actionReportTime: options.actionReportTime,
        timeIncrement: options.timeIncrement,
        limit: parsePositiveInteger(options.limit, "--limit"),
      });
      render(config, response.data);
    });

  const campaigns = ads.command("campaigns").description("Campaign commands");
  campaigns
    .command("list")
    .requiredOption("--account <accountId>", "Ad account id")
    .option("--status <status>", "Filter status")
    .description("List campaigns")
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const response = await listCampaigns(config, tokenStore, secretStore, options.account, options.status);
      render(config, response.data);
    });

  const create = ads.command("create").description("Draft ad creation");

  create
    .command("campaign")
    .requiredOption("--account <accountId>", "Ad account id")
    .requiredOption("--name <name>", "Campaign name")
    .requiredOption("--objective <objective>", "Meta campaign objective")
    .option("--dry-run", "Show payload only")
    .description("Create paused campaign")
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const payload: CampaignCreateInput = {
        adAccountId: options.account,
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
    .requiredOption("--account <accountId>", "Ad account id")
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
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const targeting = JSON.parse(fs.readFileSync(options.targetingFile, "utf8")) as Record<string, unknown>;
      const payload: AdSetCreateInput = {
        adAccountId: options.account,
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
    .requiredOption("--account <accountId>", "Ad account id")
    .requiredOption("--name <name>", "Creative name")
    .requiredOption("--page <pageId>", "Page id")
    .requiredOption("--message <message>", "Creative message")
    .requiredOption("--link <url>", "Destination URL")
    .option("--image-hash <hash>", "Existing uploaded image hash")
    .option("--dry-run", "Show payload only")
    .description("Create link ad creative")
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const payload: CreativeCreateInput = {
        adAccountId: options.account,
        name: requireValue(options.name, "--name"),
        pageId: options.page,
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
    .requiredOption("--account <accountId>", "Ad account id")
    .requiredOption("--adset <adsetId>", "Ad set id")
    .requiredOption("--creative <creativeId>", "Creative id")
    .requiredOption("--name <name>", "Ad name")
    .option("--dry-run", "Show payload only")
    .description("Create paused ad")
    .action(async (options) => {
      const config = loadConfig();
      const tokenStore = loadTokenStore();
      const secretStore = loadSecretStore();
      const payload: AdCreateInput = {
        adAccountId: options.account,
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

  business
    .command("list")
    .description("List businesses available to the current user")
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

  configCommand
    .command("show")
    .description("Show current config")
    .action(() => {
      const config = loadConfig();
      render(config, config);
    });

  configCommand
    .command("set")
    .requiredOption("--app-id <appId>", "Meta app id")
    .option("--app-secret <appSecret>", "Meta app secret saved locally")
    .option("--default-page <pageId>", "Default page id")
    .option("--default-ad-account <accountId>", "Default ad account id")
    .option("--redirect-port <port>", "Local redirect port")
    .option("--app-secret-env <name>", "Env var name for app secret")
    .description("Write local config")
    .action((options) => {
      const current = loadConfig();
      const currentSecretStore = loadSecretStore();
      const next: MetaConfig = {
        ...current,
        appId: options.appId,
        defaultPageId: options.defaultPage ?? current.defaultPageId,
        defaultAdAccountId: options.defaultAdAccount ?? current.defaultAdAccountId,
        redirectPort: options.redirectPort
          ? parsePositiveInteger(options.redirectPort, "--redirect-port")
          : current.redirectPort,
        appSecretEnvVar: options.appSecretEnv ?? current.appSecretEnvVar,
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
}

function render(config: MetaConfig, data: unknown): void {
  const useJson = process.argv.includes("--json");
  renderOutput(data, useJson ? "json" : config.output);
}

function resolvePageRef(config: MetaConfig, pageOption?: string): string {
  const pageRef = pageOption ?? config.defaultPageId;
  if (!pageRef) {
    throw new Error("Missing Page id. Pass --page or set defaultPageId in config.");
  }
  return pageRef;
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
