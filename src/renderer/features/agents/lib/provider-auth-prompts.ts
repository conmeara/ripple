import {
  agentsLoginModalOpenAtom,
  claudeLoginModalConfigAtom,
  codexLoginModalOpenAtom,
} from "../../../lib/atoms"
import { appStore } from "../../../lib/jotai-store"
import { pendingAuthRetryMessageAtom } from "../atoms"

export type ProviderAuthImageAttachment = {
  base64Data: string
  mediaType: string
  filename?: string
}

type ProviderAuthPromptInput = {
  subChatId: string
  prompt: string
  images?: ProviderAuthImageAttachment[]
}

export type CodexAuthCredentials = {
  hasApiKey: boolean
  hasSubscription: boolean
  hasAny: boolean
}

export type CodexAuthPromptResult =
  | { type: "opened-setup" }
  | { type: "queued-retry" }
  | { type: "failed-saved-credentials"; description: string }

function withImages(images?: ProviderAuthImageAttachment[]) {
  return images && images.length > 0 ? { images } : {}
}

export function openClaudeProviderSetupPrompt({
  subChatId,
  prompt,
  images,
}: ProviderAuthPromptInput) {
  appStore.set(pendingAuthRetryMessageAtom, {
    subChatId,
    provider: "claude-code",
    prompt,
    ...withImages(images),
    readyToRetry: false,
  })
  appStore.set(claudeLoginModalConfigAtom, {
    hideCustomModelSettingsLink: false,
    autoStartAuth: false,
  })
  appStore.set(agentsLoginModalOpenAtom, true)
}

export function resolveCodexProviderAuthPrompt({
  subChatId,
  prompt,
  images,
  credentials,
  forceNewSession,
}: ProviderAuthPromptInput & {
  credentials: CodexAuthCredentials
  forceNewSession: boolean
}): CodexAuthPromptResult {
  const shouldAutoRetryOnce = credentials.hasAny && !forceNewSession

  appStore.set(pendingAuthRetryMessageAtom, {
    subChatId,
    provider: "codex",
    prompt,
    ...withImages(images),
    readyToRetry: shouldAutoRetryOnce,
  })

  if (!credentials.hasAny) {
    appStore.set(codexLoginModalOpenAtom, true)
    return { type: "opened-setup" }
  }

  if (shouldAutoRetryOnce) {
    return { type: "queued-retry" }
  }

  return {
    type: "failed-saved-credentials",
    description: credentials.hasApiKey
      ? "Saved Codex API key was rejected. Update it in Settings."
      : "Saved Codex subscription auth failed. Reconnect subscription in Settings.",
  }
}
