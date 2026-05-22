import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("provider switch clean chat behavior", () => {
  test("does not attach prior chat history when switching providers", () => {
    const activeChatSource = readFileSync(
      "src/renderer/features/agents/main/active-chat.tsx",
      "utf8",
    )
    const modelSelectorSource = readFileSync(
      "src/renderer/features/agents/components/agent-model-selector.tsx",
      "utf8",
    )
    const pastedTextItemSource = readFileSync(
      "src/renderer/features/agents/ui/agent-pasted-text-item.tsx",
      "utf8",
    )
    const mentionsEditorSource = readFileSync(
      "src/renderer/features/agents/mentions/agents-mentions-editor.tsx",
      "utf8",
    )

    expect(activeChatSource).not.toContain("pendingChatHistoryAtom")
    expect(activeChatSource).not.toContain("formatHistoryForContext")
    expect(activeChatSource).not.toContain("writePastedText")
    expect(activeChatSource).not.toContain("chatHistory_")
    expect(pastedTextItemSource).not.toContain("Past chat")
    expect(mentionsEditorSource).not.toContain("CHAT_HISTORY")
    expect(modelSelectorSource).not.toContain("conversation history attached")
    expect(modelSelectorSource).toContain("a clean new chat will be created")
  })
})
