import { describe, expect, test } from "bun:test"
import { resolveChatWorkMode } from "./work-mode"

describe("chat work mode", () => {
  test("treats a project working directory without a branch as Main", () => {
    expect(
      resolveChatWorkMode({
        worktreePath: "/Users/example/Ripple/title-card",
        branch: null,
      }),
    ).toBe("local")
  })

  test("treats branch-backed temporary workspaces as Worktree", () => {
    expect(
      resolveChatWorkMode({
        worktreePath: "/Users/example/.ripple/worktrees/title-card/abc",
        branch: "ripple/comment-abc",
      }),
    ).toBe("worktree")
  })
})
