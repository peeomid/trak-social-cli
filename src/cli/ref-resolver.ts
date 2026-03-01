import type { MetaConfig } from "../types/models.js";

export function resolvePageRef(config: MetaConfig, pageOption?: string): string {
  const pageRef = resolveRef(pageOption, config.defaultPageId, config.pageAliases);
  if (!pageRef) {
    throw new Error("Missing Page id. Pass --page/alias or set defaults.page_id in config.");
  }
  return pageRef;
}

export function resolveAdAccountRef(config: MetaConfig, accountOption?: string): string {
  const adAccountRef = resolveRef(accountOption, config.defaultAdAccountId, config.adAccountAliases);
  if (!adAccountRef) {
    throw new Error("Missing ad account id. Pass --account/alias or set defaults.ad_account_id in config.");
  }
  return adAccountRef;
}

function resolveRef(optionValue: string | undefined, defaultValue: string, aliases: Record<string, string>): string {
  const value = optionValue ?? defaultValue;
  if (!value) {
    return "";
  }
  return aliases[value] ?? value;
}
