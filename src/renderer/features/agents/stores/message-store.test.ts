import { afterEach, describe, expect, test } from "bun:test"
import { appStore } from "../../../lib/jotai-store"
import {
  clearSubChatCaches,
  getPerChatMessageKey,
  messageAtomFamily,
  messageIdsPerChatAtom,
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
  clearSubChatCaches("rollback-truncate")
})

describe("message store sync", () => {
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
