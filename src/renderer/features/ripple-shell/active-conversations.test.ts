import { describe, expect, test } from "bun:test"
import {
  addActiveConversationId,
  closeActiveConversationId,
  mergeConversationHistoryItems,
  pruneActiveConversationIds,
  shouldShowActiveConversationTabs,
} from "./active-conversations"

describe("Ripple active conversations", () => {
  test("adds conversations once without reordering visible tabs", () => {
    expect(addActiveConversationId(["a", "b"], "c")).toEqual(["a", "b", "c"])
    expect(addActiveConversationId(["a", "b", "c"], "b")).toEqual(["a", "b", "c"])
  })

  test("closes only the active UI tab and selects a nearby fallback", () => {
    const archived: string[] = []
    const result = closeActiveConversationId({
      ids: ["a", "b", "c"],
      activeId: "b",
      conversationId: "b",
    })

    expect(result).toEqual({ ids: ["a", "c"], activeId: "a" })
    expect(archived).toEqual([])
  })

  test("closing an inactive tab preserves the selected conversation", () => {
    expect(
      closeActiveConversationId({
        ids: ["a", "b", "c"],
        activeId: "c",
        conversationId: "a",
      }),
    ).toEqual({ ids: ["b", "c"], activeId: "c" })
  })

  test("prunes stale ids against available history", () => {
    expect(
      pruneActiveConversationIds({
        ids: ["missing", "a", "b"],
        activeId: "missing",
        availableIds: ["a", "b"],
      }),
    ).toEqual({ ids: ["a", "b"], activeId: "b" })
  })

  test("shows the tab strip whenever there is an active conversation", () => {
    expect(shouldShowActiveConversationTabs([])).toBe(false)
    expect(shouldShowActiveConversationTabs(["a"])).toBe(true)
    expect(shouldShowActiveConversationTabs(["a", "b"])).toBe(true)
  })

  test("keeps revealed comment conversations available in history", () => {
    expect(
      mergeConversationHistoryItems(
        [{ id: "project-chat", name: "Project chat" }],
        [
          { id: "comment-chat", chatId: "comment-chat", name: "Comment chat" },
          { id: "legacy-subchat", chatId: "parent-chat", name: "Nested chat" },
        ],
      ),
    ).toEqual([
      { id: "project-chat", name: "Project chat" },
      { id: "comment-chat", chatId: "comment-chat", name: "Comment chat" },
    ])
  })
})
