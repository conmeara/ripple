import { describe, expect, test } from "bun:test"
import { AgentToolRegistry } from "./agent-tool-registry"

describe("AgentToolRegistry", () => {
  test("keeps the planning label stable for the same loading session", () => {
    const titles = Array.from({ length: 10 }, () =>
      AgentToolRegistry["tool-planning"]?.title({
        planningSessionId: "sub-chat-1:user-turn-1",
      }),
    )

    expect(new Set(titles).size).toBe(1)
  })

  test("keeps the playful planning labels varied across loading sessions", () => {
    const titles = new Set(
      Array.from({ length: 24 }, (_, index) =>
        AgentToolRegistry["tool-planning"]?.title({
          planningSessionId: `sub-chat-${index}:user-turn-${index}`,
        }),
      ),
    )

    expect(titles.size).toBeGreaterThan(1)
  })
})
