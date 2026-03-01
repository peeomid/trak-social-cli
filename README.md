# trak — Facebook & Meta CLI for Posts and Ads

> Manage Facebook Pages, inspect Page post performance, read personal posts, and track Meta ads from terminal.

`trak` is a command-line tool for **Facebook Page management**, **rich Page post insights**, **personal post reads**, **post scheduling**, and **Meta Ads insights**. It replaces browser tabs with fast terminal commands and clean JSON output.

Every legacy Facebook CLI tool (fbcmd, facebook-cli) is abandoned. `trak` fills that gap with a modern, maintained alternative built on Meta's Graph API v25.0.

## Quick Start

```bash
trak config init --app-id YOUR_APP_ID --default-page YOUR_PAGE_ID --default-ad-account YOUR_AD_ACCOUNT_ID
# edit ~/.config/trak/config.toml and add your app secret
trak auth login
trak doctor --live
trak page posts insights --limit 10
trak ads insights --level campaign --date-preset last_7d
trak ads insights --account ads1 --level campaign --date-preset last_7d
```

## What You Can Do

- Inspect recent Page posts from terminal
- Pull richer Page post metrics with `page posts insights`
- Compare two Page posts with `page posts compare`
- Read your own personal timeline posts with `user posts list/get`
- Query Ads insights by account, campaign, ad set, or ad
- Send JSON output to AI tools and automation

## Recent Additions

Recent additions:
- `trak config init` for safe starter config files
- `trak doctor` for setup diagnostics
- `trak page posts insights` for richer Page post metrics
- `trak page posts compare` for side-by-side Page post comparison
- `trak user posts list/get` for read-only personal post tracking
- ad insights filtering with:
  - `--campaign-id`
  - `--adset-id`
  - `--ad-id`
  - `--status`
- improved built-in help and examples

## Why trak

- **Facebook Page management from terminal** — list Pages, read posts, check stats, schedule content
- **Rich Page post insights** — inspect one post, inspect many posts, compare posts
- **Personal post tracking** — read your own timeline posts in a simple read-only way
- **Meta Ads command line** — campaign insights, ad set performance, draft ad creation (always paused)
- **JSON output for AI agents** — pipe data into [OpenClaw](https://github.com/openclaw/openclaw), Claude Code, or any automation pipeline
- **Business Page support** — discover Pages that don't show in `/me/accounts`
- **Safe defaults** — all ad creation is paused, dry-run mode for scheduling

## Example Commands

```bash
# Rich Page post insights
trak page posts insights --limit 10

# Compare two Page posts
trak page posts compare --post PAGE_POST_A --other-post PAGE_POST_B

# Read your own personal posts
trak user posts list --limit 10

# Ads reporting
trak ads insights --level campaign --date-preset last_7d
trak ads insights --account ads1 --level campaign --date-preset last_7d
```

## Who This Is For

- **Developers** who want to manage Facebook Pages from command line
- **Marketing ops** who need quick ad performance stats without opening Ads Manager
- **AI/automation builders** who need structured social data as JSON
- **OpenClaw users** who want a social media skill for their AI agents
- **Small teams** managing Facebook Pages and ad accounts programmatically

## Features

**Facebook Page Operations:**
- List and discover Pages (personal, business-owned, client Pages)
- Read recent posts with date filtering
- Rich Page post insights and compare flow
- Post performance stats (impressions, clicks, reactions, video views, shares)
- Schedule posts (10 min to 30 days ahead) with dry-run preview

**Personal Post Operations:**
- Read your own personal timeline posts
- Fetch one personal post by id
- Keep personal-post support read-only for now

**Meta Ads Management:**
- List ad accounts and campaigns
- Ad insights — spend, impressions, reach, clicks, CTR, CPM
- Filter by level: account, campaign, ad set, or individual ad
- Create campaigns, ad sets, creatives, and ads (all paused by default)

**Developer & AI Features:**
- `--json` flag on every command for script-friendly output
- Pipe data directly to AI tools (OpenClaw, Claude Code, shell scripts)
- Local token caching — no repeated auth flows
- Single `config.toml` setup

### Current Limitations
- Post insight numbers may be incomplete for some Pages/tokens (Meta API limitation)
- Personal posts are read-only; rich personal-profile insight parity is not promised
- Image upload for creatives not built yet
- Meta only (more platforms planned)

## Install

Requirements:
- Node.js 18+
- npm
- a Meta app with the needed permissions

Clone repo, then install:

```bash
cd /Users/luannguyenthanh/Development/Osimify/trak-social-cli
npm install
npm run build
npm link
```

Now use the CLI directly:

```bash
trak --help
```

Quick health check:

```bash
trak doctor
```

## Build

Build TypeScript into the `dist/` folder:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Re-link the local CLI after changes if needed:

```bash
npm link
```

## What You Need From Meta

You need a Meta app id and app secret.

## Create A Meta App For Personal Use

If you only use `trak` for yourself or a small private team, you can usually keep the app in Development mode.

Good fit for this:
- your own personal Pages
- Pages you manage
- a small number of known users
- app users added in App Roles

Typical flow:

1. Go to `developers.facebook.com`
2. Create a new app
3. Add:
   - Facebook Login
   - Marketing API
4. In app settings, add redirect URI:

```text
http://localhost:8787/callback
```

5. Keep app in Development mode
6. Add yourself to App Roles:
   - Admin
   - or Developer
   - or Tester
7. Log in with that same Facebook account in `trak`

Important rule:
- if the app is only used by people in App Roles, you can test permissions without full app review
- if you want outside users to use the app, then review is usually needed

Practical meaning:
- for your own Pages or Pages you manage, personal/private use is much easier
- for public product use, client rollout, or many unknown users, expect review work

Common permissions used by this project:
- `pages_show_list`
- `pages_read_engagement`
- `read_insights`
- `pages_manage_posts`
- `ads_read`
- `ads_management`
- `business_management`

Important:
- some commands work only if Meta really grants the permission to your token
- some business-owned Pages do not show in `/me/accounts`
- `trak` has fallback paths for that
- even in Development mode, the Facebook account you log in with still needs real access to the target Page or business asset

## Local Files

`trak` saves local data here:

- `~/.config/trak/config.toml`
- `~/.config/trak/tokens.json`

## First-Time Setup

Preferred setup: edit one config file directly, not secrets on command line.

Reason:
- command-line secrets can end up in shell history
- config files are simpler for repeat use
- easier for AI tools and agents to inspect safely

1. Create config folder:

```bash
mkdir -p ~/.config/trak
```

Easier option:

```bash
trak config init --app-id 1493983742290842 --default-page 1548373332058326 --default-ad-account 1243158725700119
```

That creates:
- `~/.config/trak/config.toml`

Then edit `~/.config/trak/config.toml` and replace the placeholder secret:

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
main = "1548373332058326"

[aliases.ad_accounts]
ads1 = "1243158725700119"
```

Alias rule:
- keep using `--page` and `--account`
- value can be a real id or an alias from config
- if the flag is missing, `trak` falls back to `[defaults]`

You can manage aliases without editing TOML:

```bash
trak config alias list
trak config alias set --page sahaja --value 1548373332058326
trak config alias set --account ads1 --value 1243158725700119
trak config alias rename --page sahaja --to sahaja-yoga
trak config alias remove --page sahaja
```

You can copy from repo examples:

```bash
cp examples/config.example.toml ~/.config/trak/config.toml
```

4. Log in:

```bash
trak auth login
```

5. Check saved status:

```bash
trak auth status
```

6. Run setup diagnostics:

```bash
trak doctor
```

Optional:
- use `trak config set ...` for non-secret values like default page or ad account
- avoid `trak config set --app-secret ...` if you do not want secrets in shell history

## Use With AI Agents

`trak` is built for AI agent integration. Every command supports `--json` output, making it a natural data source for AI-powered social media automation.

### With OpenClaw

[OpenClaw](https://github.com/openclaw/openclaw) is an open-source AI agent platform. `trak` works as a social media data source for OpenClaw agents:

```bash
# Pull Page data → feed to OpenClaw agent
trak page posts list --limit 10 --json > posts.json
trak page posts insights --limit 10 --json > post-insights.json
trak user posts list --limit 10 --json > user-posts.json
trak ads insights --level campaign --date-preset last_7d --json > ads.json
trak ads insights --account ads1 --level campaign --date-preset last_7d --json > ads.json

# Your OpenClaw agent can then:
# - Summarize post performance trends
# - Compare Page posts
# - Inspect personal timeline posts
# - Compare ad campaign results
# - Draft content ideas based on what's working
# - Generate weekly social reports
```

### With Claude Code / Other AI Tools

```bash
# Pipe directly to any AI tool
trak page posts insights --limit 20 --json | your-ai-tool analyze
```

### AI Use Cases
- Summarize recent post performance
- Compare ad campaigns and find winners
- Draft next post ideas from top-performing content
- Detect trending themes across your Pages
- Automate weekly social media reports

## Main Usage Guide

### 1. Find your businesses

```bash
trak business list
```

### 2. Find Pages under a business

Owned Pages:

```bash
trak business pages list --business 1242778199071505 --owned
```

Owned + client Pages:

```bash
trak business pages list --business 1242778199071505
```

### 3. Resolve one Page directly

Useful when a Page does not appear in `page list`:

```bash
trak page resolve --page SahajaVietnam
trak page resolve --page main
```

This tries to:
- find the Page by id or username
- get Page info
- cache the Page token locally if Meta returns one

### 4. Set defaults

```bash
trak config set --app-id 1493983742290842 --default-page 1548373332058326 --default-ad-account 1243158725700119
```

After that, Page commands can omit `--page` in many cases.

If you manage more than one Page or ad account, add aliases in `config.toml`:

```toml
[aliases.pages]
main = "1548373332058326"

[aliases.ad_accounts]
ads1 = "1243158725700119"
```

## Common Commands

### Auth

```bash
trak auth login
trak auth status
trak auth refresh
trak auth logout
```

### Page discovery

```bash
trak page list
trak page resolve --page SahajaVietnam
trak business list
trak business pages list --business 1242778199071505 --owned
```

### Read recent posts

```bash
trak page posts list --page 1548373332058326 --limit 10
```

If default Page is set:

```bash
trak page posts list --limit 10
```

### Get one post

```bash
trak page posts get \
  --page 1548373332058326 \
  --post 1548373332058326_1220166893652739
```

### Show recent post stats

```bash
trak page posts stats --page 1548373332058326 --limit 10
```

Current fields:
- `share_count`
- `post_impressions_unique`
- `post_clicks`
- `post_reactions_like_total`
- `post_video_views`

Note:
- some Pages return blank values for several insight fields
- this is a Meta API / permission / metric availability issue, not always a CLI bug

### Show rich Page post insights

```bash
trak page posts insights \
  --page 1548373332058326 \
  --post 1548373332058326_1220166893652739

trak page posts insights \
  --limit 10 \
  --metrics post_impressions_unique,post_clicks,post_reactions_like_total

trak page posts insights \
  --limit 10 \
  --date-preset last_7d \
  --json
```

Useful metrics:
- `post_impressions`
- `post_impressions_unique`
- `post_clicks`
- `post_engaged_users`
- `post_reactions_like_total`
- `post_reactions_love_total`
- `post_reactions_wow_total`
- `post_reactions_haha_total`
- `post_reactions_sorry_total`
- `post_reactions_anger_total`
- `post_video_views`

### Compare two Page posts

```bash
trak page posts compare \
  --page 1548373332058326 \
  --post 1548373332058326_1220166893652739 \
  --other-post 1548373332058326_1220166893652740

trak page posts compare \
  --post 1548373332058326_1220166893652739 \
  --other-post 1548373332058326_1220166893652740 \
  --metrics post_clicks,post_impressions_unique \
  --json
```

### Read personal timeline posts

```bash
trak user posts list --limit 10
trak user posts list --since 2026-02-01T00:00:00Z --until 2026-02-28T23:59:59Z --json
trak user posts get --post 123456789
```

Important:
- personal posts are read-only in `trak`
- this is separate from Page posts
- do not expect full Page-like insight metrics here

### Schedule a post

```bash
trak page posts schedule \
  --page 1548373332058326 \
  --message "New update" \
  --at "2026-03-01T09:00:00+07:00" \
  --link "https://example.com"
```

Dry run first:

```bash
trak page posts schedule \
  --page 1548373332058326 \
  --message "New update" \
  --at "2026-03-01T09:00:00+07:00" \
  --dry-run
```

Schedule rule from Meta:
- minimum 10 minutes ahead
- maximum 30 days ahead

### List ad accounts

```bash
trak ads account list
```

### Read ad performance

```bash
trak ads insights \
  --account 1243158725700119 \
  --level campaign \
  --date-preset last_7d \
  --fields spend,impressions,reach,clicks,ctr,cpm
```

Filter to one campaign:

```bash
trak ads insights \
  --account 1243158725700119 \
  --level campaign \
  --campaign-id 6908777851014 \
  --date-preset today \
  --fields spend,impressions,reach,clicks,ctr,cpm,campaign_name,campaign_id
```

Filter ad-level rows inside one campaign:

```bash
trak ads insights \
  --account 1243158725700119 \
  --level ad \
  --campaign-id 6908777851014 \
  --status ACTIVE \
  --date-preset last_7d \
  --fields spend,impressions,reach,clicks,ctr,cpm,campaign_name,adset_name,ad_name
```

Supported filter flags:
- `--campaign-id`
- `--adset-id`
- `--ad-id`
- `--status`

These are translated into Meta Insights `filtering` under the hood.

### Check local setup health

```bash
trak doctor
```

JSON version:

```bash
trak doctor --json
```

Live Meta checks:

```bash
trak doctor --live
trak doctor --live --page 1548373332058326
trak doctor --live --account 1243158725700119
```

### List campaigns

```bash
trak ads campaigns list --account 1243158725700119
```

### Create paused campaign

```bash
trak ads create campaign \
  --account 1243158725700119 \
  --name "Traffic test" \
  --objective OUTCOME_TRAFFIC
```

### Create paused ad set

```bash
trak ads create adset \
  --account 1243158725700119 \
  --campaign 123 \
  --name "VN ad set" \
  --daily-budget 200000 \
  --billing-event IMPRESSIONS \
  --optimization-goal LINK_CLICKS \
  --targeting-file ./targeting.json
```

Example `targeting.json`:

```json
{
  "geo_locations": {
    "countries": ["VN"]
  },
  "age_min": 21,
  "age_max": 55
}
```

### Create creative

```bash
trak ads create creative \
  --account 1243158725700119 \
  --name "Creative 1" \
  --page 1548373332058326 \
  --message "Check this out" \
  --link "https://example.com"
```

### Create paused ad

```bash
trak ads create ad \
  --account 1243158725700119 \
  --adset 123 \
  --creative 456 \
  --name "Ad 1"
```

## Use Cases

### Use case: business-owned Page does not show in Page list

Try this order:

```bash
trak business list
trak business pages list --business YOUR_BUSINESS_ID --owned
trak page resolve --page YOUR_PAGE_USERNAME
```

### Use case: quick check of latest Page activity

```bash
trak page posts list --limit 10
trak page posts insights --limit 10
trak page posts compare --post PAGE_POST_A --other-post PAGE_POST_B
```

### Use case: review your own personal posts

```bash
trak user posts list --limit 10
trak user posts get --post PERSONAL_POST_ID
```

### Use case: feed data into OpenClaw or another AI tool

```bash
trak page posts list --limit 10 --json > posts.json
trak page posts insights --limit 10 --json > post-insights.json
trak user posts list --limit 10 --json > user-posts.json
trak ads insights --account 1243158725700119 --level campaign --date-preset last_7d --json > ads.json
```

Then give those files to your AI workflow for:
- summary
- trend finding
- content planning
- weekly reporting

### Use case: safe ad creation flow

```bash
trak ads create campaign ...
trak ads create adset ...
trak ads create creative ...
trak ads create ad ...
```

All ad creation commands default to paused resources.

## Output Modes

Default output is table-like text.

For JSON:

```bash
trak page posts list --limit 5 --json
```

## Troubleshooting

### Page missing from `page list`

Try:
- `business pages list`
- `page resolve`
- fresh `auth login`

### Permission error

Usually means one of these:
- permission not added in Meta app
- permission not granted to current token
- app review / feature access still missing
- current Facebook user does not have the needed Page access

### Blank post insight numbers

This can happen even when the metric name is accepted.

Possible reasons:
- Meta does not expose that metric for this Page / post / token
- the post type is event or reel
- the current token path does not get the richer insight values

### Personal app works, but outside users cannot use it

That usually means:
- the app is still in Development mode
- the outside user is not in App Roles
- the app has not passed review for the required permissions

## Developer Notes

- current API version: `v25.0`
- Page reads use `/posts`
- Page token fallback supports:
  - `/me/accounts`
  - direct Page lookup
  - business-owned Pages
- local config now uses `~/.config/trak`
- repo examples:
  - `examples/config.example.toml`

## Agent Skill

The `skill/` folder contains an agent skill definition (`SKILL.md`) so AI coding agents (OpenClaw, Claude Code) know how to use `trak`. It includes full command reference, common workflows, and trigger conditions.

To enable: symlink `skill/` into your agent's skills directory.

## Alternatives

| Tool | Status | Notes |
|------|--------|-------|
| fbcmd | Abandoned | PHP, years old |
| facebook-cli (specious) | Abandoned | "needs updating" |
| facebook-cli (npm) | Abandoned | 12 years old |
| Postiz Agent | Active | Generalist (30+ platforms), less Meta depth |
| Meta Ads MCP servers | Active | Only work inside AI chat, not standalone |
| Hootsuite / Buffer | Active | Web-based, not CLI, not free |

`trak` is the only **actively maintained, dedicated Facebook/Meta CLI tool**.

## Roadmap

Planned next:
- Richer post metrics
- Token refresh helper
- Stronger permission diagnostics
- Image/video upload for creatives
- More platforms beyond Meta (Threads, Instagram)
