import { describe, expect, test } from "bun:test"
import {
  CLAUDE_MODELS,
  CODEX_MODELS,
  DEFAULT_HIDDEN_CODEX_MODEL_IDS,
  filterCodexModelsForAuthMode,
  formatCodexThinkingLabel,
} from "./models"

describe("agent model catalog", () => {
  test("keeps the primary Claude picker focused on Opus and Sonnet", () => {
    expect(CLAUDE_MODELS.map((model) => model.id)).toEqual([
      "opus",
      "sonnet",
    ])
  })

  test("keeps the primary Codex picker focused on current GPT models", () => {
    const primaryModels = CODEX_MODELS.filter(
      (model) => !DEFAULT_HIDDEN_CODEX_MODEL_IDS.includes(model.id),
    )

    expect(primaryModels.map((model) => model.id)).toEqual([
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
    ])
  })

  test("shows ChatGPT-auth compatible Codex models without API-only options", () => {
    const chatGptModels = filterCodexModelsForAuthMode(CODEX_MODELS, "chatgpt")

    expect(chatGptModels.map((model) => model.id)).toEqual([
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
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
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
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
