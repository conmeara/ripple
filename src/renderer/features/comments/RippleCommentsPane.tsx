"use client"

import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react"
import {
  Check,
  ChevronDown,
  CircleDot,
  Eye,
  FileText,
  ImageIcon,
  LoaderCircle,
  MoreHorizontal,
  RefreshCw,
  X,
} from "lucide-react"
import { toast } from "sonner"
import {
  commentAnchorPreviewTimeSeconds,
  normalizeCommentAnchor,
  type RippleCommentAnchorInput,
  type RippleCommentFilter,
  type RippleCommentMessageView,
  type RippleCommentThreadView,
  type RippleRevisionStatus,
  type RippleRevisionView,
} from "../../../shared/ripple-comments"
import { buildVisualPreviewSurfaceKey } from "../../../shared/visual-preview-surface"
import {
  type AgentRuntimeAttachment,
  MAX_AGENT_RUNTIME_ATTACHMENT_BYTES,
  MAX_AGENT_RUNTIME_ATTACHMENT_TOTAL_BYTES,
  MAX_AGENT_RUNTIME_ATTACHMENTS,
  getAgentRuntimeAttachmentSize,
  validateAgentRuntimeAttachments,
} from "../../../shared/agent-runtime-attachments"
import type { RippleTimelineRangeSelection } from "../../../shared/hyperframes-timeline-model"
import { Button } from "../../components/ui/button"
import { AttachIcon } from "../../components/ui/icons"
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
import { clearRipplePreviewCoordinator } from "../hyperframes/preview-coordinator"
import { refreshHyperframesSourceQueries } from "../hyperframes/source-refresh-queries"
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
  filterCodexModelsForAuthMode,
  type CodexThinkingLevel,
} from "../agents/lib/models"
import {
  canPreviewRevisionChanges,
  canRefreshRevisionChanges,
  canReplyToCommentThread,
  commentFilterLabels,
  hasPendingCommentStartup,
  isDeletedCommentThread,
  isRevisionResolvingAgainstLatest,
  shouldPollCommentThread,
  shouldShowRestoreAction,
} from "./comment-filters"
import {
  formatRevisionStatusLine,
  formatCommentTimecode,
  isWorkingRevisionStatus,
  revisionStatusLabel as getRevisionStatusLabel,
} from "./comment-formatting"
import { RippleCommentIcon } from "./RippleCommentIcon"
import { buildAnchorFromTimelineContext } from "./timeline-comment-prompt"

interface RippleCommentsPaneProps {
  projectId: string
  compositionId?: string | null
  currentTime: number
  selection: RippleTimelineRangeSelection | null
  selectedThreadId?: string | null
  onSelectedThreadIdChange?: (threadId: string | null) => void
  agentTextResetKey?: string | number | null
  activePreviewRevisionId?: string | null
  onPreviewRevision: (revisionId: string, time: number) => void
  onShowPrimaryPreview: (time?: number | null) => void
  onOpenChat: (
    conversationId: string,
    revisionId?: string | null,
    time?: number,
  ) => void
}

interface PreparedCommentVisual {
  key: string
  screenshotPath: string
  kind: "frame" | "range_sheet"
}

function createClientRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      resolve(result.split(",")[1] || "")
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function validateCommentAttachmentFiles(
  files: File[],
  existingAttachments: AgentRuntimeAttachment[] = [],
): void {
  if (existingAttachments.length + files.length > MAX_AGENT_RUNTIME_ATTACHMENTS) {
    throw new Error(`Attach up to ${MAX_AGENT_RUNTIME_ATTACHMENTS} files.`)
  }

  for (const file of files) {
    if (file.size > MAX_AGENT_RUNTIME_ATTACHMENT_BYTES) {
      throw new Error(`${file.name || "Attachment"} is larger than 10 MB.`)
    }
  }

  const existingBytes = existingAttachments.reduce(
    (total, attachment) => total + getAgentRuntimeAttachmentSize(attachment),
    0,
  )
  const nextBytes = files.reduce((total, file) => total + file.size, 0)
  if (existingBytes + nextBytes > MAX_AGENT_RUNTIME_ATTACHMENT_TOTAL_BYTES) {
    throw new Error("Attachments are larger than 20 MB total.")
  }
}

async function filesToCommentAttachments(
  files: File[],
  existingAttachments: AgentRuntimeAttachment[] = [],
): Promise<AgentRuntimeAttachment[]> {
  validateCommentAttachmentFiles(files, existingAttachments)
  const attachments = await Promise.all(files.map(async (file) => {
    const base64Data = await fileToBase64(file)
    if (file.type.startsWith("image/")) {
      return {
        type: "image" as const,
        base64Data,
        mediaType: file.type || "image/png",
        filename: file.name || "image.png",
        size: file.size,
      }
    }
    return {
      type: "file" as const,
      base64Data,
      mediaType: file.type || undefined,
      filename: file.name || "file",
      size: file.size,
    }
  }))
  const nextAttachments = attachments.filter((attachment) => attachment.base64Data)
  const validationMessage = validateAgentRuntimeAttachments([
    ...existingAttachments,
    ...nextAttachments,
  ])
  if (validationMessage) throw new Error(validationMessage)
  return nextAttachments
}

function commentAttachmentFallbackBody(
  attachments: AgentRuntimeAttachment[],
): string {
  if (attachments.length === 0) return ""
  if (attachments.length === 1) {
    const attachment = attachments[0]
    return attachment.type === "image"
      ? `Attached image: ${attachment.filename ?? "image"}`
      : `Attached file: ${attachment.filename}`
  }
  return `Attached ${attachments.length} files`
}

function serializeOptimisticCommentMessageMetadata(
  attachments: AgentRuntimeAttachment[],
): string | null {
  if (attachments.length === 0) return null
  return JSON.stringify({
    attachments: attachments.map((attachment) => ({
      type: attachment.type,
      filename: attachment.filename ?? (attachment.type === "image" ? "image" : "file"),
      mediaType: attachment.mediaType ?? null,
      size: attachment.size ?? null,
    })),
  })
}

function parseCommentMessageAttachments(
  message: RippleCommentMessageView,
): Array<{ type: "image" | "file"; filename: string }> {
  if (!message.metadataJson) return []
  try {
    const parsed = JSON.parse(message.metadataJson)
    if (!Array.isArray(parsed?.attachments)) return []
    return parsed.attachments
      .map((attachment: any) => {
        const type = attachment?.type === "image" ? "image" as const : "file" as const
        const fallbackFilename = type === "image" ? "image" : "file"
        return {
          type,
          filename:
            typeof attachment?.filename === "string" && attachment.filename.trim()
              ? attachment.filename
              : fallbackFilename,
        }
      })
  } catch {
    return []
  }
}

function buildOptimisticCommentThread(input: {
  projectId: string
  compositionId?: string | null
  body: string
  anchor: RippleCommentAnchorInput
  attachments?: AgentRuntimeAttachment[]
  clientRequestId?: string | null
}): RippleCommentThreadView {
  const anchor = normalizeCommentAnchor(input.anchor)
  const now = new Date()
  const optimisticId = `optimistic-${input.clientRequestId ?? now.getTime()}`

  return {
    id: optimisticId,
    projectId: input.projectId,
    compositionId: input.compositionId ?? null,
    conversationId: null,
    anchorType: anchor.anchorType,
    startTime: anchor.startTimeMs,
    endTime: anchor.endTimeMs,
    startFrame: anchor.startFrame,
    endFrame: anchor.endFrame,
    elementSelector: anchor.elementSelector,
    clipKey: anchor.clipKey,
    sourceFile: anchor.sourceFile,
    screenshotPath: anchor.screenshotPath,
    clientRequestId: input.clientRequestId ?? null,
    status: "open",
    latestRevisionId: null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    deletedAt: null,
    messages: [{
      id: `${optimisticId}-message`,
      threadId: optimisticId,
      revisionId: null,
      role: "user",
      body: input.body,
      metadataJson: serializeOptimisticCommentMessageMetadata(input.attachments ?? []),
      clientRequestId: input.clientRequestId ?? null,
      createdAt: now,
    }],
    revisions: [],
  }
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
  const { data: claudeRuntimeStatus } =
    trpc.agentRuntime.authStatus.useQuery(
      { provider: "claude" },
      { staleTime: 30 * 1000 },
    )
  const { data: codexRuntimeStatus } =
    trpc.agentRuntime.authStatus.useQuery(
      { provider: "codex" },
      { staleTime: 30 * 1000 },
    )
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
    const models = filterCodexModelsForAuthMode(
      CODEX_MODELS,
      hasAppCodexApiKey ? "api" : "chatgpt",
    )
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
    Boolean(claudeRuntimeStatus?.connected) ||
    Boolean(claudeCodeIntegration?.isConnected) ||
    anthropicOnboardingCompleted ||
    apiKeyOnboardingCompleted ||
    hasCustomClaudeConfig
  const isCodexConnected =
    Boolean(codexRuntimeStatus?.connected) ||
    codexOnboardingCompleted ||
    hasAppCodexApiKey
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
        isConnected: isCodexConnected,
      }}
    />
  )

  return {
    selector,
    selectedRevisionProvider: selectedAgentId === "codex" ? "codex" as const : "claude" as const,
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
            aria-disabled="true"
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
  attachments = [],
  onAttachmentsChange,
  placeholder,
  timecode,
  isSubmitting,
  modelSelector,
  focusSignal,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  attachments?: AgentRuntimeAttachment[]
  onAttachmentsChange?: (attachments: AgentRuntimeAttachment[]) => void
  placeholder: string
  timecode?: string
  isSubmitting?: boolean
  modelSelector?: ReactNode
  focusSignal?: number | null
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [isFocused, setIsFocused] = useState(false)
  const hasContent = value.trim().length > 0 || attachments.length > 0

  useEffect(() => {
    if (!focusSignal) return
    textareaRef.current?.focus()
  }, [focusSignal])

  const addFiles = async (files: File[]) => {
    if (files.length === 0 || !onAttachmentsChange) return
    try {
      const nextAttachments = await filesToCommentAttachments(files, attachments)
      onAttachmentsChange([...attachments, ...nextAttachments])
    } catch (error) {
      toast.error("Attachment was not added", {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const handlePaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files)
    if (files.length === 0) return
    event.preventDefault()
    void addFiles(files)
  }

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const files = Array.from(event.dataTransfer.files)
    if (files.length === 0) return
    event.preventDefault()
    void addFiles(files)
  }

  return (
    <div
      className="relative w-full"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <div
        className="relative w-full cursor-text"
        onClick={() => textareaRef.current?.focus()}
      >
        <PromptInput
          value={value}
          onValueChange={onChange}
          onSubmit={onSubmit}
          maxHeight={160}
          className={cn(
            "border bg-input-background relative z-10 p-2 rounded-xl transition-[border-color,box-shadow] duration-150 min-w-0 max-w-full",
            isFocused && "ring-2 ring-primary/50",
          )}
        >
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 items-start gap-2">
              {timecode ? (
                <span className="mt-1 shrink-0 rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
                  {timecode}
                </span>
              ) : null}
              <PromptInputTextarea
                ref={textareaRef}
                placeholder={placeholder}
                className="min-h-[40px] min-w-0 flex-1 px-0 py-1 text-sm placeholder:text-muted-foreground/70"
                onPaste={handlePaste}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                data-testid="ripple-comment-composer-input"
              />
            </div>
            {attachments.length > 0 ? (
              <div className="flex min-w-0 flex-wrap gap-1">
                {attachments.map((attachment, index) => (
                  <span
                    key={`${attachment.type}-${attachment.filename ?? "attachment"}-${index}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-background/80 px-2 py-1 text-xs text-muted-foreground"
                  >
                    {attachment.type === "image" ? (
                      <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">
                      {attachment.filename ?? (attachment.type === "image" ? "image" : "file")}
                    </span>
                    <button
                      type="button"
                      className="ml-1 rounded-sm text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        onAttachmentsChange?.(
                          attachments.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <X className="h-3 w-3" />
                      <span className="sr-only">Remove attachment</span>
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <PromptInputActions className="min-w-0 w-full">
              <div className="flex min-w-0 flex-1 items-center gap-1">
                {modelSelector}
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {onAttachmentsChange ? (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        const files = Array.from(event.target.files ?? [])
                        event.target.value = ""
                        void addFiles(files)
                      }}
                    />
                    <IconButton
                      label="Attach file"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSubmitting}
                    >
                      <AttachIcon className="h-4 w-4" />
                    </IconButton>
                  </>
                ) : null}
                <AgentSendButton
                  disabled={!hasContent || isSubmitting}
                  isSubmitting={isSubmitting}
                  hasContent={hasContent}
                  onClick={onSubmit}
                  ariaLabel="Send comment"
                />
              </div>
            </PromptInputActions>
          </div>
        </PromptInput>
      </div>
    </div>
  )
}

function CommentMessageAttachments({
  message,
}: {
  message?: RippleCommentMessageView | null
}) {
  const attachments = message ? parseCommentMessageAttachments(message) : []
  if (attachments.length === 0) return null

  return (
    <div className="mt-2 flex min-w-0 flex-wrap gap-1">
      {attachments.map((attachment, index) => (
        <span
          key={`${attachment.filename}-${index}`}
          className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-background/70 px-2 py-1 text-xs text-muted-foreground"
        >
          {attachment.type === "image" ? (
            <ImageIcon className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{attachment.filename}</span>
        </span>
      ))}
    </div>
  )
}

function CommentAgentText({
  children,
  className,
  resetKey,
}: {
  children: ReactNode
  className?: string
  resetKey?: string | number | null
}) {
  const textRef = useRef<HTMLDivElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)

  useLayoutEffect(() => {
    setExpanded(false)
  }, [resetKey])

  useLayoutEffect(() => {
    const text = textRef.current
    if (!text || expanded) return
    if (text.getClientRects().length === 0) return
    setCanExpand(text.scrollHeight > text.clientHeight + 1)
  }, [children, expanded, resetKey])

  return (
    <div className="min-w-0">
      <div
        ref={textRef}
        className={cn(
          "whitespace-pre-wrap break-words text-muted-foreground",
          !expanded && "line-clamp-4",
          className,
        )}
      >
        {children}
      </div>
      {!expanded && canExpand ? (
        <button
          type="button"
          data-comment-action="true"
          className="mt-1 text-left text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/60"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setExpanded(true)
          }}
        >
          Read more
        </button>
      ) : null}
    </div>
  )
}

function RevisionStatusLine({
  revision,
  agentTextResetKey,
}: {
  revision: RippleRevisionView
  agentTextResetKey?: string | number | null
}) {
  const isWorking = isWorkingRevisionStatus(revision.status)
  const line = formatRevisionStatusLine(revision)

  return (
    <div
      className={cn(
        "mt-3 min-w-0 px-1 text-xs font-medium",
        revision.status === "failed" && "text-destructive",
      )}
      title={line}
    >
      {isWorking ? (
        <TextShimmer
          as="span"
          duration={1.2}
          className="inline-flex h-4 max-w-full items-center truncate text-xs leading-none"
        >
          {line}
        </TextShimmer>
      ) : (
        <CommentAgentText
          resetKey={agentTextResetKey}
          className={cn(
            "text-xs font-medium leading-5",
            revision.status === "failed" && "text-destructive",
          )}
        >
          {line}
        </CommentAgentText>
      )}
    </div>
  )
}

function PendingCommentStartupLine() {
  const line = "Preparing visual context"

  return (
    <div
      className="mt-3 min-w-0 px-1 text-xs font-medium"
      title={line}
    >
      <TextShimmer
        as="span"
        duration={1.2}
        className="inline-flex h-4 max-w-full items-center truncate text-xs leading-none"
      >
        {line}
      </TextShimmer>
    </div>
  )
}

function revisionStatusLabel(status: RippleRevisionStatus): string {
  return getRevisionStatusLabel(status)
}

function commentStatusVisual(
  thread: RippleCommentThreadView,
  revision: RippleRevisionView | null,
  options: { pendingStartup?: boolean } = {},
): { label: string; className: string } {
  if (options.pendingStartup) {
    return { label: "Working", className: "bg-blue-500" }
  }

  if (
    revision?.status === "queued" ||
    revision?.status === "preparing" ||
    revision?.status === "running" ||
    revision?.status === "updating"
  ) {
    return { label: "Working", className: "bg-blue-500" }
  }

  if (revision?.status === "failed" || revision?.status === "needs_update") {
    return { label: "Needs attention", className: "bg-amber-500" }
  }

  if (
    thread.status === "resolved" ||
    revision?.status === "proposed" ||
    revision?.status === "answered" ||
    revision?.status === "accepted"
  ) {
    return { label: "Done", className: "bg-emerald-500" }
  }

  return { label: "Open", className: "bg-muted-foreground/20" }
}

function latestRevision(thread: RippleCommentThreadView): RippleRevisionView | null {
  if (thread.latestRevisionId) {
    return thread.revisions.find((revision) => revision.id === thread.latestRevisionId) ?? null
  }
  return thread.revisions[thread.revisions.length - 1] ?? null
}

function revisionAcceptControl(revision: RippleRevisionView, options: {
  deleted?: boolean
} = {}): {
  label: string
  disabled: boolean
  busy: boolean
} {
  if (options.deleted) {
    return { label: "Restore comment to continue", disabled: true, busy: false }
  }

  switch (revision.status) {
    case "proposed":
      return { label: "Accept changes", disabled: false, busy: false }
    case "answered":
      return { label: "No changes needed", disabled: true, busy: false }
    case "needs_update":
      return { label: "Refresh needed", disabled: true, busy: false }
    case "updating":
      return {
        label: "Updating",
        disabled: true,
        busy: true,
      }
    case "queued":
    case "preparing":
    case "running":
      if (isRevisionResolvingAgainstLatest(revision)) {
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
      return { label: "Changes rejected", disabled: true, busy: false }
    case "superseded":
      return { label: "Changes updated", disabled: true, busy: false }
    case "failed":
      return { label: "Refresh needed", disabled: true, busy: false }
  }
}

function CommentCard({
  thread,
  index,
  selected,
  deletedFilter,
  activePreviewRevisionId,
  agentTextResetKey,
  onSelect,
  onReply,
  onDelete,
  onRestore,
  onRefreshRevision,
  onAcceptRevision,
  reviewActionPending,
  onOpenChat,
}: {
  thread: RippleCommentThreadView
  index: number
  selected: boolean
  deletedFilter: boolean
  activePreviewRevisionId?: string | null
  agentTextResetKey?: string | number | null
  onSelect: (thread: RippleCommentThreadView, revision: RippleRevisionView | null) => void
  onReply: (
    threadId: string,
    body: string,
    clientRequestId: string,
    attachments: AgentRuntimeAttachment[],
  ) => void
  onDelete: (threadId: string) => void
  onRestore: (threadId: string) => void
  onRefreshRevision: (
    revision: RippleRevisionView,
    thread: RippleCommentThreadView,
  ) => void
  onAcceptRevision: (revisionId: string) => void
  reviewActionPending?: boolean
  onOpenChat: (
    conversationId: string,
    revisionId?: string | null,
    time?: number,
  ) => void
}) {
  const [replying, setReplying] = useState(false)
  const [reply, setReply] = useState("")
  const [replyAttachments, setReplyAttachments] = useState<AgentRuntimeAttachment[]>([])
  const revision = latestRevision(thread)
  const isAcceptedThread = thread.status === "resolved" || revision?.status === "accepted"
  const firstMessage = thread.messages.find((message) => message.role === "user")
  const replies = thread.messages.filter((message) => message.id !== firstMessage?.id)
  const isDeleted = deletedFilter || isDeletedCommentThread(thread)
  const isRevisionPreview = revision?.id === activePreviewRevisionId
  const canPreviewLatestRevision = canPreviewRevisionChanges(revision, {
    deleted: isDeleted,
  })
  const canRefreshLatestRevision = canRefreshRevisionChanges(revision, {
    deleted: isDeleted,
  })
  const shouldShowBottomRightRefresh =
    revision?.status === "failed" || revision?.status === "needs_update"
  const canReply = canReplyToCommentThread(thread) && !isAcceptedThread
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
  const pendingStartup = hasPendingCommentStartup(thread)
  const statusVisual = commentStatusVisual(thread, revision, { pendingStartup })
  const acceptControl = revision
    ? revisionAcceptControl(revision, { deleted: isDeleted })
    : null

  const submitReply = () => {
    const body = reply.trim() || commentAttachmentFallbackBody(replyAttachments)
    if (!body) return
    onReply(thread.id, body, createClientRequestId(), replyAttachments)
    setReply("")
    setReplyAttachments([])
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
    onSelect(thread, canPreviewLatestRevision ? revision : null)
  }

  return (
    <article
      data-comment-card="true"
      data-selected-comment-card={selected ? "true" : undefined}
      onClick={handleCardClick}
      className={cn(
        "min-w-0 max-w-full overflow-hidden rounded-xl border bg-background/45 transition-colors",
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
          {!isAcceptedThread ? (
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", statusVisual.className)}
              title={statusVisual.label}
            />
          ) : null}
          <span className="sr-only">{isAcceptedThread ? "Accepted" : statusVisual.label}</span>
          {isAcceptedThread ? (
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">
              Accepted
            </span>
          ) : null}
          <div className="ml-auto">
            <IconButton
              label={isRevisionPreview ? "Viewing changes" : "View changes"}
              active={isRevisionPreview && canPreviewLatestRevision}
              disabled={!canPreviewLatestRevision}
              onClick={() => onSelect(thread, revision)}
            >
              <Eye className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSelect(thread, canPreviewLatestRevision ? revision : null)}
          className="mt-3 block w-full min-w-0 max-w-full rounded-xl border bg-input-background px-3 py-2 text-left text-sm text-foreground"
        >
          <div className="whitespace-pre-wrap break-words">
            {firstMessage?.body ?? "Comment"}
          </div>
          <CommentMessageAttachments message={firstMessage} />
        </button>
        {firstRevision ? (
          <RevisionStatusLine
            revision={firstRevision}
            agentTextResetKey={agentTextResetKey}
          />
        ) : pendingStartup ? (
          <PendingCommentStartupLine />
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
                    <div className="whitespace-pre-wrap break-words rounded-xl border bg-input-background px-3 py-2 text-sm text-foreground">
                      {message.body}
                      <CommentMessageAttachments message={message} />
                    </div>
                  ) : (
                    <CommentAgentText
                      resetKey={agentTextResetKey}
                      className="px-1 py-1 text-sm leading-6 text-foreground"
                    >
                      {message.body}
                      <CommentMessageAttachments message={message} />
                    </CommentAgentText>
                  )}
                  {messageRevision ? (
                    <RevisionStatusLine
                      revision={messageRevision}
                      agentTextResetKey={agentTextResetKey}
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-3">
        <div className="flex min-w-0 items-center gap-1">
          {canReply ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => setReplying(true)}
            >
              Reply
            </Button>
          ) : null}
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
              {revision?.conversationId && !isDeleted ? (
                <DropdownMenuItem
                  onSelect={() =>
                    onOpenChat(
                      revision.conversationId!,
                      revision && canPreviewRevisionChanges(revision) ? revision.id : null,
                      commentAnchorPreviewTimeSeconds(thread),
                    )
                  }
                >
                  <RippleCommentIcon className="mr-2 h-4 w-4" />
                  Open in Chat
                </DropdownMenuItem>
              ) : null}
              {revision && canRefreshLatestRevision ? (
                <DropdownMenuItem onSelect={() => onRefreshRevision(revision, thread)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh changes
                </DropdownMenuItem>
              ) : null}
              {deletedFilter ? (
                <DropdownMenuItem onSelect={() => onRestore(thread.id)}>
                  Restore
                </DropdownMenuItem>
              ) : null}
              {!isAcceptedThread ? (
                <DropdownMenuItem onSelect={() => onDelete(thread.id)}>
                  Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isDeleted ? (
            <IconButton
              label="Restore comment"
              onClick={() => onRestore(thread.id)}
            >
              <RefreshCw className="h-4 w-4" />
            </IconButton>
          ) : !isAcceptedThread ? (
            <IconButton
              label="Delete comment"
              onClick={() => onDelete(thread.id)}
            >
              <X className="h-4 w-4" />
            </IconButton>
          ) : null}
          {revision && !isDeleted && !isAcceptedThread ? (
            shouldShowBottomRightRefresh ? (
              <IconButton
                label="Refresh changes"
                disabled={reviewActionPending}
                onClick={() => onRefreshRevision(revision, thread)}
              >
                <RefreshCw className="h-4 w-4" />
              </IconButton>
            ) : (
              <IconButton
                label={acceptControl?.label ?? "Accept changes"}
                disabled={(acceptControl?.disabled ?? true) || reviewActionPending}
                onClick={() => onAcceptRevision(revision.id)}
              >
                {acceptControl?.busy ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </IconButton>
            )
          ) : null}
        </div>
      </div>

      {replying ? (
        <div
          className="min-w-0 border-t border-border/60 p-3"
          data-comment-action="true"
        >
          <CommentComposer
            value={reply}
            onChange={setReply}
            onSubmit={submitReply}
            attachments={replyAttachments}
            onAttachmentsChange={setReplyAttachments}
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
  selectedThreadId: controlledSelectedThreadId,
  onSelectedThreadIdChange,
  agentTextResetKey,
  activePreviewRevisionId,
  onPreviewRevision,
  onShowPrimaryPreview,
  onOpenChat,
}: RippleCommentsPaneProps) {
  const [filter, setFilter] = useState<RippleCommentFilter>("active")
  const [draft, setDraft] = useState("")
  const [draftAttachments, setDraftAttachments] = useState<AgentRuntimeAttachment[]>([])
  const [draftRequestId, setDraftRequestId] = useState(createClientRequestId)
  const [preparedCommentVisual, setPreparedCommentVisual] =
    useState<PreparedCommentVisual | null>(null)
  const preparedCommentVisualRequestIdRef = useRef(0)
  const preparedCommentVisualKeyRef = useRef<string | null>(null)
  const [composerFocusSignal, setComposerFocusSignal] = useState(0)
  const [localSelectedThreadId, setLocalSelectedThreadId] = useState<string | null>(null)
  const selectedThreadId =
    controlledSelectedThreadId === undefined
      ? localSelectedThreadId
      : controlledSelectedThreadId
  const setSelectedThreadId = useCallback((threadId: string | null) => {
    setLocalSelectedThreadId(threadId)
    onSelectedThreadIdChange?.(threadId)
  }, [onSelectedThreadIdChange])
  const commentsListRef = useRef<HTMLDivElement | null>(null)
  const utils = trpc.useUtils()
  const refreshPreviewSurfaces = useCallback(() =>
    refreshHyperframesSourceQueries({
      utils,
      projectId,
      clearPreviewCache: clearRipplePreviewCoordinator,
    }), [projectId, utils])
  const {
    selector: modelSelector,
    selectedRevisionProvider,
    selectedRevisionModel,
    persistSelectionForSubChat,
  } = useCommentRevisionModelSelector()
  const refreshLatestRevisionChat = useCallback(async (
    thread: RippleCommentThreadView,
  ) => {
    const revision = latestRevision(thread)
    persistSelectionForSubChat(revision?.conversationId)
    if (!revision?.conversationId) return

    await utils.chats.get.invalidate({ id: revision.conversationId })
    await utils.chats.get.prefetch({ id: revision.conversationId }, { staleTime: 0 })
  }, [persistSelectionForSubChat, utils.chats.get])
  const threadsQueryInput = useMemo(
    () => ({ projectId, compositionId, filter }),
    [compositionId, filter, projectId],
  )
  const threadsQuery = trpc.revisions.listThreads.useQuery(
    threadsQueryInput,
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
      refetchInterval: (query) => {
        const threads = Array.isArray(query.state.data)
          ? query.state.data as RippleCommentThreadView[]
          : []
        return threads.some(shouldPollCommentThread) ? 1_000 : false
      },
    },
  )
  const prepareCommentVisual = trpc.revisions.prepareCommentVisual.useMutation()
  const createThread = trpc.revisions.createThread.useMutation({
    onMutate: async (variables) => {
      const previousThreads = utils.revisions.listThreads.getData(threadsQueryInput) ?? []
      const optimisticThread = buildOptimisticCommentThread(variables)

      await utils.revisions.listThreads.cancel(threadsQueryInput)
      preparedCommentVisualRequestIdRef.current += 1
      preparedCommentVisualKeyRef.current = null
      setPreparedCommentVisual(null)
      setDraft("")
      setDraftAttachments([])
      setDraftRequestId(createClientRequestId())
      setComposerFocusSignal((value) => value + 1)
      if (filter === "active" || filter === "all") {
        utils.revisions.listThreads.setData(threadsQueryInput, (threads = []) => [
          optimisticThread,
          ...threads.filter((thread) =>
            thread.clientRequestId !== optimisticThread.clientRequestId &&
            thread.id !== optimisticThread.id
          ),
        ])
      }

      return {
        optimisticThreadId: optimisticThread.id,
        previousThreads,
      }
    },
    onSuccess: async (thread, _variables, context) => {
      await refreshLatestRevisionChat(thread)
      utils.revisions.listThreads.setData(threadsQueryInput, (threads = []) => {
        const nextThreads = threads.map((item) =>
          item.id === context?.optimisticThreadId ||
          item.clientRequestId === thread.clientRequestId
            ? thread
            : item
        )
        return nextThreads.some((item) => item.id === thread.id)
          ? nextThreads
          : [thread, ...nextThreads]
      })
      await utils.revisions.listThreads.invalidate()
    },
    onError: (error, variables, context) => {
      utils.revisions.listThreads.setData(
        threadsQueryInput,
        context?.previousThreads ?? [],
      )
      setDraft(variables.body)
      setDraftAttachments(variables.attachments ?? [])
      setDraftRequestId(variables.clientRequestId ?? createClientRequestId())
      toast.error("Comment was not sent", { description: error.message })
    },
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
      toast.success("Comment deleted")
    },
    onError: (error) => toast.error("Comment was not deleted", { description: error.message }),
  })
  const restoreThread = trpc.revisions.restoreThread.useMutation({
    onSuccess: async (_, variables) => {
      if (selectedThreadId === variables.threadId) {
        setSelectedThreadId(null)
        onShowPrimaryPreview()
      }
      await utils.revisions.listThreads.invalidate()
    },
    onError: (error) => toast.error("Comment was not restored", { description: error.message }),
  })
  const refreshProposal = trpc.revisions.refreshProposal.useMutation({
    onSuccess: async () => {
      await refreshPreviewSurfaces()
    },
    onError: (error) => toast.error("Changes were not refreshed", { description: error.message }),
  })
  const updateStaleProposal = trpc.revisions.updateStaleProposal.useMutation({
    onSuccess: async () => {
      await utils.revisions.listThreads.invalidate()
    },
    onError: (error) => toast.error("Changes were not refreshed", { description: error.message }),
  })
  const restartFailedRevision = trpc.revisions.createFromThread.useMutation({
    onSuccess: async () => {
      await utils.revisions.listThreads.invalidate()
      toast.success("Agent run restarted")
    },
    onError: (error) => toast.error("Agent run was not restarted", { description: error.message }),
  })
  const acceptRevision = trpc.revisions.accept.useMutation({
    onSuccess: async () => {
      setSelectedThreadId(null)
      onShowPrimaryPreview()
      await refreshPreviewSurfaces()
      toast.success("Changes accepted")
    },
    onError: (error) => toast.error("Changes were not accepted", { description: error.message }),
  })
  const threads = threadsQuery.data ?? []
  const anchor = useMemo(
    () => buildAnchorFromTimelineContext({ currentTime, selection }),
    [currentTime, selection],
  )
  const visualPreviewSurfaceKey = useMemo(() =>
    buildVisualPreviewSurfaceKey({
      projectId,
      compositionId,
      revisionId: activePreviewRevisionId ?? null,
    }), [activePreviewRevisionId, compositionId, projectId])
  const commentVisualPreparation = useMemo(() => {
    const startTime = typeof anchor.startTime === "number" ? anchor.startTime : null
    const endTime = typeof anchor.endTime === "number" ? anchor.endTime : null
    const hasDraftContent = Boolean(draft.trim()) || draftAttachments.length > 0
    const isRangeAnchor = anchor.anchorType === "range" &&
      startTime !== null &&
      endTime !== null &&
      Math.abs(endTime - startTime) > 0.001
    if (startTime === null) {
      return null
    }

    const start = isRangeAnchor ? Math.min(startTime, endTime!) : startTime
    const end = isRangeAnchor ? Math.max(startTime, endTime!) : null
    return {
      key: [
        projectId,
        compositionId ?? "",
        activePreviewRevisionId ?? "",
        anchor.anchorType,
        start.toFixed(3),
        end === null ? "" : end.toFixed(3),
        anchor.startFrame ?? "",
        anchor.endFrame ?? "",
        anchor.sourceFile ?? "",
        anchor.clipKey ?? "",
        anchor.elementSelector ?? "",
      ].join("\u0000"),
      anchor,
      hasDraftContent,
    }
  }, [
    activePreviewRevisionId,
    anchor.anchorType,
    anchor.clipKey,
    anchor.elementSelector,
    anchor.endFrame,
    anchor.endTime,
    anchor.sourceFile,
    anchor.startFrame,
    anchor.startTime,
    compositionId,
    draft,
    draftAttachments.length,
    projectId,
  ])
  const prepareCommentVisualMutateAsync = prepareCommentVisual.mutateAsync

  useEffect(() => {
    if (!commentVisualPreparation) {
      preparedCommentVisualRequestIdRef.current += 1
      preparedCommentVisualKeyRef.current = null
      setPreparedCommentVisual(null)
      return
    }

    if (preparedCommentVisualKeyRef.current !== commentVisualPreparation.key) {
      preparedCommentVisualRequestIdRef.current += 1
      preparedCommentVisualKeyRef.current = commentVisualPreparation.key
      setPreparedCommentVisual(null)
    }
    const requestId = preparedCommentVisualRequestIdRef.current
    const timeoutId = window.setTimeout(() => {
      void prepareCommentVisualMutateAsync({
        projectId,
        compositionId,
        anchor: commentVisualPreparation.anchor,
        sourceRevisionId: activePreviewRevisionId,
        visualPreviewSurfaceKey,
      })
        .then((visual) => {
          if (preparedCommentVisualRequestIdRef.current !== requestId) return
          if (preparedCommentVisualKeyRef.current !== commentVisualPreparation.key) return
          if (!visual?.screenshotPath) {
            setPreparedCommentVisual(null)
            return
          }
          setPreparedCommentVisual({
            key: commentVisualPreparation.key,
            screenshotPath: visual.screenshotPath,
            kind: visual.kind,
          })
        })
        .catch(() => {
          if (preparedCommentVisualRequestIdRef.current === requestId) {
            setPreparedCommentVisual(null)
          }
        })
    }, commentVisualPreparation.anchor.anchorType === "range"
      ? 450
      : commentVisualPreparation.hasDraftContent
        ? 250
        : 750)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    activePreviewRevisionId,
    commentVisualPreparation,
    compositionId,
    prepareCommentVisualMutateAsync,
    projectId,
    visualPreviewSurfaceKey,
  ])
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
    updateStaleProposal.isPending ||
    restartFailedRevision.isPending ||
    acceptRevision.isPending

  const handleSend = () => {
    const body = draft.trim() || commentAttachmentFallbackBody(draftAttachments)
    if (!body) return
    const anchorWithPreparedVisual =
      preparedCommentVisual &&
      commentVisualPreparation &&
      preparedCommentVisual.key === commentVisualPreparation.key
        ? {
            ...anchor,
            screenshotPath: preparedCommentVisual.screenshotPath,
          }
        : anchor
    createThread.mutate({
      projectId,
      compositionId,
      body,
      anchor: anchorWithPreparedVisual,
      attachments: draftAttachments,
      createRevision: true,
      agentProvider: selectedRevisionProvider,
      model: selectedRevisionModel,
      clientRequestId: draftRequestId,
      sourceRevisionId: activePreviewRevisionId,
      visualPreviewSurfaceKey,
      captureVisualContext: true,
    })
  }

  const handleSelect = (
    thread: RippleCommentThreadView,
    revision: RippleRevisionView | null,
  ) => {
    const previewTime = commentAnchorPreviewTimeSeconds(thread)
    setSelectedThreadId(thread.id)
    if (isDeletedCommentThread(thread)) {
      onShowPrimaryPreview(previewTime)
      return
    }
    if (revision && canPreviewRevisionChanges(revision)) {
      onPreviewRevision(revision.id, previewTime)
    } else {
      onShowPrimaryPreview(previewTime)
    }
  }

  useEffect(() => {
    if (!selectedThreadId || threadsQuery.isLoading) return
    const selectedThread = threads.find((thread) => thread.id === selectedThreadId)
    if (selectedThread) {
      const revision = latestRevision(selectedThread)
      if (
        activePreviewRevisionId &&
        revision?.id === activePreviewRevisionId &&
        !canPreviewRevisionChanges(revision, {
          deleted: isDeletedCommentThread(selectedThread),
        })
      ) {
        onShowPrimaryPreview()
      }
      return
    }

    if (filter !== "all") {
      setFilter("all")
      return
    }

    setSelectedThreadId(null)
    onShowPrimaryPreview()
  }, [
    activePreviewRevisionId,
    filter,
    onShowPrimaryPreview,
    selectedThreadId,
    setSelectedThreadId,
    threads,
    threadsQuery.isLoading,
  ])

  useEffect(() => {
    if (!selectedThreadId) return
    const frame = window.requestAnimationFrame(() => {
      commentsListRef.current
        ?.querySelector("[data-selected-comment-card='true']")
        ?.scrollIntoView({ block: "nearest" })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selectedThreadId, threads])

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
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-tl-background text-foreground"
      onClickCapture={handlePaneClickCapture}
      data-testid="ripple-comments-pane"
    >
      <div className="flex h-12 min-w-0 shrink-0 items-center justify-between px-4">
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

      <div
        ref={commentsListRef}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4"
      >
        {threadsQuery.isLoading ? (
          <div className="px-3 py-10 text-center text-sm text-muted-foreground">
            Loading comments...
          </div>
        ) : threads.length === 0 ? (
          null
        ) : (
          <div className="min-w-0 space-y-3">
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
                  agentTextResetKey={agentTextResetKey}
                  onSelect={handleSelect}
                  onReply={(threadId, body, clientRequestId, attachments) =>
                    addReply.mutate({
                      threadId,
                      body,
                      attachments,
                      createRevision: true,
                      agentProvider: selectedRevisionProvider,
                      model: selectedRevisionModel,
                      clientRequestId,
                    })
                  }
                  onDelete={(threadId) => deleteThread.mutate({ threadId })}
                  onRestore={(threadId) => restoreThread.mutate({ threadId })}
                  onRefreshRevision={(targetRevision, thread) => {
                    const revisionId = targetRevision.id
                    if (targetRevision.status === "needs_update") {
                      updateStaleProposal.mutate({ revisionId })
                    } else if (targetRevision.status === "failed") {
                      const promptMessage =
                        thread.messages.find((message) =>
                          message.role === "user" &&
                          message.revisionId === targetRevision.id
                        ) ??
                        thread.messages.find((message) => message.role === "user")
                      restartFailedRevision.mutate({
                        threadId: thread.id,
                        body: promptMessage?.body ?? "Try again.",
                        baseRevisionId: targetRevision.id,
                        agentProvider: selectedRevisionProvider,
                        model: selectedRevisionModel,
                      })
                    } else {
                      refreshProposal.mutate({ revisionId })
                    }
                  }}
                  onAcceptRevision={(revisionId) => acceptRevision.mutate({ revisionId })}
                  reviewActionPending={acceptRevision.isPending}
                  onOpenChat={onOpenChat}
                />
              )
            })}
          </div>
        )}
      </div>

      <div className="pb-2 shadow-sm shadow-background relative z-10 px-3">
        <CommentComposer
          value={draft}
          onChange={setDraft}
          onSubmit={handleSend}
          attachments={draftAttachments}
          onAttachmentsChange={setDraftAttachments}
          placeholder="Comment on this frame..."
          timecode={composerTimecode}
          isSubmitting={isMutating}
          modelSelector={modelSelector}
          focusSignal={composerFocusSignal}
        />
      </div>
    </div>
  )
}
