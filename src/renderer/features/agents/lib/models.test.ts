import { describe, expect, test } from "bun:test"
import {
  CLAUDE_MODELS,
  CODEX_MODELS,
  filterCodexModelsForAuthMode,
  formatCodexThinkingLabel,
} from "./models"

describe("agent model catalog", () => {
  test("keeps Claude Code aliases available for the model switcher", () => {
    expect(CLAUDE_MODELS.map((model) => model.id)).toEqual([
      "opus",
      "sonnet",
      "haiku",
      "opusplan",
      "sonnet[1m]",
      "default",
    ])
  })

  test("shows ChatGPT-auth compatible Codex models without API-only options", () => {
    const chatGptModels = filterCodexModelsForAuthMode(CODEX_MODELS, "chatgpt")

    expect(chatGptModels.map((model) => model.id)).toEqual([
      "gpt-5.3-codex",
      "gpt-5.2-codex",
      "gpt-5.1-codex-max",
      "gpt-5.1-codex-mini",
    ])
    expect(chatGptModels.map((model) => model.id)).not.toContain("gpt-5-codex")
  })

  test("shows API-key Codex models and thinking labels for provider input", () => {
    const apiModels = filterCodexModelsForAuthMode(CODEX_MODELS, "api")

    expect(apiModels.map((model) => model.id)).toEqual([
      "gpt-5.3-codex",
      "gpt-5.2-codex",
      "gpt-5.1-codex-max",
      "gpt-5.1-codex",
      "gpt-5.1-codex-mini",
      "gpt-5-codex",
    ])
    expect(formatCodexThinkingLabel("xhigh")).toBe("Extra High")
    expect(formatCodexThinkingLabel("medium")).toBe("Medium")
  })
})
