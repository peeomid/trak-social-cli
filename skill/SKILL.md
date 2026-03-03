---
name: trak
description: Use the trak CLI for Facebook content, campaigns, reports, publishing, and provider-specific Meta commands. Prefer the main task-first tree (`source`, `account`, `content`, `campaign`, `report`, `publish`) and use `facebook ...` for advanced provider-only actions.
version: 2.0.0
---

# trak

Repo: `/Users/luannguyenthanh/Development/Osimify/trak-social-cli`

## What It Is

`trak` is now a multi-source CLI shape.

Main command tree:
- `trak source ...`
- `trak account ...`
- `trak content ...`
- `trak campaign ...`
- `trak report ...`
- `trak publish ...`

Provider trees:
- `trak facebook ...`
- `trak instagram ...`
- `trak threads ...`
- `trak ga ...`

Current live provider:
- Facebook

Planned only for now:
- Instagram
- Threads
- GA

## When To Use

Use this skill when user asks to:
- check Facebook Page posts or post performance
- compare two Page posts
- inspect ad campaign or ad performance
- schedule a Facebook Page post
- list Pages, businesses, ad accounts, or campaigns
- get JSON social data for AI workflows
- check auth, token, or permission health for Meta

## Setup

Binary:
- `trak`

Config files:
- `~/.config/trak/config.toml`
- `~/.config/trak/tokens.json`

Useful checks:

```bash
trak doctor
trak doctor --live
trak auth status
trak source list
trak config show
trak config alias list
```

Important:
- `read_insights` is required for Page post performance
- invalid login scope `user_posts` is not requested anymore

## Main Commands

### Source

```bash
trak source list
trak source capabilities --source facebook
trak source capabilities --source instagram
trak source status --source ga
```

### Account

```bash
trak account list --source facebook
trak account get --source facebook --kind page --id sahaja
trak account get --source facebook --kind ad_account --id luan
trak account use sahaja --source facebook --kind page
trak account use luan --source facebook --kind ad_account
```

### Content

```bash
trak content list --source facebook --account sahaja --limit 5
trak content get --source facebook --account sahaja --id PAGE_POST_ID
trak content stats --source facebook --account sahaja --limit 10
trak content compare --source facebook --account sahaja --id POST_A --other-id POST_B
```

### Campaign

```bash
trak campaign list --source facebook --account luan
trak campaign list --source facebook --account luan --status ACTIVE
trak campaign stats --source facebook --account luan --level campaign --date-preset last_7d
trak campaign get --source facebook --account luan --id CAMPAIGN_ID
trak campaign ad list --source facebook --account luan --campaign CAMPAIGN_ID
trak campaign ad list --source facebook --account luan --campaign CAMPAIGN_ID --with-creative
```

### Report

```bash
trak report daily --source facebook
trak report weekly --source facebook
trak report summary --source facebook --account sahaja --from 2026-03-01 --to 2026-03-03
trak report top-content --source facebook --account sahaja --limit 5
trak report ad-content --source facebook --account luan --date-preset this_month
trak report ad-content --source facebook --account luan --date-preset this_month --csv
```

### Publish

```bash
trak publish preview --source facebook --account sahaja --message "Hello" --at "2026-03-10T09:00:00+07:00"
trak publish schedule --source facebook --account sahaja --message "Hello" --at "2026-03-10T09:00:00+07:00"
```

## Provider-Specific Facebook Commands

Use these when the user needs Meta/Facebook-only features.

```bash
trak facebook page list
trak facebook page resolve --page SahajaVietnam
trak facebook page posts list --page sahaja --limit 10
trak facebook page posts stats --page sahaja --limit 10
trak facebook page posts insights --page sahaja --limit 10
trak facebook page posts compare --page sahaja --post POST_A --other-post POST_B
trak facebook page posts schedule --page sahaja --message "Hello" --at "2026-03-10T09:00:00+07:00"

trak facebook user posts list --limit 10
trak facebook user posts get --post POST_ID

trak facebook ads account list
trak facebook ads campaigns list --account luan
trak facebook ads insights --account luan --level campaign --date-preset last_7d
trak facebook ads create campaign --account luan --name "Traffic test" --objective OUTCOME_TRAFFIC
trak facebook ads create adset --account luan --campaign CAMPAIGN_ID --name "VN ad set" --daily-budget 200000 --billing-event IMPRESSIONS --optimization-goal LINK_CLICKS --targeting-file ./targeting.json
trak facebook ads create creative --account luan --page sahaja --name "Creative 1" --message "Check this out" --link "https://example.com"
trak facebook ads create ad --account luan --adset ADSET_ID --creative CREATIVE_ID --name "Ad 1"
trak facebook ads ad get --account luan --id AD_ID
trak facebook ads ad creative --account luan --id AD_ID
trak facebook ads ad post --account luan --id AD_ID --with-stats

trak facebook business list
trak facebook business pages list --business BUSINESS_ID --owned
```

## Aliases

Page and ad account aliases live in config.

Example:

```toml
[aliases.pages]
sahaja = "1548373332058326"

[aliases.ad_accounts]
luan = "1243158725700119"
```

Manage aliases:

```bash
trak config alias list
trak config alias set --page sahaja --value 1548373332058326
trak config alias set --account luan --value 1243158725700119
trak config alias rename --page sahaja --to sahaja-yoga
trak config alias remove --account luan
```

## JSON Output

Add `--json` for AI-friendly output:

```bash
trak content stats --source facebook --account sahaja --limit 5 --json
trak campaign stats --source facebook --account luan --level campaign --date-preset last_7d --json
trak report top-content --source facebook --account sahaja --json
```

## Troubleshooting

If Page metrics are blank:

```bash
trak doctor --live --page PAGE_ID
trak auth login
```

Most common cause:
- missing `read_insights`

If user needs old root examples like `trak page ...` or `trak ads ...`:
- correct them to `trak facebook page ...`
- correct them to `trak facebook ads ...`

## Current Limits

- only Facebook is implemented now
- Instagram, Threads, and GA are placeholders now
- personal profile posts are read-only
- some Meta insight fields may be blank depending on token/Page access
