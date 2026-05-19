import { readFile, realpath } from "node:fs/promises"
import { extname, resolve } from "node:path"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { runVisualCommand, type VisualCommandOptions } from "../../../cli/visual"
import { isPathInsideDirectory } from "../ripple-projects/paths"

type RippleVisualToolName = "snapshot" | "frame_sheet"

export interface NativeVisualContextResult {
  kind: RippleVisualToolName
  payload: Record<string, unknown>
  artifactPath: string
  relativePath: string
  mediaType: string
  base64Data: string
  byteLength: number
}

export interface CodexNativeVisualContextContentItem {
  type: "inputText" | "inputImage"
  text?: string
  imageUrl?: string
}

export interface RippleVisualDynamicToolSpec {
  namespace: "ripple"
  name: string
  description: string
  inputSchema: Record<string, unknown>
  deferLoading?: boolean
}

export const RIPPLE_NATIVE_VISUAL_TOOL_COPY = {
  snapshotDescription: [
    "Use this app-managed Ripple visual tool immediately when you need the visible frame, a current snapshot, or one exact timestamp; it should be the first external action for that need.",
    "It returns the image directly in the tool result; do not use shell commands, file lookup, browser/open/view_image, or generic screenshot tools first.",
    "Use `at=current` for the visible app frame. Use a timestamp such as `1.25s` only when the user asks for that exact time.",
  ].join(" "),
  frameSheetDescription: [
    "Use this app-managed Ripple visual tool immediately when you need to understand motion over time, compare frames, inspect a time range, or the user asks for a frame sheet; it should be the first external action for that need.",
    "It returns the sheet image directly in the tool result; do not use shell commands, file lookup, browser/open/view_image, video extraction, or generic screenshot tools first.",
    "Start with a compact range and small sample count unless the task needs more detail.",
  ].join(" "),
  snapshotAtDescription: "`current` means the visible app frame. Use a timestamp like `1.25s` only for an exact frame or exact-time request.",
  frameSheetRangeDescription: "Time range like `0s..8s`. Use the user's requested range, the comment range, or a compact overview range.",
  frameSheetSamplesDescription: "Number of evenly spaced sheet cells. Use 3 for short eval ranges and 8 for a normal motion overview.",
  frameSheetColumnsDescription: "Number of columns in the sheet. Use 3 for three samples and 4 for the normal eight-sample overview.",
  compositionDescription: "Optional project-relative HTML composition path. Omit for the active/default composition; do not pass labels like Main.",
} as const

type VisualCommandRunner = typeof runVisualCommand

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function mediaTypeForPath(path: string): string {
  const extension = extname(path).toLowerCase()
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg"
  if (extension === ".webp") return "image/webp"
  if (extension === ".gif") return "image/gif"
  return "image/png"
}

function stringField(value: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const field = value[key]
    if (typeof field === "string" && field.trim()) return field.trim()
  }
  return null
}

function finiteNumberField(value: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const field = value[key]
    if (typeof field === "number" && Number.isFinite(field)) return field
  }
  return null
}

function positiveIntegerField(value: Record<string, unknown>, ...keys: string[]): number | null {
  const number = finiteNumberField(value, ...keys)
  return number && Number.isInteger(number) && number > 0 ? number : null
}

function stripBackendArgument(argumentsValue: unknown): unknown {
  if (!isRecord(argumentsValue) || !("backend" in argumentsValue)) return argumentsValue
  const { backend: _backend, ...rest } = argumentsValue
  return rest
}

function compositionPathField(value: Record<string, unknown>): string | null {
  const raw = stringField(value, "compositionPath", "composition")
  if (!raw) return null
  const normalized = raw.replaceAll("\\", "/")
  const lower = normalized.toLowerCase()
  if (lower === "main" || lower === "default" || lower === "current" || lower === "active") {
    return null
  }
  if (!lower.endsWith(".html") && !lower.endsWith(".htm")) {
    return null
  }
  return normalized
}

function normalizeToolName(tool: unknown): RippleVisualToolName | null {
  if (typeof tool !== "string") return null
  const normalized = tool.trim().toLowerCase().replaceAll("-", "_")
  if (normalized === "snapshot" || normalized === "ripple_snapshot") return "snapshot"
  if (
    normalized === "frame_sheet" ||
    normalized === "framesheet" ||
    normalized === "ripple_frame_sheet" ||
    normalized === "ripple_framesheet"
  ) {
    return "frame_sheet"
  }
  return null
}

export function isRippleVisualDynamicToolCall(input: {
  namespace?: unknown
  tool?: unknown
}): boolean {
  const namespace = typeof input.namespace === "string" ? input.namespace.trim().toLowerCase() : null
  const toolName = normalizeToolName(input.tool)
  if (!toolName) return false
  if (namespace === "ripple") return true
  return namespace === null && typeof input.tool === "string" && input.tool.startsWith("ripple_")
}

function appendOptionalString(args: string[], flag: string, value: string | null): void {
  if (value) args.push(flag, value)
}

function appendOptionalInteger(args: string[], flag: string, value: number | null): void {
  if (value !== null) args.push(flag, String(value))
}

function timestampValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return `${Math.round(value)}ms`
  }
  return null
}

export function buildRippleVisualCommandArgs(input: {
  tool: unknown
  arguments?: unknown
}): string[] {
  const toolName = normalizeToolName(input.tool)
  if (!toolName) {
    throw new Error("Ripple visual context tool is not supported.")
  }
  const args = isRecord(input.arguments) ? input.arguments : {}

  if (toolName === "snapshot") {
    const commandArgs = ["snapshot", "--at", timestampValue(args.at) ?? timestampValue(args.timeMs) ?? "current"]
    appendOptionalString(commandArgs, "--composition", compositionPathField(args))
    appendOptionalString(commandArgs, "--backend", stringField(args, "backend"))
    appendOptionalInteger(commandArgs, "--width", positiveIntegerField(args, "width"))
    appendOptionalInteger(commandArgs, "--height", positiveIntegerField(args, "height"))
    appendOptionalInteger(commandArgs, "--fps", positiveIntegerField(args, "fps"))
    appendOptionalInteger(commandArgs, "--timeout", positiveIntegerField(args, "timeoutMs", "timeout"))
    commandArgs.push("--json")
    return commandArgs
  }

  const commandArgs = ["frame-sheet"]
  const range = stringField(args, "range")
  const at = Array.isArray(args.at)
    ? args.at.map(timestampValue).filter((value): value is string => Boolean(value)).join(",")
    : timestampValue(args.at)
  const startMs = finiteNumberField(args, "startMs")
  const endMs = finiteNumberField(args, "endMs")
  if (range) {
    commandArgs.push("--range", range)
  } else if (startMs !== null && endMs !== null) {
    commandArgs.push("--range", `${Math.round(startMs)}ms..${Math.round(endMs)}ms`)
  } else if (at) {
    commandArgs.push("--at", at)
  } else {
    commandArgs.push("--range", "0s..8s")
  }
  appendOptionalInteger(commandArgs, "--samples", positiveIntegerField(args, "samples"))
  appendOptionalString(commandArgs, "--every", stringField(args, "every"))
  appendOptionalInteger(commandArgs, "--every-frames", positiveIntegerField(args, "everyFrames"))
  appendOptionalInteger(commandArgs, "--columns", positiveIntegerField(args, "columns"))
  appendOptionalInteger(commandArgs, "--max-sheet-width", positiveIntegerField(args, "maxSheetWidth"))
  appendOptionalString(commandArgs, "--composition", compositionPathField(args))
  appendOptionalString(commandArgs, "--backend", stringField(args, "backend"))
  appendOptionalInteger(commandArgs, "--timeout", positiveIntegerField(args, "timeoutMs", "timeout"))
  commandArgs.push("--json")
  return commandArgs
}

function getPayloadArtifact(input: Record<string, unknown>): {
  kind: RippleVisualToolName
  relativePath: string
} {
  const snapshot = isRecord(input.snapshot) ? input.snapshot : null
  const sheet = isRecord(input.sheet) ? input.sheet : null
  const snapshotPath = snapshot ? stringField(snapshot, "path") : null
  if (snapshotPath) {
    return { kind: "snapshot", relativePath: snapshotPath }
  }
  const sheetPath = sheet ? stringField(sheet, "path") : null
  if (sheetPath) {
    return { kind: "frame_sheet", relativePath: sheetPath }
  }
  throw new Error("Ripple visual context did not include an image artifact.")
}

export async function loadNativeVisualContextArtifact(input: {
  projectPath: string
  payload: unknown
}): Promise<NativeVisualContextResult> {
  if (!isRecord(input.payload)) {
    throw new Error("Ripple visual context returned invalid JSON.")
  }
  const { kind, relativePath } = getPayloadArtifact(input.payload)
  const projectRealPath = await realpath(input.projectPath)
  const artifactPath = resolve(projectRealPath, relativePath)
  const artifactRealPath = await realpath(artifactPath)
  if (!isPathInsideDirectory(projectRealPath, artifactRealPath)) {
    throw new Error("Visual context artifact escaped the project.")
  }
  const image = await readFile(artifactRealPath)
  return {
    kind,
    payload: input.payload,
    artifactPath: artifactRealPath,
    relativePath,
    mediaType: mediaTypeForPath(artifactRealPath),
    base64Data: image.toString("base64"),
    byteLength: image.byteLength,
  }
}

export async function runNativeVisualContextTool(input: {
  cwd: string
  env: NodeJS.ProcessEnv
  repoRoot?: string
  tool: unknown
  arguments?: unknown
  runVisualCommand?: VisualCommandRunner
}): Promise<NativeVisualContextResult> {
  const commandArgs = buildRippleVisualCommandArgs({
    tool: input.tool,
    arguments: stripBackendArgument(input.arguments),
  })
  const command = await (input.runVisualCommand ?? runVisualCommand)(commandArgs, {
    cwd: input.cwd,
    env: input.env,
    repoRoot: input.repoRoot,
  } satisfies VisualCommandOptions)
  const stdout = command.stdout.trim()
  let payload: unknown = null
  try {
    payload = stdout ? JSON.parse(stdout) : null
  } catch {
    throw new Error("Ripple visual context returned invalid JSON.")
  }
  if (command.exitCode !== 0) {
    const message = isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
      ? payload.error.message
      : command.stderr.trim() || "Ripple visual context command failed."
    throw new Error(message)
  }
  if (!isRecord(payload) || payload.ok !== true) {
    throw new Error("Ripple visual context command did not succeed.")
  }
  return loadNativeVisualContextArtifact({
    projectPath: input.cwd,
    payload,
  })
}

export function summarizeNativeVisualContextResult(result: NativeVisualContextResult): string {
  return [
    "Ripple visual context is attached as a native image.",
    JSON.stringify({
      ok: true,
      type: result.kind === "frame_sheet" ? "sheet" : "snapshot",
      artifact: {
        path: result.relativePath,
        mediaType: result.mediaType,
        bytes: result.byteLength,
      },
      payload: result.payload,
    }, null, 2),
  ].join("\n")
}

export function buildCodexNativeVisualContextContentItems(
  result: NativeVisualContextResult,
): CodexNativeVisualContextContentItem[] {
  return [
    {
      type: "inputText",
      text: summarizeNativeVisualContextResult(result),
    },
    {
      type: "inputImage",
      imageUrl: `data:${result.mediaType};base64,${result.base64Data}`,
    },
  ]
}

export function buildClaudeNativeVisualContextToolResult(
  result: NativeVisualContextResult,
): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: summarizeNativeVisualContextResult(result),
      },
      {
        type: "image",
        data: result.base64Data,
        mimeType: result.mediaType,
      },
    ],
  }
}

export function buildRippleVisualDynamicToolSpecs(): RippleVisualDynamicToolSpec[] {
  return [
    {
      namespace: "ripple",
      name: "snapshot",
      description: RIPPLE_NATIVE_VISUAL_TOOL_COPY.snapshotDescription,
      inputSchema: {
        type: "object",
        properties: {
          at: {
            type: "string",
            description: RIPPLE_NATIVE_VISUAL_TOOL_COPY.snapshotAtDescription,
            default: "current",
          },
          composition: {
            type: "string",
            description: RIPPLE_NATIVE_VISUAL_TOOL_COPY.compositionDescription,
          },
        },
        additionalProperties: true,
      },
      deferLoading: false,
    },
    {
      namespace: "ripple",
      name: "frame_sheet",
      description: RIPPLE_NATIVE_VISUAL_TOOL_COPY.frameSheetDescription,
      inputSchema: {
        type: "object",
        properties: {
          range: {
            type: "string",
            description: RIPPLE_NATIVE_VISUAL_TOOL_COPY.frameSheetRangeDescription,
            default: "0s..8s",
          },
          samples: {
            type: "integer",
            minimum: 1,
            description: RIPPLE_NATIVE_VISUAL_TOOL_COPY.frameSheetSamplesDescription,
            default: 8,
          },
          columns: {
            type: "integer",
            minimum: 1,
            description: RIPPLE_NATIVE_VISUAL_TOOL_COPY.frameSheetColumnsDescription,
            default: 4,
          },
          composition: {
            type: "string",
            description: RIPPLE_NATIVE_VISUAL_TOOL_COPY.compositionDescription,
          },
        },
        additionalProperties: true,
      },
      deferLoading: false,
    },
  ]
}
