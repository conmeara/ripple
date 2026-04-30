import type { AgentRuntimeAttachment } from "../../../../shared/agent-runtime-attachments"

export interface AgentRuntimeMessageInput {
  prompt: string
  attachments: AgentRuntimeAttachment[]
}

export function buildAgentRuntimeMessageInput(message: {
  parts?: Array<Record<string, any>>
} | undefined): AgentRuntimeMessageInput {
  if (!message?.parts) {
    return { prompt: "", attachments: [] }
  }

  const textParts: string[] = []
  const fileContents: string[] = []
  const attachmentLabels: string[] = []
  const attachments: AgentRuntimeAttachment[] = []

  for (const part of message.parts) {
    if (part.type === "text" && typeof part.text === "string") {
      textParts.push(part.text)
      continue
    }

    if (part.type === "file-content") {
      const fileName =
        part.filePath?.split("/").pop() || part.filePath || "file"
      fileContents.push(`\n--- ${fileName} ---\n${part.content ?? ""}`)
      continue
    }

    if (part.type === "data-image" && part.data) {
      const filename = part.data.filename || "image"
      attachmentLabels.push(`\n[Attached image: ${filename}]`)
      if (part.data.base64Data && part.data.mediaType) {
        attachments.push({
          type: "image",
          base64Data: part.data.base64Data,
          mediaType: part.data.mediaType,
          filename,
        })
      }
      continue
    }

    if (part.type === "data-file" && part.data) {
      const filename = part.data.filename || "file"
      attachmentLabels.push(`\n[Attached file: ${filename}]`)
      if (part.data.base64Data) {
        attachments.push({
          type: "file",
          base64Data: part.data.base64Data,
          mediaType: part.data.mediaType,
          filename,
          size: typeof part.data.size === "number" ? part.data.size : undefined,
        })
      }
    }
  }

  return {
    prompt: textParts.join("\n") + fileContents.join("") + attachmentLabels.join(""),
    attachments,
  }
}
