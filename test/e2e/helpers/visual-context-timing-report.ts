import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

export type VisualContextTimingPath =
  | "chat.current_snapshot_tool"
  | "chat.timestamp_snapshot_tool"
  | "chat.frame_sheet_tool"
  | "comment.auto_current_frame_attachment"
  | "comment.auto_range_sheet_attachment"
  | "comment.current_snapshot_tool"
  | "comment.timestamp_snapshot_tool"
  | "comment.frame_sheet_tool"

export const VISUAL_CONTEXT_TIMING_PATHS: VisualContextTimingPath[] = [
  "chat.current_snapshot_tool",
  "chat.timestamp_snapshot_tool",
  "chat.frame_sheet_tool",
  "comment.auto_current_frame_attachment",
  "comment.auto_range_sheet_attachment",
  "comment.current_snapshot_tool",
  "comment.timestamp_snapshot_tool",
  "comment.frame_sheet_tool",
]

export interface VisualContextTimingRow {
  provider: "codex" | "claude"
  surface: "chat" | "comment"
  path: VisualContextTimingPath
  trigger: "agent_tool" | "automatic_comment_visual"
  runId?: string | null
  threadId?: string | null
  revisionId?: string | null
  artifactPath?: string | null
  uiCardVisibleMs?: number | null
  autoVisualReadyMs?: number | null
  runObservedMs?: number | null
  runCreatedToStartedMs?: number | null
  toolOrderIndex?: number | null
  modelToolChoiceMs?: number | null
  runStartedToToolStartMs?: number | null
  toolExecutionMs?: number | null
  visualCaptureMs?: number | null
  nativeHandoffMs?: number | null
  providerRunMs?: number | null
  e2eMs?: number | null
  status: "completed" | "failed" | "not_observed"
  notes?: string | null
}

export interface VisualContextTimingBudget {
  path: VisualContextTimingPath
  ownedBudgetMs: number
  target: string
  ownership: string
}

export interface VisualContextTimingBudgetResult {
  provider: "codex" | "claude"
  surface: "chat" | "comment"
  path: VisualContextTimingPath
  ownedLatencyMs: number | null
  budgetMs: number
  status: "within_budget" | "over_budget" | "not_observed"
  modelToolChoiceMs: number | null
  modelToolChoiceBudgetMs: number | null
  modelToolChoiceStatus: "within_budget" | "over_budget" | "not_observed" | "not_applicable"
  primaryBottleneck: string
  target: string
}

export interface VisualContextTimingReport {
  generatedAt: string
  columns: string[]
  paths: VisualContextTimingPath[]
  budgetResults: VisualContextTimingBudgetResult[]
  rows: VisualContextTimingRow[]
  missingPathsByProvider: Record<string, VisualContextTimingPath[]>
}

const UI_CARD_VISIBLE_BUDGET_MS = 300
const NATIVE_HANDOFF_BUDGET_MS = 50
export const VISUAL_CONTEXT_MODEL_TOOL_CHOICE_BUDGET_MS = 4_000

export const VISUAL_CONTEXT_TIMING_BUDGETS: Record<VisualContextTimingPath, VisualContextTimingBudget> = {
  "chat.current_snapshot_tool": {
    path: "chat.current_snapshot_tool",
    ownedBudgetMs: 250,
    target: "Current snapshot returns from the already-visible preview after the model asks for it.",
    ownership: "tool execution",
  },
  "chat.timestamp_snapshot_tool": {
    path: "chat.timestamp_snapshot_tool",
    ownedBudgetMs: 1_000,
    target: "Timestamp snapshot uses a warm source-canonical render path.",
    ownership: "tool execution",
  },
  "chat.frame_sheet_tool": {
    path: "chat.frame_sheet_tool",
    ownedBudgetMs: 1_500,
    target: "Frame sheet uses warm sampled renders and bounded sheet assembly.",
    ownership: "tool execution",
  },
  "comment.auto_current_frame_attachment": {
    path: "comment.auto_current_frame_attachment",
    ownedBudgetMs: 750,
    target: "Point comment startup receives a current-frame attachment without a long gate.",
    ownership: "automatic comment visual",
  },
  "comment.auto_range_sheet_attachment": {
    path: "comment.auto_range_sheet_attachment",
    ownedBudgetMs: 2_000,
    target: "Range comment startup receives a compact source-valid frame sheet without an unbounded gate.",
    ownership: "automatic comment visual",
  },
  "comment.current_snapshot_tool": {
    path: "comment.current_snapshot_tool",
    ownedBudgetMs: 250,
    target: "Comment agents can ask for the current frame through the same fast tool path.",
    ownership: "tool execution",
  },
  "comment.timestamp_snapshot_tool": {
    path: "comment.timestamp_snapshot_tool",
    ownedBudgetMs: 1_000,
    target: "Comment agents can ask for a timestamped source-canonical frame through the warm path.",
    ownership: "tool execution",
  },
  "comment.frame_sheet_tool": {
    path: "comment.frame_sheet_tool",
    ownedBudgetMs: 1_500,
    target: "Comment agents can ask for a compact frame sheet through the warm path.",
    ownership: "tool execution",
  },
}

const REPORT_COLUMNS = [
  "provider",
  "surface",
  "path",
  "trigger",
  "uiCardVisibleMs",
  "autoVisualReadyMs",
  "runObservedMs",
  "runCreatedToStartedMs",
  "toolOrderIndex",
  "modelToolChoiceMs",
  "runStartedToToolStartMs",
  "toolExecutionMs",
  "visualCaptureMs",
  "nativeHandoffMs",
  "providerRunMs",
  "e2eMs",
  "status",
  "artifactPath",
  "notes",
]

function roundMs(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return Math.max(0, Math.round(value))
}

function normalizeRow(row: VisualContextTimingRow): VisualContextTimingRow {
  return {
    ...row,
    uiCardVisibleMs: roundMs(row.uiCardVisibleMs),
    autoVisualReadyMs: roundMs(row.autoVisualReadyMs),
    runObservedMs: roundMs(row.runObservedMs),
    runCreatedToStartedMs: roundMs(row.runCreatedToStartedMs),
    toolOrderIndex: roundMs(row.toolOrderIndex),
    modelToolChoiceMs: roundMs(row.modelToolChoiceMs),
    runStartedToToolStartMs: roundMs(row.runStartedToToolStartMs),
    toolExecutionMs: roundMs(row.toolExecutionMs),
    visualCaptureMs: roundMs(row.visualCaptureMs),
    nativeHandoffMs: roundMs(row.nativeHandoffMs),
    providerRunMs: roundMs(row.providerRunMs),
    e2eMs: roundMs(row.e2eMs),
  }
}

function addNullable(...values: Array<number | null | undefined>): number | null {
  let total = 0
  let hasValue = false
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue
    total += value
    hasValue = true
  }
  return hasValue ? total : null
}

export function visualContextOwnedLatencyMs(row: VisualContextTimingRow): number | null {
  if (row.trigger === "automatic_comment_visual") {
    return roundMs(row.autoVisualReadyMs)
  }
  return roundMs(
    addNullable(row.visualCaptureMs, row.nativeHandoffMs) ??
    row.visualCaptureMs ??
    row.toolExecutionMs,
  )
}

export function visualContextModelToolChoiceMs(row: VisualContextTimingRow): number | null {
  if (row.trigger !== "agent_tool") return null
  return roundMs(row.modelToolChoiceMs ?? row.runStartedToToolStartMs)
}

function visualContextPrimaryBottleneck(row: VisualContextTimingRow): string {
  const budget = VISUAL_CONTEXT_TIMING_BUDGETS[row.path]
  const ownedLatencyMs = visualContextOwnedLatencyMs(row)
  const modelToolChoiceMs = visualContextModelToolChoiceMs(row)
  if (ownedLatencyMs === null) return "not observed"

  if (
    row.trigger === "automatic_comment_visual" &&
    typeof row.uiCardVisibleMs === "number" &&
    row.uiCardVisibleMs > UI_CARD_VISIBLE_BUDGET_MS
  ) {
    return "comment card visibility"
  }

  if (row.trigger === "automatic_comment_visual") {
    return ownedLatencyMs > budget.ownedBudgetMs
      ? "automatic visual gate"
      : "within app-owned budget"
  }

  if (
    typeof row.visualCaptureMs === "number" &&
    row.visualCaptureMs > budget.ownedBudgetMs
  ) {
    return "visual capture"
  }

  if (
    typeof row.nativeHandoffMs === "number" &&
    row.nativeHandoffMs > NATIVE_HANDOFF_BUDGET_MS
  ) {
    return "native image handoff"
  }

  if (ownedLatencyMs > budget.ownedBudgetMs) return "tool execution"

  if (
    typeof modelToolChoiceMs === "number" &&
    modelToolChoiceMs > Math.max(VISUAL_CONTEXT_MODEL_TOOL_CHOICE_BUDGET_MS, ownedLatencyMs * 2)
  ) {
    return "model tool choice"
  }

  return "within app-owned budget"
}

export function buildVisualContextTimingBudgetResult(
  row: VisualContextTimingRow,
): VisualContextTimingBudgetResult {
  const budget = VISUAL_CONTEXT_TIMING_BUDGETS[row.path]
  const ownedLatencyMs = visualContextOwnedLatencyMs(row)
  const modelToolChoiceMs = visualContextModelToolChoiceMs(row)
  const status = ownedLatencyMs === null
    ? "not_observed"
    : ownedLatencyMs <= budget.ownedBudgetMs
      ? "within_budget"
      : "over_budget"
  const modelToolChoiceStatus = row.trigger !== "agent_tool"
    ? "not_applicable"
    : modelToolChoiceMs === null
      ? "not_observed"
      : modelToolChoiceMs <= VISUAL_CONTEXT_MODEL_TOOL_CHOICE_BUDGET_MS
        ? "within_budget"
        : "over_budget"

  return {
    provider: row.provider,
    surface: row.surface,
    path: row.path,
    ownedLatencyMs,
    budgetMs: budget.ownedBudgetMs,
    status,
    modelToolChoiceMs,
    modelToolChoiceBudgetMs: row.trigger === "agent_tool"
      ? VISUAL_CONTEXT_MODEL_TOOL_CHOICE_BUDGET_MS
      : null,
    modelToolChoiceStatus,
    primaryBottleneck: visualContextPrimaryBottleneck(row),
    target: budget.target,
  }
}

function rowSortKey(row: VisualContextTimingRow): string {
  const providerRank = row.provider === "codex" ? "0" : "1"
  const pathRank = VISUAL_CONTEXT_TIMING_PATHS.indexOf(row.path).toString().padStart(2, "0")
  return `${providerRank}:${pathRank}:${row.runId ?? ""}:${row.artifactPath ?? ""}`
}

export function buildVisualContextTimingReport(
  rows: VisualContextTimingRow[],
): VisualContextTimingReport {
  const normalizedRows = rows
    .map(normalizeRow)
    .sort((left, right) => rowSortKey(left).localeCompare(rowSortKey(right)))
  const providers = Array.from(new Set(normalizedRows.map((row) => row.provider))).sort()
  const missingPathsByProvider: Record<string, VisualContextTimingPath[]> = {}
  for (const provider of providers) {
    const seen = new Set(normalizedRows
      .filter((row) => row.provider === provider && row.status === "completed")
      .map((row) => row.path))
    missingPathsByProvider[provider] = VISUAL_CONTEXT_TIMING_PATHS.filter((path) => !seen.has(path))
  }

  return {
    generatedAt: new Date().toISOString(),
    columns: REPORT_COLUMNS,
    paths: VISUAL_CONTEXT_TIMING_PATHS,
    budgetResults: normalizedRows.map(buildVisualContextTimingBudgetResult),
    rows: normalizedRows,
    missingPathsByProvider,
  }
}

function cell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-"
  return String(value).replace(/\|/g, "\\|")
}

export function renderVisualContextTimingMarkdown(
  report: VisualContextTimingReport,
): string {
  const budgetResults = report.budgetResults?.length
    ? report.budgetResults
    : report.rows.map(buildVisualContextTimingBudgetResult)
  const lines = [
    "# Visual Context Timing Matrix",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Budget Readout",
    "",
    "| Provider | Surface | Path | App-owned latency | Budget | Status | Model choice | Choice budget | Choice status | Primary bottleneck |",
    "| --- | --- | --- | ---: | ---: | --- | ---: | ---: | --- | --- |",
  ]

  for (const result of budgetResults) {
    lines.push([
      result.provider,
      result.surface,
      result.path,
      cell(result.ownedLatencyMs),
      cell(result.budgetMs),
      result.status,
      cell(result.modelToolChoiceMs),
      cell(result.modelToolChoiceBudgetMs),
      result.modelToolChoiceStatus,
      result.primaryBottleneck,
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"))
  }

  lines.push(
    "",
    "## Raw Timing Rows",
    "",
    "| Provider | Surface | Path | Trigger | Tool # | UI card | Auto visual | Run observed | Run start | Tool choice | Tool wait | Tool exec | Capture | Handoff | Provider run | E2E | Status | Artifact |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
  )

  for (const row of report.rows) {
    lines.push([
      row.provider,
      row.surface,
      row.path,
      row.trigger,
      cell(row.toolOrderIndex),
      cell(row.uiCardVisibleMs),
      cell(row.autoVisualReadyMs),
      cell(row.runObservedMs),
      cell(row.runCreatedToStartedMs),
      cell(row.modelToolChoiceMs),
      cell(row.runStartedToToolStartMs),
      cell(row.toolExecutionMs),
      cell(row.visualCaptureMs),
      cell(row.nativeHandoffMs),
      cell(row.providerRunMs),
      cell(row.e2eMs),
      row.status,
      cell(row.artifactPath),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"))
  }

  const missing = Object.entries(report.missingPathsByProvider)
    .filter(([, paths]) => paths.length > 0)
  if (missing.length > 0) {
    lines.push("", "## Missing Paths", "")
    for (const [provider, paths] of missing) {
      lines.push(`- ${provider}: ${paths.join(", ")}`)
    }
  }

  return `${lines.join("\n")}\n`
}

export async function writeVisualContextTimingReport(input: {
  path: string
  rows: VisualContextTimingRow[]
}): Promise<VisualContextTimingReport> {
  const existingRows = existsSync(input.path)
    ? (JSON.parse(await readFile(input.path, "utf8")).rows ?? []) as VisualContextTimingRow[]
    : []
  const nextReport = buildVisualContextTimingReport([...existingRows, ...input.rows])
  await mkdir(dirname(input.path), { recursive: true })
  await writeFile(input.path, `${JSON.stringify(nextReport, null, 2)}\n`, "utf8")
  await writeFile(
    input.path.replace(/\.json$/, ".md"),
    renderVisualContextTimingMarkdown(nextReport),
    "utf8",
  )
  return nextReport
}
