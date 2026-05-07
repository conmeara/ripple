import { describe, expect, test } from "bun:test"
import {
  filterConversationHistoryMessagesForRun,
  formatConversationHistoryForPrompt,
  shouldIncludeConversationHistory,
} from "./chat-history-context"

describe("agent runtime chat history context", () => {
  test("includes visible prior messages as compact provider context", () => {
    const context = formatConversationHistoryForPrompt([
      {
        role: "user",
        body: "change the text from hello to goodbye",
        partsJson: "[]",
      },
      {
        role: "assistant",
        body: "Updated Main to say goodbye.",
        partsJson: "[]",
      },
    ] as any)

    expect(context).toContain("Previous conversation context:")
    expect(context).toContain("User: change the text from hello to goodbye")
    expect(context).toContain("Assistant: Updated Main to say goodbye.")
  })

  test("uses parts text when the stored message body is empty", () => {
    const context = formatConversationHistoryForPrompt([
      {
        role: "assistant",
        body: "",
        partsJson: JSON.stringify([
          { type: "text", text: "Recovered from persisted parts." },
          { type: "tool-Bash", output: "noisy output" },
        ]),
      },
    ] as any)

    expect(context).toContain("Assistant: Recovered from persisted parts.")
    expect(context).not.toContain("noisy output")
  })

  test("bridges history for clean Codex threads and Claude sessions without resume ids", () => {
    expect(shouldIncludeConversationHistory({
      run: { provider: "codex", runKind: "chat", conversationId: "conversation-1" },
      thread: { providerSessionId: "ignored-for-codex" },
    } as any)).toBe(true)

    expect(shouldIncludeConversationHistory({
      run: { provider: "claude", runKind: "chat", conversationId: "conversation-1" },
      thread: { providerSessionId: "claude-session-1" },
    } as any)).toBe(false)

    expect(shouldIncludeConversationHistory({
      run: { provider: "claude", runKind: "chat", conversationId: "conversation-1" },
      thread: { providerSessionId: null },
    } as any)).toBe(true)
  })

  test("bridges generated-change follow-up history without echoing the current reply", () => {
    expect(shouldIncludeConversationHistory({
      run: {
        provider: "codex",
        runKind: "generated_change",
        conversationId: "conversation-1",
      },
      thread: { providerSessionId: null },
    } as any)).toBe(true)

    const messages = filterConversationHistoryMessagesForRun({
      run: {
        id: "run-2",
        runKind: "generated_change",
        revisionId: "revision-2",
      } as any,
      messages: [
        {
          agentRunId: null,
          metadataJson: JSON.stringify({
            source: "ripple-comment",
            revisionId: "revision-1",
          }),
        },
        {
          agentRunId: "run-1",
          metadataJson: JSON.stringify({
            source: "agent-runtime",
          }),
        },
        {
          agentRunId: null,
          metadataJson: JSON.stringify({
            source: "ripple-comment",
            revisionId: "revision-2",
          }),
        },
      ] as any,
    })

    expect(messages).toHaveLength(2)
    expect(messages[0]?.metadataJson).toContain("revision-1")
    expect(messages[1]?.agentRunId).toBe("run-1")
  })
})
