import { execFile } from "child_process"
import type { ModelReportJson, TimePeriod, PeriodStats } from "./types"
import { PERIOD_FLAGS } from "./types"

type SemVer = readonly [number, number, number]

export class TokscaleNotFoundError extends Error {
  constructor() {
    super("tokscale binary not found")
    this.name = "TokscaleNotFoundError"
  }
}

interface Runner {
  command: string
  prefixArgs: readonly string[]
  probeTimeout: number
}

// bunx/npx may download tokscale on first use, so their probes get more time.
// npx gets -y so it never waits for an install confirmation.
const RUNNERS: readonly Runner[] = [
  { command: "tokscale", prefixArgs: [], probeTimeout: 5000 },
  { command: "bunx", prefixArgs: ["tokscale@latest"], probeTimeout: 60000 },
  { command: "npx", prefixArgs: ["-y", "tokscale@latest"], probeTimeout: 60000 },
]

let cachedDetection: boolean | null = null
let cachedVersion: SemVer | null = null
let cachedRunner: Runner | null = null

export function resetDetectionCache(): void {
  cachedDetection = null
  cachedVersion = null
  cachedRunner = null
}

export function getVersion(): SemVer | null {
  return cachedVersion
}

export function parseVersion(versionOutput: string): SemVer | null {
  const match = versionOutput.trim().match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)]
}

export function versionAtLeast(version: SemVer, target: SemVer): boolean {
  for (let i = 0; i < 3; i++) {
    if (version[i] > target[i]) return true
    if (version[i] < target[i]) return false
  }
  return true
}

function probeRunner(runner: Runner): Promise<{ version: SemVer | null } | null> {
  return new Promise((resolve) => {
    execFile("which", [runner.command], { timeout: 5000 }, (whichError) => {
      if (whichError) {
        resolve(null)
        return
      }
      execFile(
        runner.command,
        [...runner.prefixArgs, "--version"],
        { timeout: runner.probeTimeout },
        (versionError, stdout) => {
          if (versionError) {
            resolve(null)
            return
          }
          resolve({ version: parseVersion(String(stdout ?? "")) })
        },
      )
    })
  })
}

export async function detectTokscale(): Promise<boolean> {
  if (cachedDetection !== null) return cachedDetection

  for (const runner of RUNNERS) {
    const probe = await probeRunner(runner)
    if (probe) {
      cachedRunner = runner
      cachedVersion = probe.version
      cachedDetection = true
      return true
    }
  }
  cachedDetection = false
  return false
}

export function fetchPeriodStats(
  period: TimePeriod,
  options?: { openCodeOnly?: boolean },
): Promise<PeriodStats> {
  const args = ["models", "--json", PERIOD_FLAGS[period], "--no-spinner"]
  if (options?.openCodeOnly !== false) {
    const version = getVersion()
    if (version && versionAtLeast(version, [4, 0, 0])) {
      args.push("-c", "opencode")
    } else {
      args.push("--opencode")
    }
  }

  const runner = cachedRunner ?? RUNNERS[0]

  return new Promise((resolve, reject) => {
    execFile(
      runner.command,
      [...runner.prefixArgs, ...args],
      { timeout: 15000, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            resetDetectionCache()
            reject(new TokscaleNotFoundError())
            return
          }
          reject(new Error(`tokscale CLI failed: ${error.message}`))
          return
        }
        try {
          const report = parseModelReport(stdout as string)
          resolve(reportToStats(report))
        } catch (e) {
          reject(e)
        }
      },
    )
  })
}

export function parseModelReport(stdout: string): ModelReportJson {
  if (!stdout) throw new Error("Empty output from tokscale CLI")

  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new Error(`Invalid JSON from tokscale CLI: ${stdout.slice(0, 100)}`)
  }

  const report = parsed as Record<string, unknown>
  if (
    typeof report.totalInput !== "number" ||
    typeof report.totalOutput !== "number" ||
    typeof report.totalCost !== "number"
  ) {
    throw new Error("Invalid tokscale report: missing required numeric fields")
  }

  return parsed as ModelReportJson
}

export function reportToStats(report: ModelReportJson): PeriodStats {
  return {
    totalTokens:
      report.totalInput + report.totalOutput + report.totalCacheRead + report.totalCacheWrite,
    totalCost: report.totalCost,
    totalMessages: report.totalMessages,
    fetchedAt: Date.now(),
  }
}
