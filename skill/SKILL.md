---
name: trak
description: Manage Facebook Pages, rich Page post insights, personal post reads, ad performance, and draft ads using the trak CLI. Use when asked to check Facebook Page posts, compare Page posts, inspect personal Facebook posts, schedule a Facebook post, view ad insights, list ad campaigns, create ads, discover business Pages, or pull social data as JSON for AI workflows.
version: 1.0.0
---

# trak — Facebook & Meta Ads CLI

CLI tool at `/Users/luannguyenthanh/Development/Osimify/trak-social-cli/` for managing Meta/Facebook Pages and Ads from terminal.

## When to Use

- User asks to check Facebook Page posts or post performance
- User asks to compare two Facebook Page posts
- User asks to inspect their own personal Facebook posts
- User asks to schedule a Facebook post
- User asks for ad performance stats (spend, clicks, impressions, CTR)
- User asks to list ad campaigns or ad accounts
- User asks to create a campaign, ad set, creative, or ad
- User asks to find or discover Facebook Pages (including business-owned)
- User asks to pull social media data as JSON for AI analysis
- User asks to compare post or ad performance
- User asks for weekly social report data

## Setup

Already installed. Binary: `trak`

Config location: `~/.config/trak/`

Preferred config method:
- run `trak config init` first
- edit `~/.config/trak/config.toml`
- do not put app secrets on the command line unless the user explicitly wants that

Repo examples:
- `/Users/luannguyenthanh/Development/Osimify/trak-social-cli/examples/config.example.toml`

Check status:
```bash
trak doctor
trak doctor --live
trak auth status
trak auth refresh
trak config show
trak config alias list
```

## Commands Reference

### Auth
```bash
trak auth login          # Browser-based Meta login
trak auth status         # Check token status
trak auth refresh        # Re-check token, try refresh, rebuild Page tokens
trak auth logout         # Clear tokens
```

Important:
- `trak auth login` requests Page + ads permissions including `read_insights`
- it does not request the invalid `user_posts` login scope
- if Page post performance comes back blank, run `trak doctor --live` and check for missing `read_insights`

### Auth Diagnostics
```bash
trak doctor                                  # Local config + token checks
trak doctor --live                           # Ask Meta for live auth health
trak doctor --live --page PAGE_ID            # Validate one Page
trak doctor --live --account AD_ACCOUNT_ID   # Validate one ad account
```

Use these when:
- token may be expired or revoked
- permissions look wrong
- Page works but ads do not
- ads work but Page does not

### Page Discovery
```bash
trak page list                                           # List accessible Pages
trak page resolve --page SahajaVietnam                   # Resolve Page by username or ID
trak business list                                       # List businesses
trak business pages list --business BUSINESS_ID --owned  # Business-owned Pages
trak business pages list --business BUSINESS_ID          # All business Pages (owned + client)
```

### Page Posts
```bash
trak page posts list --limit 10                          # Recent posts (uses default Page)
trak page posts list --page PAGE_ID --limit 10           # Specific Page
trak page posts list --page sahaja --limit 10            # Alias also works
trak page posts list --limit 10 --json                   # JSON output for AI
trak page posts get --page PAGE_ID --post POST_ID        # Single post details
trak page posts stats --limit 10                         # Post performance stats
trak page posts stats --page PAGE_ID --limit 20 --json   # Stats as JSON
trak page posts insights --post POST_ID                  # Rich insights for one post
trak page posts insights --limit 10 --json               # Rich insights for recent posts
trak page posts compare --post POST_A --other-post POST_B
```

Stats fields: share_count, post_impressions_unique, post_clicks, post_reactions_like_total, post_video_views

Useful Page insight metrics:
- post_impressions
- post_impressions_unique
- post_clicks
- post_engaged_users
- post_reactions_like_total
- post_reactions_love_total
- post_reactions_wow_total
- post_reactions_haha_total
- post_reactions_sorry_total
- post_reactions_anger_total
- post_video_views

### Personal Posts
```bash
trak user posts list --limit 10
trak user posts list --since 2026-02-01T00:00:00Z --until 2026-02-28T23:59:59Z --json
trak user posts get --post POST_ID
```

Important:
- read-only only
- for personal profile posts, not Page posts
- do not promise full Page-like insight metrics here

### Schedule Posts
```bash
trak page posts schedule \
  --page PAGE_ID \
  --message "Post text" \
  --at "2026-03-01T09:00:00+07:00" \
  --link "https://example.com"

# Dry run first (preview, no actual post)
trak page posts schedule \
  --page PAGE_ID \
  --message "Post text" \
  --at "2026-03-01T09:00:00+07:00" \
  --dry-run
```

Rules: min 10 minutes ahead, max 30 days ahead.

### Ad Accounts
```bash
trak ads account list                                    # List ad accounts
```

### Ad Insights
```bash
trak ads insights \
  --account AD_ACCOUNT_ID \
  --level campaign \
  --date-preset last_7d \
  --fields spend,impressions,reach,clicks,ctr,cpm

# Default ad account also works
trak ads insights \
  --level campaign \
  --date-preset last_7d

# Alias also works
trak ads insights \
  --account luan \
  --level campaign \
  --date-preset last_7d

# Filter to one campaign
trak ads insights \
  --account AD_ACCOUNT_ID \
  --level campaign \
  --campaign-id CAMPAIGN_ID \
  --date-preset today

# Filter ad rows inside one campaign
trak ads insights \
  --account AD_ACCOUNT_ID \
  --level ad \
  --campaign-id CAMPAIGN_ID \
  --status ACTIVE \
  --date-preset last_7d \
  --json

# JSON for AI analysis
trak ads insights \
  --account AD_ACCOUNT_ID \
  --level campaign \
  --date-preset last_7d \
  --json
```

Levels: account, campaign, adset, ad
Date presets: today, yesterday, last_7d, last_14d, last_30d, this_month, last_month

### List Campaigns
```bash
trak ads campaigns list --account AD_ACCOUNT_ID
```

### Create Ads (all created PAUSED)
```bash
# Campaign
trak ads create campaign \
  --account AD_ACCOUNT_ID \
  --name "Campaign name" \
  --objective OUTCOME_TRAFFIC

# Ad Set
trak ads create adset \
  --account AD_ACCOUNT_ID \
  --campaign CAMPAIGN_ID \
  --name "Ad set name" \
  --daily-budget 200000 \
  --billing-event IMPRESSIONS \
  --optimization-goal LINK_CLICKS \
  --targeting-file ./targeting.json

# Creative
trak ads create creative \
  --account AD_ACCOUNT_ID \
  --name "Creative name" \
  --page PAGE_ID \
  --message "Ad copy" \
  --link "https://example.com"

# Ad
trak ads create ad \
  --account AD_ACCOUNT_ID \
  --adset ADSET_ID \
  --creative CREATIVE_ID \
  --name "Ad name"
```

### Config
```bash
trak config init
trak doctor
trak doctor --live
trak config show
trak config set --app-id APP_ID
trak config set --default-page PAGE_ID
trak config set --default-ad-account AD_ACCOUNT_ID
trak config alias list
trak config alias set --page sahaja --value PAGE_ID
trak config alias set --account luan --value AD_ACCOUNT_ID
trak config alias rename --page sahaja --to sahaja-yoga
trak config alias remove --account luan
```

Preferred:
- edit `~/.config/trak/config.toml`

Avoid:
- `trak config set --app-secret ...`
Reason: shell history may log the secret.

## JSON Output

Add `--json` to any command for machine-readable output:
```bash
trak page posts list --limit 5 --json
trak ads insights --account 123 --level campaign --date-preset last_7d --json
```

## Common Workflows

### Quick performance check
```bash
trak page posts insights --limit 10
trak page posts insights --page sahaja --limit 10
trak page posts compare --post PAGE_POST_A --other-post PAGE_POST_B
trak ads insights --account luan --level campaign --date-preset last_7d
```

### Check personal timeline posts
```bash
trak user posts list --limit 10
trak user posts get --post POST_ID
```

### Fix auth problems
```bash
trak auth status
trak doctor --live
trak auth refresh
```

If `trak doctor --live` shows missing permissions:
- run `trak auth login` again
- approve the missing permissions in Meta
- run `trak doctor --live` again

If Page post performance returns `null` for all metrics:
- check `trak doctor --live --page PAGE_ID`
- most common cause: missing `read_insights`
- after re-login, rerun `trak page posts insights ...`

### Pull data for AI analysis
```bash
trak page posts list --limit 20 --json > posts.json
trak page posts insights --limit 20 --json > post-insights.json
trak user posts list --limit 20 --json > user-posts.json
trak ads insights --account 123 --level campaign --date-preset last_30d --json > ads.json
```

### Find a Page that doesn't appear in page list
```bash
trak business list
trak business pages list --business BUSINESS_ID --owned
trak page resolve --page PAGE_USERNAME
```

## Known Limitations

- Some Pages return blank values for insight fields (Meta API limitation, not a CLI bug)
- Personal posts are read-only and do not promise Page-like insights
- Image upload for ad creatives not built yet
- Only Meta/Facebook supported (more platforms planned)
