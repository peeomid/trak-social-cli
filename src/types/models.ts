export type OutputFormat = "table" | "json";

export type MetaConfig = {
  defaultApiVersion: string;
  defaultPageId: string;
  defaultAdAccountId: string;
  appId: string;
  appSecretEnvVar: string;
  redirectPort: number;
  output: OutputFormat;
};

export type SecretStore = {
  appSecret: string;
};

export type StoredPageToken = {
  pageId: string;
  pageName: string;
  accessToken: string;
  fetchedAt: string;
};

export type TokenStore = {
  userAccessToken: string;
  userTokenExpiresAt: string;
  scopes: string[];
  pageTokens: Record<string, StoredPageToken>;
};

export type PagePostScheduleInput = {
  pageId: string;
  message: string;
  scheduledPublishTime: string;
  link?: string;
};

export type InsightsLevel = "account" | "campaign" | "adset" | "ad";

export type InsightsQuery = {
  adAccountId: string;
  level: InsightsLevel;
  datePreset: string;
  fields: string[];
  actionReportTime?: "impression" | "conversion" | "mixed";
  timeIncrement?: "all_days" | "1";
  limit?: number;
};

export type CampaignCreateInput = {
  adAccountId: string;
  name: string;
  objective: string;
  status: "PAUSED";
};

export type AdSetCreateInput = {
  adAccountId: string;
  campaignId: string;
  name: string;
  dailyBudget: number;
  billingEvent: string;
  optimizationGoal: string;
  targeting: Record<string, unknown>;
  startTime?: string;
  endTime?: string;
  status: "PAUSED";
};

export type CreativeCreateInput = {
  adAccountId: string;
  name: string;
  pageId: string;
  message: string;
  link: string;
  imageHash?: string;
};

export type AdCreateInput = {
  adAccountId: string;
  adSetId: string;
  creativeId: string;
  name: string;
  status: "PAUSED";
};
