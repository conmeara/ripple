export const CLAUDE_MODELS = [
  { id: "opus", name: "Opus", version: "latest" },
  { id: "sonnet", name: "Sonnet", version: "latest" },
]

export type CodexThinkingLevel = "low" | "medium" | "high" | "xhigh"
export type CodexAuthMode = "chatgpt" | "api"

export type CodexModelOption = {
  id: string
  name: string
  thinkings: CodexThinkingLevel[]
  authModes: CodexAuthMode[]
}

export const CODEX_MODELS: CodexModelOption[] = [
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
    authModes: ["chatgpt", "api"],
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
    authModes: ["chatgpt", "api"],
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
    authModes: ["chatgpt", "api"],
  },
  {
    id: "gpt-5.3-codex",
    name: "GPT-5.3-Codex",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
    authModes: ["chatgpt", "api"],
  },
  {
    id: "gpt-5.2-codex",
    name: "GPT-5.2-Codex",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
    authModes: ["chatgpt", "api"],
  },
  {
    id: "gpt-5.1-codex-max",
    name: "GPT-5.1-Codex Max",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
    authModes: ["chatgpt", "api"],
  },
  {
    id: "gpt-5.1-codex",
    name: "GPT-5.1-Codex",
    thinkings: ["low", "medium", "high"] as CodexThinkingLevel[],
    authModes: ["api"],
  },
  {
    id: "gpt-5.1-codex-mini",
    name: "GPT-5.1-Codex Mini",
    thinkings: ["medium", "high"] as CodexThinkingLevel[],
    authModes: ["chatgpt", "api"],
  },
  {
    id: "gpt-5-codex",
    name: "GPT-5-Codex",
    thinkings: ["low", "medium", "high"] as CodexThinkingLevel[],
    authModes: ["api"],
  },
]

export const PRIMARY_CODEX_MODEL_IDS = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
] as const

export const DEFAULT_HIDDEN_CODEX_MODEL_IDS = CODEX_MODELS
  .filter((model) => !PRIMARY_CODEX_MODEL_IDS.some((id) => id === model.id))
  .map((model) => model.id)

export function filterCodexModelsForAuthMode(
  models: CodexModelOption[],
  mode: CodexAuthMode,
): CodexModelOption[] {
  return models.filter((model) => model.authModes.includes(mode))
}

export function formatCodexThinkingLabel(thinking: CodexThinkingLevel): string {
  if (thinking === "xhigh") return "Extra High"
  return thinking.charAt(0).toUpperCase() + thinking.slice(1)
}
