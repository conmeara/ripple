import { describe, expect, test } from "bun:test"
import {
  getLocalChatReusePaths,
  isReusableLocalProjectChat,
} from "./chat-reuse"

describe("Ripple local chat reuse", () => {
  test("deduplicates legacy and Ripple project paths", () => {
    expect(
      getLocalChatReusePaths({
        path: "/Users/example/Ripple/launch",
        localPath: "/Users/example/Ripple/launch",
      }),
    ).toEqual(["/Users/example/Ripple/launch"])
  })

  test("allows only active local-mode chats for reuse", () => {
    const project = {
      path: "/legacy/path",
      localPath: "/Users/example/Ripple/launch",
    }

    expect(
      isReusableLocalProjectChat(project, {
        worktreePath: "/Users/example/Ripple/launch",
        branch: null,
        baseBranch: null,
        archivedAt: null,
      }),
    ).toBe(true)
    expect(
      isReusableLocalProjectChat(project, {
        worktreePath: "/Users/example/Ripple/launch/.ripple/revisions/rev-1",
        branch: "rev-1",
        baseBranch: "main",
        archivedAt: null,
      }),
    ).toBe(false)
    expect(
      isReusableLocalProjectChat(project, {
        worktreePath: "/Users/example/Ripple/launch",
        branch: null,
        baseBranch: null,
        archivedAt: new Date(),
      }),
    ).toBe(false)
  })
})
