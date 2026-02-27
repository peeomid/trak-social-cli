# trak

`trak` is a local command-line tool for social publishing and marketing ops.

Today, it works with Meta first:
- read Facebook Page posts
- schedule Facebook Page posts
- read ads performance
- create ads in paused state
- discover Pages from personal access, business access, or direct Page lookup
- export clean JSON that can be fed into AI tools and agents

The name is neutral on purpose, so the tool can grow later to support more platforms like Threads.

## Who This Is For

Use `trak` if you want to:
- manage social Pages from terminal
- check ad performance quickly
- schedule posts without opening many browser tabs
- work with business-owned Pages that do not always appear in `/me/accounts`
- pull social data into AI workflows like OpenClaw

## Current Scope

What works now:
- Meta browser login
- local token storage
- Page discovery
- Page post list / get / basic recent post stats
- Page post scheduling
- ad account list
- ad insights
- paused campaign / ad set / creative / ad creation

What is still limited:
- post insight numbers are incomplete for some Pages / tokens
- image upload flow for creatives is not built yet
- only Meta is implemented right now

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

- `~/.config/trak/config.json`
- `~/.config/trak/tokens.json`
- `~/.config/trak/secrets.json`

Backward compatibility:
- if those files do not exist yet, `trak` can still read the older `~/.config/meta-cli/*` files

## First-Time Setup

1. Save app id:

```bash
trak config set --app-id 1493983742290842
```

2. Save app secret locally:

```bash
trak config set --app-id 1493983742290842 --app-secret 'YOUR_APP_SECRET'
```

You can also use env instead:

```bash
export META_APP_SECRET='YOUR_APP_SECRET'
```

3. Log in:

```bash
trak auth login
```

4. Check saved status:

```bash
trak auth status
```

## Use With AI

`trak` is useful as a data source for AI tools.

Why:
- commands can return JSON
- output is simple and script-friendly
- you can pipe data into other tools

Example with plain shell:

```bash
trak page posts list --limit 5 --json > recent-posts.json
```

Example idea with OpenClaw:
- use `trak` to pull Page posts or ad stats
- pass the JSON to an OpenClaw agent
- ask the agent to summarize results, find trends, or suggest new content

Good AI use cases:
- summarize recent post performance
- compare ad campaign results
- draft next post ideas based on recent content
- detect which themes show up often
- prepare weekly social reports

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
```

This tries to:
- find the Page by id or username
- get Page info
- cache the Page token locally if Meta returns one

### 4. Set defaults

```bash
trak config set \
  --app-id 1493983742290842 \
  --default-page 1548373332058326 \
  --default-ad-account 1243158725700119
```

After that, Page commands can omit `--page` in many cases.

## Common Commands

### Auth

```bash
trak auth login
trak auth status
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
trak page posts stats --limit 10
```

### Use case: feed data into OpenClaw or another AI tool

```bash
trak page posts list --limit 10 --json > posts.json
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
- older `~/.config/meta-cli` files are still read as fallback

## Roadmap

Planned next:
- richer post metrics
- token refresh helper
- stronger permission diagnostics
- image/video upload for creatives
- later: more platforms beyond Meta
