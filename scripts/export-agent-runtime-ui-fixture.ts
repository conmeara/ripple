#!/usr/bin/env bun
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { Database } from "bun:sqlite"
import {
  buildAgentRuntimeAssistantProjection,
  type RuntimeEventLike,
} from "../src/shared/agent-runtime-ui-projection"
import {
  activeMotionRuntimeItemId,
  buildMotionRuntimeActivity,
  buildMotionRuntimeTimeline,
  shouldShowMotionRuntimeThinkingFallback,
  type MotionRuntimeActivityItem,
} from "../src/renderer/features/agents/ui/motion-runtime-activity"

type RunRow = {
  id: string
  provider: string
  model: string | null
  status: string
  runKind: string
  prompt: string
  projectPath: string | null
}

type EventRow = {
  id: string
  sequence: number
  type: string
  providerType: string | null
  providerId: string | null
  payloadJson: string
}

type FixtureRow = {
  kind: MotionRuntimeActivityItem["kind"] | "reply"
  status: MotionRuntimeActivityItem["status"]
  title: string
  visual?: "snapshot" | "frame_sheet"
}

type FixtureCheckpoint = {
  name: string
  eventCount: number
  live: boolean
  expectedRows: FixtureRow[]
  shimmerCount: number
}

type Fixture = {
  schemaVersion: 1
  source: {
    provider: string
    model: string | null
    runKind: string
    status: string
    originalEventCount: number
    selectedEventCount: number
    note: string
  }
  projectPath: string
  events: RuntimeEventLike[]
  checkpoints: FixtureCheckpoint[]
}

function usage(): never {
  console.error([
    "Usage: bun scripts/export-agent-runtime-ui-fixture.ts --run <agent_run_id> --name <fixture-name> --out <path>",
    "",
    "Options:",
    "  --db <path>       Override the Ripple agent database path.",
    "  --all-events      Keep every run event instead of only visible UI transitions.",
  ].join("\n"))
  process.exit(1)
}

function argValue(flag: string): string | null {
  const index = Bun.argv.indexOf(flag)
  if (index < 0) return null
  return Bun.argv[index + 1] ?? null
}

function parseJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function truncate(value: string, max = 320): string {
  const normalized = value.length > max ? `${value.slice(0, max - 1)}...` : value
  return normalized
}

function rowsFromParts(input: {
  parts: Record<string, any>[]
  projectPath?: string
  live?: boolean
}): FixtureRow[] {
  const timeline = buildMotionRuntimeTimeline({
    parts: input.parts,
    projectPath: input.projectPath,
  })
  const rows: FixtureRow[] = []

  for (const entry of timeline) {
    if (entry.kind === "runtime") {
      const runtime = buildMotionRuntimeActivity({
        parts: entry.parts,
        events: entry.events,
        projectPath: input.projectPath,
      })
      for (const item of runtime.items) {
        rows.push({
          kind: item.kind,
          status: item.status,
          title: item.title,
          ...(item.visual ? { visual: item.visual.kind } : {}),
        })
      }
      continue
    }

    if (entry.part.type === "text" && String(entry.part.text ?? "").trim()) {
      rows.push({
        kind: "reply",
        status: entry.part.state === "streaming" ? "pending" : "done",
        title: "Agent reply",
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
    })
  }

  return rows
}

function comparableRows(rows: FixtureRow[]): string {
  return rows.map((row) => [
    row.kind,
    row.status,
    row.title,
    row.visual ?? "",
  ].join("|")).join("\n")
}

function projectRows(events: RuntimeEventLike[], options: { live: boolean; projectPath: string }): FixtureRow[] {
  const projection = buildAgentRuntimeAssistantProjection({
    events,
    fallbackText: "",
    finalize: !options.live,
    includeFallback: false,
  })
  return rowsFromParts({
    parts: projection.parts,
    projectPath: options.projectPath,
    live: options.live,
  })
}

function renderedShimmerCount(input: {
  events: RuntimeEventLike[]
  live: boolean
  projectPath: string
}): number {
  if (!input.live) return 0
  const projection = buildAgentRuntimeAssistantProjection({
    events: input.events,
    fallbackText: "",
    finalize: false,
    includeFallback: false,
  })
  const timeline = buildMotionRuntimeTimeline({
    parts: projection.parts,
    projectPath: input.projectPath,
  })
  const lastRuntimeEntry = [...timeline].reverse().find((entry) => entry.kind === "runtime")
  const shouldShowFallback = shouldShowMotionRuntimeThinkingFallback({
    timeline,
    projectPath: input.projectPath,
    sandboxSetupStatus: "ready",
    isStreaming: true,
    isLastMessage: true,
  })
  if (shouldShowFallback) return 1

  return timeline.some((entry) => {
    if (entry.kind !== "runtime" || entry.key !== lastRuntimeEntry?.key) return false
    const runtime = buildMotionRuntimeActivity({
      parts: entry.parts,
      events: entry.events,
      projectPath: input.projectPath,
    })
    return Boolean(activeMotionRuntimeItemId(runtime.items, true))
  }) ? 1 : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function createSanitizer(input: { runId: string; fixtureName: string }) {
  const idMap = new Map<string, string>([[input.runId, input.fixtureName]])
  let idCounter = 0

  const mapId = (value: string): string => {
    if (!value) return value
    if (!idMap.has(value)) {
      idCounter += 1
      idMap.set(value, `fixture-id-${String(idCounter).padStart(3, "0")}`)
    }
    return idMap.get(value) ?? value
  }

  const sanitizeString = (value: string, key?: string): string => {
    let next = value
      .replace(/\/Users\/conmeara\/Ripple\/test-project/gi, "/Users/motion/Ripple Projects/Fixture Project")
      .replace(/\/Users\/conmeara\/ripple\/test-project/gi, "/Users/motion/Ripple Projects/Fixture Project")
      .replace(/\/Users\/conmeara\/\.codex\/[^\s"'`]+/g, "/Users/motion/.codex/sanitized")
      .replace(/\/Users\/conmeara\/[^\s"'`]+/g, "/Users/motion/sanitized")
      .replace(/\/private\/var\/folders\/[^\s"'`]+/g, "/private/var/folders/sanitized")
      .replace(/\/var\/folders\/[^\s"'`]+/g, "/var/folders/sanitized")

    if (key && /(?:^|_)(?:id|ids)$|Id$|ID$/.test(key)) {
      next = mapId(next)
    }

    if (key === "data" && /^[A-Za-z0-9+/=]{80,}$/.test(next)) {
      return "iVBORw0KGgo="
    }

    if (
      key === "output" ||
      key === "stdout" ||
      key === "stderr" ||
      key === "delta" ||
      key === "diff" ||
      key === "text"
    ) {
      return truncate(next)
    }

    return next
  }

  const sanitizeValue = (value: unknown, key?: string): unknown => {
    if (typeof value === "string") return sanitizeString(value, key)
    if (Array.isArray(value)) return value.map((item) => sanitizeValue(item))
    if (!isRecord(value)) return value

    const result: Record<string, unknown> = {}
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (entryKey === "rawPayload") continue
      const sanitized = sanitizeValue(entryValue, entryKey)
      if (sanitized !== undefined) result[entryKey] = sanitized
    }
    return result
  }

  return {
    eventId: (value: string) => mapId(value),
    providerId: (value: string | null) => value ? mapId(value) : null,
    value: sanitizeValue,
  }
}

function buildSanitizedEvents(input: {
  run: RunRow
  rows: EventRow[]
  fixtureName: string
}): RuntimeEventLike[] {
  const sanitizer = createSanitizer({
    runId: input.run.id,
    fixtureName: input.fixtureName,
  })

  return input.rows.map((row, index) => {
    const payload = sanitizer.value(parseJson(row.payloadJson)) as Record<string, unknown>
    if (isRecord(payload.providerRefs)) {
      payload.providerRefs = {
        ...payload.providerRefs,
        eventId: `${input.fixtureName}-event-${String(index + 1).padStart(3, "0")}`,
        sequence: index + 1,
        provider: input.run.provider,
        runId: input.fixtureName,
      }
    }
    return {
      id: `${input.fixtureName}-event-${String(index + 1).padStart(3, "0")}`,
      type: row.type,
      agentRunId: input.fixtureName,
      sequence: index + 1,
      createdAt: `2026-05-21T12:00:${String(index % 60).padStart(2, "0")}.000Z`,
      provider: input.run.provider,
      providerType: row.providerType,
      providerId: sanitizer.providerId(row.providerId),
      payload,
    }
  })
}

function selectTransitionEvents(input: {
  events: RuntimeEventLike[]
  projectPath: string
  keepAllEvents: boolean
}): RuntimeEventLike[] {
  if (input.keepAllEvents) return input.events

  const selectedIndexes = new Set<number>()
  let previousSignature = ""

  for (let index = 1; index <= input.events.length; index++) {
    const event = input.events[index - 1]
    if (shouldKeepCoverageEvent(event)) selectedIndexes.add(index - 1)

    const prefix = input.events.slice(0, index)
    const signature = comparableRows(projectRows(prefix, {
      live: true,
      projectPath: input.projectPath,
    }))
    if (!signature || signature === previousSignature) continue
    selectedIndexes.add(index - 1)
    previousSignature = signature
  }

  const selectedToolIds = new Set<string>()
  for (const index of selectedIndexes) {
    const event = input.events[index]
    if (event?.type !== "tool_start") continue
    const payload = isRecord(event.payload) ? event.payload : {}
    const toolCallId = typeof payload.toolCallId === "string"
      ? payload.toolCallId
      : event.providerId
    if (toolCallId) selectedToolIds.add(toolCallId)
  }

  input.events.forEach((event, index) => {
    if (event.type !== "tool_end") return
    const payload = isRecord(event.payload) ? event.payload : {}
    const toolCallId = typeof payload.toolCallId === "string"
      ? payload.toolCallId
      : event.providerId
    if (toolCallId && selectedToolIds.has(toolCallId)) selectedIndexes.add(index)
  })

  if (input.events.length > 0) selectedIndexes.add(input.events.length - 1)

  return [...selectedIndexes].sort((a, b) => a - b).map((sourceIndex, index) => ({
    ...input.events[sourceIndex],
    sequence: index + 1,
  }))
}

function shouldKeepCoverageEvent(event: RuntimeEventLike | undefined): boolean {
  if (!event) return false
  if (
    event.type === "approval_request" ||
    event.type === "error" ||
    event.type === "file_change"
  ) {
    return true
  }
  if (event.type !== "status") return false
  const payload = isRecord(event.payload) ? event.payload : {}
  const status = typeof payload.status === "string"
    ? payload.status
    : typeof payload.state === "string"
      ? payload.state
      : null
  return status === "cancelled" || status === "failed" || status === "recoverable"
}

function buildCheckpoints(input: {
  events: RuntimeEventLike[]
  projectPath: string
}): FixtureCheckpoint[] {
  const checkpoints: FixtureCheckpoint[] = []
  let previousSignature = ""

  for (let index = 1; index <= input.events.length; index++) {
    const event = input.events[index - 1]
    const prefix = input.events.slice(0, index)
    const rows = projectRows(prefix, {
      live: true,
      projectPath: input.projectPath,
    })
    const signature = comparableRows(rows)
    if (!signature || signature === previousSignature) continue
    previousSignature = signature
    checkpoints.push({
      name: `after ${event.type}${event.providerType ? ` ${event.providerType}` : ""}`,
      eventCount: index,
      live: true,
      expectedRows: rows,
      shimmerCount: renderedShimmerCount({
        events: prefix,
        live: true,
        projectPath: input.projectPath,
      }),
    })
  }

  const finalRows = projectRows(input.events, {
    live: false,
    projectPath: input.projectPath,
  })
  const finalSignature = comparableRows(finalRows)
  if (finalSignature && finalSignature !== previousSignature) {
    checkpoints.push({
      name: "final transcript",
      eventCount: input.events.length,
      live: false,
      expectedRows: finalRows,
      shimmerCount: 0,
    })
  }

  return checkpoints
}

const runId = argValue("--run")
const fixtureName = argValue("--name")
const outPath = argValue("--out")
if (!runId || !fixtureName || !outPath) usage()

const dbPath =
  argValue("--db") ??
  process.env.RIPPLE_AGENT_DB ??
  join(homedir(), "Library/Application Support/Ripple Dev/data/agents.db")
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
    r.run_kind as runKind,
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
    sequence,
    type,
    provider_type as providerType,
    provider_id as providerId,
    payload_json as payloadJson
  from agent_run_events
  where agent_run_id = ?
  order by sequence asc
`).all(runId) as EventRow[]

const projectPath = "/Users/motion/Ripple Projects/Fixture Project"
const sanitizedEvents = buildSanitizedEvents({
  run,
  rows: eventRows,
  fixtureName,
})
const events = selectTransitionEvents({
  events: sanitizedEvents,
  projectPath,
  keepAllEvents: Bun.argv.includes("--all-events"),
})
const fixture: Fixture = {
  schemaVersion: 1,
  source: {
    provider: run.provider,
    model: run.model,
    runKind: run.runKind,
    status: run.status,
    originalEventCount: eventRows.length,
    selectedEventCount: events.length,
    note: `Sanitized from a real local Ripple Dev run. Prompt summary: ${truncate(compact(run.prompt), 140)}`,
  },
  projectPath,
  events,
  checkpoints: buildCheckpoints({
    events,
    projectPath,
  }),
}

await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8")
console.log(`Wrote ${outPath}`)
console.log(`${fixture.source.provider} ${fixture.source.model ?? ""} ${fixture.source.status}`)
console.log(`${fixture.source.selectedEventCount}/${fixture.source.originalEventCount} events, ${fixture.checkpoints.length} checkpoints`)
