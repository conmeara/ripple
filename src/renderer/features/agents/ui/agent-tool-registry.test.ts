import { describe, expect, test } from "bun:test"
import { AgentToolRegistry } from "./agent-tool-registry"

describe("AgentToolRegistry", () => {
  test("uses the same thinking label while the first agent event is loading", () => {
    const titles = Array.from({ length: 10 }, () =>
      AgentToolRegistry["tool-planning"]?.title({
        planningSessionId: "sub-chat-1:user-turn-1",
      }),
    )

    expect(new Set(titles).size).toBe(1)
    expect(titles[0]).toBe("Thinking")
  })

  test("does not cycle playful loading labels across sessions", () => {
    const titles = Array.from({ length: 24 }, (_, index) =>
      AgentToolRegistry["tool-planning"]?.title({
        planningSessionId: `sub-chat-${index}:user-turn-${index}`,
      }),
    )

    expect(new Set(titles)).toEqual(new Set(["Thinking"]))
  })
})
