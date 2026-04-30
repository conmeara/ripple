function parseStoredMessages(value: string | null | undefined): any[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function compactOneLineSummary(value: string | null | undefined): string | null {
  const compacted = value
    ?.replace(/\s+/g, " ")
    .replace(/^summary:\s*/i, "")
    .trim()
  if (!compacted) return null
  return compacted.length > 180 ? `${compacted.slice(0, 177)}...` : compacted
}

function compactAssistantResponse(value: string | null | undefined): string | null {
  const compacted = value
    ?.replace(/\s+/g, " ")
    .replace(/^summary:\s*/i, "")
    .trim()
  return compacted || null
}

function extractTextFromMessagePart(part: any): string | null {
  if (!part || typeof part !== "object") return null
  if (part.type === "text" && typeof part.text === "string") return part.text
  if (part.type === "text-delta" && typeof part.text === "string") return part.text
  if (part.type === "text-delta" && typeof part.delta === "string") return part.delta
  if (typeof part.text === "string" && !String(part.type ?? "").startsWith("tool-")) {
    return part.text
  }
  return null
}

export function extractAssistantFinalResponseFromMessages(
  value: string | null | undefined,
): string | null {
  const messages = parseStoredMessages(value)
  for (const assistant of [...messages].reverse()) {
    if (assistant?.role !== "assistant") continue
    const parts: any[] = Array.isArray(assistant.parts) ? assistant.parts : []
    for (const part of [...parts].reverse()) {
      const text = compactAssistantResponse(extractTextFromMessagePart(part))
      if (text) return text
    }
  }
  return null
}
