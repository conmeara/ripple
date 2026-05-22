import type { AgentRuntimeProviderRefs } from "../../../../shared/agent-runtime-ui-projection"
import {
  agentRuntimeBasename as basename,
  agentRuntimeCommandForPart as commandForPart,
  agentRuntimePartId as partId,
  agentRuntimePartStatus as partStatus,
  agentRuntimeProviderRefsFromPart as providerRefsFromPart,
  agentRuntimeSummaryFromPart,
  agentRuntimeVisualToolKind,
  compactAgentRuntimeString as compactString,
  formatAgentRuntimeJson as formatJson,
  isAgentRuntimeChangeReviewCommand as isChangeReviewCommand,
  isAgentRuntimeProjectInspectionCommand as isProjectInspectionCommand,
  isAgentRuntimeRecord as isRecord,
  pluralAgentRuntimeCount as plural,
  titleForAgentRuntimeDataPart,
  titleForAgentRuntimeSummaryPart,
  truncateAgentRuntimeString as truncate,
  type AgentRuntimeSummaryPart,
  type AgentRuntimeSummaryStatus,
  type AgentRuntimeProductSummary,
} from "../../../../shared/agent-runtime-summary"

export type MotionRuntimeActivityKind =
  | "thinking"
  | "explored"
  | "reviewed_composition"
  | "visual_check"
  | "motion_change"
  | "verification"
  | "status"
  | "project_tool"

export type MotionRuntimeActivityStatus = AgentRuntimeSummaryStatus

export interface MotionRuntimeVisual {
  kind: "snapshot" | "frame_sheet"
  label: string
  artifactPath?: string
  imageUrl?: string
}

export interface MotionRuntimeActivityItem {
  id: string
  kind: MotionRuntimeActivityKind
  title: string
  subtitle: string
  status: MotionRuntimeActivityStatus
  tags: string[]
  preview?: string
  liveTitle?: string
  details?: MotionRuntimeActivityDetail[]
  collapsible?: boolean
  defaultExpanded?: boolean
  visual?: MotionRuntimeVisual
  startedAt?: number
}

export interface MotionRuntimeActivityDetail {
  id: string
  label: string
  value: string
}

export interface MotionRuntimeAdvancedDetail {
  id: string
  label: string
  value: string
}

export interface MotionRuntimeActivityProjection {
  items: MotionRuntimeActivityItem[]
  advancedDetails: MotionRuntimeAdvancedDetail[]
  hiddenTechnicalCount: number
}

export type MotionRuntimeTimelineEntry =
  | {
      kind: "runtime"
      key: string
      parts: AnyRecord[]
      events: MotionRuntimeCanonicalEvent[]
      startIndex: number
    }
  | {
      kind: "part"
      key: string
      part: AnyRecord
      index: number
    }

export interface MotionRuntimeMetadataLike {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  durationMs?: number
  totalCostUsd?: number
  model?: string
}

type AnyRecord = AgentRuntimeSummaryPart

type ExploringDetailDraft = MotionRuntimeActivityDetail & {
  key: string
  category: "file" | "list" | "search" | "web"
}

export type MotionRuntimeCanonicalEventType =
  | "content.delta"
  | "item.started"
  | "item.updated"
  | "item.completed"
  | "runtime.status"

export type MotionRuntimeCanonicalItemType =
  | "reasoning"
  | "project_inspection"
  | "command_execution"
  | "file_change"
  | "visual_context"
  | "motion_edit"
  | "status"
  | "project_tool"

export type MotionRuntimeCanonicalStreamKind =
  | "reasoning_summary"
  | "reasoning_text"
  | "status_text"
  | "tool_input"
  | "tool_output"

export interface MotionRuntimeCanonicalEvent {
  id: string
  type: MotionRuntimeCanonicalEventType
  index: number
  eventId?: string | null
  createdAt?: string | null
  provider?: string | null
  turnId?: string | null
  requestId?: string | null
  itemId: string
  itemType: MotionRuntimeCanonicalItemType
  status: MotionRuntimeActivityStatus
  sourceType?: string
  streamKind?: MotionRuntimeCanonicalStreamKind
  toolName?: string
  toolType?: string
  title?: string
  label?: string
  text?: string
  input?: unknown
  output?: unknown
  data?: AnyRecord
  visualKind?: MotionRuntimeVisual["kind"]
  preliminary?: boolean
  providerRefs?: AgentRuntimeProviderRefs[]
  sourcePart?: AnyRecord
}

const EXPLORING_TYPES = new Set([
  "tool-Read",
  "tool-Grep",
  "tool-Glob",
  "tool-WebSearch",
  "tool-WebFetch",
])

const TECHNICAL_TOOL_TYPES = new Set([
  "reasoning",
  "tool-Thinking",
  "tool-Read",
  "tool-Grep",
  "tool-Glob",
  "tool-WebSearch",
  "tool-WebFetch",
  "tool-Edit",
  "tool-Write",
  "tool-Bash",
])

function latestProviderRefs(part: AnyRecord): AgentRuntimeProviderRefs | null {
  return providerRefsFromPart(part).at(-1) ?? null
}

function productSummaryForPart(part: AnyRecord): AgentRuntimeProductSummary | null {
  return agentRuntimeSummaryFromPart(part)
}

function productSummaryTitle(part: AnyRecord): string | null {
  return compactString(productSummaryForPart(part)?.title)
}

export function visualToolKind(part: AnyRecord): "snapshot" | "frame_sheet" | null {
  return agentRuntimeVisualToolKind(part)
}

function firstJsonObject(value: string): Record<string, unknown> | null {
  const start = value.indexOf("{")
  if (start < 0) return null
  try {
    const parsed = JSON.parse(value.slice(start))
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function visualRecordFromOutput(output: unknown): {
  record: Record<string, unknown> | null
  dataImageUrl: string | null
} {
  if (Array.isArray(output)) {
    const text = output
      .map((item) => isRecord(item) && typeof item.text === "string" ? item.text : "")
      .filter(Boolean)
      .join("\n")
    const image = output.find((item) =>
      isRecord(item) &&
      item.type === "image" &&
      typeof item.data === "string" &&
      typeof item.mimeType === "string"
    )
    return {
      record: firstJsonObject(text),
      dataImageUrl: isRecord(image)
        ? `data:${image.mimeType};base64,${image.data}`
        : null,
    }
  }

  if (isRecord(output)) {
    if (Array.isArray(output.content)) return visualRecordFromOutput(output.content)
    return { record: output, dataImageUrl: null }
  }

  if (typeof output === "string") {
    return { record: firstJsonObject(output), dataImageUrl: null }
  }

  return { record: null, dataImageUrl: null }
}

function recordValue(record: Record<string, unknown> | null, ...keys: string[]): unknown {
  let current: unknown = record
  for (const key of keys) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }
  return current
}

function normalizedPathSegments(path: string): string[] {
  const normalized = path.replaceAll("\\", "/")
  const segments: string[] = []
  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments
}

function normalizeProjectPath(path: string): string {
  const prefix = path.startsWith("/") ? "/" : ""
  return `${prefix}${normalizedPathSegments(path).join("/")}`
}

function projectRelativePath(
  projectPath: string | undefined,
  artifactPath: string,
): string | null {
  if (!projectPath) return null
  let candidate = artifactPath.trim()
  if (!candidate) return null

  if (candidate.startsWith("file://")) {
    try {
      candidate = decodeURIComponent(new URL(candidate).pathname)
    } catch {
      return null
    }
  }

  const root = normalizeProjectPath(projectPath).replace(/\/+$/, "")
  if (candidate.startsWith("/")) {
    const absolute = normalizeProjectPath(candidate)
    if (absolute !== root && !absolute.startsWith(`${root}/`)) return null
    candidate = absolute.slice(root.length).replace(/^\/+/, "")
  }

  const rawSegments = candidate.replaceAll("\\", "/").split("/")
  if (rawSegments.some((segment) => segment === "..")) return null
  const relative = normalizedPathSegments(candidate).join("/")
  if (!relative.startsWith(".ripple/")) return null
  return relative
}

function projectImageUrl(projectPath: string | undefined, artifactPath: string | undefined): string | undefined {
  if (!artifactPath) return undefined
  if (artifactPath.startsWith("data:")) return artifactPath
  const relative = projectRelativePath(projectPath, artifactPath)
  if (!relative || !projectPath) return undefined
  const root = projectPath.replace(/\/+$/, "")
  return `file://${encodeURI(`${root}/${relative}`)}`
}

function visualFromPart(
  part: AnyRecord,
  projectPath: string | undefined,
): MotionRuntimeVisual | undefined {
  const kind = visualToolKind(part)
  if (!kind) return undefined

  const { record, dataImageUrl } = visualRecordFromOutput(part.output ?? part.result)
  const artifactPath =
    compactString(recordValue(record, "artifactPath")) ??
    compactString(recordValue(record, "artifact", "path")) ??
    compactString(recordValue(record, "payload", "snapshot", "path")) ??
    compactString(recordValue(record, "payload", "sheet", "path")) ??
    compactString(recordValue(record, "snapshot", "path")) ??
    compactString(recordValue(record, "sheet", "path")) ??
    undefined

  return {
    kind,
    label: kind === "frame_sheet" ? "Frame sheet" : "Current frame",
    artifactPath,
    imageUrl: dataImageUrl ?? projectImageUrl(projectPath, artifactPath),
  }
}

function isExploringPart(part: AnyRecord): boolean {
  if (EXPLORING_TYPES.has(part.type)) return true
  return part.type === "tool-Bash" && isProjectInspectionCommand(commandForPart(part))
}

function parsedCommandsForPart(part: AnyRecord): AnyRecord[] {
  const input = isRecord(part.input) ? part.input : {}
  const parsed = input.parsed_cmd ?? part.parsed_cmd
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isRecord)
}

function parsedCommandTarget(parsed: AnyRecord): string | null {
  return basename(parsed.name ?? parsed.path) ??
    basename(parsed.file_path) ??
    basename(parsed.target)
}

function stableParsedCommandKey(parsed: AnyRecord, fallback: string): string {
  return compactString(parsed.path) ??
    compactString(parsed.name) ??
    compactString(parsed.query) ??
    fallback
}

function explorationDraftForPart(part: AnyRecord, index: number): ExploringDetailDraft {
  const input = isRecord(part.input) ? part.input : {}
  const fallbackKey = partId(part, index, "explore-detail")
  let label = part.type.replace("tool-", "")
  let value = ""
  let category: ExploringDetailDraft["category"] = "file"
  let key = `${part.type}:${fallbackKey}`

  if (part.type === "tool-Read") {
    const name = basename(input.file_path ?? input.path) ?? "file"
    label = `Read ${name}`
    key = `file:${input.file_path ?? input.path ?? name}`
  } else if (part.type === "tool-Grep") {
    const name = basename(input.path)
    label = name ? `Searched ${name}` : "Searched project"
    value = compactString(input.pattern) ?? ""
    category = "search"
    key = `search:${input.path ?? "project"}:${input.pattern ?? ""}`
  } else if (part.type === "tool-Glob") {
    label = compactString(input.pattern)
      ? `Listed ${input.pattern}`
      : "Listed files"
    value = compactString(input.path ?? input.target_directory) ?? ""
    category = "list"
    key = `list:${input.path ?? input.target_directory ?? input.pattern ?? fallbackKey}`
  } else if (part.type === "tool-WebSearch") {
    label = compactString(input.query) ?? "Searched web"
    category = "web"
    key = `web-search:${label}`
  } else if (part.type === "tool-WebFetch") {
    label = compactString(input.url) ?? "Fetched reference"
    category = "web"
    key = `web-fetch:${label}`
  } else if (part.type === "tool-Bash") {
    const command = commandForPart(part)
    const parsed = parsedCommandsForPart(part)[0]
    const parsedType = compactString(parsed?.type)
    const target = parsed ? parsedCommandTarget(parsed) : null
    if (parsedType === "read") {
      label = `Read ${target ?? "project"}`
      key = `file:${stableParsedCommandKey(parsed, command ?? fallbackKey)}`
    } else if (parsedType === "search") {
      label = target ? `Searched ${target}` : "Searched project"
      value = compactString(parsed?.query) ?? ""
      category = "search"
      key = `search:${stableParsedCommandKey(parsed, command ?? fallbackKey)}:${value}`
    } else if (parsedType === "list") {
      label = target ? `Listed ${target}` : "Listed files"
      category = "list"
      key = `list:${stableParsedCommandKey(parsed, command ?? fallbackKey)}`
    } else if (/\b(ls|find)\b/.test(command?.toLowerCase() ?? "")) {
      label = "Listed files"
      category = "list"
      key = `list:${command ?? fallbackKey}`
    } else if (/\b(rg|grep|awk)\b/.test(command?.toLowerCase() ?? "")) {
      label = "Searched project"
      category = "search"
      key = `search:${command ?? fallbackKey}`
    } else {
      label = target ? `Read ${target}` : "Read project"
      key = `file:${target ?? command ?? fallbackKey}`
    }
  }

  return {
    id: `${fallbackKey}-detail`,
    key,
    category,
    label,
    value,
  }
}

function exploringCounts(parts: AnyRecord[]): { files: number; lists: number; searches: number; web: number } {
  const files = new Set<string>()
  const lists = new Set<string>()
  const searches = new Set<string>()
  const web = new Set<string>()

  for (const [index, part] of parts.entries()) {
    const detail = explorationDraftForPart(part, index)
    if (detail.category === "file") files.add(detail.key)
    else if (detail.category === "list") lists.add(detail.key)
    else if (detail.category === "search") searches.add(detail.key)
    else web.add(detail.key)
  }

  return {
    files: files.size,
    lists: lists.size,
    searches: searches.size,
    web: web.size,
  }
}

function exploringTitle(parts: AnyRecord[], status: MotionRuntimeActivityStatus): string {
  const counts = exploringCounts(parts)
  const pieces: string[] = []
  if (counts.files > 0) pieces.push(plural(counts.files, "file"))
  if (counts.lists > 0) pieces.push(plural(counts.lists, "list"))
  if (counts.searches > 0) pieces.push(plural(counts.searches, "search", "searches"))
  if (counts.web > 0) pieces.push(`searched web ${counts.web} ${counts.web === 1 ? "time" : "times"}`)

  const suffix = pieces.length > 0 ? ` ${pieces.join(", ")}` : ""
  return `${status === "pending" ? "Exploring" : "Explored"}${suffix}`
}

function exploringSubtitle(parts: AnyRecord[]): string {
  void parts
  return ""
}

function exploringTags(parts: AnyRecord[]): string[] {
  const tags = new Set<string>()
  for (const part of parts) {
    const input = isRecord(part.input) ? part.input : {}
    const fileName = basename(input.file_path ?? input.path)
    if (fileName?.endsWith(".html")) tags.add("composition")
    else if (fileName?.endsWith(".css")) tags.add("style")
    else if (fileName) tags.add("project file")
    if (part.type === "tool-Bash" && isProjectInspectionCommand(commandForPart(part))) tags.add("project file")
    if (part.type === "tool-Grep" || part.type === "tool-Glob") tags.add("search")
    if (part.type === "tool-WebSearch" || part.type === "tool-WebFetch") tags.add("reference")
  }
  return Array.from(tags).slice(0, 3)
}

function verificationTitle(part: AnyRecord, status: MotionRuntimeActivityStatus): string {
  return titleForAgentRuntimeSummaryPart(part, status)
}

function verificationSubtitle(part: AnyRecord): string {
  const command = commandForPart(part)
  if (isChangeReviewCommand(command)) {
    return ""
  }
  const output = part.output
  if (isRecord(output) && output.exitCode !== undefined && output.exitCode !== 0) {
    return "The check needs attention before the preview is ready."
  }
  const stdout = isRecord(output)
    ? compactString(output.stdout) ?? compactString(output.output)
    : typeof output === "string" ? output : null
  if (stdout && /no issues|passed|success|ok/i.test(stdout)) {
    return stdout.split("\n").find((line) => line.trim())?.trim() ?? "No issues found"
  }
  return ""
}

function addAdvancedDetail(
  details: MotionRuntimeAdvancedDetail[],
  part: AnyRecord,
  index: number,
  label: string,
  value: unknown,
): void {
  details.push({
    id: `${partId(part, index, "detail")}-${label}`,
    label,
    value: formatJson(value),
  })
}

export function isMotionRuntimeActivityPart(part: AnyRecord): boolean {
  if (!part?.type || part.type === "step-start" || part.type === "tool-TaskOutput") return false
  if (part.type === "data-agent-runtime") {
    return part.data?.kind === "status" || part.data?.kind === "file_change"
  }
  if (TECHNICAL_TOOL_TYPES.has(part.type)) return true
  if (visualToolKind(part)) return true
  return false
}

function canonicalItemTypeForPart(part: AnyRecord): MotionRuntimeCanonicalItemType {
  if (isReasoningPart(part)) return "reasoning"
  if (visualToolKind(part)) return "visual_context"
  if (part.type === "tool-Edit" || part.type === "tool-Write") return "motion_edit"
  if (part.type === "tool-Bash") {
    return isProjectInspectionCommand(commandForPart(part))
      ? "project_inspection"
      : "command_execution"
  }
  if (isExploringPart(part)) return "project_inspection"
  if (part.type === "data-agent-runtime") {
    return part.data?.kind === "file_change" ? "file_change" : "status"
  }
  return "project_tool"
}

function canonicalEventTypeForPart(part: AnyRecord): MotionRuntimeCanonicalEventType {
  if (isReasoningPart(part)) return "content.delta"
  if (part.type === "data-agent-runtime") return "runtime.status"
  const status = partStatus(part)
  if (status === "pending") return "item.started"
  return "item.completed"
}

function canonicalStreamKindForPart(part: AnyRecord): MotionRuntimeCanonicalStreamKind | undefined {
  if (isReasoningPart(part)) return "reasoning_text"
  if (part.type === "data-agent-runtime") return "status_text"
  if (partStatus(part) === "pending") return "tool_input"
  return "tool_output"
}

function canonicalPartLabel(part: AnyRecord): string | undefined {
  const summaryTitle = productSummaryTitle(part)
  if (summaryTitle) return summaryTitle
  if (part.type === "data-agent-runtime") {
    return titleForAgentRuntimeDataPart(part) ?? undefined
  }
  return compactString(part.toolName) ??
    compactString(part.type)?.replace(/^tool-/, "") ??
    undefined
}

function partToMotionRuntimeCanonicalEvent(
  part: AnyRecord,
  index: number,
): MotionRuntimeCanonicalEvent | null {
  if (!isMotionRuntimeActivityPart(part)) return null

  const itemId = partId(part, index, "runtime-item")
  const eventType = canonicalEventTypeForPart(part)
  const itemType = canonicalItemTypeForPart(part)
  const providerRefs = providerRefsFromPart(part)
  const latestRefs = providerRefs.at(-1) ?? null
  const event: MotionRuntimeCanonicalEvent = {
    id: latestRefs?.eventId ?? `${eventType}:${itemId}:${index}`,
    type: eventType,
    index,
    eventId: latestRefs?.eventId ?? null,
    createdAt: latestRefs?.createdAt ?? null,
    provider: latestRefs?.provider ?? null,
    turnId: latestRefs?.turnId ?? null,
    requestId: latestRefs?.requestId ?? null,
    itemId,
    itemType,
    status: partStatus(part),
    providerRefs,
    sourcePart: part,
  }
  const sourceType = compactString(part.type)
  const streamKind = canonicalStreamKindForPart(part)
  const toolName = compactString(part.toolName) ?? (
    sourceType?.startsWith("tool-") ? sourceType.slice(5) : undefined
  )
  const label = canonicalPartLabel(part)
  const text = isReasoningPart(part) ? reasoningText(part) : undefined
  const visualKind = visualToolKind(part)
  const productSummary = productSummaryForPart(part)

  if (sourceType) event.sourceType = sourceType
  if (streamKind) event.streamKind = streamKind
  if (toolName) event.toolName = toolName
  if (sourceType?.startsWith("tool-")) event.toolType = sourceType
  if (productSummary?.title) event.title = productSummary.title
  if (label) event.label = label
  if (text) event.text = text
  if (part.input !== undefined) event.input = part.input
  if (part.output !== undefined) event.output = part.output
  else if (part.result !== undefined) event.output = part.result
  if (isRecord(part.data)) event.data = part.data
  if (visualKind) event.visualKind = visualKind
  if (part.preliminary === true) event.preliminary = true

  return event
}

export function buildMotionRuntimeCanonicalEvents(input: {
  parts: AnyRecord[]
  includeRuntimePart?: (part: AnyRecord, index: number) => boolean
}): MotionRuntimeCanonicalEvent[] {
  const includeRuntimePart = input.includeRuntimePart ?? (() => true)
  const events: MotionRuntimeCanonicalEvent[] = []
  for (let index = 0; index < input.parts.length; index++) {
    const part = input.parts[index]
    if (!includeRuntimePart(part, index)) continue
    const event = partToMotionRuntimeCanonicalEvent(part, index)
    if (event) events.push(event)
  }
  return events
}

function stateForCanonicalStatus(status: MotionRuntimeActivityStatus): string {
  if (status === "pending") return "input-available"
  if (status === "error") return "output-error"
  return "output-available"
}

function syntheticPartForCanonicalEvent(event: MotionRuntimeCanonicalEvent): AnyRecord {
  const state = stateForCanonicalStatus(event.status)
  if (event.itemType === "reasoning") {
    const textKey = event.streamKind === "reasoning_summary" ? "summary" : "text"
    return {
      id: event.itemId,
      type: "reasoning",
      [textKey]: event.text ?? "",
      state,
    }
  }

  if (event.itemType === "status" || event.itemType === "file_change") {
    return {
      id: event.itemId,
      type: "data-agent-runtime",
      state,
      data: event.data ?? {
        kind: event.itemType === "file_change" ? "file_change" : "status",
        label: event.label,
        payload: event.output,
      },
      preliminary: event.preliminary,
    }
  }

  const toolType =
    event.toolType ??
    (event.itemType === "visual_context"
      ? `tool-mcp__ripple_visual_context__ripple_${event.visualKind === "frame_sheet" ? "frame_sheet" : "snapshot"}`
      : event.itemType === "motion_edit"
        ? "tool-Edit"
        : event.itemType === "command_execution"
          ? "tool-Bash"
          : event.itemType === "project_inspection"
            ? "tool-Read"
            : "tool-Agent")

  const syntheticPart: AnyRecord = {
    id: event.itemId,
    toolCallId: event.itemId,
    type: toolType,
    state,
  }
  if (event.toolName) syntheticPart.toolName = event.toolName
  if (event.input !== undefined) syntheticPart.input = event.input
  if (event.output !== undefined) syntheticPart.output = event.output
  if (event.preliminary === true) syntheticPart.preliminary = true
  return syntheticPart
}

function partForCanonicalEvent(event: MotionRuntimeCanonicalEvent): AnyRecord {
  return event.sourcePart ?? syntheticPartForCanonicalEvent(event)
}

function canonicalEventStatus(
  event: MotionRuntimeCanonicalEvent,
  options: { allowPending?: boolean } = {},
): MotionRuntimeActivityStatus {
  if (event.status === "error") return "error"
  if (event.status === "pending" || event.preliminary === true) {
    return options.allowPending === false ? "done" : "pending"
  }
  return "done"
}

function isExploringEvent(event: MotionRuntimeCanonicalEvent): boolean {
  return event.itemType === "project_inspection" || isExploringPart(partForCanonicalEvent(event))
}

function isReasoningEvent(event: MotionRuntimeCanonicalEvent): boolean {
  return event.itemType === "reasoning" || isReasoningPart(partForCanonicalEvent(event))
}

function isMotionRuntimeActivityEvent(event: MotionRuntimeCanonicalEvent): boolean {
  if (isMotionRuntimeActivityPart(partForCanonicalEvent(event))) return true
  return event.itemType === "project_tool"
}

export function hasMotionRuntimeActivityParts(parts: AnyRecord[]): boolean {
  return parts.some(isMotionRuntimeActivityPart)
}

function canProduceRuntimeActivityItem(
  event: MotionRuntimeCanonicalEvent,
  projectPath: string | undefined,
): boolean {
  const part = partForCanonicalEvent(event)
  if (!isMotionRuntimeActivityEvent(event)) return false
  if (isExploringEvent(event)) return true
  if (isReasoningEvent(event)) return true
  if (visualFromPart(part, projectPath)) return true
  if (part.type === "tool-Edit" || part.type === "tool-Write" || part.type === "tool-Bash") {
    return true
  }
  if (part.type === "data-agent-runtime") {
    const label = titleForAgentRuntimeDataPart(part)
    return Boolean(label)
  }
  return true
}

function allowPendingForActivityAt(
  events: MotionRuntimeCanonicalEvent[],
  index: number,
  projectPath: string | undefined,
): boolean {
  for (let cursor = index + 1; cursor < events.length; cursor++) {
    if (canProduceRuntimeActivityItem(events[cursor], projectPath)) return false
  }
  return true
}

function hasVisibleActivityAfter(
  events: MotionRuntimeCanonicalEvent[],
  index: number,
  projectPath: string | undefined,
): boolean {
  for (let cursor = index + 1; cursor < events.length; cursor++) {
    const part = partForCanonicalEvent(events[cursor])
    if (isThinkingStatusPart(part)) continue
    if (canProduceRuntimeActivityItem(events[cursor], projectPath)) return true
  }
  return false
}

function isReasoningPart(part: AnyRecord): boolean {
  return part.type === "reasoning" || part.type === "tool-Thinking"
}

function reasoningText(part: AnyRecord): string {
  return (
    compactString(part.text) ??
    compactString(part.input?.text) ??
    compactString(part.input?.thought) ??
    compactString(part.output?.text) ??
    compactString(part.output?.thought) ??
    ""
  )
}

// Codex emits a short, model-authored summary alongside the full reasoning.
// We use it as the headline so we never have to guess one from raw thought text.
function reasoningSummary(part: AnyRecord): string {
  return (
    compactString(part.summary) ??
    compactString(part.input?.summary) ??
    ""
  )
}

function plainThoughtPreview(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_#>~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function leadingThoughtHeading(value: string): string | null {
  const trimmed = value.trim()
  const boldMatch = trimmed.match(/^\*\*([^*]+)\*\*/)
  if (boldMatch?.[1]) return plainThoughtPreview(boldMatch[1])

  const headingMatch = trimmed.match(/^#{1,6}\s+([^\n]+)/)
  if (headingMatch?.[1]) return plainThoughtPreview(headingMatch[1])

  return null
}

function neutralizeFirstPersonThought(value: string): string {
  return value
    .replace(/^i\s+need\s+to\s+/i, "")
    .replace(/^i'?m\s+/i, "")
    .replace(/^i\s+am\s+/i, "")
    .replace(/^i'?ll\s+/i, "")
    .replace(/^i\s+will\s+/i, "")
    .trim()
}

function sentenceCase(value: string): string {
  if (!value) return value
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

function designerFacingThoughtHeadline(value: string): string {
  const normalized = value.toLowerCase()
  if (normalized.includes("hyperframes")) {
    if (normalized.includes("validat") || normalized.includes("lint")) {
      return "Checking project"
    }
    if (normalized.includes("command")) {
      return "Checking project tools"
    }
  }
  if (/\bcss\b|\bjs\b|\bjavascript\b/.test(normalized)) {
    if (normalized.includes("adjust") || normalized.includes("position")) {
      return "Adjusting composition"
    }
    if (normalized.includes("inspect")) {
      return "Checking layout"
    }
  }
  return value
}

// Produces a clean, glanceable headline. Prefers the model's own summary; falls
// back to a lightly-cleaned first line of the full thought (markdown stripped,
// first person neutralized). It deliberately never drops real content — the full
// thought is always available in the expandable detail.
export function displayThoughtText(value: string): string {
  const heading = leadingThoughtHeading(value)
  if (heading) return truncate(designerFacingThoughtHeadline(heading), 96)

  const preview = plainThoughtPreview(value)
  if (!preview) return ""
  return truncate(
    designerFacingThoughtHeadline(sentenceCase(neutralizeFirstPersonThought(preview))),
    96,
  )
}

function thinkingHeadline(summaryText: string, detailText: string): string {
  const source = compactString(summaryText) ?? detailText
  return source ? displayThoughtText(source) : ""
}

function thinkingTitle(headline: string, status: MotionRuntimeActivityStatus): string {
  void headline
  void status
  return "Thinking"
}

// The expandable detail carries the FULL reasoning text (detail on demand),
// not the cleaned headline — that's the transparency the headline trades away.
function thinkingDetails(detailText: string, id: string): MotionRuntimeActivityDetail[] | undefined {
  const value = compactString(detailText)
  if (!value) return undefined
  return [{
    id: `${id}-thought`,
    label: "Thought",
    value,
  }]
}

function thinkingSubtitle(_hasDetails: boolean): string {
  return ""
}

function activityStartedAt(event: MotionRuntimeCanonicalEvent): number | undefined {
  const part = partForCanonicalEvent(event)
  if (typeof part.startedAt === "number" && Number.isFinite(part.startedAt)) {
    return part.startedAt
  }
  if (event.createdAt) {
    const timestamp = Date.parse(event.createdAt)
    if (Number.isFinite(timestamp)) return timestamp
  }
  return undefined
}

function isThinkingStatusPart(part: AnyRecord): boolean {
  if (part.type !== "data-agent-runtime" || part.data?.kind !== "status") return false
  const label = titleForAgentRuntimeDataPart(part)
  return label === "Thinking"
}

function fileChangeKey(part: AnyRecord): string | null {
  if (part.type !== "data-agent-runtime" || part.data?.kind !== "file_change") return null
  const payload = isRecord(part.data?.payload) ? part.data.payload : {}
  const diff = compactString(payload.diff)
  if (diff) return `file-change:${diff}`
  return `file-change:${formatJson(payload)}`
}

function runtimeDedupeKey(part: AnyRecord, projectPath: string | undefined): string | null {
  const fileKey = fileChangeKey(part)
  if (fileKey) return fileKey

  if (part.type === "data-agent-runtime" && part.data?.kind === "status") {
    const label = titleForAgentRuntimeDataPart(part)
    return label ? `status:${label}` : null
  }

  const visual = visualFromPart(part, projectPath)
  if (visual?.artifactPath) return `visual:${visual.kind}:${visual.artifactPath}`

  return null
}

function eventCanRemainPending(event: MotionRuntimeCanonicalEvent): boolean {
  return event.status === "pending" || event.preliminary === true
}

function settleStalePendingTimelineEvents(
  entries: MotionRuntimeTimelineEntry[],
): MotionRuntimeTimelineEntry[] {
  let foundLatestPending = false
  let latestPendingRuntimeId: string | null = null
  for (let entryIndex = entries.length - 1; entryIndex >= 0 && !foundLatestPending; entryIndex--) {
    const entry = entries[entryIndex]
    if (entry.kind === "part") {
      if (
        entry.part.type === "text" &&
        (entry.part.state === "streaming" || entry.part.state === "pending") &&
        compactString(entry.part.text)
      ) {
        foundLatestPending = true
      }
      continue
    }
    for (let eventIndex = entry.events.length - 1; eventIndex >= 0; eventIndex--) {
      const event = entry.events[eventIndex]
      if (eventCanRemainPending(event)) {
        latestPendingRuntimeId = event.id
        foundLatestPending = true
        break
      }
    }
  }
  if (!foundLatestPending) return entries

  return entries.map((entry) => {
    if (entry.kind !== "runtime") return entry
    let changed = false
    const events = entry.events.map((event) => {
      if (!eventCanRemainPending(event) || event.id === latestPendingRuntimeId) return event
      changed = true
      return {
        ...event,
        status: "done" as MotionRuntimeActivityStatus,
        preliminary: false,
      }
    })
    return changed ? { ...entry, events } : entry
  })
}

function hasLaterNonThinkingRuntimePart(input: {
  parts: AnyRecord[]
  startIndex: number
  projectPath?: string
  includeRuntimePart: (part: AnyRecord, index: number) => boolean
}): boolean {
  for (let index = input.startIndex + 1; index < input.parts.length; index++) {
    const part = input.parts[index]
    if (!isMotionRuntimeActivityPart(part) || !input.includeRuntimePart(part, index)) {
      continue
    }
    if (isReasoningPart(part) || isThinkingStatusPart(part)) {
      continue
    }
    const event = partToMotionRuntimeCanonicalEvent(part, index)
    if (event && canProduceRuntimeActivityItem(event, input.projectPath)) {
      return true
    }
  }
  return false
}

function hasLaterVisibleAssistantText(input: {
  parts: AnyRecord[]
  startIndex: number
}): boolean {
  for (let index = input.startIndex + 1; index < input.parts.length; index++) {
    const part = input.parts[index]
    if (
      part?.type === "text" &&
      compactString(part.text)
    ) {
      return true
    }
  }
  return false
}

function hasEarlierVisibleAssistantText(input: {
  parts: AnyRecord[]
  beforeIndex: number
}): boolean {
  for (let index = 0; index < input.beforeIndex; index++) {
    const part = input.parts[index]
    if (
      part?.type === "text" &&
      compactString(part.text)
    ) {
      return true
    }
  }
  return false
}

function isConcreteEditPart(part: AnyRecord): boolean {
  return part.type === "tool-Edit" || part.type === "tool-Write"
}

function editFileName(part: AnyRecord): string | null {
  const input = isRecord(part.input) ? part.input : {}
  return basename(input.file_path ?? input.path)
}

function diffStatsFromPatch(patches: unknown): { added: number; removed: number } | null {
  if (!Array.isArray(patches)) return null
  let added = 0
  let removed = 0
  for (const patch of patches) {
    if (!isRecord(patch) || !Array.isArray(patch.lines)) continue
    for (const line of patch.lines) {
      if (typeof line !== "string") continue
      if (line.startsWith("+") && !line.startsWith("+++")) added += 1
      if (line.startsWith("-") && !line.startsWith("---")) removed += 1
    }
  }
  return added || removed ? { added, removed } : null
}

function diffStatsForEdit(part: AnyRecord): string {
  const input = isRecord(part.input) ? part.input : {}
  const output = isRecord(part.output) ? part.output : {}
  const fromPatch = diffStatsFromPatch(output.structuredPatch)
  if (fromPatch) return `+${fromPatch.added} -${fromPatch.removed}`

  const oldString = compactString(input.old_string)
  const newString = compactString(input.new_string)
  if (!oldString && !newString) return ""
  if (oldString === newString) return ""

  const oldLines = (oldString ?? "").split("\n")
  const newLines = (newString ?? "").split("\n")
  const maxLines = Math.max(oldLines.length, newLines.length)
  let changed = 0
  for (let index = 0; index < maxLines; index++) {
    if (oldLines[index] !== newLines[index]) changed += 1
  }
  return changed > 0 ? `+${changed} -${changed}` : ""
}

function editTitle(parts: AnyRecord[], status: MotionRuntimeActivityStatus): string {
  return titleForAgentRuntimeSummaryPart(parts[0] ?? { type: "tool-Edit" }, status)
}

function editSubtitle(_parts: AnyRecord[], _status: MotionRuntimeActivityStatus): string {
  return ""
}

function editDetails(parts: AnyRecord[], index: number): MotionRuntimeActivityDetail[] {
  return parts.map((part, offset) => {
    const fileName = editFileName(part) ?? "file"
    const stats = diffStatsForEdit(part)
    return {
      id: `${partId(part, index + offset, "edit-detail")}-file`,
      label: stats ? `${fileName} ${stats}` : fileName,
      value: "",
    }
  })
}

function exploringDetails(parts: AnyRecord[], startIndex: number): MotionRuntimeActivityDetail[] {
  const details = new Map<string, {
    detail: MotionRuntimeActivityDetail
    category: ExploringDetailDraft["category"]
    count: number
  }>()

  for (const [offset, part] of parts.entries()) {
    const draft = explorationDraftForPart(part, startIndex + offset)
    const existing = details.get(draft.key)
    if (existing) {
      existing.count += 1
      continue
    }
    details.set(draft.key, {
      category: draft.category,
      count: 1,
      detail: {
        id: draft.id,
        label: draft.label,
        value: draft.value,
      },
    })
  }

  return Array.from(details.values()).map(({ detail, category, count }) => ({
    ...detail,
    label: count > 1
      ? `${detail.label} (${count} ${category === "file" ? "reads" : "times"})`
      : detail.label,
  }))
}

export function buildMotionRuntimeTimeline(input: {
  parts: AnyRecord[]
  projectPath?: string
  includeRuntimePart?: (part: AnyRecord, index: number) => boolean
}): MotionRuntimeTimelineEntry[] {
  const includeRuntimePart = input.includeRuntimePart ?? (() => true)
  const hasReasoning = input.parts.some((part, index) =>
    isReasoningPart(part) && includeRuntimePart(part, index)
  )
  const hasConcreteEdit = input.parts.some((part, index) =>
    isConcreteEditPart(part) && includeRuntimePart(part, index)
  )
  const seen = new Set<string>()
  const entries: MotionRuntimeTimelineEntry[] = []
  let runtimeParts: AnyRecord[] = []
  let runtimeEvents: MotionRuntimeCanonicalEvent[] = []
  let runtimeStartIndex = -1

  const flushRuntime = () => {
    if (runtimeParts.length === 0) return
    const first = runtimeParts[0]
    entries.push({
      kind: "runtime",
      key: `runtime-${runtimeStartIndex}-${partId(first, runtimeStartIndex, "runtime")}`,
      parts: runtimeParts,
      events: runtimeEvents,
      startIndex: runtimeStartIndex,
    })
    runtimeParts = []
    runtimeEvents = []
    runtimeStartIndex = -1
  }

  for (let index = 0; index < input.parts.length; index++) {
    const part = input.parts[index]
    const shouldRenderAsRuntime =
      isMotionRuntimeActivityPart(part) && includeRuntimePart(part, index)

    if (!shouldRenderAsRuntime) {
      flushRuntime()
      entries.push({
        kind: "part",
        key: `part-${index}-${partId(part, index, "part")}`,
        part,
        index,
      })
      continue
    }

    if (hasConcreteEdit && fileChangeKey(part)) {
      continue
    }

    if (hasReasoning && isThinkingStatusPart(part)) {
      continue
    }

    if (
      (isReasoningPart(part) || isThinkingStatusPart(part)) &&
      partStatus(part, { allowPending: true }) !== "pending" &&
      hasEarlierVisibleAssistantText({
        parts: input.parts,
        beforeIndex: index,
      })
    ) {
      continue
    }

    if (
      (isReasoningPart(part) || isThinkingStatusPart(part)) &&
      (
        hasLaterNonThinkingRuntimePart({
          parts: input.parts,
          startIndex: index,
          projectPath: input.projectPath,
          includeRuntimePart,
        }) ||
        hasLaterVisibleAssistantText({
          parts: input.parts,
          startIndex: index,
        })
      )
    ) {
      continue
    }

    const dedupeKey = runtimeDedupeKey(part, input.projectPath)
    if (dedupeKey) {
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
    }

    if (runtimeParts.length === 0) runtimeStartIndex = index
    runtimeParts.push(part)
    const event = partToMotionRuntimeCanonicalEvent(part, index)
    if (event) runtimeEvents.push(event)
  }

  flushRuntime()
  return settleStalePendingTimelineEvents(entries)
}

export function shouldHideMotionRuntimeInterimPart(input: {
  entry: MotionRuntimeTimelineEntry
  timeline: MotionRuntimeTimelineEntry[]
  index: number
}): boolean {
  void input
  // Assistant text is part of the transcript, even when the agent continues
  // with more runtime work afterward. Earlier we treated that text as interim
  // status and hid it once the next tool row arrived; that made live agent
  // messages disappear mid-run.
  return false
}

export function shouldShowMotionRuntimeThinkingFallback(input: {
  timeline: MotionRuntimeTimelineEntry[]
  projectPath?: string
  sandboxSetupStatus?: string
  isStreaming: boolean
  isLastMessage: boolean
}): boolean {
  if (input.sandboxSetupStatus !== "ready" || !input.isStreaming || !input.isLastMessage) {
    return false
  }

  const lastRuntimeIndex = input.timeline.reduce(
    (lastIndex, entry, index) => entry.kind === "runtime" ? index : lastIndex,
    -1,
  )
  if (lastRuntimeIndex < 0) return false

  const hasVisibleAssistantTextAfterLastRuntime = input.timeline
    .slice(lastRuntimeIndex + 1)
    .some((entry) =>
      entry.kind === "part" &&
      entry.part.type === "text" &&
      Boolean(compactString(entry.part.text))
    )
  if (hasVisibleAssistantTextAfterLastRuntime) return false

  let hasRuntimeEntry = false
  let hasPendingItem = false
  let hasThinkingItem = false

  for (const entry of input.timeline) {
    if (entry.kind !== "runtime") continue
    hasRuntimeEntry = true
    const projection = buildMotionRuntimeActivity({
      events: entry.events,
      projectPath: input.projectPath,
    })
    for (const item of projection.items) {
      if (item.kind === "thinking") hasThinkingItem = true
      if (item.status === "pending") hasPendingItem = true
    }
  }

  return hasRuntimeEntry && !hasPendingItem && !hasThinkingItem
}

export function activeMotionRuntimeItemId(
  items: MotionRuntimeActivityItem[],
  isLive?: boolean,
): string | undefined {
  if (!isLive) return undefined
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]
    if (item.status === "pending") return item.id
  }
  return undefined
}

export function buildMotionRuntimeActivity(input: {
  parts?: AnyRecord[]
  events?: MotionRuntimeCanonicalEvent[]
  metadata?: MotionRuntimeMetadataLike
  projectPath?: string
}): MotionRuntimeActivityProjection {
  const items: MotionRuntimeActivityItem[] = []
  const advancedDetails: MotionRuntimeAdvancedDetail[] = []
  const events = input.events ?? buildMotionRuntimeCanonicalEvents({ parts: input.parts ?? [] })
  const hasReasoning = events.some(isReasoningEvent)

  for (let index = 0; index < events.length; index++) {
    const event = events[index]
    const part = partForCanonicalEvent(event)
    if (!isMotionRuntimeActivityEvent(event)) continue

    if (isExploringEvent(event)) {
      const group: MotionRuntimeCanonicalEvent[] = [event]
      let cursor = index + 1
      while (cursor < events.length && isExploringEvent(events[cursor])) {
        group.push(events[cursor])
        cursor += 1
      }
      index = cursor - 1
      const groupParts = group.map(partForCanonicalEvent)
      const allowPending = allowPendingForActivityAt(events, cursor - 1, input.projectPath)
      const status = group.some((item) => canonicalEventStatus(item, { allowPending }) === "pending") ? "pending" : "done"
      items.push({
        id: `explored-${partId(part, index, "explore")}`,
        kind: "explored",
        title: exploringTitle(groupParts, status),
        subtitle: exploringSubtitle(groupParts),
        status,
        tags: exploringTags(groupParts),
        details: exploringDetails(groupParts, index),
        collapsible: true,
        defaultExpanded: false,
      })
      for (const [groupIndex, item] of group.entries()) {
        const groupPart = partForCanonicalEvent(item)
        addAdvancedDetail(
          advancedDetails,
          groupPart,
          index + groupIndex,
          groupPart.type.replace("tool-", ""),
          groupPart.input ?? item,
        )
      }
      continue
    }

    if (isReasoningEvent(event)) {
      const group: MotionRuntimeCanonicalEvent[] = [event]
      let cursor = index + 1
      while (cursor < events.length && isReasoningEvent(events[cursor])) {
        group.push(events[cursor])
        cursor += 1
      }
      index = cursor - 1
      const groupParts = group.map(partForCanonicalEvent)
      const detailText = groupParts.map(reasoningText).filter(Boolean).join("\n\n")
      const summaryText = groupParts.map(reasoningSummary).filter(Boolean).join("\n")
      const allowPending = allowPendingForActivityAt(events, cursor - 1, input.projectPath)
      const status = group.some((item) => canonicalEventStatus(item, { allowPending }) === "pending") ? "pending" : "done"
      if (status !== "pending" && hasVisibleActivityAfter(events, cursor - 1, input.projectPath)) {
        continue
      }
      const id = `thinking-${partId(part, index, "reasoning")}`
      const headline = thinkingHeadline(summaryText, detailText)
      if (status === "pending" || headline) {
        items.push({
          id,
          kind: "thinking",
          title: thinkingTitle(headline, status),
          subtitle: thinkingSubtitle(Boolean(detailText.trim())),
          status,
          tags: [],
          preview: headline || undefined,
          liveTitle: status === "pending" && headline ? headline : undefined,
          details: thinkingDetails(detailText, id),
          defaultExpanded: false,
          startedAt: group.map(activityStartedAt).find((value) => value !== undefined),
        })
      }
      continue
    }

    const visual = visualFromPart(part, input.projectPath)
    if (visual) {
      const status = canonicalEventStatus(event, {
        allowPending: allowPendingForActivityAt(events, index, input.projectPath),
      })
      items.push({
        id: `visual-${partId(part, index, "visual")}`,
        kind: "visual_check",
        title: titleForAgentRuntimeSummaryPart(part, status),
        subtitle: "",
        status,
        tags: [visual.label.toLowerCase()],
        visual,
      })
      addAdvancedDetail(advancedDetails, part, index, "Ripple visual tool", {
        tool: part.toolName ?? part.type,
        input: part.input,
        output: part.output,
      })
      continue
    }

    if (part.type === "tool-Edit" || part.type === "tool-Write") {
      const startIndex = index
      const group: MotionRuntimeCanonicalEvent[] = [event]
      let cursor = index + 1
      while (
        cursor < events.length &&
        (
          partForCanonicalEvent(events[cursor]).type === "tool-Edit" ||
          partForCanonicalEvent(events[cursor]).type === "tool-Write"
        )
      ) {
        group.push(events[cursor])
        cursor += 1
      }
      index = cursor - 1
      const groupParts = group.map(partForCanonicalEvent)
      const allowPending = allowPendingForActivityAt(events, cursor - 1, input.projectPath)
      const status = group.some((item) => canonicalEventStatus(item, { allowPending }) === "pending") ? "pending" : "done"
      items.push({
        id: `change-${partId(part, startIndex, "change")}`,
        kind: "motion_change",
        title: editTitle(groupParts, status),
        subtitle: editSubtitle(groupParts, status),
        status,
        tags: groupParts.some((item) => item.type === "tool-Write") ? ["created", "saved"] : ["saved"],
        details: editDetails(groupParts, startIndex),
      })
      for (const [groupIndex, item] of group.entries()) {
        const groupPart = partForCanonicalEvent(item)
        addAdvancedDetail(advancedDetails, groupPart, startIndex + groupIndex, groupPart.type.replace("tool-", ""), {
          input: groupPart.input,
          output: groupPart.output,
        })
      }
      continue
    }

    if (part.type === "tool-Bash") {
      const status = canonicalEventStatus(event, {
        allowPending: allowPendingForActivityAt(events, index, input.projectPath),
      })
      items.push({
        id: `verify-${partId(part, index, "verify")}`,
        kind: "verification",
        title: verificationTitle(part, status),
        subtitle: verificationSubtitle(part),
        status,
        tags: status === "error" ? ["needs attention"] : ["ready"],
      })
      addAdvancedDetail(advancedDetails, part, index, "Command", {
        command: commandForPart(part),
        output: part.output,
      })
      continue
    }

    if (part.type === "data-agent-runtime") {
      const summary = productSummaryForPart(part)
      const label = titleForAgentRuntimeDataPart(part)
      if (label) {
        const status = canonicalEventStatus(event, {
          allowPending: allowPendingForActivityAt(events, index, input.projectPath),
        })
        const isMotionChange = summary?.kind === "motion_edit" || part.data?.kind === "file_change"
        if (isThinkingStatusPart(part)) {
          if (!hasReasoning && (status === "pending" || !hasVisibleActivityAfter(events, index, input.projectPath))) {
            items.push({
              id: `thinking-${partId(part, index, "status")}`,
              kind: "thinking",
              title: "Thinking",
              subtitle: thinkingSubtitle(false),
              status,
              tags: [],
              defaultExpanded: false,
              startedAt: activityStartedAt(event),
            })
          }
        } else {
          items.push({
            id: `status-${partId(part, index, "status")}`,
            kind: isMotionChange ? "motion_change" : "status",
            title: label,
            subtitle: isMotionChange
              ? ""
              : "Runtime status update.",
            status,
            tags: [],
          })
        }
      }
      addAdvancedDetail(advancedDetails, part, index, "Runtime status", part.data)
      continue
    }

    items.push({
      id: `tool-${partId(part, index, "tool")}`,
      kind: "project_tool",
      title: canonicalEventStatus(event) === "pending" ? "Working on project" : "Updated project",
      subtitle: "Handled a project operation in the background.",
      status: canonicalEventStatus(event),
      tags: [],
    })
    addAdvancedDetail(advancedDetails, part, index, "Tool", part)
  }

  const metadata = input.metadata
  if (
    metadata &&
    ((metadata.inputTokens ?? 0) > 0 ||
      (metadata.outputTokens ?? 0) > 0 ||
      (metadata.totalTokens ?? 0) > 0 ||
      (metadata.durationMs ?? 0) > 0 ||
      (metadata.totalCostUsd ?? 0) > 0)
  ) {
    advancedDetails.push({
      id: "message-usage",
      label: "Usage",
      value: formatJson({
        model: metadata.model,
        inputTokens: metadata.inputTokens,
        outputTokens: metadata.outputTokens,
        totalTokens: metadata.totalTokens,
        durationMs: metadata.durationMs,
        totalCostUsd: metadata.totalCostUsd,
      }),
    })
  }

  return {
    items,
    advancedDetails,
    hiddenTechnicalCount: advancedDetails.length,
  }
}
