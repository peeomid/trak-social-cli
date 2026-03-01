export type OutputFormat = "table" | "json";

export type MetaConfig = {
  defaultApiVersion: string;
  defaultPageId: string;
  defaultAdAccountId: string;
  pageAliases: Record<string, string>;
  adAccountAliases: Record<string, string>;
  appId: string;
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

export type DoctorCheck = {
  name: string;
  status: "ok" | "warn";
  details: string;
};

export type PermissionSet = {
  required: string[];
  granted: string[];
  missing: string[];
  extra: string[];
};

export type LiveDoctorTokenCheck = {
  status: "ok" | "warn";
  isValid: boolean;
  expiresAt: string;
  errorCode?: number;
  errorMessage?: string;
};

export type LiveDoctorPageAccess = {
  status: "ok" | "warn";
  pageId: string;
  pageName?: string;
  canRead: boolean;
  hasPageToken: boolean;
  details: string;
};

export type LiveDoctorAdsAccess = {
  status: "ok" | "warn";
  adAccountId: string;
  canRead: boolean;
  details: string;
};

export type LiveDoctorReport = {
  token: LiveDoctorTokenCheck;
  permissions: PermissionSet;
  pageAccess?: LiveDoctorPageAccess;
  adsAccess?: LiveDoctorAdsAccess;
};

export type DoctorReport = {
  summary: {
    ok: number;
    warn: number;
  };
  paths: {
    configPath: string;
    tokenPath: string;
  };
  checks: DoctorCheck[];
  nextSteps: string[];
  live?: LiveDoctorReport;
};

export type AuthRefreshReport = {
  status: "ok" | "warn";
  action: "refreshed" | "still_valid" | "relogin_required";
  token: {
    masked: string;
    expiresAt: string;
    isExpired: boolean;
  };
  pages: {
    count: number;
    rebuilt: boolean;
  };
  notes: string[];
  nextSteps: string[];
};

export type PagePostScheduleInput = {
  pageId: string;
  message: string;
  scheduledPublishTime: string;
  link?: string;
};

export type PagePostInsightMetric =
  | "post_impressions"
  | "post_impressions_unique"
  | "post_clicks"
  | "post_engaged_users"
  | "post_reactions_like_total"
  | "post_reactions_love_total"
  | "post_reactions_wow_total"
  | "post_reactions_haha_total"
  | "post_reactions_sorry_total"
  | "post_reactions_anger_total"
  | "post_video_views";

export type PageInsightsPeriod = "day" | "week" | "days_28" | "month" | "lifetime" | "total_over_range";

export type PageInsightsTimeRange = {
  datePreset?: string;
  since?: string;
  until?: string;
};

export type PagePostInsightRow = {
  postId: string;
  createdTime?: string;
  permalinkUrl?: string;
  message?: string;
  shareCount: number | null;
  insights: Record<string, number | null>;
  missingMetrics: string[];
};

export type UserPostAttachment = {
  type?: string;
  mediaType?: string;
  url?: string;
  target?: {
    id?: string;
    url?: string;
  };
};

export type UserPostRow = {
  postId: string;
  createdTime?: string;
  message?: string;
  permalinkUrl?: string;
  attachments: UserPostAttachment[];
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
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  effectiveStatus?: string;
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
