export interface VisualPreviewSurfaceKeyInput {
  projectId: string
  compositionId?: string | null
  revisionId?: string | null
  chatId?: string | null
}

export interface VisualPreviewSurfaceBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface VisualPreviewSurfaceUpdate {
  surfaceKey: string
  projectId: string
  compositionId?: string | null
  revisionId?: string | null
  chatId?: string | null
  projectPath?: string | null
  sourcePath?: string | null
  compositionPath?: string | null
  sourceWidth?: number | null
  sourceHeight?: number | null
  timeMs?: number | null
  frame?: number | null
  bounds: VisualPreviewSurfaceBounds
}

function keyPart(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed.replaceAll(":", "_") : fallback
}

export function buildVisualPreviewSurfaceKey(input: VisualPreviewSurfaceKeyInput): string {
  const projectId = keyPart(input.projectId, "project")
  const compositionId = keyPart(input.compositionId, "composition")
  const revisionId = keyPart(input.revisionId, "")
  const chatId = keyPart(input.chatId, "")
  if (revisionId) return `${projectId}:${compositionId}:revision:${revisionId}`
  if (chatId) return `${projectId}:${compositionId}:chat:${chatId}`
  return `${projectId}:${compositionId}:main`
}
