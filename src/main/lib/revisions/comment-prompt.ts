interface PromptThread {
  anchorType: "frame" | "range" | "element"
  startTime: number
  endTime: number | null
  startFrame: number
  endFrame: number | null
  elementSelector: string | null
  clipKey: string | null
  sourceFile: string | null
  compositionId: string | null
}

interface PromptProject {
  name: string
}

interface PromptComposition {
  name: string
  filePath: string
}

function parseStoredChatMessages(value: unknown): any[] {
  if (Array.isArray(value)) return value
  if (typeof value !== "string") return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function timecodeFromMs(value: number): string {
  const totalFrames = Math.max(0, Math.round((value / 1000) * 30))
  const frames = totalFrames % 30
  const totalSeconds = Math.floor(totalFrames / 30)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds, frames]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":")
}

function formatAnchorKind(thread: PromptThread): string {
  if (thread.anchorType === "element") return "element"
  if (thread.anchorType === "range") return "range"
  return "frame"
}

export function appendRippleCommentPromptMessage(input: {
  messages: unknown
  prompt: string
  threadId: string
  revisionId: string
  model?: string
}): string {
  const messages = parseStoredChatMessages(input.messages)
  messages.push({
    id: `msg-${Date.now()}-${input.revisionId}`,
    role: "user",
    parts: [{ type: "text", text: input.prompt }],
    metadata: {
      source: "ripple-comment",
      threadId: input.threadId,
      revisionId: input.revisionId,
      ...(input.model ? { model: input.model } : {}),
    },
  })
  return JSON.stringify(messages)
}

export function buildRevisionPrompt(input: {
  thread: PromptThread
  body: string
  project: PromptProject
  composition?: PromptComposition | null
}): string {
  const body = input.body.trim()
  const timeRange =
    input.thread.endTime !== null && input.thread.endTime > input.thread.startTime
      ? `${timecodeFromMs(input.thread.startTime)} to ${timecodeFromMs(input.thread.endTime)}`
      : timecodeFromMs(input.thread.startTime)
  const frameRange =
    input.thread.endFrame !== null && input.thread.endFrame > input.thread.startFrame
      ? `${input.thread.startFrame} to ${input.thread.endFrame}`
      : String(input.thread.startFrame)

  const contextLines = [
    "",
    "Comment context:",
    `- Project: ${input.project.name}`,
    input.composition
      ? `- Composition: ${input.composition.name} (${input.composition.filePath})`
      : input.thread.compositionId
        ? `- Composition id: ${input.thread.compositionId}`
        : null,
    `- Anchor type: ${formatAnchorKind(input.thread)}`,
    `- Time: ${timeRange}`,
    `- Frame: ${frameRange}`,
    input.thread.elementSelector
      ? `- Element selector: ${input.thread.elementSelector}`
      : null,
    input.thread.clipKey ? `- Clip: ${input.thread.clipKey}` : null,
    input.thread.sourceFile ? `- Source file: ${input.thread.sourceFile}` : null,
    "",
    "Use the comment context to target the change. Edit only this Ripple/HyperFrames project, preserve composition data attributes and registered GSAP timelines, and keep the change focused on the user's comment.",
  ].filter((line): line is string => line !== null)

  return [body, ...contextLines].join("\n")
}
