import { afterEach, describe, expect, test } from "bun:test"
import { appStore } from "../../../lib/jotai-store"
import {
  clearSubChatCaches,
  getPerChatMessageKey,
  messageAtomFamily,
  messageIdsPerChatAtom,
  preserveDroppedAssistantTail,
  preserveDroppedAssistantTailFromSnapshots,
  syncMessagesWithStatusAtom,
  type Message,
} from "./message-store"

function userMessage(id: string, text: string): Message {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text }],
  }
}

function assistantMessage(id: string, text: string): Message {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
  }
}

function sync(subChatId: string, status: string, messages: Message[]) {
  appStore.set(syncMessagesWithStatusAtom, {
    messages,
    status,
    subChatId,
    updateGlobal: false,
  })
}

function getIds(subChatId: string): string[] {
  return appStore.get(messageIdsPerChatAtom(subChatId))
}

function getMessage(subChatId: string, messageId: string): Message | null {
  return appStore.get(messageAtomFamily(getPerChatMessageKey(subChatId, messageId)))
}

afterEach(() => {
  clearSubChatCaches("settled-finish")
  clearSubChatCaches("settled-finish-different-assistant")
  clearSubChatCaches("streaming-different-assistant")
  clearSubChatCaches("streaming-empty-assistant")
  clearSubChatCaches("rollback-truncate")
})

describe("message store sync", () => {
  test("preserves a dropped assistant tail for finish-time cache snapshots", () => {
    const user = userMessage("user-1", "Move the phone up.")
    const assistant = assistantMessage("assistant-1", "Updated composition.")

    expect(preserveDroppedAssistantTail([user], [user, assistant])).toEqual([
      user,
      assistant,
    ])
  })

  test("preserves a dropped assistant tail from the live chat snapshot before falling back to cache", () => {
    const user = userMessage("user-1", "Move the phone up.")
    const assistant = assistantMessage("assistant-1", "Updated composition.")

    expect(preserveDroppedAssistantTailFromSnapshots([user], [[user, assistant], [user]])).toEqual([
      user,
      assistant,
    ])
  })

  test("preserves same-id assistant text when the finish snapshot is runtime-only", () => {
    const user = userMessage("user-1", "Move the phone up.")
    const assistant = assistantMessage("assistant-1", "Updated composition.")
    const runtimeOnlyAssistant: Message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "data-agent-runtime",
          data: { kind: "motion_edit", title: "Edited" },
        },
      ],
    }

    const [, nextAssistant] = preserveDroppedAssistantTailFromSnapshots(
      [user, runtimeOnlyAssistant],
      [[user, assistant]],
    )

    expect(nextAssistant?.parts?.map((part) => part.type)).toEqual([
      "data-agent-runtime",
      "text",
    ])
    expect(nextAssistant?.parts?.at(-1)?.text).toBe("Updated composition.")
  })

  test("restores same-id assistant text without moving it past later runtime rows", () => {
    const user = userMessage("user-1", "Move the phone up.")
    const previousAssistant: Message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "data-agent-runtime",
          id: "runtime-looked",
          data: { kind: "visual_context", title: "Looked" },
        },
        {
          type: "text",
          text: "I found the current frame.",
        },
        {
          type: "data-agent-runtime",
          id: "runtime-edited",
          data: { kind: "motion_edit", title: "Edited" },
        },
      ],
    }
    const runtimeOnlyAssistant: Message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "data-agent-runtime",
          id: "runtime-looked",
          data: { kind: "visual_context", title: "Looked" },
        },
        {
          type: "data-agent-runtime",
          id: "runtime-edited",
          data: { kind: "motion_edit", title: "Edited" },
        },
      ],
    }

    const [, nextAssistant] = preserveDroppedAssistantTailFromSnapshots(
      [user, runtimeOnlyAssistant],
      [[user, previousAssistant]],
    )

    expect(nextAssistant?.parts?.map((part) =>
      part.type === "text" ? part.text : part.id
    )).toEqual([
      "runtime-looked",
      "I found the current frame.",
      "runtime-edited",
    ])
  })

  test("does not preserve non-assistant tails for intentional truncation", () => {
    const userOne = userMessage("user-1", "Move the phone up.")
    const assistantOne = assistantMessage("assistant-1", "Moved it up.")
    const userTwo = userMessage("user-2", "Make the background darker.")
    const assistantTwo = assistantMessage("assistant-2", "Darkened the background.")

    expect(
      preserveDroppedAssistantTail(
        [userOne, assistantOne],
        [userOne, assistantOne, userTwo, assistantTwo],
      ),
    ).toEqual([userOne, assistantOne])
  })

  test("keeps a completed assistant reply visible when a settled AI SDK snapshot drops it", () => {
    const subChatId = "settled-finish"
    const user = userMessage("user-1", "Move the phone up.")
    const assistant = assistantMessage("assistant-1", "Updated composition.")

    sync(subChatId, "streaming", [user, assistant])
    sync(subChatId, "ready", [user])

    expect(getIds(subChatId)).toEqual(["user-1", "assistant-1"])
    expect(getMessage(subChatId, "assistant-1")).toEqual(expect.objectContaining({
      role: "assistant",
      parts: [expect.objectContaining({ text: "Updated composition." })],
    }))
  })

  test("does not graft old text onto a different settled assistant id", () => {
    const subChatId = "settled-finish-different-assistant"
    const user = userMessage("user-1", "Move the phone up.")
    const assistant = assistantMessage("assistant-1", "Updated composition.")
    const emptyReplacement: Message = {
      id: "assistant-final-empty",
      role: "assistant",
      parts: [],
    }

    sync(subChatId, "streaming", [user, assistant])
    sync(subChatId, "ready", [user, emptyReplacement])

    expect(getIds(subChatId)).toEqual(["user-1", "assistant-final-empty"])
    expect(getMessage(subChatId, "assistant-final-empty")).toEqual(expect.objectContaining({
      role: "assistant",
      parts: [],
    }))
    expect(getMessage(subChatId, "assistant-1")).toBeNull()
  })

  test("does not graft old text onto a different runtime-only assistant id", () => {
    const subChatId = "streaming-different-assistant"
    const user = userMessage("user-1", "Move the phone up.")
    const assistant = assistantMessage("assistant-1", "Updated composition.")
    const runtimeOnlyAssistant: Message = {
      id: "assistant-2",
      role: "assistant",
      parts: [
        {
          type: "data-agent-runtime",
          data: { kind: "motion_edit", title: "Editing" },
        },
      ],
    }

    sync(subChatId, "streaming", [user, assistant])
    sync(subChatId, "streaming", [user, runtimeOnlyAssistant])

    expect(getIds(subChatId)).toEqual(["user-1", "assistant-2"])
    expect(getMessage(subChatId, "assistant-2")?.parts).toEqual([
      expect.objectContaining({ type: "data-agent-runtime" }),
    ])
    expect(getMessage(subChatId, "assistant-1")).toBeNull()
  })

  test("keeps assistant text visible when a streaming AI SDK snapshot temporarily goes empty", () => {
    const subChatId = "streaming-empty-assistant"
    const user = userMessage("user-1", "Move the phone up.")
    const assistant = assistantMessage("assistant-1", "Updated composition.")
    const runtimeOnlyAssistant: Message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "data-agent-runtime",
          data: { kind: "motion_edit", title: "Edited" },
        },
      ],
    }

    sync(subChatId, "streaming", [user, assistant])
    sync(subChatId, "streaming", [user, runtimeOnlyAssistant])

    expect(getIds(subChatId)).toEqual(["user-1", "assistant-1"])
    expect(getMessage(subChatId, "assistant-1")).toEqual(expect.objectContaining({
      role: "assistant",
      parts: [
        expect.objectContaining({ type: "data-agent-runtime" }),
        expect.objectContaining({ text: "Updated composition." }),
      ],
    }))
  })

  test("does not restore a truncated conversation tail during settled rollbacks", () => {
    const subChatId = "rollback-truncate"
    const userOne = userMessage("user-1", "Move the phone up.")
    const assistantOne = assistantMessage("assistant-1", "Moved it up.")
    const userTwo = userMessage("user-2", "Make the background darker.")
    const assistantTwo = assistantMessage("assistant-2", "Darkened the background.")

    sync(subChatId, "ready", [userOne, assistantOne, userTwo, assistantTwo])
    sync(subChatId, "ready", [userOne, assistantOne])

    expect(getIds(subChatId)).toEqual(["user-1", "assistant-1"])
    expect(getMessage(subChatId, "assistant-2")).toBeNull()
  })
})
