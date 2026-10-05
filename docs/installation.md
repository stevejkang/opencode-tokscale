# opencode-tokscale Installation Guide

> This guide is designed for LLM agents to follow step-by-step. Each step includes expected outcomes for verification.

## What is opencode-tokscale?

An opencode TUI plugin that displays [tokscale](https://github.com/junhoyeo/tokscale) token usage statistics in the sidebar. Shows total tokens and costs for today, this week, and this month.

## Prerequisites

- [opencode](https://opencode.ai) installed and working
- opencode v1 (`@opencode-ai/plugin` >= 1.4.3) or opencode v2 (>= 2.0.20)
- [tokscale](https://github.com/junhoyeo/tokscale) CLI installed and in PATH

### Check tokscale

```bash
tokscale --version
```

If not installed:

```bash
npm i -g @tokscale/cli
```

## Step 0: Detect the opencode major version

Run `opencode --version`.

- Output like `1.18.34` → follow **Step 1 (opencode v1)**.
- Output like `opencode v2.0.23` → follow **Step 1 (opencode v2)**.

## Step 1 (opencode v2): Configure the CLI plugin

Edit `~/.config/opencode/cli.json`. Create the file if it doesn't exist. Do not edit `tui.json` on opencode v2; it is no longer read.

Add `{ "package": "opencode-tokscale", "options": {} }` to the `plugins` array, appending to any existing entries:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    { "package": "opencode-tokscale", "options": {} }
  ]
}
```

Skip Step 1 (opencode v1) and continue at **Options** to customize the plugin, or at **Step 2** to keep the defaults.

## Step 1 (opencode v1): Configure the TUI plugin

Edit `~/.config/opencode/tui.json`. Create the file if it doesn't exist.

Add `["opencode-tokscale", { "enabled": true }]` to the `plugin` array:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    ["opencode-tokscale", { "enabled": true }]
  ]
}
```

**If the file already exists with other plugins**, append to the existing array. Do not replace existing entries:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    ["existing-plugin", { "enabled": true }],
    ["opencode-tokscale", { "enabled": true }]
  ]
}
```

## Options

All options are optional, and the option names and values are the same on opencode v1 and v2. Only the surrounding entry differs. Defaults shown:

**opencode v2** — inside the entry's `options` object in `~/.config/opencode/cli.json`:

```json
{ "package": "opencode-tokscale", "options": {
  "refreshInterval": 60,
  "showOpenCodeOnly": true
} }
```

**opencode v1** — as the second element of the plugin tuple in `~/.config/opencode/tui.json`:

```json
["opencode-tokscale", {
  "enabled": true,
  "refreshInterval": 60,
  "showOpenCodeOnly": true
}]
```

`enabled` is an opencode v1 plugin toggle, not a plugin option; do not add it on opencode v2.

| Option | Type | Default | Description |
|---|---|---|---|
| `refreshInterval` | `number` | `60` | Seconds between data refreshes |
| `showOpenCodeOnly` | `boolean` | `true` | Only count opencode usage. Set `false` for all AI clients |

## Step 2: Restart opencode

The plugin loads at startup. Restart opencode to activate.

## Verification

After restart, the sidebar should show a "Tokscale" section near the top with three time period rows:

```
Tokscale
Today        1.2M    $3.45
This Week    5.6M   $12.34
This Month  12.3M   $45.67
```

If tokscale is not installed, you will see:

```
Tokscale
Install: npm i -g @tokscale/cli
```

If there is no usage data yet, values show as `—`.

## Troubleshooting

- **Plugin not showing**: Verify the plugin entry exists in `~/.config/opencode/tui.json` (opencode v1) or `~/.config/opencode/cli.json` (opencode v2). On opencode v2, `opencode plugin list` should list it. Restart opencode after editing. The sidebar renders only after the first message.
- **"Install: npm i -g @tokscale/cli" message**: tokscale binary is not found in PATH. Run `npm i -g @tokscale/cli` and restart opencode.
- **All values show $0.00**: tokscale has no session data to scan. Use opencode for a while, then check again.
- **Data not updating**: Default refresh is 60 seconds. Wait or lower `refreshInterval` in options.
- **Shows data from other clients**: Set `"showOpenCodeOnly": true` (default) to filter to opencode sessions only.

## Uninstall

1. Remove the `opencode-tokscale` entry from `~/.config/opencode/tui.json` (opencode v1) or `~/.config/opencode/cli.json` (opencode v2)
2. Restart opencode
3. Optionally delete opencode's downloaded copy of the package:
   - opencode v1: `rm -rf ~/.cache/opencode/packages/opencode-tokscale@*`
   - opencode v2: `rm -rf ~/.cache/opencode/npm/opencode-tokscale@*`

   Do not delete `~/.cache/opencode/` itself; it also holds other plugins and model data.
