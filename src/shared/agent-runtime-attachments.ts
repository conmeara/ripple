export interface AgentRuntimeImageAttachment {
  type: "image"
  base64Data: string
  mediaType: string
  filename?: string
  size?: number
}

export interface AgentRuntimeFileAttachment {
  type: "file"
  base64Data: string
  mediaType?: string
  filename: string
  size?: number
}

export type AgentRuntimeAttachment =
  | AgentRuntimeImageAttachment
  | AgentRuntimeFileAttachment

export const MAX_AGENT_RUNTIME_ATTACHMENTS = 6
export const MAX_AGENT_RUNTIME_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_AGENT_RUNTIME_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024
export const MAX_AGENT_RUNTIME_ATTACHMENT_BASE64_CHARS =
  Math.ceil(MAX_AGENT_RUNTIME_ATTACHMENT_BYTES * 4 / 3) + 128

export function estimateBase64DecodedBytes(base64Data: string): number {
  const normalized = base64Data.trim()
  if (!normalized) return 0
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0
  return Math.max(0, Math.floor(normalized.length * 3 / 4) - padding)
}

export function getAgentRuntimeAttachmentSize(
  attachment: AgentRuntimeAttachment,
): number {
  const decodedSize = estimateBase64DecodedBytes(attachment.base64Data)
  const reportedSize =
    typeof attachment.size === "number" && Number.isFinite(attachment.size)
      ? Math.max(0, attachment.size)
      : 0
  return Math.max(decodedSize, reportedSize)
}

export function validateAgentRuntimeAttachments(
  attachments: AgentRuntimeAttachment[],
): string | null {
  if (attachments.length > MAX_AGENT_RUNTIME_ATTACHMENTS) {
    return `Attach up to ${MAX_AGENT_RUNTIME_ATTACHMENTS} files.`
  }

  let totalBytes = 0
  for (const attachment of attachments) {
    const size = getAgentRuntimeAttachmentSize(attachment)
    if (size > MAX_AGENT_RUNTIME_ATTACHMENT_BYTES) {
      return `${attachment.filename || "Attachment"} is larger than 10 MB.`
    }
    if (attachment.base64Data.length > MAX_AGENT_RUNTIME_ATTACHMENT_BASE64_CHARS) {
      return `${attachment.filename || "Attachment"} is too large to send.`
    }
    totalBytes += size
  }

  if (totalBytes > MAX_AGENT_RUNTIME_ATTACHMENT_TOTAL_BYTES) {
    return "Attachments are larger than 20 MB total."
  }

  return null
}
