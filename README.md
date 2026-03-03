# trak

Multi-source tracking CLI for content, campaigns, reports, and publishing.

Current live provider:
- Facebook

Planned providers:
- Instagram
- Threads
- Google Analytics

Today, the new main CLI shape is already live:
- `trak source ...`
- `trak account ...`
- `trak content ...`
- `trak campaign ...`
- `trak report ...`
- `trak publish ...`

Provider-specific commands stay under:
- `trak facebook ...`
- `trak instagram ...`
- `trak threads ...`
- `trak ga ...`

Right now, only `facebook` is implemented. The other provider namespaces are reserved and explain planned support.

## Install

Requirements:
- Node.js 18+
- npm
- Meta app id + app secret

```bash
cd /Users/luannguyenthanh/Development/Osimify/trak-social-cli
npm install
npm run build
npm link
```

Check:

```bash
trak --help
trak source list
```

## Quick Start

```bash
trak config init --app-id YOUR_APP_ID --default-page YOUR_PAGE_ID --default-ad-account YOUR_AD_ACCOUNT_ID
# edit ~/.config/trak/config.toml and add your app secret
trak auth login
trak doctor --live
trak account list --source facebook
trak content list --source facebook --account main --limit 5
trak report top-content --source facebook --account main
```

## Main Command Model

Use the main tree for common jobs:

```bash
trak source list
trak account list --source facebook
trak content stats --source facebook --account sahaja --limit 10
trak campaign stats --source facebook --account luan --date-preset last_7d
trak report daily --source facebook
trak publish preview --source facebook --account sahaja --message "Hello" --at "2026-03-10T09:00:00+07:00"
```

Use provider trees for advanced provider-only work:

```bash
trak facebook page resolve --page SahajaVietnam
trak facebook business list
trak facebook business pages list --business BUSINESS_ID --owned
trak facebook user posts list --limit 10
trak facebook ads create campaign --account luan --name "Traffic test" --objective OUTCOME_TRAFFIC
```

## Sources

Inspect source support:

```bash
trak source list
trak source capabilities --source facebook
trak source capabilities --source instagram
trak source status --source ga
```

## Accounts

List connected assets:

```bash
trak account list --source facebook
```

Get one asset:

```bash
trak account get --source facebook --kind page --id sahaja
trak account get --source facebook --kind ad_account --id luan
```

Set a saved alias as default:

```bash
trak account use sahaja --source facebook --kind page
trak account use luan --source facebook --kind ad_account
```

## Content

List recent content:

```bash
trak content list --source facebook --account sahaja --limit 5
```

Get one content item:

```bash
trak content get --source facebook --account sahaja --id PAGE_POST_ID
```

Show content performance:

```bash
trak content stats --source facebook --account sahaja --limit 10
```

Compare two posts:

```bash
trak content compare \
  --source facebook \
  --account sahaja \
  --id PAGE_POST_A \
  --other-id PAGE_POST_B
```

## Campaigns

List campaigns:

```bash
trak campaign list --source facebook --account luan
```

Campaign or ad performance:

```bash
trak campaign stats --source facebook --account luan --level campaign --date-preset last_7d
trak campaign stats --source facebook --account luan --level ad --campaign-id CAMPAIGN_ID --status ACTIVE
```

Get one campaign:

```bash
trak campaign get --source facebook --account luan --id CAMPAIGN_ID
```

List ads inside one campaign:

```bash
trak campaign ad list --source facebook --account luan --campaign CAMPAIGN_ID --date-preset last_7d
```

## Reports

Daily and weekly summary:

```bash
trak report daily --source facebook
trak report weekly --source facebook
```

Date-range summary:

```bash
trak report summary --source facebook --account sahaja --from 2026-03-01 --to 2026-03-03
```

Top content:

```bash
trak report top-content --source facebook --account sahaja --limit 5
```

## Publish

Preview a scheduled post:

```bash
trak publish preview \
  --source facebook \
  --account sahaja \
  --message "Hello from trak" \
  --at "2026-03-10T09:00:00+07:00"
```

Schedule it:

```bash
trak publish schedule \
  --source facebook \
  --account sahaja \
  --message "Hello from trak" \
  --at "2026-03-10T09:00:00+07:00"
```

## Provider-Specific Facebook Tree

These advanced commands still exist under `trak facebook ...`:

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

trak facebook business list
trak facebook business pages list --business BUSINESS_ID --owned
```

## Config And Aliases

Local files:
- `~/.config/trak/config.toml`
- `~/.config/trak/tokens.json`

Example config:

```toml
[auth]
app_id = "1493983742290842"
app_secret = "YOUR_META_APP_SECRET"
redirect_port = 8787

[defaults]
api_version = "v25.0"
page_id = "1548373332058326"
ad_account_id = "1243158725700119"
output = "table"

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

## Auth And Permissions

Main auth commands:

```bash
trak auth login
trak auth status
trak auth refresh
trak auth logout
trak doctor
trak doctor --live
```

Important:
- `read_insights` is required for Page post performance
- invalid login scope `user_posts` is not requested
- if content metrics come back blank, run `trak doctor --live --page PAGE_ID`

## JSON Output

Every command supports `--json`.

Examples:

```bash
trak content stats --source facebook --account sahaja --limit 10 --json
trak campaign stats --source facebook --account luan --level campaign --date-preset last_7d --json
trak report top-content --source facebook --account sahaja --json
```

## Build

```bash
npm run build
npm test
npm link
```

## Current Limits

- Only Facebook is implemented today
- Instagram, Threads, and GA are command placeholders today
- Some Page insight fields may still be blank for some Page/token combos
- Personal profile posts stay read-only
- Image upload for ad creatives is not built yet
