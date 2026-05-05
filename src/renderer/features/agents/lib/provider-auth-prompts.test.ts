import { describe, expect, test } from "bun:test"

class TestStorage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  clear() {
    this.values.clear()
  }
}

const localStorage = new TestStorage()
const sessionStorage = new TestStorage()
Object.assign(globalThis, {
  localStorage,
  sessionStorage,
  window: {
    location: {
      search: "",
      hash: "",
    },
  },
})

const {
  agentsLoginModalOpenAtom,
  claudeLoginModalConfigAtom,
  codexLoginModalOpenAtom,
} = await import("../../../lib/atoms")
const { appStore } = await import("../../../lib/jotai-store")
const { pendingAuthRetryMessageAtom } = await import("../atoms")
const {
  openClaudeProviderSetupPrompt,
  resolveCodexProviderAuthPrompt,
} = await import("./provider-auth-prompts")

function resetAuthPromptState() {
  appStore.set(agentsLoginModalOpenAtom, false)
  appStore.set(codexLoginModalOpenAtom, false)
  appStore.set(claudeLoginModalConfigAtom, {
    hideCustomModelSettingsLink: true,
    autoStartAuth: true,
  })
  appStore.set(pendingAuthRetryMessageAtom, null)
}

describe("provider auth prompts", () => {
  test("opens Claude setup after an auth error and queues the failed prompt", () => {
    resetAuthPromptState()

    openClaudeProviderSetupPrompt({
      subChatId: "sub-chat-1",
      prompt: "Make the title more energetic.",
      images: [
        {
          base64Data: "frame-data",
          mediaType: "image/png",
          filename: "frame.png",
        },
      ],
    })

    expect(appStore.get(agentsLoginModalOpenAtom)).toBe(true)
    expect(appStore.get(claudeLoginModalConfigAtom)).toEqual({
      hideCustomModelSettingsLink: false,
      autoStartAuth: false,
    })
    expect(appStore.get(pendingAuthRetryMessageAtom)).toEqual({
      subChatId: "sub-chat-1",
      provider: "claude-code",
      prompt: "Make the title more energetic.",
      images: [
        {
          base64Data: "frame-data",
          mediaType: "image/png",
          filename: "frame.png",
        },
      ],
      readyToRetry: false,
    })
  })

  test("opens Codex setup only when no saved credentials can retry", () => {
    resetAuthPromptState()

    const result = resolveCodexProviderAuthPrompt({
      subChatId: "sub-chat-2",
      prompt: "Create a version for review.",
      credentials: {
        hasApiKey: false,
        hasSubscription: false,
        hasAny: false,
      },
      forceNewSession: false,
    })

    expect(result).toEqual({ type: "opened-setup" })
    expect(appStore.get(codexLoginModalOpenAtom)).toBe(true)
    expect(appStore.get(pendingAuthRetryMessageAtom)).toEqual({
      subChatId: "sub-chat-2",
      provider: "codex",
      prompt: "Create a version for review.",
      readyToRetry: false,
    })
  })

  test("queues one Codex retry for saved credentials without opening setup", () => {
    resetAuthPromptState()

    const result = resolveCodexProviderAuthPrompt({
      subChatId: "sub-chat-3",
      prompt: "Try the saved connection again.",
      credentials: {
        hasApiKey: true,
        hasSubscription: false,
        hasAny: true,
      },
      forceNewSession: false,
    })

    expect(result).toEqual({ type: "queued-retry" })
    expect(appStore.get(codexLoginModalOpenAtom)).toBe(false)
    expect(appStore.get(pendingAuthRetryMessageAtom)).toEqual({
      subChatId: "sub-chat-3",
      provider: "codex",
      prompt: "Try the saved connection again.",
      readyToRetry: true,
    })
  })

  test("reports failed saved Codex credentials after the retry session", () => {
    resetAuthPromptState()

    const result = resolveCodexProviderAuthPrompt({
      subChatId: "sub-chat-4",
      prompt: "Retry failed again.",
      credentials: {
        hasApiKey: false,
        hasSubscription: true,
        hasAny: true,
      },
      forceNewSession: true,
    })

    expect(result).toEqual({
      type: "failed-saved-credentials",
      description:
        "Saved Codex subscription auth failed. Reconnect subscription in Settings.",
    })
    expect(appStore.get(codexLoginModalOpenAtom)).toBe(false)
    expect(appStore.get(pendingAuthRetryMessageAtom)).toEqual({
      subChatId: "sub-chat-4",
      provider: "codex",
      prompt: "Retry failed again.",
      readyToRetry: false,
    })
  })
})
