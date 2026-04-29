import type { AgentProviderId } from "./types"

export function inferAgentProviderFromModel(
  model: string | null | undefined,
): AgentProviderId {
  const normalized = model?.trim().toLowerCase()
  if (!normalized) return "claude"
  if (
    normalized.includes("codex") ||
    normalized.startsWith("gpt-") ||
    /^o\d/.test(normalized)
  ) {
    return "codex"
  }
  if (normalized === "fake" || normalized.startsWith("fake-")) return "fake"
  return "claude"
}
