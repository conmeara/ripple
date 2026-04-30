import type { PreparedRuntimeAttachments } from "../runtime-attachments"

export type CodexUserInput =
  | { type: "text"; text: string; text_elements: [] }
  | { type: "localImage"; path: string }

export function buildCodexTurnInput(
  prompt: string,
  attachments: PreparedRuntimeAttachments,
): CodexUserInput[] {
  const localImageInputs = attachments.savedAttachments
    .filter((attachment) => attachment.type === "image")
    .map((attachment) => ({
      type: "localImage" as const,
      path: attachment.path,
    }))
  const textInput = prompt.trim()
    ? [{ type: "text" as const, text: prompt, text_elements: [] as [] }]
    : []
  return [...localImageInputs, ...textInput]
}
