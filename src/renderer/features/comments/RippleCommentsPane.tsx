"use client"

import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react"
import {
  Check,
  ChevronDown,
  CircleDot,
  Eye,
  LoaderCircle,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
  X,
} from "lucide-react"
import { toast } from "sonner"
import type {
  RippleCommentFilter,
  RippleCommentMessageView,
  RippleCommentThreadView,
  RippleRevisionStatus,
  RippleRevisionView,
} from "../../../shared/ripple-comments"
import type { RippleTimelineRangeSelection } from "../../../shared/hyperframes-timeline-model"
import { Button } from "../../components/ui/button"
import { TextShimmer } from "../../components/ui/text-shimmer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from "../../components/ui/prompt-input"
import {
  agentsSettingsDialogActiveTabAtom,
  agentsSettingsDialogOpenAtom,
  anthropicOnboardingCompletedAtom,
  apiKeyOnboardingCompletedAtom,
  codexApiKeyAtom,
  codexOnboardingCompletedAtom,
  customClaudeConfigAtom,
  extendedThinkingEnabledAtom,
  hiddenModelsAtom,
  normalizeCodexApiKey,
  normalizeCustomClaudeConfig,
  selectedOllamaModelAtom,
  showOfflineModeFeaturesAtom,
} from "../../lib/atoms"
import { appStore } from "../../lib/jotai-store"
import { trpc } from "../../lib/trpc"
import { cn } from "../../lib/utils"
import {
  lastSelectedAgentIdAtom,
  lastSelectedCodexModelIdAtom,
  lastSelectedCodexThinkingAtom,
  lastSelectedModelIdAtom,
  subChatCodexModelIdAtomFamily,
  subChatCodexThinkingAtomFamily,
  subChatModelIdAtomFamily,
} from "../agents/atoms"
import {
  AgentModelSelector,
  type AgentProviderId,
} from "../agents/components/agent-model-selector"
import { AgentSendButton } from "../agents/components/agent-send-button"
import {
  CLAUDE_MODELS,
  CODEX_MODELS,
  type CodexThinkingLevel,
} from "../agents/lib/models"
import { commentFilterLabels, shouldShowRestoreAction } from "./comment-filters"
import {
  formatRevisionResultLine,
  formatCommentTimecode,
  parseRevisionDiffSummary,
} from "./comment-formatting"
import { buildAnchorFromTimelineContext } from "./timeline-comment-prompt"

interface RippleCommentsPaneProps {
  projectId: string
  compositionId?: string | null
  currentTime: number
  selection: RippleTimelineRangeSelection | null
  activePreviewRevisionId?: string | null
  onPreviewRevision: (revisionId: string, time: number) => void
  onShowPrimaryPreview: () => void
  onOpenChat: (
    chatId: string,
    revisionId?: string | null,
    time?: number,
  ) => void
}

function createClientRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function normalizeAgentProvider(value: string): AgentProviderId {
  return value === "codex" ? "codex" : "claude-code"
}

function useAvailableCommentModels() {
  const showOfflineFeatures = useAtomValue(showOfflineModeFeaturesAtom)
  const { data: ollamaStatus } = trpc.ollama.getStatus.useQuery(undefined, {
    refetchInterval: showOfflineFeatures ? 30_000 : false,
    enabled: showOfflineFeatures,
  })

  const isOffline = ollamaStatus ? !ollamaStatus.internet.online : false
  const hasOllama =
    Boolean(ollamaStatus?.ollama.available) &&
    (ollamaStatus?.ollama.models?.length ?? 0) > 0

  if (showOfflineFeatures && hasOllama && isOffline) {
    return {
      models: CLAUDE_MODELS,
      ollamaModels: ollamaStatus?.ollama.models ?? [],
      recommendedModel: ollamaStatus?.ollama.recommendedModel,
      isOffline,
      hasOllama: true,
    }
  }

  return {
    models: CLAUDE_MODELS,
    ollamaModels: [] as string[],
    recommendedModel: undefined as string | undefined,
    isOffline,
    hasOllama: false,
  }
}

function useCommentRevisionModelSelector() {
  const [lastSelectedAgentId, setLastSelectedAgentId] = useAtom(
    lastSelectedAgentIdAtom,
  )
  const selectedAgentId = normalizeAgentProvider(lastSelectedAgentId)
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false)
  const availableModels = useAvailableCommentModels()
  const [lastSelectedModelId, setLastSelectedModelId] = useAtom(
    lastSelectedModelIdAtom,
  )
  const [lastSelectedCodexModelId, setLastSelectedCodexModelId] = useAtom(
    lastSelectedCodexModelIdAtom,
  )
  const [lastSelectedCodexThinking, setLastSelectedCodexThinking] = useAtom(
    lastSelectedCodexThinkingAtom,
  )
  const [selectedOllamaModel, setSelectedOllamaModel] = useAtom(
    selectedOllamaModelAtom,
  )
  const [thinkingEnabled, setThinkingEnabled] = useAtom(
    extendedThinkingEnabledAtom,
  )
  const hiddenModels = useAtomValue(hiddenModelsAtom)
  const storedCodexApiKey = useAtomValue(codexApiKeyAtom)
  const hasAppCodexApiKey = Boolean(normalizeCodexApiKey(storedCodexApiKey))
  const customClaudeConfig = useAtomValue(customClaudeConfigAtom)
  const hasCustomClaudeConfig = Boolean(
    normalizeCustomClaudeConfig(customClaudeConfig),
  )
  const anthropicOnboardingCompleted = useAtomValue(
    anthropicOnboardingCompletedAtom,
  )
  const apiKeyOnboardingCompleted = useAtomValue(apiKeyOnboardingCompletedAtom)
  const codexOnboardingCompleted = useAtomValue(codexOnboardingCompletedAtom)
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsTab = useSetAtom(agentsSettingsDialogActiveTabAtom)
  const { data: claudeCodeIntegration } =
    trpc.claudeCode.getIntegration.useQuery()

  const [selectedModel, setSelectedModel] = useState(
    () =>
      availableModels.models.find((model) => model.id === lastSelectedModelId) ||
      availableModels.models[0],
  )

  useEffect(() => {
    const model = availableModels.models.find(
      (item) => item.id === lastSelectedModelId,
    )
    if (model && model.id !== selectedModel?.id) {
      setSelectedModel(model)
    }
  }, [availableModels.models, lastSelectedModelId, selectedModel?.id])

  const codexUiModels = useMemo(() => {
    const models = hasAppCodexApiKey
      ? CODEX_MODELS.filter((model) => model.id !== "gpt-5.3-codex")
      : CODEX_MODELS
    return models.filter((model) => !hiddenModels.includes(model.id))
  }, [hasAppCodexApiKey, hiddenModels])

  const selectedCodexModel = useMemo(
    () =>
      codexUiModels.find((model) => model.id === lastSelectedCodexModelId) ||
      codexUiModels[0] ||
      CODEX_MODELS[0]!,
    [codexUiModels, lastSelectedCodexModelId],
  )

  const selectedCodexThinking = useMemo<CodexThinkingLevel>(() => {
    if (
      selectedCodexModel.thinkings.includes(
        lastSelectedCodexThinking as CodexThinkingLevel,
      )
    ) {
      return lastSelectedCodexThinking as CodexThinkingLevel
    }
    return selectedCodexModel.thinkings.includes("high")
      ? "high"
      : selectedCodexModel.thinkings[0]!
  }, [lastSelectedCodexThinking, selectedCodexModel])

  useEffect(() => {
    if (
      selectedCodexModel.thinkings.includes(
        lastSelectedCodexThinking as CodexThinkingLevel,
      )
    ) {
      return
    }
    setLastSelectedCodexThinking(selectedCodexThinking)
  }, [
    lastSelectedCodexThinking,
    selectedCodexModel,
    selectedCodexThinking,
    setLastSelectedCodexThinking,
  ])

  const currentOllamaModel =
    selectedOllamaModel ||
    availableModels.recommendedModel ||
    availableModels.ollamaModels[0]
  const isClaudeConnected =
    Boolean(claudeCodeIntegration?.isConnected) ||
    anthropicOnboardingCompleted ||
    apiKeyOnboardingCompleted ||
    hasCustomClaudeConfig
  const selectedModelLabel = useMemo(() => {
    if (selectedAgentId === "codex") return selectedCodexModel.name
    if (availableModels.isOffline && availableModels.hasOllama) {
      return currentOllamaModel || "Ollama"
    }
    if (hasCustomClaudeConfig) return "Custom Model"
    if (!selectedModel) return "Select model"
    return `${selectedModel.name} ${selectedModel.version}`
  }, [
    selectedAgentId,
    selectedCodexModel.name,
    availableModels.isOffline,
    availableModels.hasOllama,
    currentOllamaModel,
    hasCustomClaudeConfig,
    selectedModel,
  ])

  const selectedRevisionModel = useMemo(() => {
    if (selectedAgentId === "codex") {
      return `${selectedCodexModel.id}/${selectedCodexThinking}`
    }
    return selectedModel?.id ?? "opus"
  }, [
    selectedAgentId,
    selectedCodexModel.id,
    selectedCodexThinking,
    selectedModel?.id,
  ])

  const persistSelectionForSubChat = (subChatId?: string | null) => {
    if (!subChatId) return
    appStore.set(subChatModelIdAtomFamily(subChatId), selectedModel?.id ?? "opus")
    appStore.set(subChatCodexModelIdAtomFamily(subChatId), selectedCodexModel.id)
    appStore.set(subChatCodexThinkingAtomFamily(subChatId), selectedCodexThinking)
  }

  const selector = (
    <AgentModelSelector
      open={isModelDropdownOpen}
      onOpenChange={setIsModelDropdownOpen}
      selectedAgentId={selectedAgentId}
      onSelectedAgentIdChange={setLastSelectedAgentId}
      selectedModelLabel={selectedModelLabel}
      triggerClassName="h-7 max-w-[180px] px-2 text-xs"
      contentClassName="max-w-[min(360px,calc(100vw-32px))]"
      onOpenModelsSettings={() => {
        setSettingsTab("models")
        setSettingsOpen(true)
      }}
      claude={{
        models: availableModels.models.filter(
          (model) => !hiddenModels.includes(model.id),
        ),
        selectedModelId: selectedModel?.id,
        onSelectModel: (modelId) => {
          const model =
            availableModels.models.find((item) => item.id === modelId) ||
            availableModels.models[0]
          if (!model) return
          setSelectedModel(model)
          setLastSelectedModelId(model.id)
        },
        hasCustomModelConfig: hasCustomClaudeConfig,
        isOffline: availableModels.isOffline && availableModels.hasOllama,
        ollamaModels: availableModels.ollamaModels,
        selectedOllamaModel: currentOllamaModel,
        recommendedOllamaModel: availableModels.recommendedModel,
        onSelectOllamaModel: setSelectedOllamaModel,
        isConnected: isClaudeConnected,
        thinkingEnabled,
        onThinkingChange: setThinkingEnabled,
      }}
      codex={{
        models: codexUiModels,
        selectedModelId: selectedCodexModel.id,
        onSelectModel: (modelId) => {
          const model = codexUiModels.find((item) => item.id === modelId)
          if (!model) return
          const nextThinking = model.thinkings.includes(selectedCodexThinking)
            ? selectedCodexThinking
            : model.thinkings.includes("high")
              ? "high"
              : model.thinkings[0]!
          setLastSelectedCodexModelId(model.id)
          setLastSelectedCodexThinking(nextThinking)
        },
        selectedThinking: selectedCodexThinking,
        onSelectThinking: setLastSelectedCodexThinking,
        isConnected: codexOnboardingCompleted,
      }}
    />
  )

  return {
    selector,
    selectedRevisionModel,
    persistSelectionForSubChat,
  }
}

function IconButton({
  label,
  active,
  children,
  onClick,
  disabled,
}: {
  label: string
  active?: boolean
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-7 w-7 rounded-full p-0 text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
        active && "bg-primary/12 text-primary hover:text-primary",
      )}
    >
      {children}
    </Button>
  )

  return (
    <Tooltip>
      {disabled ? (
        <TooltipTrigger asChild>
          <span
            role="button"
            aria-label={label}
            aria-disabled="true"
            tabIndex={0}
            className="inline-flex"
          >
            {button}
          </span>
        </TooltipTrigger>
      ) : (
        <TooltipTrigger asChild>{button}</TooltipTrigger>
      )}
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function CommentComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  timecode,
  isSubmitting,
  modelSelector,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
  timecode?: string
  isSubmitting?: boolean
  modelSelector?: ReactNode
}) {
  const hasContent = value.trim().length > 0

  return (
    <PromptInput
      value={value}
      onValueChange={onChange}
      onSubmit={onSubmit}
      maxHeight={160}
      className="border bg-input-background relative z-10 p-2 rounded-xl transition-[border-color,box-shadow] duration-150 focus-within:ring-2 focus-within:ring-primary/50"
    >
      <div className="flex items-start gap-2">
        {timecode ? (
          <span className="mt-1 shrink-0 rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
            {timecode}
          </span>
        ) : null}
        <PromptInputTextarea
          placeholder={placeholder}
          className="min-h-[40px] px-0 py-1 text-sm placeholder:text-muted-foreground/70"
        />
      </div>
      <PromptInputActions className="w-full">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {modelSelector}
        </div>
        <div className="ml-auto">
          <AgentSendButton
            disabled={!hasContent || isSubmitting}
            isSubmitting={isSubmitting}
            hasContent={hasContent}
            onClick={onSubmit}
            ariaLabel="Send comment"
          />
        </div>
      </PromptInputActions>
    </PromptInput>
  )
}

function EmptyComments() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-5 h-20 w-24 text-muted-foreground/35">
        <div className="absolute left-1 top-7 h-10 w-16 rounded-lg bg-foreground/10" />
        <div className="absolute right-0 top-1 flex h-12 w-16 items-center justify-center rounded-lg bg-foreground/10">
          <MoreHorizontal className="h-5 w-5" />
        </div>
      </div>
      <div className="text-sm font-medium text-muted-foreground">
        No comments yet
      </div>
    </div>
  )
}

function RevisionStatusLine({
  revision,
}: {
  revision: RippleRevisionView
}) {
  if (isRevisionUpdatingAgainstLatest(revision)) return null

  const summary = parseRevisionDiffSummary(revision.diffSummary)
  const isWorking =
    revision.status === "queued" ||
    revision.status === "preparing" ||
    revision.status === "running"
  const label = revisionStatusLabel(revision.status)
  const resultLine =
    revision.status === "proposed" ||
    revision.status === "accepted" ||
    revision.status === "rejected" ||
    revision.status === "superseded"
      ? formatRevisionResultLine(summary)
      : label
  const line = revision.status === "failed"
    ? revision.errorMessage || revisionStatusLabel(revision.status)
    : resultLine

  return (
    <div
      className={cn(
        "mt-3 px-1 text-xs font-medium",
        revision.status === "failed" && "text-destructive",
      )}
    >
      {isWorking ? (
        <TextShimmer
          as="span"
          duration={1.2}
          className="inline-flex h-4 items-center text-xs leading-none"
        >
          {line}
        </TextShimmer>
      ) : (
        <span
          className={cn(
            revision.status === "failed"
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {line}
        </span>
      )}
    </div>
  )
}

function isRevisionUpdatingAgainstLatest(revision: RippleRevisionView): boolean {
  return revision.status === "updating" || (
    Boolean(revision.diffSummary) &&
    (
      revision.status === "queued" ||
      revision.status === "preparing" ||
      revision.status === "running"
    )
  )
}

function revisionStatusLabel(status: RippleRevisionStatus): string {
  switch (status) {
    case "queued":
      return "Starting agent"
    case "preparing":
      return "Preparing changes"
    case "running":
      return "Agent is working"
    case "updating":
      return "Updating"
    case "proposed":
      return "Changes ready"
    case "accepted":
      return "Accepted"
    case "rejected":
      return "Deleted"
    case "superseded":
      return "Updated"
    case "failed":
      return "Needs attention"
  }
}

function commentStatusVisual(
  thread: RippleCommentThreadView,
  revision: RippleRevisionView | null,
): { label: string; className: string } {
  if (
    revision?.status === "queued" ||
    revision?.status === "preparing" ||
    revision?.status === "running" ||
    revision?.status === "updating"
  ) {
    return { label: "In Progress", className: "bg-blue-500" }
  }

  if (revision?.status === "failed") {
    return { label: "Need Input", className: "bg-amber-500" }
  }

  if (
    thread.status === "resolved" ||
    revision?.status === "proposed" ||
    revision?.status === "accepted"
  ) {
    return { label: "Done", className: "bg-emerald-500" }
  }

  return { label: "Drafts", className: "bg-muted-foreground/20" }
}

function latestRevision(thread: RippleCommentThreadView): RippleRevisionView | null {
  if (thread.latestRevisionId) {
    return thread.revisions.find((revision) => revision.id === thread.latestRevisionId) ?? null
  }
  return thread.revisions[thread.revisions.length - 1] ?? null
}

function revisionAcceptControl(revision: RippleRevisionView): {
  label: string
  disabled: boolean
  busy: boolean
} {
  switch (revision.status) {
    case "proposed":
      return { label: "Accept changes", disabled: false, busy: false }
    case "updating":
      return {
        label: "Updating",
        disabled: true,
        busy: true,
      }
    case "queued":
    case "preparing":
    case "running":
      if (isRevisionUpdatingAgainstLatest(revision)) {
        return {
          label: "Resolving",
          disabled: true,
          busy: true,
        }
      }
      return {
        label: "Generating changes",
        disabled: true,
        busy: true,
      }
    case "accepted":
      return { label: "Changes accepted", disabled: true, busy: false }
    case "rejected":
      return { label: "Changes deleted", disabled: true, busy: false }
    case "superseded":
      return { label: "Changes updated", disabled: true, busy: false }
    case "failed":
      return { label: "Open in Chat to continue", disabled: true, busy: false }
  }
}

function CommentCard({
  thread,
  index,
  selected,
  deletedFilter,
  activePreviewRevisionId,
  onSelect,
  onReply,
  onDelete,
  onRestore,
  onRefreshRevision,
  onAcceptRevision,
  onOpenChat,
}: {
  thread: RippleCommentThreadView
  index: number
  selected: boolean
  deletedFilter: boolean
  activePreviewRevisionId?: string | null
  onSelect: (thread: RippleCommentThreadView, revision: RippleRevisionView | null) => void
  onReply: (threadId: string, body: string, clientRequestId: string) => void
  onDelete: (threadId: string) => void
  onRestore: (threadId: string) => void
  onRefreshRevision: (revisionId: string) => void
  onAcceptRevision: (revisionId: string) => void
  onOpenChat: (
    chatId: string,
    revisionId?: string | null,
    time?: number,
  ) => void
}) {
  const [replying, setReplying] = useState(false)
  const [reply, setReply] = useState("")
  const revision = latestRevision(thread)
  const firstMessage = thread.messages.find((message) => message.role === "user")
  const replies = thread.messages.filter((message) => message.id !== firstMessage?.id)
  const isRevisionPreview = revision?.id === activePreviewRevisionId
  const revisionByMessageId = useMemo(() => {
    const revisionsById = new Map(
      thread.revisions.map((item) => [item.id, item] as const),
    )
    const userMessages = thread.messages.filter(
      (message): message is RippleCommentMessageView => message.role === "user",
    )
    return new Map(
      userMessages.map((message, userIndex) => [
        message.id,
        message.revisionId
          ? revisionsById.get(message.revisionId) ?? null
          : thread.revisions[userIndex] ?? null,
      ] as const),
    )
  }, [thread.messages, thread.revisions])
  const firstRevision = firstMessage
    ? revisionByMessageId.get(firstMessage.id) ?? null
    : null
  const statusVisual = commentStatusVisual(thread, revision)
  const acceptControl = revision ? revisionAcceptControl(revision) : null

  const submitReply = () => {
    const body = reply.trim()
    if (!body) return
    onReply(thread.id, body, createClientRequestId())
    setReply("")
    setReplying(false)
  }

  const handleCardClick = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (
      target.closest(
        "button, a, input, textarea, select, [role='button'], [data-comment-action='true']",
      )
    ) {
      return
    }
    onSelect(thread, revision)
  }

  return (
    <article
      data-comment-card="true"
      onClick={handleCardClick}
      className={cn(
        "rounded-xl border bg-background/45 transition-colors",
        selected
          ? "border-primary/45 bg-muted/30"
          : "border-border/55 hover:border-border",
      )}
    >
      <div className="px-3 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
            {formatCommentTimecode(thread.startTime, thread.endTime)}
          </span>
          <span className="shrink-0 text-xs font-semibold text-muted-foreground">
            #{index + 1}
          </span>
          <span
            className={cn("h-2 w-2 shrink-0 rounded-full", statusVisual.className)}
            title={statusVisual.label}
          />
          <span className="sr-only">{statusVisual.label}</span>
          {thread.status === "resolved" ? (
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">
              Resolved
            </span>
          ) : null}
          <div className="ml-auto">
            <IconButton
              label={isRevisionPreview ? "Viewing changes" : "View changes"}
              active={isRevisionPreview}
              disabled={!revision || revision.status === "failed"}
              onClick={() => onSelect(thread, revision)}
            >
              <Eye className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSelect(thread, revision)}
          className="mt-3 block w-full rounded-xl border bg-input-background px-3 py-2 text-left text-sm text-foreground"
        >
          <div className="whitespace-pre-wrap">{firstMessage?.body ?? "Comment"}</div>
        </button>
        {firstRevision ? (
          <RevisionStatusLine revision={firstRevision} />
        ) : null}
      </div>

      {replies.length > 0 ? (
        <div className="mt-3 px-3 pb-3">
          <div className="space-y-3">
            {replies.map((message) => {
              const isUserReply = message.role === "user"
              const messageRevision = isUserReply
                ? revisionByMessageId.get(message.id) ?? null
                : null
              return (
                <div key={message.id}>
                  {isUserReply ? (
                    <div className="rounded-xl border bg-input-background px-3 py-2 text-sm text-foreground">
                      {message.body}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap px-1 py-1 text-sm leading-6 text-foreground">
                      {message.body}
                    </div>
                  )}
                  {messageRevision ? (
                    <RevisionStatusLine revision={messageRevision} />
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => setReplying(true)}
          >
            Reply
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full p-0 text-muted-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Comment actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {revision?.chatId ? (
                <DropdownMenuItem
                  onSelect={() =>
                    onOpenChat(
                      revision.chatId!,
                      revision.status === "failed" ? null : revision.id,
                      thread.startTime / 1000,
                    )
                  }
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Open in Chat
                </DropdownMenuItem>
              ) : null}
              {revision ? (
                <DropdownMenuItem onSelect={() => onRefreshRevision(revision.id)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh changes
                </DropdownMenuItem>
              ) : null}
              {deletedFilter ? (
                <DropdownMenuItem onSelect={() => onRestore(thread.id)}>
                  Restore
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => onDelete(thread.id)}>
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-1">
          {!deletedFilter ? (
            <IconButton
              label="Delete comment"
              onClick={() => onDelete(thread.id)}
            >
              <X className="h-4 w-4" />
            </IconButton>
          ) : null}
          {revision ? (
            <IconButton
              label={acceptControl?.label ?? "Accept changes"}
              disabled={acceptControl?.disabled ?? true}
              onClick={() => onAcceptRevision(revision.id)}
            >
              {acceptControl?.busy ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </IconButton>
          ) : null}
        </div>
      </div>

      {replying ? (
        <div className="border-t border-border/60 p-3" data-comment-action="true">
          <CommentComposer
            value={reply}
            onChange={setReply}
            onSubmit={submitReply}
            placeholder="Ask for a change..."
          />
        </div>
      ) : null}
    </article>
  )
}

export function RippleCommentsPane({
  projectId,
  compositionId,
  currentTime,
  selection,
  activePreviewRevisionId,
  onPreviewRevision,
  onShowPrimaryPreview,
  onOpenChat,
}: RippleCommentsPaneProps) {
  const [filter, setFilter] = useState<RippleCommentFilter>("active")
  const [draft, setDraft] = useState("")
  const [draftRequestId, setDraftRequestId] = useState(createClientRequestId)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const utils = trpc.useUtils()
  const {
    selector: modelSelector,
    selectedRevisionModel,
    persistSelectionForSubChat,
  } = useCommentRevisionModelSelector()
  const refreshLatestRevisionChat = useCallback(async (
    thread: RippleCommentThreadView,
  ) => {
    const revision = latestRevision(thread)
    persistSelectionForSubChat(revision?.subChatId)
    if (!revision?.chatId) return

    await utils.chats.get.invalidate({ id: revision.chatId })
    await utils.chats.get.prefetch({ id: revision.chatId }, { staleTime: 0 })
  }, [persistSelectionForSubChat, utils.chats.get])
  const threadsQuery = trpc.revisions.listThreads.useQuery(
    { projectId, compositionId, filter },
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
    },
  )
  const createThread = trpc.revisions.createThread.useMutation({
    onSuccess: async (thread) => {
      await refreshLatestRevisionChat(thread)
      setDraft("")
      setDraftRequestId(createClientRequestId())
      await utils.revisions.listThreads.invalidate()
    },
    onError: (error) => toast.error("Comment was not sent", { description: error.message }),
  })
  const addReply = trpc.revisions.addReply.useMutation({
    onSuccess: async (thread) => {
      await refreshLatestRevisionChat(thread)
      await utils.revisions.listThreads.invalidate()
    },
    onError: (error) => toast.error("Reply was not sent", { description: error.message }),
  })
  const deleteThread = trpc.revisions.deleteThread.useMutation({
    onSuccess: async (_, variables) => {
      if (selectedThreadId === variables.threadId) {
        setSelectedThreadId(null)
        onShowPrimaryPreview()
      }
      await utils.revisions.listThreads.invalidate()
    },
    onError: (error) => toast.error("Comment was not deleted", { description: error.message }),
  })
  const restoreThread = trpc.revisions.restoreThread.useMutation({
    onSuccess: async () => utils.revisions.listThreads.invalidate(),
    onError: (error) => toast.error("Comment was not restored", { description: error.message }),
  })
  const refreshProposal = trpc.revisions.refreshProposal.useMutation({
    onSuccess: async () => utils.revisions.listThreads.invalidate(),
    onError: (error) => toast.error("Changes were not refreshed", { description: error.message }),
  })
  const acceptRevision = trpc.revisions.accept.useMutation({
    onSuccess: async () => {
      setSelectedThreadId(null)
      onShowPrimaryPreview()
      await Promise.all([
        utils.revisions.listThreads.invalidate(),
        utils.hyperframes.getPlayerSource.invalidate(),
        utils.hyperframes.getTimelineModel.invalidate(),
        utils.hyperframes.getProjectBrowserModel.invalidate(),
      ])
      toast.success("Changes accepted")
    },
    onError: (error) => toast.error("Changes were not accepted", { description: error.message }),
  })

  const threads = threadsQuery.data ?? []
  const anchor = useMemo(
    () => buildAnchorFromTimelineContext({ currentTime, selection }),
    [currentTime, selection],
  )
  const composerTimecode = formatCommentTimecode(
    Math.round((anchor.startTime ?? 0) * 1000),
    anchor.endTime === null || anchor.endTime === undefined
      ? null
      : Math.round(anchor.endTime * 1000),
  )
  const isMutating =
    createThread.isPending ||
    addReply.isPending ||
    deleteThread.isPending ||
    restoreThread.isPending ||
    refreshProposal.isPending ||
    acceptRevision.isPending

  const handleSend = () => {
    const body = draft.trim()
    if (!body) return
    createThread.mutate({
      projectId,
      compositionId,
      body,
      anchor,
      createRevision: true,
      model: selectedRevisionModel,
      clientRequestId: draftRequestId,
    })
  }

  const handleSelect = (
    thread: RippleCommentThreadView,
    revision: RippleRevisionView | null,
  ) => {
    setSelectedThreadId(thread.id)
    if (revision && revision.status !== "failed") {
      onPreviewRevision(revision.id, thread.startTime / 1000)
    } else {
      onShowPrimaryPreview()
    }
  }

  const clearCommentPreview = useCallback(() => {
    if (!selectedThreadId && !activePreviewRevisionId) return
    setSelectedThreadId(null)
    onShowPrimaryPreview()
  }, [activePreviewRevisionId, onShowPrimaryPreview, selectedThreadId])

  const handlePaneClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.closest("[data-comment-card='true']")) return
      clearCommentPreview()
    },
    [clearCommentPreview],
  )

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-tl-background text-foreground"
      onClickCapture={handlePaneClickCapture}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-foreground hover:bg-foreground/5"
            >
              {commentFilterLabels[filter]}
              <ChevronDown className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {(["active", "resolved", "deleted", "all"] as RippleCommentFilter[]).map((next) => (
              <DropdownMenuItem
                key={next}
                onSelect={() => {
                  setFilter(next)
                  setSelectedThreadId(null)
                  onShowPrimaryPreview()
                }}
              >
                {commentFilterLabels[next]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {selectedThreadId || activePreviewRevisionId ? (
          <div className="flex items-center gap-1">
            <IconButton label="View Main" onClick={clearCommentPreview}>
              <CircleDot className="h-4 w-4" />
            </IconButton>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {threadsQuery.isLoading ? (
          <div className="px-3 py-10 text-center text-sm text-muted-foreground">
            Loading comments...
          </div>
        ) : threads.length === 0 ? (
          <EmptyComments />
        ) : (
          <div className="space-y-3">
            {threads.map((thread, index) => {
              const revision = latestRevision(thread)
              return (
                <CommentCard
                  key={thread.id}
                  thread={thread}
                  index={threads.length - index - 1}
                  selected={selectedThreadId === thread.id}
                  deletedFilter={shouldShowRestoreAction(filter)}
                  activePreviewRevisionId={activePreviewRevisionId}
                  onSelect={handleSelect}
                  onReply={(threadId, body, clientRequestId) =>
                    addReply.mutate({
                      threadId,
                      body,
                      createRevision: true,
                      model: selectedRevisionModel,
                      clientRequestId,
                    })
                  }
                  onDelete={(threadId) => deleteThread.mutate({ threadId })}
                  onRestore={(threadId) => restoreThread.mutate({ threadId })}
                  onRefreshRevision={(revisionId) => refreshProposal.mutate({ revisionId })}
                  onAcceptRevision={(revisionId) => acceptRevision.mutate({ revisionId })}
                  onOpenChat={onOpenChat}
                />
              )
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 bg-background/80 p-3">
        <CommentComposer
          value={draft}
          onChange={setDraft}
          onSubmit={handleSend}
          placeholder="Comment on this frame..."
          timecode={composerTimecode}
          isSubmitting={isMutating}
          modelSelector={modelSelector}
        />
      </div>
    </div>
  )
}
