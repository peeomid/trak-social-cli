import type { SupportedSource } from "../types/models.js";

export const supportedSources: SupportedSource[] = ["facebook", "instagram", "threads", "ga"];

export function resolveSource(source?: string): SupportedSource {
  const value = (source?.trim() || "facebook") as SupportedSource;
  if (!supportedSources.includes(value)) {
    throw new Error(`Unsupported source: ${source}. Use one of: ${supportedSources.join(", ")}`);
  }
  return value;
}

export function assertImplementedSource(source: SupportedSource): void {
  if (source !== "facebook") {
    throw new Error(`${source} support is not implemented yet. Use 'trak source capabilities --source ${source}' to inspect planned support.`);
  }
}

export function getSourceCapabilities(source: SupportedSource): {
  source: SupportedSource;
  implemented: boolean;
  account: boolean;
  content: boolean;
  campaign: boolean;
  report: boolean;
  publish: boolean;
  providerTree: boolean;
  notes: string[];
} {
  if (source === "facebook") {
    return {
      source,
      implemented: true,
      account: true,
      content: true,
      campaign: true,
      report: true,
      publish: true,
      providerTree: true,
      notes: ["Current live provider", "Supports Page content, ads, business discovery, scheduling"],
    };
  }

  return {
    source,
    implemented: false,
    account: false,
    content: false,
    campaign: false,
    report: false,
    publish: false,
    providerTree: true,
    notes: ["Planned provider", "Command namespace reserved for future implementation"],
  };
}
