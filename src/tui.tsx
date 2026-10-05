/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule, TuiSlotContext } from "@opencode-ai/plugin/tui"
import type { Plugin as V2Plugin } from "@opencode/plugin/tui"
import type { ColorInput } from "@opentui/core"
import { createSignal } from "solid-js"
import type { TimePeriod, PeriodState, TokscalePluginOptions } from "./types"
import { TIME_PERIODS, PERIOD_LABELS } from "./types"
import { formatTokens, formatCost } from "./format"
import { detectTokscale, fetchPeriodStats, TokscaleNotFoundError } from "./tokscale"

const TOKSCALE_BLUE = "#0073FF"

function startTokscale(rawOptions: unknown) {
  const options = (rawOptions as TokscalePluginOptions | undefined) ?? {}
  const refreshInterval = (options.refreshInterval ?? 60) * 1000
  const showOpenCodeOnly = options.showOpenCodeOnly ?? true
  const tokenColor = options.tokenColor ?? TOKSCALE_BLUE
  const customCostColor = options.costColor
  const customLabelColor = options.labelColor

  const signals: Record<TimePeriod, [() => PeriodState, (s: PeriodState) => void]> = {} as Record<TimePeriod, [() => PeriodState, (s: PeriodState) => void]>
  for (const period of TIME_PERIODS) {
    signals[period] = createSignal<PeriodState>({ status: "idle", stats: null, error: null })
  }

  const [installed, setInstalled] = createSignal<boolean | null>(null)

  let refreshing = false
  async function refresh() {
    if (refreshing) return
    refreshing = true
    try {
      const isInstalled = await detectTokscale()
      setInstalled(isInstalled)
      if (!isInstalled) {
        for (const period of TIME_PERIODS) {
          signals[period][1]({ status: "not-installed", stats: null, error: null })
        }
        return
      }
      await Promise.allSettled(
        TIME_PERIODS.map(async (period) => {
          const setState = signals[period][1]
          setState({ status: "loading", stats: signals[period][0]().stats, error: null })
          try {
            const stats = await fetchPeriodStats(period, {
              openCodeOnly: showOpenCodeOnly,
            })
            setState({ status: "success", stats, error: null })
          } catch (e) {
            if (e instanceof TokscaleNotFoundError) {
              setInstalled(false)
              for (const p of TIME_PERIODS) {
                signals[p][1]({ status: "not-installed", stats: null, error: null })
              }
              return
            }
            setState({ status: "error", stats: signals[period][0]().stats, error: String(e) })
          }
        })
      )
    } finally {
      refreshing = false
    }
  }

  refresh()

  const timer = setInterval(refresh, refreshInterval)
  const dispose = () => clearInterval(timer)

  const renderSidebar = (themeText: ColorInput | undefined, themeMuted: ColorInput | undefined) => {
    const dim = customCostColor ?? themeMuted ?? "#546E7A"
    const fgColor = customLabelColor ?? themeText ?? "#EEFFFF"

    return (
      <box flexDirection="column">
        <box height={1}>
          <text fg={tokenColor}><b>{"Tokscale"}</b></text>
        </box>

        {installed() === false ? (
          <box height={1}>
            <text fg={dim}>{"Install: npm i -g @tokscale/cli"}</text>
          </box>
        ) : (
          TIME_PERIODS.map((period) => {
            const state = signals[period][0]()
            const label = PERIOD_LABELS[period]
            return (
              <box height={1} flexDirection="row">
                <text fg={fgColor}>{`${label.padEnd(12)}`}</text>
                {state.status === "loading" && !state.stats ? (
                  <text fg={dim}>{"..."}</text>
                ) : state.status === "error" && !state.stats ? (
                  <text fg={dim}>{"err"}</text>
                ) : state.stats ? (
                  <>
                    <text fg={tokenColor}>{`${formatTokens(state.stats.totalTokens).padStart(7)}`}</text>
                    <text fg={dim}>{` ${formatCost(state.stats.totalCost).padStart(9)}`}</text>
                  </>
                ) : (
                  <text fg={dim}>{"—"}</text>
                )}
              </box>
            )
          })
        )}
      </box>
    )
  }

  return { renderSidebar, dispose }
}

const tui: TuiPlugin = async (api, options, _meta) => {
  const tokscale = startTokscale(options)
  api.lifecycle.onDispose(tokscale.dispose)

  api.slots.register({
    order: 50,
    slots: {
      sidebar_content(ctx: TuiSlotContext, _props: unknown) {
        const t = ctx.theme.current
        return tokscale.renderSidebar(t.text, t.textMuted) as any
      },
    },
  })
}

const setup = (ctx: V2Plugin.Context) => {
  const tokscale = startTokscale(ctx.options)
  ctx.ui.slot({
    append: "sidebar.content",
    render: () => tokscale.renderSidebar(ctx.theme.text.base, ctx.theme.text.muted),
  })
  return tokscale.dispose
}

/**
 * Serves both OpenCode hosts from one module: V1 calls `tui`, V2 calls `setup`.
 */
const plugin: TuiPluginModule & V2Plugin.Definition = {
  id: "opencode-tokscale",
  tui,
  setup,
}

export default plugin
