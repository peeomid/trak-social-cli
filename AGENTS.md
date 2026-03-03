# trak

Repo: `/Users/luannguyenthanh/Development/Osimify/trak-social-cli`

## What This Is

`trak` is a multi-source tracking CLI.

Main public tree:
- `source`
- `account`
- `content`
- `campaign`
- `report`
- `publish`

Provider trees:
- `facebook`
- `instagram`
- `threads`
- `ga`

Current state:
- Facebook implemented
- Instagram/Threads/GA reserved, not implemented yet

## Quick Start

1. `trak config init --app-id 1493983742290842 --default-page 1548373332058326 --default-ad-account 1243158725700119`
2. Edit `~/.config/trak/config.toml`
3. `trak auth login`
4. `trak doctor --live`
5. `trak account list --source facebook`
6. `trak content list --source facebook --account sahaja --limit 5`
7. `trak campaign stats --source facebook --account luan --date-preset last_7d`

## Important Paths

- README: `/Users/luannguyenthanh/Development/Osimify/trak-social-cli/README.md`
- skill doc: `/Users/luannguyenthanh/Development/Osimify/trak-social-cli/skill/SKILL.md`
- config example: `/Users/luannguyenthanh/Development/Osimify/trak-social-cli/examples/config.example.toml`

Runtime files:
- `~/.config/trak/config.toml`
- `~/.config/trak/tokens.json`

## Current Feature Set

- `auth login|status|refresh|logout`
- `source list|capabilities|status`
- `account list|get|use`
- `content list|get|stats|compare`
- `campaign list|stats|get`
- `campaign ad list`
- `report daily|weekly|summary|top-content`
- `publish preview|schedule`
- `config init|show|set`
- `config alias list|set|remove|rename`
- `doctor --live`
- `facebook page ...`
- `facebook user ...`
- `facebook ads ...`
- `facebook business ...`

## Safety / Conventions

- Prefer main task-first tree for common jobs
- Use `facebook ...` tree for provider-only commands
- Prefer file config over secrets on command line
- Use aliases for Page and ad account shortcuts
- Ad creation stays paused by default
- Use `--json` for AI workflows
- Page performance needs Meta `read_insights`

## Verification

```bash
npm run build
npm test
trak --help
trak source list
trak account list --source facebook
trak content stats --source facebook --account sahaja --limit 5
trak facebook page posts --help
trak facebook ads insights --help
```
