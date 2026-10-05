# opencode-tokscale

A [opencode](https://opencode.ai) TUI sidebar plugin for [tokscale](https://github.com/junhoyeo/tokscale). Shows token usage and costs for today, this week, and this month.

```
Tokscale
Today        1.2M    $3.45
This Week    5.6M   $12.34
This Month  12.3M   $45.67
```

## Install

Paste this into your LLM agent (Claude Code, opencode, Cursor, etc.):

```
Install and configure opencode-tokscale by following the instructions here:
https://raw.githubusercontent.com/stevejkang/opencode-tokscale/refs/heads/main/docs/installation.md
```

### Prerequisites

[tokscale](https://github.com/junhoyeo/tokscale) must be installed:

```bash
npm i -g @tokscale/cli
```

A global install is recommended but not required. If `tokscale` isn't in PATH (or its `--version` fails), the plugin falls back to `bunx tokscale@latest`, then `npx -y tokscale@latest`. If none of them work, it shows an install prompt instead of stats.

### Setup

One config file. Restart. Done. The same package works on opencode v1 and v2; only the config file differs.

**opencode v1** — `~/.config/opencode/tui.json`

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["opencode-tokscale", { "enabled": true }]]
}
```

**opencode v2** — `~/.config/opencode/cli.json`

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [{ "package": "opencode-tokscale", "options": {} }]
}
```

opencode resolves the npm package on startup automatically.

### Options

Shown in opencode v1 form. On opencode v2, put the same object (without `enabled`) under `options` of the `cli.json` entry.

```json
{
  "plugin": [["opencode-tokscale", {
    "enabled": true,
    "refreshInterval": 60,
    "showOpenCodeOnly": true,
    "tokenColor": "#FF5733",
    "costColor": "#AAAAAA",
    "labelColor": "#FFFFFF"
  }]]
}
```

| Option | Default | Description |
|---|---|---|
| `refreshInterval` | `60` | Seconds between data refreshes |
| `showOpenCodeOnly` | `true` | Show only opencode usage. Set `false` for all clients. Automatically uses `-c opencode` on tokscale v4+ or `--opencode` on v3 |
| `tokenColor` | `#0073FF` | Color of the "Tokscale" title and token count values |
| `costColor` | theme muted | Color of cost values (e.g., `$0.00`) and placeholder states (`...`, `err`, `—`) |
| `labelColor` | theme primary | Color of time period labels (e.g., "Today", "This Week") |

## How It Works

Shells out to `tokscale models --json` with `--today`, `--week`, and `--month` flags. Parses the JSON. Renders totals in the sidebar. Detects the installed tokscale version at startup and uses the matching client filter flag (`-c opencode` on v4+, `--opencode` on v3).

```
setInterval(60s) → tokscale models --json --today -c opencode --no-spinner → parse → render
                 → tokscale models --json --week  -c opencode --no-spinner → parse → render
                 → tokscale models --json --month -c opencode --no-spinner → parse → render
```

Three parallel CLI calls per refresh. tokscale processes in ~175ms thanks to its Rust core, so the sidebar stays snappy.

## Features

|   | What | Why it matters |
|:---:|---|---|
| ⏱ | **Auto-refresh** | Configurable interval, default 60 seconds |
| 🛡 | **Graceful fallback** | No global tokscale? Runs it via `bunx`/`npx`, or shows install instructions if neither works |

## Requirements

- [opencode](https://opencode.ai) v1 with plugin support (`@opencode-ai/plugin` >= 1.4.3), or opencode v2 (`@opencode/plugin` >= 2.0.20)
- [tokscale](https://github.com/junhoyeo/tokscale) CLI in PATH, or `bunx`/`npx` available to run it

## Manual Install

Skip npm. Copy the source files directly:

```bash
mkdir -p ~/.config/opencode/plugins/opencode-tokscale
cp src/tui.tsx src/tokscale.ts src/format.ts src/types.ts \
  ~/.config/opencode/plugins/opencode-tokscale/
```

Register the local path (opencode v1):

```json
{
  "plugin": [["./plugins/opencode-tokscale/tui.tsx", { "enabled": true }]]
}
```

On opencode v2, point `cli.json` at a clone of this repository, which exposes a root `tui.ts`:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [{ "package": "/path/to/opencode-tokscale", "options": {} }]
}
```

## Development

```bash
git clone https://github.com/stevejkang/opencode-tokscale.git
cd opencode-tokscale
bun install
```

Run tests:

```bash
bun run test
```

Edit, restart opencode, see changes live.

## License

MIT
