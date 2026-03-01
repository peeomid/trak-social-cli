# trak

Repo: `/Users/luannguyenthanh/Development/Osimify/trak-social-cli`

## What This Is

Terminal CLI for:
- Facebook Page discovery
- Facebook Page post reads, rich insights, compare, and scheduling
- personal Facebook post reads
- Meta Ads insights
- paused draft ad creation
- JSON output for AI workflows like OpenClaw

CLI name:
- `trak`

## Quick Start

Preferred setup:
1. `trak config init --app-id 1493983742290842 --default-page 1548373332058326 --default-ad-account 1243158725700119`
2. Edit `~/.config/trak/config.toml`
3. `trak auth login`
4. `trak auth status`
5. `trak doctor`
6. `trak doctor --live`

## Important Paths

- README: `/Users/luannguyenthanh/Development/Osimify/trak-social-cli/README.md`
- skill doc: `/Users/luannguyenthanh/Development/Osimify/trak-social-cli/skill/SKILL.md`
- config example: `/Users/luannguyenthanh/Development/Osimify/trak-social-cli/examples/config.example.toml`

Local runtime files:
- `~/.config/trak/config.toml`
- `~/.config/trak/tokens.json`

## Current Feature Set

- `auth login|status|refresh|logout`
- `config init|show|set`
- `config alias list|set|remove|rename`
- `page list|resolve`
- `page posts list|get|stats|insights|compare|schedule`
- `user posts list|get`
- `business list`
- `business pages list`
- `ads account list`
- `ads campaigns list`
- `ads insights` with filters:
  - `--campaign-id`
  - `--adset-id`
  - `--ad-id`
  - `--status`
- `doctor --live` for Meta token / permission / Page / ads access checks
- `ads create campaign|adset|creative|ad`

## Safety / Conventions

- Prefer file-based config over passing secrets on command line
- Avoid `trak config set --app-secret ...` unless explicitly needed
- Use `trak config alias ...` for named Page / ad account shortcuts
- Ad creation stays paused by default
- Use `--json` for AI or automation workflows
- Page post performance needs Meta `read_insights`

## Verification

Common checks:

```bash
npm run build
npm test
trak --help
trak auth status
trak doctor
trak doctor --live
trak auth refresh
trak page posts --help
trak user posts --help
trak ads insights --help
```
