import { describe, expect, it, vi, beforeEach } from "vitest"
import type { ModelReportJson, PeriodStats } from "../types"

const validReport: ModelReportJson = {
  groupBy: "client,model",
  entries: [],
  totalInput: 1234567,
  totalOutput: 567890,
  totalCacheRead: 890123,
  totalCacheWrite: 12345,
  totalMessages: 456,
  totalCost: 12.34,
  processingTimeMs: 175,
}

const validReportJson = JSON.stringify(validReport)

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}))

import { execFile } from "child_process"
import {
  detectTokscale,
  fetchPeriodStats,
  getVersion,
  parseModelReport,
  parseVersion,
  versionAtLeast,
  reportToStats,
  resetDetectionCache,
  TokscaleNotFoundError,
} from "../tokscale"

const mockExecFile = vi.mocked(execFile)

function mockExecFileSuccess(stdout: string) {
  mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
    const callback = typeof _opts === "function" ? _opts : cb
    ;(callback as Function)(null, stdout, "")
    return {} as ReturnType<typeof execFile>
  })
}

function mockExecFileError(error: Error & { code?: number }) {
  mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
    const callback = typeof _opts === "function" ? _opts : cb
    ;(callback as Function)(error, "", "")
    return {} as ReturnType<typeof execFile>
  })
}

/**
 * Mock detectTokscale's two-step sequence:
 * 1st call: `which tokscale` → success
 * 2nd call: `tokscale --version` → returns versionStdout
 */
function mockDetectSequence(versionStdout: string) {
  let callCount = 0
  mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
    callCount++
    const callback = typeof _opts === "function" ? _opts : cb
    if (callCount === 1) {
      // which tokscale → success
      ;(callback as Function)(null, "/usr/local/bin/tokscale", "")
    } else if (callCount === 2) {
      // tokscale --version → return version
      ;(callback as Function)(null, versionStdout, "")
    }
    return {} as ReturnType<typeof execFile>
  })
}

/**
 * Route execFile calls by command line. `available` lists commands that
 * `which` can resolve; `versions` maps "<cmd> <args...>" of a --version probe
 * to its stdout, or to an Error when the probe fails.
 */
function mockRunners(available: string[], versions: Record<string, string | Error>) {
  mockExecFile.mockImplementation((cmd, args, _opts, cb) => {
    const callback = (typeof _opts === "function" ? _opts : cb) as Function
    const argv = (args ?? []) as string[]
    if (cmd === "which") {
      if (available.includes(argv[0])) callback(null, `/usr/bin/${argv[0]}`, "")
      else callback(Object.assign(new Error("not found"), { code: 1 }), "", "")
    } else {
      const result = versions[[cmd, ...argv].join(" ")]
      if (result instanceof Error) callback(result, "", "")
      else if (result !== undefined) callback(null, result, "")
      else callback(null, validReportJson, "")
    }
    return {} as ReturnType<typeof execFile>
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  resetDetectionCache()
})

describe("parseVersion", () => {
  it("parses 'tokscale 4.0.5' → [4, 0, 5]", () => {
    expect(parseVersion("tokscale 4.0.5")).toEqual([4, 0, 5])
  })

  it("parses '3.1.3' → [3, 1, 3]", () => {
    expect(parseVersion("3.1.3")).toEqual([3, 1, 3])
  })

  it("parses '4.0.0\\n' with trailing newline → [4, 0, 0]", () => {
    expect(parseVersion("4.0.0\n")).toEqual([4, 0, 0])
  })

  it("returns null for empty string", () => {
    expect(parseVersion("")).toBeNull()
  })

  it("returns null for garbage", () => {
    expect(parseVersion("not a version")).toBeNull()
  })
})

describe("versionAtLeast", () => {
  it("returns true when equal", () => {
    expect(versionAtLeast([4, 0, 0], [4, 0, 0])).toBe(true)
  })

  it("returns true when major is greater", () => {
    expect(versionAtLeast([5, 0, 0], [4, 0, 0])).toBe(true)
  })

  it("returns true when minor is greater", () => {
    expect(versionAtLeast([4, 1, 0], [4, 0, 0])).toBe(true)
  })

  it("returns true when patch is greater", () => {
    expect(versionAtLeast([4, 0, 5], [4, 0, 0])).toBe(true)
  })

  it("returns false when below", () => {
    expect(versionAtLeast([3, 1, 3], [4, 0, 0])).toBe(false)
  })
})

describe("detectTokscale", () => {
  it("returns true and caches major version when tokscale is found", async () => {
    mockDetectSequence("tokscale 4.0.5")
    const result = await detectTokscale()
    expect(result).toBe(true)
    expect(getVersion()).toEqual([4, 0, 5])
    expect(mockExecFile).toHaveBeenCalledTimes(2)
    expect(mockExecFile).toHaveBeenNthCalledWith(
      1,
      "which",
      ["tokscale"],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function),
    )
    expect(mockExecFile).toHaveBeenNthCalledWith(
      2,
      "tokscale",
      ["--version"],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function),
    )
  })

  it("returns true with v3 version cached", async () => {
    mockDetectSequence("tokscale 3.1.3")
    const result = await detectTokscale()
    expect(result).toBe(true)
    expect(getVersion()).toEqual([3, 1, 3])
  })

  it("returns false when which tokscale fails with exit code 1", async () => {
    const error = Object.assign(new Error("not found"), { code: 1 })
    mockExecFileError(error)
    const result = await detectTokscale()
    expect(result).toBe(false)
    expect(getVersion()).toBeNull()
  })

  it("returns false when which tokscale times out", async () => {
    const error = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" as unknown as number })
    mockExecFileError(error)
    const result = await detectTokscale()
    expect(result).toBe(false)
  })

  it("returns false when global tokscale --version fails and no bunx/npx exists", async () => {
    mockRunners(["tokscale"], { "tokscale --version": new Error("version failed") })
    const result = await detectTokscale()
    expect(result).toBe(false)
    expect(getVersion()).toBeNull()
  })

  it("accepts a runner with null version when --version succeeds with unparseable output", async () => {
    mockRunners(["tokscale"], { "tokscale --version": "dev build" })
    const result = await detectTokscale()
    expect(result).toBe(true)
    expect(getVersion()).toBeNull()
  })
})

describe("runner fallback", () => {
  it("falls back to bunx tokscale@latest when global tokscale is missing", async () => {
    mockRunners(["bunx", "npx"], { "bunx tokscale@latest --version": "tokscale 4.17.0" })
    expect(await detectTokscale()).toBe(true)
    expect(getVersion()).toEqual([4, 17, 0])

    await fetchPeriodStats("today")
    expect(mockExecFile).toHaveBeenLastCalledWith(
      "bunx",
      ["tokscale@latest", "models", "--json", "--today", "--no-spinner", "-c", "opencode"],
      expect.objectContaining({ timeout: 15000 }),
      expect.any(Function),
    )
  })

  it("falls back to npx -y tokscale@latest when tokscale and bunx are missing", async () => {
    mockRunners(["npx"], { "npx -y tokscale@latest --version": "tokscale 4.17.0" })
    expect(await detectTokscale()).toBe(true)

    await fetchPeriodStats("week")
    expect(mockExecFile).toHaveBeenLastCalledWith(
      "npx",
      ["-y", "tokscale@latest", "models", "--json", "--week", "--no-spinner", "-c", "opencode"],
      expect.objectContaining({ timeout: 15000 }),
      expect.any(Function),
    )
  })

  it("falls back to bunx when global tokscale exists but --version fails", async () => {
    mockRunners(["tokscale", "bunx"], {
      "tokscale --version": new Error("broken install"),
      "bunx tokscale@latest --version": "tokscale 4.17.0",
    })
    expect(await detectTokscale()).toBe(true)
    await fetchPeriodStats("today")
    expect(mockExecFile).toHaveBeenLastCalledWith(
      "bunx",
      expect.arrayContaining(["tokscale@latest", "models"]),
      expect.any(Object),
      expect.any(Function),
    )
  })

  it("falls back to npx when bunx --version fails", async () => {
    mockRunners(["bunx", "npx"], {
      "bunx tokscale@latest --version": new Error("network"),
      "npx -y tokscale@latest --version": "tokscale 4.17.0",
    })
    expect(await detectTokscale()).toBe(true)
    await fetchPeriodStats("today")
    expect(mockExecFile).toHaveBeenLastCalledWith(
      "npx",
      expect.arrayContaining(["-y", "tokscale@latest", "models"]),
      expect.any(Object),
      expect.any(Function),
    )
  })

  it("gives bunx/npx probes a longer timeout to allow the first download", async () => {
    mockRunners(["npx"], { "npx -y tokscale@latest --version": "tokscale 4.17.0" })
    await detectTokscale()
    expect(mockExecFile).toHaveBeenCalledWith(
      "npx",
      ["-y", "tokscale@latest", "--version"],
      expect.objectContaining({ timeout: 60000 }),
      expect.any(Function),
    )
  })

  it("prefers global tokscale when it works", async () => {
    mockRunners(["tokscale", "bunx", "npx"], { "tokscale --version": "tokscale 2.0.22" })
    expect(await detectTokscale()).toBe(true)
    expect(getVersion()).toEqual([2, 0, 22])
    expect(mockExecFile).not.toHaveBeenCalledWith("which", ["bunx"], expect.anything(), expect.anything())
  })

  it("returns false when no runner is available", async () => {
    mockRunners([], {})
    expect(await detectTokscale()).toBe(false)
  })
})

describe("fetchPeriodStats", () => {
  it("returns parsed PeriodStats on successful CLI call", async () => {
    mockExecFileSuccess(validReportJson)
    const stats = await fetchPeriodStats("today")
    expect(stats.totalTokens).toBe(1234567 + 567890 + 890123 + 12345)
    expect(stats.totalCost).toBe(12.34)
    expect(stats.totalMessages).toBe(456)
    expect(stats.fetchedAt).toBeTypeOf("number")
  })

  it("uses -c opencode on v4+", async () => {
    // Prime the version cache with v4
    mockDetectSequence("tokscale 4.0.5")
    await detectTokscale()
    vi.clearAllMocks()

    mockExecFileSuccess(validReportJson)
    await fetchPeriodStats("today")
    expect(mockExecFile).toHaveBeenCalledWith(
      "tokscale",
      ["models", "--json", "--today", "--no-spinner", "-c", "opencode"],
      expect.objectContaining({ timeout: 15000, maxBuffer: 1024 * 1024 }),
      expect.any(Function),
    )
  })

  it("uses --opencode on v3", async () => {
    // Prime the version cache with v3
    mockDetectSequence("tokscale 3.1.3")
    await detectTokscale()
    vi.clearAllMocks()

    mockExecFileSuccess(validReportJson)
    await fetchPeriodStats("today")
    expect(mockExecFile).toHaveBeenCalledWith(
      "tokscale",
      ["models", "--json", "--today", "--no-spinner", "--opencode"],
      expect.objectContaining({ timeout: 15000, maxBuffer: 1024 * 1024 }),
      expect.any(Function),
    )
  })

  it("falls back to --opencode when version is unknown", async () => {
    // No detectTokscale() called → version is null
    mockExecFileSuccess(validReportJson)
    await fetchPeriodStats("today")
    expect(mockExecFile).toHaveBeenCalledWith(
      "tokscale",
      ["models", "--json", "--today", "--no-spinner", "--opencode"],
      expect.objectContaining({ timeout: 15000 }),
      expect.any(Function),
    )
  })

  it("passes CLI args without client filter when openCodeOnly=false", async () => {
    mockExecFileSuccess(validReportJson)
    await fetchPeriodStats("today", { openCodeOnly: false })
    expect(mockExecFile).toHaveBeenCalledWith(
      "tokscale",
      ["models", "--json", "--today", "--no-spinner"],
      expect.objectContaining({ timeout: 15000 }),
      expect.any(Function),
    )
  })

  it("returns PeriodStats with zero totals for empty entries but valid JSON", async () => {
    const emptyReport: ModelReportJson = {
      groupBy: "client,model",
      entries: [],
      totalInput: 0,
      totalOutput: 0,
      totalCacheRead: 0,
      totalCacheWrite: 0,
      totalMessages: 0,
      totalCost: 0,
      processingTimeMs: 10,
    }
    mockExecFileSuccess(JSON.stringify(emptyReport))
    const stats = await fetchPeriodStats("today")
    expect(stats.totalTokens).toBe(0)
    expect(stats.totalCost).toBe(0)
    expect(stats.totalMessages).toBe(0)
  })

  it("throws error when CLI exits with code 1", async () => {
    const error = Object.assign(new Error("CLI failed"), { code: 1 })
    mockExecFileError(error)
    await expect(fetchPeriodStats("today")).rejects.toThrow()
  })

  it("throws error when CLI returns invalid JSON", async () => {
    mockExecFileSuccess("not json at all")
    await expect(fetchPeriodStats("today")).rejects.toThrow()
  })

  it("throws error when CLI times out", async () => {
    const error = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" as unknown as number })
    mockExecFileError(error)
    await expect(fetchPeriodStats("today")).rejects.toThrow()
  })

  it("throws TokscaleNotFoundError and resets detection cache on ENOENT", async () => {
    // Prime cache as installed
    mockDetectSequence("tokscale 4.0.5")
    await detectTokscale()
    vi.clearAllMocks()

    // Now simulate binary gone (ENOENT)
    const error = Object.assign(new Error("spawn tokscale ENOENT"), {
      code: "ENOENT" as unknown as number,
    })
    mockExecFileError(error)

    await expect(fetchPeriodStats("today")).rejects.toThrow(TokscaleNotFoundError)

    // Detection cache should be reset — next detectTokscale() must re-probe
    mockExecFileError(Object.assign(new Error("not found"), { code: 1 }))
    const result = await detectTokscale()
    expect(result).toBe(false)
  })
})

describe("parseModelReport", () => {
  it("parses valid JSON string into ModelReportJson", () => {
    const result = parseModelReport(validReportJson)
    expect(result).toEqual(validReport)
  })

  it("throws error for empty string", () => {
    expect(() => parseModelReport("")).toThrow()
  })

  it("throws error for invalid JSON", () => {
    expect(() => parseModelReport("{invalid}")).toThrow()
  })

  it("throws error for valid JSON missing totalInput", () => {
    const incomplete = JSON.stringify({ groupBy: "client,model", entries: [], totalOutput: 0 })
    expect(() => parseModelReport(incomplete)).toThrow()
  })
})

describe("reportToStats", () => {
  it("converts ModelReportJson to PeriodStats", () => {
    const stats = reportToStats(validReport)
    expect(stats.totalTokens).toBe(1234567 + 567890 + 890123 + 12345)
    expect(stats.totalCost).toBe(12.34)
    expect(stats.totalMessages).toBe(456)
    expect(stats.fetchedAt).toBeTypeOf("number")
    expect(stats.fetchedAt).toBeGreaterThan(0)
  })
})
