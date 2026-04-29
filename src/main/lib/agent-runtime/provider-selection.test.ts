import { describe, expect, test } from "bun:test"
import { inferAgentProviderFromModel } from "./provider-selection"

describe("agent provider selection", () => {
  test("persists Codex explicitly for Codex and GPT model names", () => {
    expect(inferAgentProviderFromModel("gpt-5.3-codex/high")).toBe("codex")
    expect(inferAgentProviderFromModel("gpt-5.2")).toBe("codex")
    expect(inferAgentProviderFromModel("o4-mini")).toBe("codex")
  })

  test("defaults ambiguous and Claude model names to Claude", () => {
    expect(inferAgentProviderFromModel(null)).toBe("claude")
    expect(inferAgentProviderFromModel("claude-sonnet-4-6")).toBe("claude")
    expect(inferAgentProviderFromModel("opus")).toBe("claude")
  })

  test("keeps the fake adapter available for runtime tests", () => {
    expect(inferAgentProviderFromModel("fake-agent")).toBe("fake")
  })
})

