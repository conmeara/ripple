#!/usr/bin/env bun
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

type FixtureRow = {
  kind: string
  status: string
  title: string
  subtitle?: string
  visual?: string
}

type FixtureCheckpoint = {
  name: string
  eventCount: number
  live: boolean
  shimmerCount?: number
  expectedRows?: FixtureRow[]
}

type RuntimeUiFixture = {
  schemaVersion: number
  source?: {
    provider?: string
    model?: string | null
    runKind?: string
    status?: string
    originalEventCount?: number
    selectedEventCount?: number
    note?: string
  }
  projectPath?: string
  events?: Array<{ type?: string }>
  checkpoints?: FixtureCheckpoint[]
}

type Manifest = {
  schemaVersion: number
  scenarios?: Array<{
    id: string
    label: string
    required: boolean
    description: string
  }>
  fixtures?: Array<{
    file: string
    scenarios: string[]
  }>
}

type ReportIssue = {
  severity: "error" | "warning"
  surface: "chat" | "comments" | "manifest"
  fixture?: string
  checkpoint?: string
  message: string
}

type CheckpointReport = {
  name: string
  eventCount: number
  live: boolean
  rowCount: number
  shimmerCount: number
  commentStatus: string
  commentLine: string
  issues: ReportIssue[]
}

type FixtureReport = {
  file: string
  provider: string
  model: string | null
  runKind: string
  status: string
  eventCount: number
  checkpointCount: number
  note: string
  scenarioIds: string[]
  checkpoints: CheckpointReport[]
  issues: ReportIssue[]
}

const RAW_CHAT_PATTERN =
  /\b(?:Bash|Edit|Write|Grep|Glob|commandExecution|fileChange|tool-|mcp__)\b|(?:\/bin\/zsh|sed -n|git diff|bun run|npm run|hyperframes validate|\/Users\/|\/private\/tmp\/)/i

const RAW_COMMENT_PATTERN =
  /\b(?:Bash|Edit|Write|Grep|Glob|commandExecution|fileChange|tool-|mcp__|Agent is thinking|Editing files|Agent run)\b|(?:\/bin\/zsh|sed -n|git diff|bun run|npm run|hyperframes validate|\/Users\/|\/private\/tmp\/)/i

function usage(): never {
  console.error([
    "Usage: bun scripts/agent-runtime-ui-report.ts [--fixtures-dir <path>] [--out-dir <path>]",
    "",
    "Defaults:",
    "  --fixtures-dir test/fixtures/agent-runtime-ui",
    "  --out-dir test-results/agent-runtime-ui-report",
  ].join("\n"))
  process.exit(1)
}

function argValue(flag: string): string | null {
  const index = Bun.argv.indexOf(flag)
  if (index < 0) return null
  const value = Bun.argv[index + 1]
  if (!value || value.startsWith("--")) usage()
  return value
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function truncate(value: string, max = 180): string {
  const normalized = compact(value)
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized
}

function lastRow(
  rows: FixtureRow[],
  predicate: (row: FixtureRow) => boolean,
): FixtureRow | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]
    if (row && predicate(row)) return row
  }
  return null
}

function commentStatus(input: {
  fixture: RuntimeUiFixture
  checkpoint: FixtureCheckpoint
}): string {
  const sourceStatus = input.fixture.source?.status
  if (sourceStatus === "failed" || sourceStatus === "cancelled") return "failed"

  const rows = input.checkpoint.expectedRows ?? []
  const pendingRow = lastRow(rows, (row) =>
    row.status === "pending" && row.kind !== "reply"
  )
  if (pendingRow?.kind === "motion_change") return "running"
  if (pendingRow) return "preparing"
  if (lastRow(rows, (row) => row.kind === "motion_change" && row.status === "done")) {
    return "proposed"
  }
  if (lastRow(rows, (row) => row.kind === "reply" && row.status === "done")) {
    return "answered"
  }
  return input.checkpoint.live ? "queued" : "answered"
}

function commentLine(input: {
  fixture: RuntimeUiFixture
  checkpoint: FixtureCheckpoint
  status: string
}): string {
  if (input.status === "failed") {
    return input.fixture.source?.status === "cancelled"
      ? "This generated change was cancelled."
      : "This generated change needs attention."
  }

  const rows = input.checkpoint.expectedRows ?? []
  return (
    lastRow(rows, (row) => row.status === "pending" && row.kind !== "reply")?.title ??
    lastRow(rows, (row) => row.kind === "motion_change" && row.status === "done")?.title ??
    lastRow(rows, (row) => row.kind === "visual_check" && row.status === "done")?.title ??
    lastRow(rows, (row) => row.kind === "verification" && row.status === "done")?.title ??
    lastRow(rows, (row) => row.kind === "reply" && row.status === "done")?.title ??
    "Planning the change"
  )
}

function scenarioMap(manifest: Manifest | null): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const entry of manifest?.fixtures ?? []) {
    result.set(entry.file, entry.scenarios)
  }
  return result
}

function manifestIssues(
  manifest: Manifest | null,
  fixtureFiles: string[],
): ReportIssue[] {
  const issues: ReportIssue[] = []
  if (!manifest) {
    issues.push({
      severity: "warning",
      surface: "manifest",
      message: "No manifest.json was found; scenario coverage was not evaluated.",
    })
    return issues
  }

  const knownFixtures = new Set(fixtureFiles)
  const knownScenarioIds = new Set((manifest.scenarios ?? []).map((scenario) => scenario.id))
  for (const entry of manifest.fixtures ?? []) {
    if (!knownFixtures.has(entry.file)) {
      issues.push({
        severity: "error",
        surface: "manifest",
        fixture: entry.file,
        message: "Manifest references a missing fixture.",
      })
    }
    for (const scenarioId of entry.scenarios) {
      if (!knownScenarioIds.has(scenarioId)) {
        issues.push({
          severity: "error",
          surface: "manifest",
          fixture: entry.file,
          message: `Manifest references an unknown scenario: ${scenarioId}`,
        })
      }
    }
  }

  for (const scenario of (manifest.scenarios ?? []).filter((item) => item.required)) {
    const covered = (manifest.fixtures ?? []).some((entry) =>
      entry.scenarios.includes(scenario.id) && knownFixtures.has(entry.file)
    )
    if (!covered) {
      issues.push({
        severity: "error",
        surface: "manifest",
        message: `Required scenario is not mapped to an available fixture: ${scenario.id}`,
      })
    }
  }

  return issues
}

function checkpointIssues(input: {
  fixtureFile: string
  checkpoint: FixtureCheckpoint
  rows: FixtureRow[]
  commentLine: string
}): ReportIssue[] {
  const issues: ReportIssue[] = []
  const pendingRows = input.rows.filter((row) => row.status === "pending")
  const shimmerCount = input.checkpoint.shimmerCount ?? pendingRows.length
  if (pendingRows.length > 1) {
    issues.push({
      severity: "error",
      surface: "chat",
      fixture: input.fixtureFile,
      checkpoint: input.checkpoint.name,
      message: `${pendingRows.length} chat rows are pending: ${pendingRows.map((row) => row.title).join(", ")}`,
    })
  }
  if (shimmerCount > 1) {
    issues.push({
      severity: "error",
      surface: "chat",
      fixture: input.fixtureFile,
      checkpoint: input.checkpoint.name,
      message: `Expected shimmer count is ${shimmerCount}; only one row should shimmer at a time.`,
    })
  }

  for (const row of input.rows) {
    const visible = `${row.title} ${row.subtitle ?? ""}`
    if (RAW_CHAT_PATTERN.test(visible)) {
      issues.push({
        severity: "error",
        surface: "chat",
        fixture: input.fixtureFile,
        checkpoint: input.checkpoint.name,
        message: `Chat row leaks runtime wording: ${truncate(visible)}`,
      })
    }
  }

  const firstReplyIndex = input.rows.findIndex((row) => row.kind === "reply")
  if (
    firstReplyIndex >= 0 &&
    input.rows.slice(firstReplyIndex + 1).some((row, offset) =>
      row.kind === "thinking" &&
      row.title === "Thinking" &&
      !(row.status === "pending" && firstReplyIndex + 1 + offset === input.rows.length - 1)
    )
  ) {
    issues.push({
      severity: "error",
      surface: "chat",
      fixture: input.fixtureFile,
      checkpoint: input.checkpoint.name,
      message: "Stale generic Thinking appears after visible assistant narration.",
    })
  }

  if (RAW_COMMENT_PATTERN.test(input.commentLine)) {
    issues.push({
      severity: "error",
      surface: "comments",
      fixture: input.fixtureFile,
      checkpoint: input.checkpoint.name,
      message: `Comment card line leaks runtime wording: ${truncate(input.commentLine)}`,
    })
  }

  return issues
}

function fixtureReport(input: {
  file: string
  fixture: RuntimeUiFixture
  scenarioIds: string[]
}): FixtureReport {
  const checkpoints = input.fixture.checkpoints ?? []
  const checkpointReports = checkpoints.map((checkpoint): CheckpointReport => {
    const rows = checkpoint.expectedRows ?? []
    const status = commentStatus({ fixture: input.fixture, checkpoint })
    const line = commentLine({ fixture: input.fixture, checkpoint, status })
    const issues = checkpointIssues({
      fixtureFile: input.file,
      checkpoint,
      rows,
      commentLine: line,
    })
    return {
      name: checkpoint.name,
      eventCount: checkpoint.eventCount,
      live: checkpoint.live,
      rowCount: rows.length,
      shimmerCount: checkpoint.shimmerCount ?? rows.filter((row) => row.status === "pending").length,
      commentStatus: status,
      commentLine: line,
      issues,
    }
  })
  const issues = checkpointReports.flatMap((checkpoint) => checkpoint.issues)
  return {
    file: input.file,
    provider: input.fixture.source?.provider ?? "unknown",
    model: input.fixture.source?.model ?? null,
    runKind: input.fixture.source?.runKind ?? "unknown",
    status: input.fixture.source?.status ?? "unknown",
    eventCount: input.fixture.events?.length ?? 0,
    checkpointCount: checkpoints.length,
    note: input.fixture.source?.note ?? "",
    scenarioIds: input.scenarioIds,
    checkpoints: checkpointReports,
    issues,
  }
}

function renderHtml(report: {
  generatedAt: string
  fixturesDir: string
  fixtureReports: FixtureReport[]
  issues: ReportIssue[]
  refreshChecklist: string[]
}): string {
  const errorCount = report.issues.filter((issue) => issue.severity === "error").length
  const warningCount = report.issues.filter((issue) => issue.severity === "warning").length
  const rows = report.fixtureReports.map((fixture) => {
    const fixtureIssueCount = fixture.issues.length
    const checkpointRows = fixture.checkpoints.map((checkpoint) => `
      <tr>
        <td>${escapeHtml(checkpoint.name)}</td>
        <td>${checkpoint.eventCount}</td>
        <td>${checkpoint.live ? "live" : "final"}</td>
        <td>${checkpoint.shimmerCount}</td>
        <td>${escapeHtml(checkpoint.commentStatus)}</td>
        <td>${escapeHtml(checkpoint.commentLine)}</td>
        <td>${checkpoint.issues.length}</td>
      </tr>`).join("")
    return `
      <section class="fixture">
        <h2>${escapeHtml(fixture.file)}</h2>
        <p class="meta">${escapeHtml(fixture.provider)} ${escapeHtml(fixture.model ?? "")} - ${escapeHtml(fixture.status)} - ${escapeHtml(fixture.runKind)} - ${fixture.eventCount} events - ${fixture.checkpointCount} checkpoints - ${fixtureIssueCount} issues</p>
        <p>${escapeHtml(fixture.note)}</p>
        <p class="scenarios">Scenarios: ${escapeHtml(fixture.scenarioIds.join(", ") || "none")}</p>
        <table>
          <thead><tr><th>Checkpoint</th><th>Events</th><th>Mode</th><th>Shimmer</th><th>Comment status</th><th>Comment line</th><th>Issues</th></tr></thead>
          <tbody>${checkpointRows}</tbody>
        </table>
      </section>`
  }).join("")
  const issueRows = report.issues.map((issue) => `
    <tr>
      <td class="${issue.severity}">${issue.severity}</td>
      <td>${escapeHtml(issue.surface)}</td>
      <td>${escapeHtml(issue.fixture ?? "")}</td>
      <td>${escapeHtml(issue.checkpoint ?? "")}</td>
      <td>${escapeHtml(issue.message)}</td>
    </tr>`).join("")
  const checklist = report.refreshChecklist.map((item) =>
    `<li>${escapeHtml(item)}</li>`
  ).join("")

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Ripple Agent Runtime UI Report</title>
  <style>
    body { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; color: #18181b; background: #f4f4f5; }
    main { max-width: 1180px; margin: 0 auto; padding: 32px; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { font-size: 18px; margin: 0 0 8px; }
    .summary, .fixture, .issues, .checklist { background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 18px; margin: 16px 0; }
    .meta, .scenarios { color: #52525b; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-top: 1px solid #e4e4e7; padding: 8px; text-align: left; vertical-align: top; }
    th { color: #52525b; font-weight: 600; }
    .error { color: #b91c1c; font-weight: 700; }
    .warning { color: #b45309; font-weight: 700; }
    code { background: #f4f4f5; border-radius: 4px; padding: 1px 4px; }
  </style>
</head>
<body>
  <main>
    <h1>Agent Runtime UI Report</h1>
    <div class="summary">
      <p>Generated ${escapeHtml(report.generatedAt)} from <code>${escapeHtml(report.fixturesDir)}</code>.</p>
      <p>${report.fixtureReports.length} fixtures, ${report.fixtureReports.reduce((total, fixture) => total + fixture.checkpointCount, 0)} checkpoints, ${errorCount} errors, ${warningCount} warnings.</p>
    </div>
    <section class="checklist">
      <h2>Provider Refresh Checklist</h2>
      <ol>${checklist}</ol>
    </section>
    <section class="issues">
      <h2>Issues</h2>
      <table>
        <thead><tr><th>Severity</th><th>Surface</th><th>Fixture</th><th>Checkpoint</th><th>Message</th></tr></thead>
        <tbody>${issueRows || "<tr><td colspan=\"5\">No issues found.</td></tr>"}</tbody>
      </table>
    </section>
    ${rows}
  </main>
</body>
</html>
`
}

const fixturesDir = resolve(argValue("--fixtures-dir") ?? "test/fixtures/agent-runtime-ui")
const outDir = resolve(argValue("--out-dir") ?? "test-results/agent-runtime-ui-report")

if (!existsSync(fixturesDir)) {
  console.error(`Fixture directory was not found: ${fixturesDir}`)
  process.exit(1)
}

const fixtureFiles = readdirSync(fixturesDir)
  .filter((file) => file.endsWith(".json") && file !== "manifest.json")
  .sort()
if (fixtureFiles.length === 0) {
  console.error(`No fixture JSON files found in ${fixturesDir}`)
  process.exit(1)
}

const manifestPath = join(fixturesDir, "manifest.json")
const manifest = existsSync(manifestPath) ? readJson<Manifest>(manifestPath) : null
const scenarioIdsByFixture = scenarioMap(manifest)
const fixtureReports = fixtureFiles.map((file) => fixtureReport({
  file,
  fixture: readJson<RuntimeUiFixture>(join(fixturesDir, file)),
  scenarioIds: scenarioIdsByFixture.get(file) ?? [],
}))
const issues = [
  ...manifestIssues(manifest, fixtureFiles),
  ...fixtureReports.flatMap((fixture) => fixture.issues),
]
const refreshChecklist = [
  "Run a real Codex and Claude session after provider runtime updates.",
  "Export each run with eval:agent-runtime-ui:refresh or eval:agent-runtime-ui:live.",
  "Review this report for shimmer count, raw runtime leaks, and comments card status.",
  "Replay exported fixtures through the Electron harness before replacing canonical fixtures.",
  "Update manifest scenario mappings when a new provider behavior appears.",
]
const generatedAt = new Date().toISOString()
const report = {
  schemaVersion: 1,
  generatedAt,
  fixturesDir,
  summary: {
    fixtureCount: fixtureReports.length,
    checkpointCount: fixtureReports.reduce((total, fixture) => total + fixture.checkpointCount, 0),
    errorCount: issues.filter((issue) => issue.severity === "error").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
  },
  refreshChecklist,
  issues,
  fixtures: fixtureReports,
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, "agent-runtime-ui-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
writeFileSync(join(outDir, "agent-runtime-ui-report.html"), renderHtml({
  generatedAt,
  fixturesDir,
  fixtureReports,
  issues,
  refreshChecklist,
}), "utf8")

console.log(`Wrote ${join(outDir, "agent-runtime-ui-report.html")}`)
console.log(`${report.summary.fixtureCount} fixtures, ${report.summary.checkpointCount} checkpoints, ${report.summary.errorCount} errors, ${report.summary.warningCount} warnings`)
if (report.summary.errorCount > 0) process.exit(1)
