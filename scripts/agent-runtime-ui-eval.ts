#!/usr/bin/env bun
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import {
  buildAgentRuntimeAssistantProjection,
  type RuntimeEventLike,
} from "../src/shared/agent-runtime-ui-projection"
import {
  buildMotionRuntimeActivity,
  buildMotionRuntimeTimeline,
  shouldShowMotionRuntimeThinkingFallback,
} from "../src/renderer/features/agents/ui/motion-runtime-activity"

type RunRow = {
  id: string
  provider: string
  model: string | null
  status: string
  prompt: string
  projectPath: string | null
}

type EventRow = {
  id: string
  type: string
  providerType: string | null
  providerId: string | null
  payloadJson: string
}

type MessageRow = {
  partsJson: string
  metadataJson: string
}

type EvalRow = {
  kind: string
  status: string
  title: string
  subtitle: string
  details?: number
  visual?: string
}

type ContractIssue = {
  severity: "error" | "warning"
  message: string
}

function truncate(value: string, max = 96): string {
  const compact = value.replace(/\s+/g, " ").trim()
  return compact.length > max ? `${compact.slice(0, max - 1)}...` : compact
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function rowsFromParts(input: {
  parts: Record<string, any>[]
  projectPath?: string
  live?: boolean
}): EvalRow[] {
  const timeline = buildMotionRuntimeTimeline({
    parts: input.parts,
    projectPath: input.projectPath,
  })

  const rows: EvalRow[] = []
  for (const entry of timeline) {
    if (entry.kind === "runtime") {
      const runtime = buildMotionRuntimeActivity({
        parts: entry.parts,
        projectPath: input.projectPath,
      })
      for (const item of runtime.items) {
        rows.push({
          kind: item.kind,
          status: item.status,
          title: item.title,
          subtitle: item.subtitle,
          ...(item.details?.length ? { details: item.details.length } : {}),
          ...(item.visual ? { visual: item.visual.kind } : {}),
        })
      }
      continue
    }

    if (entry.part.type === "text") {
      rows.push({
        kind: "reply",
        status: entry.part.state === "streaming" ? "pending" : "done",
        title: "Agent reply",
        subtitle: truncate(String(entry.part.text ?? "")),
      })
    }
  }

  if (input.live && shouldShowMotionRuntimeThinkingFallback({
    timeline,
    projectPath: input.projectPath,
    sandboxSetupStatus: "ready",
    isStreaming: true,
    isLastMessage: true,
  })) {
    rows.push({
      kind: "thinking",
      status: "pending",
      title: "Thinking",
      subtitle: "",
    })
  }

  return rows
}

function printRows(title: string, rows: EvalRow[]): void {
  console.log(title)
  rows.forEach((row, index) => {
    const visual = row.visual ? ` [${row.visual}]` : ""
    const details = row.details ? ` [details:${row.details}]` : ""
    console.log(`${String(index + 1).padStart(2, " ")}. ${row.status.padEnd(7)} ${row.title}${visual}${details}`)
    if (row.subtitle) console.log(`    ${row.subtitle}`)
  })
}

function comparableRows(rows: EvalRow[]): string[] {
  return rows.map((row) => [
    row.kind,
    row.status,
    row.title,
    row.visual ?? "",
  ].join("|"))
}

function rowContractIssues(title: string, rows: EvalRow[]): ContractIssue[] {
  const issues: ContractIssue[] = []
  const pendingRows = rows.filter((row) => row.status === "pending")
  if (pendingRows.length > 1) {
    issues.push({
      severity: "error",
      message: `${title}: ${pendingRows.length} rows are pending (${pendingRows.map((row) => row.title).join(", ")}). Only one row should shimmer at a time.`,
    })
  }

  const replyIndex = rows.findIndex((row) => row.kind === "reply" && row.subtitle)
  const staleThinkingAfterReply = replyIndex >= 0
    ? rows.slice(replyIndex + 1).find((row, offset) =>
        row.kind === "thinking" &&
        row.title === "Thinking" &&
        !(row.status === "pending" && replyIndex + 1 + offset === rows.length - 1)
      )
    : null
  if (staleThinkingAfterReply) {
    issues.push({
      severity: "error",
      message: `${title}: stale generic Thinking appears after visible assistant reply text.`,
    })
  }

  for (const row of rows) {
    if (/\b(Bash|Edit|Write|Grep|Glob|mcp__|commandExecution|fileChange|tool-)/.test(row.title)) {
      issues.push({
        severity: "error",
        message: `${title}: row title leaks developer/runtime wording: "${row.title}".`,
      })
    }
    if (/(?:\bsrc\/|\.tsx?\b|\.jsx?\b|\.json\b|\/Users\/|\/private\/tmp\/|\/private\/var\/|\/var\/folders\/)/.test(row.subtitle)) {
      issues.push({
        severity: "warning",
        message: `${title}: row subtitle may expose implementation detail: "${row.subtitle}".`,
      })
    }
  }

  return issues
}

function projectionDriftIssues(
  storedRows: EvalRow[] | null,
  projectedRows: EvalRow[],
): ContractIssue[] {
  if (!storedRows) return []
  const storedComparable = comparableRows(storedRows)
  const projectedComparable = comparableRows(projectedRows)
  if (JSON.stringify(storedComparable) === JSON.stringify(projectedComparable)) return []
  return [{
    severity: "warning",
    message: "Stored chat rows differ from rows reprojected from raw run events. Inspect whether this is expected migration drift or a projection bug.",
  }]
}

function providerRefCoverage(parts: Record<string, any>[]): { withRefs: number; total: number } {
  const runtimeParts = parts.filter((part) =>
    part.type === "reasoning" ||
    part.type === "data-agent-runtime" ||
    (typeof part.type === "string" && part.type.startsWith("tool-"))
  )
  return {
    total: runtimeParts.length,
    withRefs: runtimeParts.filter((part) => Array.isArray(part.providerRefs) && part.providerRefs.length > 0).length,
  }
}

const liveMode = Bun.argv.includes("--live")
const checkMode = Bun.argv.includes("--check")
const timelineMode = Bun.argv.includes("--timeline")
const knownFlags = new Set(["--live", "--check", "--timeline"])
const runId = Bun.argv.find((arg, index) =>
  index > 1 &&
  !knownFlags.has(arg)
)
if (!runId) {
  console.error("Usage: bun scripts/agent-runtime-ui-eval.ts [--live] [--check] [--timeline] <agent_run_id>")
  process.exit(1)
}

const defaultDbPath = join(homedir(), "Library/Application Support/Ripple Dev/data/agents.db")
const dbPath = process.env.RIPPLE_AGENT_DB ?? defaultDbPath
if (!existsSync(dbPath)) {
  console.error(`Ripple agent database was not found at ${dbPath}`)
  process.exit(1)
}

const db = new Database(dbPath, { readonly: true })
const run = db.query(`
  select
    r.id,
    r.provider,
    r.model,
    r.status,
    r.prompt,
    w.path as projectPath
  from agent_runs r
  left join workspaces w on w.id = r.workspace_id
  where r.id = ?
`).get(runId) as RunRow | null

if (!run) {
  console.error(`No agent run found for ${runId}`)
  process.exit(1)
}

const eventRows = db.query(`
  select
    id,
    type,
    provider_type as providerType,
    provider_id as providerId,
    payload_json as payloadJson
  from agent_run_events
  where agent_run_id = ?
  order by sequence asc
`).all(runId) as EventRow[]

const storedMessage = db.query(`
  select
    parts_json as partsJson,
    metadata_json as metadataJson
  from conversation_messages
  where agent_run_id = ? and role = 'assistant'
  order by created_at desc
  limit 1
`).get(runId) as MessageRow | null

const events: RuntimeEventLike[] = eventRows.map((event, index) => ({
  id: event.id,
  type: event.type,
  agentRunId: run.id,
  sequence: index + 1,
  provider: run.provider,
  providerType: event.providerType,
  providerId: event.providerId,
  payloadJson: event.payloadJson,
}))

const projection = buildAgentRuntimeAssistantProjection({
  events,
  fallbackText: "",
  includeFallback: false,
})
const projectedRows = rowsFromParts({
  parts: projection.parts,
  projectPath: run.projectPath ?? undefined,
  live: liveMode,
})

console.log(`${run.provider}${run.model ? ` ${run.model}` : ""} - ${run.status}`)
console.log(truncate(run.prompt, 140))
console.log("")

let storedRows: EvalRow[] | null = null
if (storedMessage) {
  storedRows = rowsFromParts({
    parts: parseJson<Record<string, any>[]>(storedMessage.partsJson, []),
    projectPath: run.projectPath ?? undefined,
    live: liveMode,
  })
  printRows("Stored chat rows", storedRows)
  console.log("")
}

printRows("Rows if reprojected from run events", projectedRows)

const coverage = providerRefCoverage(projection.parts)
console.log("")
console.log(`Provider refs on reprojected runtime parts: ${coverage.withRefs}/${coverage.total}`)

const timelineIssues: ContractIssue[] = []
if (timelineMode) {
  console.log("")
  console.log("Timeline transitions from raw run events")
  let previousSignature = ""
  for (let index = 1; index <= events.length; index++) {
    const event = events[index - 1]
    const snapshotProjection = buildAgentRuntimeAssistantProjection({
      events: events.slice(0, index),
      fallbackText: "",
      finalize: false,
      includeFallback: false,
    })
    const rows = rowsFromParts({
      parts: snapshotProjection.parts,
      projectPath: run.projectPath ?? undefined,
      live: true,
    })
    const signature = comparableRows(rows).join("\n")
    if (!signature || signature === previousSignature) continue
    previousSignature = signature
    const providerType = event.providerType ? ` ${event.providerType}` : ""
    printRows(`After event ${index}/${events.length}: ${event.type ?? "event"}${providerType}`, rows)
    const issues = rowContractIssues(`After event ${index}`, rows)
    if (issues.length > 0) {
      timelineIssues.push(...issues)
      for (const issue of issues) {
        console.log(`    ${issue.severity.toUpperCase()}: ${issue.message}`)
      }
    }
    console.log("")
  }
}

const storedRowIssues = storedRows ? rowContractIssues("Stored chat rows", storedRows) : []
const projectedRowIssues = rowContractIssues("Rows if reprojected from run events", projectedRows)
const driftIssues = projectionDriftIssues(storedRows, projectedRows)
const issues = [
  ...storedRowIssues,
  ...projectedRowIssues,
  ...timelineIssues,
  ...driftIssues,
]

if (issues.length > 0) {
  console.log("")
  console.log("UI contract issues")
  for (const issue of issues) {
    console.log(`- ${issue.severity.toUpperCase()}: ${issue.message}`)
  }
}

const checkIssues = [
  ...storedRowIssues.filter((issue) => issue.severity === "error"),
  ...projectedRowIssues,
  ...timelineIssues,
  ...driftIssues.filter((issue) => issue.severity === "error"),
]

if (checkMode && checkIssues.length > 0) {
  process.exit(1)
}
