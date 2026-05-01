export type RippleExportTarget = "main" | "preview"

export type RippleExportSource =
  | { kind: "main"; revisionId: null; chatId: null; label: "Main" }
  | {
      kind: "preview"
      revisionId: string | null
      chatId: string | null
      label: "Current Preview"
    }

export interface RippleExportCompositionSummary {
  id?: string | null
  name?: string | null
  filePath?: string | null
  width?: number | null
  height?: number | null
}

export function resolveExportRevisionId(input: {
  target: RippleExportTarget
  activePreviewRevisionId?: string | null
}): string | null {
  if (input.target !== "preview") return null
  return input.activePreviewRevisionId ?? null
}

export function isPreviewExportAvailable(
  activePreviewRevisionId?: string | null,
  activePreviewChatId?: string | null,
): boolean {
  return Boolean(activePreviewRevisionId || activePreviewChatId)
}

export function resolveExportSource(input: {
  target: RippleExportTarget
  activePreviewRevisionId?: string | null
  activePreviewChatId?: string | null
}): RippleExportSource {
  if (input.target !== "preview") {
    return { kind: "main", revisionId: null, chatId: null, label: "Main" }
  }

  const revisionId = input.activePreviewRevisionId ?? null
  if (revisionId) {
    return {
      kind: "preview",
      revisionId,
      chatId: null,
      label: "Current Preview",
    }
  }

  const chatId = input.activePreviewChatId ?? null
  if (!chatId) {
    return { kind: "main", revisionId: null, chatId: null, label: "Main" }
  }

  return {
    kind: "preview",
    revisionId: null,
    chatId,
    label: "Current Preview",
  }
}

function labelFromFilePath(filePath: string): string {
  const filename = filePath.split("/").pop() ?? filePath
  const basename = filename.replace(/\.[a-z0-9]+$/i, "")
  const label = basename
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")

  return label || "Composition"
}

export function getExportCompositionName(
  composition?: RippleExportCompositionSummary | null,
): string {
  if (!composition) return "Selected composition"
  if (composition.filePath === "index.html") return "Main timeline"
  return composition.name || labelFromFilePath(composition.filePath ?? "")
}

export function getExportCompositionDetails(
  composition?: RippleExportCompositionSummary | null,
): string {
  if (!composition) return "Active composition"
  const details: string[] = []
  if (composition.filePath === "index.html") {
    details.push("Main timeline")
  } else if (composition.filePath) {
    details.push(composition.filePath)
  }
  if (composition.width && composition.height) {
    details.push(`${composition.width}x${composition.height}`)
  }
  return details.join(" · ") || "Active composition"
}
