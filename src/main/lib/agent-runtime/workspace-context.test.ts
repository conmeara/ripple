import { describe, expect, test } from "bun:test"
import { resolveChatWorkspaceKind } from "./workspace-kind"

describe("resolveChatWorkspaceKind", () => {
  test("treats a project-path chat without a branch as Main", () => {
    expect(
      resolveChatWorkspaceKind({
        projectPath: "/Users/example/Ripple/launch-promo",
        worktreePath: "/Users/example/Ripple/launch-promo",
        branch: null,
      }),
    ).toEqual({
      cwd: "/Users/example/Ripple/launch-promo",
      kind: "main",
    })
  })

  test("treats a branch-backed separate workspace as Worktree", () => {
    expect(
      resolveChatWorkspaceKind({
        projectPath: "/Users/example/Ripple/launch-promo",
        worktreePath: "/Users/example/.ripple/worktrees/launch-promo-chat",
        branch: "ripple/chat-123",
      }),
    ).toEqual({
      cwd: "/Users/example/.ripple/worktrees/launch-promo-chat",
      kind: "chat_worktree",
    })
  })

  test("does not treat a stored project path as Worktree even when branch metadata is stale", () => {
    expect(
      resolveChatWorkspaceKind({
        projectPath: "/Users/example/Ripple/launch-promo",
        worktreePath: "/Users/example/Ripple/launch-promo",
        branch: "ripple/stale-chat",
      }).kind,
    ).toBe("main")
  })
})
