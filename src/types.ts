export interface ModelUsageJson {
  client: string
  mergedClients: string | null
  workspaceKey?: string | null
  workspaceLabel?: string
  model: string
  provider: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
  messageCount: number
  cost: number
}

export interface ModelReportJson {
  groupBy: string
  entries: ModelUsageJson[]
  totalInput: number
  totalOutput: number
  totalCacheRead: number
  totalCacheWrite: number
  totalMessages: number
  totalCost: number
  processingTimeMs: number
}

export type TimePeriod = "today" | "week" | "month"

export interface PeriodStats {
  totalTokens: number
  totalCost: number
  totalMessages: number
  fetchedAt: number
}

export type TokscaleStatus = "idle" | "loading" | "success" | "error" | "not-installed"

export interface PeriodState {
  status: TokscaleStatus
  stats: PeriodStats | null
  error: string | null
}

export interface TokscalePluginOptions {
  refreshInterval?: number
  showOpenCodeOnly?: boolean
  tokenColor?: string
  costColor?: string
  labelColor?: string
}

export const PERIOD_FLAGS: Record<TimePeriod, string> = {
  today: "--today",
  week: "--week",
  month: "--month",
} as const

export const PERIOD_LABELS: Record<TimePeriod, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
} as const

export const TIME_PERIODS: readonly TimePeriod[] = ["today", "week", "month"] as const
