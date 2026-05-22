import { describe, expect, test } from "bun:test"
import {
  AGENT_TASK_INTERRUPTED_NAME,
  agentTaskToolSubtitle,
  agentTaskToolTitle,
} from "./agent-task-tool-copy"

describe("agent task tool copy", () => {
  test("uses product copy for task titles", () => {
    expect(agentTaskToolTitle(true)).toBe("Working on project")
    expect(agentTaskToolTitle(false)).toBe("Project work complete")
    expect(AGENT_TASK_INTERRUPTED_NAME).toBe("Agent")
  })

  test("keeps nested technical activity out of the collapsed task row", () => {
    const subtitle = agentTaskToolSubtitle({
      isPending: true,
      description: "Bash /Users/example/project/src/index.html stdout",
      nestedTools: [{
        type: "tool-Bash",
        state: "pending",
        input: {
          command: "git diff -- /Users/example/project/src/index.html",
        },
      }],
    })

    expect(subtitle).toBe("Checking changes")
    expect(subtitle).not.toMatch(/Bash|git diff|\/Users|src\/index|stdout/)
  })

  test("sanitizes task descriptions when no nested activity is available", () => {
    const subtitle = agentTaskToolSubtitle({
      isPending: false,
      description: "Bash /Users/example/project/src/index.html stdout",
      nestedTools: [],
    })

    expect(subtitle).toBe("Checking project")
  })
})
