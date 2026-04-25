import { describe, expect, test } from "bun:test"
import { findReusableProjectChat } from "./project-chat-selection"

describe("project chat selection", () => {
  test("selects the latest active local project chat", () => {
    const project = {
      id: "project-1",
      path: "/Users/example/Ripple/launch",
      localPath: "/Users/example/Ripple/launch",
    }

    expect(
      findReusableProjectChat(project, [
        {
          id: "older",
          projectId: "project-1",
          worktreePath: "/Users/example/Ripple/launch",
          branch: null,
          baseBranch: null,
          archivedAt: null,
          createdAt: "2026-04-24T10:00:00.000Z",
          updatedAt: "2026-04-24T10:00:00.000Z",
        },
        {
          id: "revision",
          projectId: "project-1",
          worktreePath: "/Users/example/Ripple/launch/.ripple/revisions/r1",
          branch: "r1",
          baseBranch: "main",
          archivedAt: null,
          createdAt: "2026-04-25T10:00:00.000Z",
          updatedAt: "2026-04-25T10:00:00.000Z",
        },
        {
          id: "newer",
          projectId: "project-1",
          worktreePath: "/Users/example/Ripple/launch",
          branch: null,
          baseBranch: null,
          archivedAt: null,
          createdAt: "2026-04-25T11:00:00.000Z",
          updatedAt: "2026-04-25T11:00:00.000Z",
        },
      ])?.id,
    ).toBe("newer")
  })

  test("does not reuse archived or mismatched project chats", () => {
    expect(
      findReusableProjectChat(
        {
          id: "project-1",
          path: "/Users/example/Ripple/launch",
          localPath: "/Users/example/Ripple/launch",
        },
        [
          {
            id: "archived",
            projectId: "project-1",
            worktreePath: "/Users/example/Ripple/launch",
            branch: null,
            baseBranch: null,
            archivedAt: "2026-04-25T10:00:00.000Z",
            createdAt: "2026-04-25T10:00:00.000Z",
            updatedAt: "2026-04-25T10:00:00.000Z",
          },
          {
            id: "other-project",
            projectId: "project-2",
            worktreePath: "/Users/example/Ripple/launch",
            branch: null,
            baseBranch: null,
            archivedAt: null,
            createdAt: "2026-04-25T11:00:00.000Z",
            updatedAt: "2026-04-25T11:00:00.000Z",
          },
        ],
      ),
    ).toBeNull()
  })
})
