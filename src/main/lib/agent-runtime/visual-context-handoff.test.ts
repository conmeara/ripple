import { describe, expect, test } from "bun:test"
import { shouldPrepareAgentVisualContextHandoff } from "./visual-context-handoff"

describe("visual context handoff startup policy", () => {
  test("does not eagerly capture visual context unless explicitly enabled", () => {
    expect(shouldPrepareAgentVisualContextHandoff({})).toBe(false)
    expect(shouldPrepareAgentVisualContextHandoff({
      RIPPLE_EAGER_AGENT_VISUAL_CONTEXT: "0",
    })).toBe(false)
    expect(shouldPrepareAgentVisualContextHandoff({
      RIPPLE_EAGER_AGENT_VISUAL_CONTEXT: "1",
    })).toBe(true)
  })
})
