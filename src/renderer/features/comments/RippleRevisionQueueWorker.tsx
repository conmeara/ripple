"use client"

import { Chat, useChat } from "@ai-sdk/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { trpc } from "../../lib/trpc"
import { appStore } from "../../lib/jotai-store"
import type { AgentProviderId } from "../agents/components/agent-model-selector"
import { ACPChatTransport } from "../agents/lib/acp-chat-transport"
import { IPCChatTransport } from "../agents/lib/ipc-chat-transport"
import type { CodexThinkingLevel } from "../agents/lib/models"
import { agentChatStore } from "../agents/stores/agent-chat-store"
import { useStreamingStatusStore } from "../agents/stores/streaming-status-store"
import {
  subChatCodexModelIdAtomFamily,
  subChatCodexThinkingAtomFamily,
  subChatModelIdAtomFamily,
} from "../agents/atoms"

interface RevisionQueueRun {
  revisionId: string
  chatId: string
  subChatId: string
  projectPath: string
  worktreePath: string
  mode: "plan" | "agent"
  messages: string | null
  streamId: string | null
}

function parseStoredChatMessages(value: unknown): any[] {
  if (Array.isArray(value)) return value
  if (typeof value !== "string") return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function getRuntimeChatMessages(chat: Chat<any> | null | undefined): any[] {
  const messages = (chat as any)?.messages
  return Array.isArray(messages) ? messages : []
}

function areChatMessagesEqual(left: any[], right: any[]): boolean {
  if (left === right) return true
  if (left.length !== right.length) return false
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

function extractTextFromChatPart(part: any): string | null {
  if (!part || typeof part !== "object") return null
  if (part.type === "text" && typeof part.text === "string") return part.text
  if (typeof part.text === "string" && !String(part.type ?? "").startsWith("tool-")) {
    return part.text
  }
  return null
}

function extractLastUserPrompt(messages: any[]): string | null {
  const userMessage = [...messages].reverse().find((message) => message?.role === "user")
  const parts: any[] = Array.isArray(userMessage?.parts) ? userMessage.parts : []
  const text = parts.length > 0
    ? parts
        .map(extractTextFromChatPart)
        .filter((part): part is string => Boolean(part))
        .join("\n")
        .trim()
    : ""
  return text || null
}

function inferRevisionProvider(messages: any[]): AgentProviderId {
  const model = [...messages]
    .reverse()
    .map((message) => message?.metadata?.model)
    .find((value): value is string => typeof value === "string")
  if (!model) return "claude-code"
  return model.includes("codex") || model.startsWith("gpt-")
    ? "codex"
    : "claude-code"
}

function restoreStoredRevisionModelSelection(subChatId: string, messages: any[]) {
  const model = [...messages]
    .reverse()
    .map((message) => message?.metadata?.model)
    .find((value): value is string => typeof value === "string")
  if (!model) return

  if (model.includes("codex") || model.startsWith("gpt-")) {
    const [modelId, thinking] = model.split("/")
    if (modelId) appStore.set(subChatCodexModelIdAtomFamily(subChatId), modelId)
    if (thinking) {
      appStore.set(
        subChatCodexThinkingAtomFamily(subChatId),
        thinking as CodexThinkingLevel,
      )
    }
    return
  }

  appStore.set(subChatModelIdAtomFamily(subChatId), model)
}

function RevisionQueueJobRunner({
  job,
  onSettled,
}: {
  job: RevisionQueueRun
  onSettled: () => Promise<void>
}) {
  const completeRun = trpc.revisions.completeBackgroundRun.useMutation()
  const failRun = trpc.revisions.failBackgroundRun.useMutation()
  const utils = trpc.useUtils()
  const startedRef = useRef(false)
  const runErrorRef = useRef<string | null>(null)
  const storedMessages = useMemo(
    () => parseStoredChatMessages(job.messages),
    [job.messages],
  )
  const prompt = useMemo(() => extractLastUserPrompt(storedMessages), [storedMessages])
  const chat = useMemo(() => {
    const existing = agentChatStore.get(job.subChatId)
    if (existing) {
      const existingMessages = getRuntimeChatMessages(existing)
      const runtimeIsStreaming = useStreamingStatusStore
        .getState()
        .isStreaming(job.subChatId)
      const storedTranscriptIsNewer =
        storedMessages.length > 0 &&
        !runtimeIsStreaming &&
        !agentChatStore.getStreamId(job.subChatId) &&
        !areChatMessagesEqual(storedMessages, existingMessages)
      if (!storedTranscriptIsNewer) return existing
      agentChatStore.delete(job.subChatId)
    }

    restoreStoredRevisionModelSelection(job.subChatId, storedMessages)
    const provider = inferRevisionProvider(storedMessages)
    const transport =
      provider === "codex"
        ? new ACPChatTransport({
            chatId: job.chatId,
            subChatId: job.subChatId,
            cwd: job.worktreePath,
            projectPath: job.projectPath,
            mode: job.mode,
            provider: "codex",
            disableMcp: true,
          })
        : new IPCChatTransport({
            chatId: job.chatId,
            subChatId: job.subChatId,
            cwd: job.worktreePath,
            projectPath: job.projectPath,
            mode: job.mode,
          })

    const nextChat = new Chat<any>({
      id: job.subChatId,
      messages: storedMessages,
      transport,
      onError: (error) => {
        runErrorRef.current = error.message
        useStreamingStatusStore.getState().setStatus(job.subChatId, "ready")
      },
      onFinish: () => {
        useStreamingStatusStore.getState().setStatus(job.subChatId, "ready")
      },
    })
    agentChatStore.set(job.subChatId, nextChat, job.chatId)
    agentChatStore.setStreamId(job.subChatId, job.streamId || null)
    return nextChat
  }, [
    job.chatId,
    job.mode,
    job.projectPath,
    job.streamId,
    job.subChatId,
    job.worktreePath,
    storedMessages,
  ])

  const { status, regenerate } = useChat({
    id: job.subChatId,
    chat,
    resume: Boolean(job.streamId),
    experimental_throttle: 100,
  })

  useEffect(() => {
    if (status === "streaming" || status === "submitted") {
      useStreamingStatusStore.getState().setStatus(job.subChatId, status)
      return
    }
    if (status === "error") {
      useStreamingStatusStore.getState().setStatus(job.subChatId, "error")
    }
  }, [job.subChatId, status])

  useEffect(() => {
    if (
      !prompt ||
      startedRef.current ||
      status !== "ready" ||
      agentChatStore.getStreamId(job.subChatId)
    ) {
      return
    }
    startedRef.current = true

    void (async () => {
      try {
        runErrorRef.current = null
        await regenerate()
        if (runErrorRef.current) {
          throw new Error(runErrorRef.current)
        }
        await completeRun.mutateAsync({ revisionId: job.revisionId })
        await Promise.all([
          utils.revisions.listThreads.invalidate(),
          utils.chats.get.invalidate({ id: job.chatId }),
          utils.hyperframes.getPlayerSource.invalidate(),
          utils.hyperframes.getTimelineModel.invalidate(),
          utils.hyperframes.getProjectBrowserModel.invalidate(),
        ])
      } catch (error) {
        await failRun.mutateAsync({
          revisionId: job.revisionId,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        await Promise.all([
          utils.revisions.listThreads.invalidate(),
          utils.chats.get.invalidate({ id: job.chatId }),
          utils.hyperframes.getPlayerSource.invalidate(),
          utils.hyperframes.getTimelineModel.invalidate(),
          utils.hyperframes.getProjectBrowserModel.invalidate(),
        ])
      } finally {
        useStreamingStatusStore.getState().setStatus(job.subChatId, "ready")
        await onSettled()
      }
    })()
  }, [
    completeRun,
    failRun,
    job.chatId,
    job.revisionId,
    job.subChatId,
    onSettled,
    prompt,
    regenerate,
    status,
    utils.chats.get,
    utils.hyperframes.getPlayerSource,
    utils.hyperframes.getProjectBrowserModel,
    utils.hyperframes.getTimelineModel,
    utils.revisions.listThreads,
  ])

  return null
}

export function RippleRevisionQueueWorker({
  projectId,
}: {
  projectId: string
}) {
  const [job, setJob] = useState<RevisionQueueRun | null>(null)
  const claimNextRun = trpc.revisions.claimNextRun.useMutation()
  const pollDelayRef = useRef(300)

  const claimNext = useCallback(async () => {
    const result = await claimNextRun.mutateAsync({ projectId })
    const nextJob = result.job as RevisionQueueRun | null
    if (nextJob) {
      pollDelayRef.current = 300
      setJob(nextJob)
      return
    }
    pollDelayRef.current = Math.min(pollDelayRef.current * 2, 2_500)
  }, [claimNextRun, projectId])

  useEffect(() => {
    if (job || claimNextRun.isPending) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      void claimNext().catch((error) => {
        console.warn("[RippleRevisionQueueWorker] Could not claim revision run:", error)
      })
    }, pollDelayRef.current)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [claimNext, claimNextRun.isPending, job])

  const handleSettled = useCallback(async () => {
    setJob(null)
  }, [])

  if (!job) return null

  return (
    <RevisionQueueJobRunner
      key={job.revisionId}
      job={job}
      onSettled={handleSettled}
    />
  )
}
