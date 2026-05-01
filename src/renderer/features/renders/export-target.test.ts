import { describe, expect, test } from "bun:test"
import {
  getExportCompositionDetails,
  getExportCompositionName,
  isPreviewExportAvailable,
  resolveExportRevisionId,
  resolveExportSource,
} from "./export-target"

describe("render export target helpers", () => {
  test("defaults to Main unless Current Preview is explicitly selected", () => {
    expect(resolveExportRevisionId({
      target: "main",
      activePreviewRevisionId: "revision-1",
    })).toBeNull()
    expect(resolveExportRevisionId({
      target: "preview",
      activePreviewRevisionId: "revision-1",
    })).toBe("revision-1")
  })

  test("only enables Current Preview when a revision is active", () => {
    expect(isPreviewExportAvailable(null)).toBe(false)
    expect(isPreviewExportAvailable("revision-1")).toBe(true)
    expect(isPreviewExportAvailable(null, "chat-1")).toBe(true)
  })

  test("passes through the active preview source", () => {
    expect(resolveExportSource({
      target: "preview",
      activePreviewRevisionId: "revision-1",
      activePreviewChatId: "chat-1",
    })).toEqual({
      kind: "preview",
      revisionId: "revision-1",
      chatId: null,
      label: "Current Preview",
    })
    expect(resolveExportSource({
      target: "preview",
      activePreviewRevisionId: null,
      activePreviewChatId: "chat-1",
    })).toEqual({
      kind: "preview",
      revisionId: null,
      chatId: "chat-1",
      label: "Current Preview",
    })
  })

  test("names the root entry as the main timeline", () => {
    expect(getExportCompositionName({
      name: "Index",
      filePath: "index.html",
      width: 1920,
      height: 1080,
    })).toBe("Main timeline")
    expect(getExportCompositionDetails({
      filePath: "index.html",
      width: 1920,
      height: 1080,
    })).toBe("Main timeline · 1920x1080")
  })

  test("derives readable names for nested composition files", () => {
    expect(getExportCompositionName({
      filePath: "compositions/lower-third.html",
    })).toBe("Lower Third")
    expect(getExportCompositionDetails({
      filePath: "compositions/lower-third.html",
      width: 1080,
      height: 1080,
    })).toBe("compositions/lower-third.html · 1080x1080")
  })
})
