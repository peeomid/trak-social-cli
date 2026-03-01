import test from "node:test";
import assert from "node:assert/strict";
import { attachLiveDoctorReport, buildDoctorReport } from "../src/diagnostics/doctor.js";
import { validateScheduleTime } from "../src/guards/validate.js";
import {
  buildLiveDoctorReport,
  buildPermissionSet,
  refreshAuthState,
} from "../src/meta/auth-health.js";
import {
  buildAdSetPayload,
  buildCreativePayload,
  buildInsightsFiltering,
  buildInsightsParams,
  validateInsightsFilterCombination,
} from "../src/meta/ads.js";
import {
  buildPageInsightsTimeParams,
  getDefaultPagePostInsightMetrics,
  validatePagePostInsightMetrics,
} from "../src/meta/pages.js";
import { getRequestedScopes } from "../src/meta/auth.js";
import { getUserPost, listUserPosts } from "../src/meta/user-posts.js";

test("validateScheduleTime accepts time inside Meta window", () => {
  const now = new Date("2026-02-27T00:00:00Z");
  const date = validateScheduleTime("2026-02-27T00:15:00Z", now);
  assert.equal(date.toISOString(), "2026-02-27T00:15:00.000Z");
});

test("validateScheduleTime rejects time below 10 minutes", () => {
  const now = new Date("2026-02-27T00:00:00Z");
  assert.throws(() => validateScheduleTime("2026-02-27T00:05:00Z", now));
});

test("buildInsightsParams maps fields correctly", () => {
  const params = buildInsightsParams({
    adAccountId: "act_123",
    level: "campaign",
    datePreset: "last_7d",
    fields: ["spend", "impressions"],
    actionReportTime: "mixed",
    timeIncrement: "1",
    limit: 20,
  });

  assert.deepEqual(params, {
    fields: "spend,impressions",
    level: "campaign",
    date_preset: "last_7d",
    action_report_time: "mixed",
    time_increment: "1",
    limit: 20,
  });
});

test("buildInsightsParams includes campaign filtering", () => {
  const params = buildInsightsParams({
    adAccountId: "act_123",
    level: "campaign",
    datePreset: "today",
    fields: ["spend", "clicks"],
    campaignId: "6908777851014",
  });

  assert.equal(
    params.filtering,
    JSON.stringify([
      {
        field: "campaign.id",
        operator: "IN",
        value: ["6908777851014"],
      },
    ]),
  );
});

test("buildInsightsFiltering includes campaign and status filters", () => {
  const filters = buildInsightsFiltering({
    adAccountId: "act_123",
    level: "campaign",
    datePreset: "today",
    fields: ["spend"],
    campaignId: "6908777851014",
    effectiveStatus: "ACTIVE",
  });

  assert.deepEqual(filters, [
    {
      field: "campaign.id",
      operator: "IN",
      value: ["6908777851014"],
    },
    {
      field: "campaign.effective_status",
      operator: "IN",
      value: ["ACTIVE"],
    },
  ]);
});

test("buildInsightsFiltering includes ad set filter", () => {
  const filters = buildInsightsFiltering({
    adAccountId: "act_123",
    level: "adset",
    datePreset: "today",
    fields: ["spend"],
    adSetId: "12345",
  });

  assert.deepEqual(filters, [
    {
      field: "adset.id",
      operator: "IN",
      value: ["12345"],
    },
  ]);
});

test("buildInsightsFiltering includes ad filter", () => {
  const filters = buildInsightsFiltering({
    adAccountId: "act_123",
    level: "ad",
    datePreset: "today",
    fields: ["spend"],
    adId: "999",
  });

  assert.deepEqual(filters, [
    {
      field: "ad.id",
      operator: "IN",
      value: ["999"],
    },
  ]);
});

test("validateInsightsFilterCombination rejects adset filter on campaign level", () => {
  assert.throws(
    () =>
      validateInsightsFilterCombination({
        adAccountId: "act_123",
        level: "campaign",
        datePreset: "today",
        fields: ["spend"],
        adSetId: "12345",
      }),
    /--adset-id cannot be used with --level campaign/,
  );
});

test("validateInsightsFilterCombination rejects ad and campaign together", () => {
  assert.throws(
    () =>
      validateInsightsFilterCombination({
        adAccountId: "act_123",
        level: "ad",
        datePreset: "today",
        fields: ["spend"],
        campaignId: "6908777851014",
        adId: "999",
      }),
    /--ad-id cannot be combined with --campaign-id/,
  );
});

test("buildAdSetPayload serializes targeting", () => {
  const payload = buildAdSetPayload({
    adAccountId: "act_123",
    campaignId: "cmp_1",
    name: "Test ad set",
    dailyBudget: 200000,
    billingEvent: "IMPRESSIONS",
    optimizationGoal: "LINK_CLICKS",
    targeting: { geo_locations: { countries: ["US"] } },
    status: "PAUSED",
  });

  assert.equal(payload.targeting, JSON.stringify({ geo_locations: { countries: ["US"] } }));
});

test("buildCreativePayload builds object_story_spec", () => {
  const payload = buildCreativePayload({
    adAccountId: "act_123",
    name: "Creative 1",
    pageId: "123",
    message: "Hello",
    link: "https://example.com",
    imageHash: "abc123",
  });

  const objectStorySpec = JSON.parse(payload.object_story_spec);
  assert.equal(objectStorySpec.page_id, "123");
  assert.equal(objectStorySpec.link_data.link, "https://example.com");
  assert.equal(objectStorySpec.link_data.image_hash, "abc123");
});

test("getRequestedScopes includes read_insights and excludes invalid user_posts scope", () => {
  assert.equal(getRequestedScopes().includes("read_insights"), true);
  assert.equal(getRequestedScopes().includes("user_posts"), false);
});

test("getDefaultPagePostInsightMetrics returns current default bundle", () => {
  assert.deepEqual(getDefaultPagePostInsightMetrics(), [
    "post_impressions_unique",
    "post_clicks",
    "post_reactions_like_total",
    "post_video_views",
  ]);
});

test("buildPageInsightsTimeParams prefers explicit range over date preset", () => {
  assert.deepEqual(
    buildPageInsightsTimeParams({
      datePreset: "last_7d",
      since: "2026-02-01T00:00:00Z",
      until: "2026-02-28T23:59:59Z",
    }),
    {
      date_preset: undefined,
      since: "2026-02-01T00:00:00Z",
      until: "2026-02-28T23:59:59Z",
    },
  );
});

test("validatePagePostInsightMetrics rejects unsupported metric", () => {
  assert.throws(() => validatePagePostInsightMetrics(["post_clicks", "not_real_metric"]), /Unsupported Page insight metric/);
});

test("buildDoctorReport returns next steps when config is incomplete", () => {
  const report = buildDoctorReport(
    {
      defaultApiVersion: "v25.0",
      defaultPageId: "",
      defaultAdAccountId: "",
      pageAliases: {},
      adAccountAliases: {},
      appId: "",
      redirectPort: 8787,
      output: "table",
    },
    {
      appSecret: "",
    },
    {
      userAccessToken: "",
      userTokenExpiresAt: "",
      scopes: [],
      pageTokens: {},
    },
  );

  assert.equal(report.summary.warn > 0, true);
  assert.equal(report.nextSteps.includes("Run: trak auth login"), true);
});

test("buildPermissionSet finds missing and extra permissions", () => {
  assert.deepEqual(buildPermissionSet(["pages_show_list", "ads_read"], ["pages_show_list", "business_management"]), {
    required: ["pages_show_list", "ads_read"],
    granted: ["pages_show_list", "business_management"],
    missing: ["ads_read"],
    extra: ["business_management"],
  });
});

test("attachLiveDoctorReport appends live warnings", () => {
  const offline = buildDoctorReport(
    {
      defaultApiVersion: "v25.0",
      defaultPageId: "123",
      defaultAdAccountId: "456",
      pageAliases: {},
      adAccountAliases: {},
      appId: "app_1",
      redirectPort: 8787,
      output: "table",
    },
    {
      appSecret: "secret",
    },
    {
      userAccessToken: "user-token",
      userTokenExpiresAt: "2030-01-01T00:00:00.000Z",
      scopes: ["pages_show_list"],
      pageTokens: {},
    },
  );

  const merged = attachLiveDoctorReport(offline, {
    token: {
      status: "ok",
      isValid: true,
      expiresAt: "2030-01-01T00:00:00.000Z",
    },
    permissions: {
      required: ["pages_show_list", "ads_read"],
      granted: ["pages_show_list"],
      missing: ["ads_read"],
      extra: [],
    },
    pageAccess: {
      status: "warn",
      pageId: "123",
      canRead: false,
      hasPageToken: false,
      details: "Missing page access",
    },
  });

  assert.equal(merged.live?.permissions.missing.includes("ads_read"), true);
  assert.equal(merged.nextSteps.includes("Log in again and approve: ads_read"), true);
});

test("buildLiveDoctorReport returns live token and permission data", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/debug_token")) {
      return new Response(
        JSON.stringify({
          data: {
            is_valid: true,
            expires_at: 1893456000,
          },
        }),
        { status: 200 },
      );
    }
    if (url.includes("/me/permissions")) {
      return new Response(
        JSON.stringify({
          data: [
            { permission: "pages_show_list", status: "granted" },
            { permission: "pages_read_engagement", status: "granted" },
            { permission: "read_insights", status: "granted" },
            { permission: "pages_manage_posts", status: "granted" },
            { permission: "ads_read", status: "granted" },
            { permission: "ads_management", status: "granted" },
            { permission: "business_management", status: "granted" },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.includes("/123?")) {
      return new Response(JSON.stringify({ id: "123", name: "Test Page" }), { status: 200 });
    }
    if (url.includes("/act_456?")) {
      return new Response(JSON.stringify({ id: "act_456", name: "Test Ads" }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const live = await buildLiveDoctorReport(
      {
        defaultApiVersion: "v25.0",
        defaultPageId: "123",
        defaultAdAccountId: "456",
        pageAliases: {},
        adAccountAliases: {},
        appId: "app_1",
        redirectPort: 8787,
        output: "table",
      },
      {
        appSecret: "secret",
      },
      {
        userAccessToken: "user-token",
        userTokenExpiresAt: "2030-01-01T00:00:00.000Z",
        scopes: [],
        pageTokens: {
          "123": {
            pageId: "123",
            pageName: "Test Page",
            accessToken: "page-token",
            fetchedAt: "2030-01-01T00:00:00.000Z",
          },
        },
      },
    );

    assert.equal(live.token.isValid, true);
    assert.deepEqual(live.permissions.missing, []);
    assert.equal(live.pageAccess?.canRead, true);
    assert.equal(live.adsAccess?.canRead, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("listUserPosts maps attachments from Meta response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: [
          {
            id: "post-1",
            message: "Hello",
            created_time: "2026-02-01T00:00:00+0000",
            permalink_url: "https://facebook.com/post-1",
            attachments: {
              data: [
                {
                  type: "photo",
                  media_type: "image",
                  url: "https://example.com/image.jpg",
                  target: { id: "target-1", url: "https://example.com/target" },
                },
              ],
            },
          },
        ],
      }),
      { status: 200 },
    );

  try {
    const rows = await listUserPosts(
      {
        defaultApiVersion: "v25.0",
        defaultPageId: "",
        defaultAdAccountId: "",
        pageAliases: {},
        adAccountAliases: {},
        appId: "app_1",
        redirectPort: 8787,
        output: "table",
      },
      {
        userAccessToken: "user-token",
        userTokenExpiresAt: "2030-01-01T00:00:00.000Z",
        scopes: ["user_posts"],
        pageTokens: {},
      },
      {
        appSecret: "secret",
      },
      {
        limit: 5,
      },
    );

    assert.equal(rows[0]?.postId, "post-1");
    assert.equal(rows[0]?.attachments[0]?.mediaType, "image");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getUserPost maps a single post response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: "post-2",
        message: "One post",
        created_time: "2026-02-02T00:00:00+0000",
        permalink_url: "https://facebook.com/post-2",
      }),
      { status: 200 },
    );

  try {
    const row = await getUserPost(
      {
        defaultApiVersion: "v25.0",
        defaultPageId: "",
        defaultAdAccountId: "",
        pageAliases: {},
        adAccountAliases: {},
        appId: "app_1",
        redirectPort: 8787,
        output: "table",
      },
      {
        userAccessToken: "user-token",
        userTokenExpiresAt: "2030-01-01T00:00:00.000Z",
        scopes: ["user_posts"],
        pageTokens: {},
      },
      {
        appSecret: "secret",
      },
      "post-2",
    );

    assert.equal(row.postId, "post-2");
    assert.equal(row.message, "One post");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refreshAuthState returns relogin_required for invalid token", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/debug_token")) {
      return new Response(
        JSON.stringify({
          data: {
            is_valid: false,
            error: {
              code: 190,
              message: "Token expired",
            },
          },
        }),
        { status: 200 },
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const result = await refreshAuthState(
      {
        defaultApiVersion: "v25.0",
        defaultPageId: "",
        defaultAdAccountId: "",
        pageAliases: {},
        adAccountAliases: {},
        appId: "app_1",
        redirectPort: 8787,
        output: "table",
      },
      {
        appSecret: "secret",
      },
      {
        userAccessToken: "expired-token",
        userTokenExpiresAt: "2020-01-01T00:00:00.000Z",
        scopes: [],
        pageTokens: {},
      },
    );

    assert.equal(result.report.action, "relogin_required");
    assert.equal(result.nextTokenStore, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refreshAuthState keeps valid token and rebuilds pages", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/debug_token")) {
      return new Response(
        JSON.stringify({
          data: {
            is_valid: true,
            expires_at: 1893456000,
          },
        }),
        { status: 200 },
      );
    }
    if (url.includes("/me/accounts")) {
      return new Response(
        JSON.stringify({
          data: [{ id: "123", name: "Test Page", access_token: "page-token" }],
        }),
        { status: 200 },
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const result = await refreshAuthState(
      {
        defaultApiVersion: "v25.0",
        defaultPageId: "",
        defaultAdAccountId: "",
        pageAliases: {},
        adAccountAliases: {},
        appId: "app_1",
        redirectPort: 8787,
        output: "table",
      },
      {
        appSecret: "secret",
      },
      {
        userAccessToken: "user-token",
        userTokenExpiresAt: "2030-01-01T00:00:00.000Z",
        scopes: [],
        pageTokens: {},
      },
    );

    assert.equal(result.report.action, "still_valid");
    assert.equal(result.report.pages.rebuilt, true);
    assert.equal(result.nextTokenStore?.pageTokens["123"]?.accessToken, "page-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
