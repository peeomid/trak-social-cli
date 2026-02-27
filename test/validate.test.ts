import test from "node:test";
import assert from "node:assert/strict";
import { validateScheduleTime } from "../src/guards/validate.js";
import { buildAdSetPayload, buildCreativePayload, buildInsightsParams } from "../src/meta/ads.js";

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
