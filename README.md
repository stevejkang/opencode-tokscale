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

If tokscale isn't found, the plugin shows an install prompt instead of stats.

### Setup

One config file. Restart. Done.

**`~/.config/opencode/tui.json`**

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["opencode-tokscale", { "enabled": true }]]
}
```

opencode resolves the npm package on startup automatically.

### Options

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
| `showOpenCodeOnly` | `true` | Show only opencode usage (`--opencode` flag). Set `false` for all clients |
| `tokenColor` | `#0073FF` | Color of the "Tokscale" title and token count values |
| `costColor` | theme muted | Color of cost values (e.g., `$0.00`) and placeholder states (`...`, `err`, `—`) |
| `labelColor` | theme primary | Color of time period labels (e.g., "Today", "This Week") |

## How It Works

Shells out to `tokscale models --json` with `--today`, `--week`, and `--month` flags. Parses the JSON. Renders totals in the sidebar.

```
setInterval(60s) → tokscale models --json --today --opencode --no-spinner → parse → render
                 → tokscale models --json --week  --opencode --no-spinner → parse → render
                 → tokscale models --json --month --opencode --no-spinner → parse → render
```

Three parallel CLI calls per refresh. tokscale processes in ~175ms thanks to its Rust core, so the sidebar stays snappy.

## Features

|   | What | Why it matters |
|:---:|---|---|
| ⏱ | **Auto-refresh** | Configurable interval, default 60 seconds |
| 🛡 | **Graceful fallback** | No tokscale? Shows install instructions instead of crashing |

## Requirements

- [opencode](https://opencode.ai) with plugin support (`@opencode-ai/plugin` >= 1.4.3)
- [tokscale](https://github.com/junhoyeo/tokscale) CLI installed and in PATH

## Manual Install

Skip npm. Copy the source files directly:

```bash
mkdir -p ~/.config/opencode/plugins/opencode-tokscale
cp src/tui.tsx src/tokscale.ts src/format.ts src/types.ts \
  ~/.config/opencode/plugins/opencode-tokscale/
```

Register the local path:

```json
{
  "plugin": [["./plugins/opencode-tokscale/tui.tsx", { "enabled": true }]]
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
