import { describe, expect, test } from "bun:test"
import { buildVisualPreviewSurfaceKey } from "./visual-preview-surface"

describe("visual preview surface keys", () => {
  test("uses a stable key for the visible Main preview surface", () => {
    expect(buildVisualPreviewSurfaceKey({
      projectId: "project-1",
      compositionId: "composition-1",
    })).toBe("project-1:composition-1:main")
  })

  test("distinguishes comment and chat preview surfaces from Main", () => {
    expect(buildVisualPreviewSurfaceKey({
      projectId: "project-1",
      compositionId: "composition-1",
      revisionId: "revision-1",
    })).toBe("project-1:composition-1:revision:revision-1")

    expect(buildVisualPreviewSurfaceKey({
      projectId: "project-1",
      compositionId: "composition-1",
      chatId: "conversation-1",
    })).toBe("project-1:composition-1:chat:conversation-1")
  })
})
