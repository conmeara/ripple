"use client"

import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  CirclePlay,
  MoreHorizontal,
} from "lucide-react"
import {
  TbLayoutDistributeVertical,
  TbLayoutSidebar,
  TbLayoutSidebarRight,
} from "react-icons/tb"
import { Button } from "../../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { Kbd } from "../../components/ui/kbd"
import { ResizableSidebar } from "../../components/ui/resizable-sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { chatSourceModeAtom, isDesktopAtom, isFullscreenAtom } from "../../lib/atoms"
import { useResolvedHotkeyDisplay } from "../../lib/hotkeys"
import { trpc } from "../../lib/trpc"
import { cn } from "../../lib/utils"
import type { RippleTimelineRangeSelection } from "../../../shared/hyperframes-timeline-model"
import {
  RIPPLE_TIMELINE_FPS,
  timelineSecondsToFrame,
} from "../../../shared/hyperframes-timeline-model"
import { TrafficLights } from "../agents/components/traffic-light-spacer"
import {
  hyperframesProjectPaneWidthAtom,
  selectedAgentChatIdAtom,
  selectedChatIsRemoteAtom,
  selectedDraftIdAtom,
  showNewChatFormAtom,
  type SelectedProject,
} from "../agents/atoms"
import { ChatView } from "../agents/main/active-chat"
import type { AgentRuntimeChatContext } from "../agents/lib/agent-runtime-chat-transport"
import { NewChatForm } from "../agents/main/new-chat-form"
import { RippleRevisionQueueWorker } from "../comments/RippleRevisionQueueWorker"
import { HyperFramesPreviewPlayer } from "../hyperframes/HyperFramesPreviewPlayer"
import { HyperFramesProjectPane } from "../hyperframes/HyperFramesProjectPane"
import { RippleRendersPane } from "../renders/RippleRendersPane"
import { RippleEmbeddedChatToolbar } from "./RippleEmbeddedChatToolbar"
import type { RippleConversationTabMeta } from "./RippleActiveConversationTabs"
import {
  RippleReviewPane,
  UtilityModeIcon,
  rightPaneLabels,
} from "./RippleReviewPane"
import {
  rippleShellAssetsPanelOpenAtom,
  rippleShellCenterStageOpenAtom,
  rippleShellReviewPaneOpenAtom,
  rippleShellRightPaneModeAtom,
} from "./ripple-shell-atoms"
import {
  applyRippleShellShortcut,
  getRippleReviewContentKey,
  RIPPLE_UTILITY_MODES,
  resolveRippleShellState,
  setRippleRightPaneMode,
  toggleRippleShellPanel,
  type RippleRightPaneMode,
  type RippleShellPanel,
  type RippleShellState,
} from "./ripple-shell-layout"
import {
  normalizeRipplePreviewTime,
  shouldIgnorePendingRipplePreviewTimeUpdate,
  shouldKeepStickyRipplePreviewTime,
} from "./ripple-preview-time"
import {
  getActiveRipplePreviewChatId,
  getActiveRipplePreviewRevisionId,
  resetRipplePreviewTarget,
  selectRippleChatDraftPreview,
  selectRippleCommentPreview,
  selectRippleMainPreview,
  selectRippleProjectChatPreview,
  selectRippleRevisionChatPreview,
  selectRippleRevisionPreview,
  type RipplePreviewTarget,
} from "./ripple-preview-target"
import {
  addActiveConversationId,
  closeActiveConversationId,
  loadActiveConversationIds,
  mergeConversationHistoryItems,
  pruneActiveConversationIds,
  saveActiveConversationIds,
} from "./active-conversations"

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  )
}

function PanelToggleButton({
  label,
  shortcut,
  active,
  onClick,
  children,
}: {
  label: string
  shortcut: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={cn(
            "h-7 w-7 rounded-md border border-transparent bg-transparent p-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground",
            active && "text-primary",
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        <span className="ml-2 text-[10px] text-muted-foreground">
          {shortcut}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

function UtilityMenuButton({
  activeMode,
  active,
  onModeChange,
}: {
  activeMode: RippleRightPaneMode
  active: boolean
  onModeChange: (mode: RippleRightPaneMode) => void
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 rounded-md p-0 text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground",
                active && "bg-foreground/[0.10] text-foreground",
              )}
              aria-label="Right pane pages"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Right pane pages</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-44">
        {RIPPLE_UTILITY_MODES.map((utilityMode) => (
          <DropdownMenuItem
            key={utilityMode}
            className={cn(
              "gap-2",
              activeMode === utilityMode && "bg-foreground/5",
            )}
            onSelect={() => onModeChange(utilityMode)}
          >
            <UtilityModeIcon mode={utilityMode} />
            {rightPaneLabels[utilityMode]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function RippleShell({
  selectedProject,
  chatId,
  isSidebarOpen,
  onToggleSidebar,
  selectedTeamName,
  selectedTeamImageUrl,
}: {
  selectedProject: NonNullable<SelectedProject>
  chatId: string | null
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  selectedTeamName?: string
  selectedTeamImageUrl?: string
}) {
  const toggleSidebarHotkey = useResolvedHotkeyDisplay("toggle-sidebar")
  const isDesktop = useAtomValue(isDesktopAtom)
  const isFullscreen = useAtomValue(isFullscreenAtom)
  const [assetsPanelOpen, setAssetsPanelOpen] = useAtom(
    rippleShellAssetsPanelOpenAtom,
  )
  const [centerStageOpen, setCenterStageOpen] = useAtom(
    rippleShellCenterStageOpenAtom,
  )
  const [reviewPaneOpen, setReviewPaneOpen] = useAtom(
    rippleShellReviewPaneOpenAtom,
  )
  const [rightPaneMode, setRightPaneModeAtom] = useAtom(
    rippleShellRightPaneModeAtom,
  )
  const trpcUtils = trpc.useUtils()
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setSelectedChatIsRemote = useSetAtom(selectedChatIsRemoteAtom)
  const setSelectedDraftId = useSetAtom(selectedDraftIdAtom)
  const setShowNewChatForm = useSetAtom(showNewChatFormAtom)
  const setChatSourceMode = useSetAtom(chatSourceModeAtom)
  const [previewTime, setPreviewTime] = useState(0)
  const [previewFrame, setPreviewFrame] = useState(0)
  const previewTimeRef = useRef(0)
  const previewFrameRef = useRef(0)
  const previewFpsRef = useRef(RIPPLE_TIMELINE_FPS)
  const pendingPreviewSeekTimeRef = useRef<number | null>(null)
  const [timelineSelection, setTimelineSelection] =
    useState<RippleTimelineRangeSelection | null>(null)
  const [previewTarget, setPreviewTarget] =
    useState<RipplePreviewTarget>({ kind: "main" })
  const [previewSeekRequest, setPreviewSeekRequest] = useState<{
    time: number
    requestId: number
  } | null>(null)
  const [selectedCommentThreadId, setSelectedCommentThreadId] = useState<string | null>(null)
  const [newChatDraftKey, setNewChatDraftKey] = useState(0)
  const [activeConversationIds, setActiveConversationIds] = useState<string[]>(() =>
    loadActiveConversationIds(selectedProject.id),
  )
  const [
    revealedConversationItems,
    setRevealedConversationItems,
  ] = useState<Record<string, RippleConversationTabMeta>>({})
  const projectHistoryChats = trpc.chats.list.useQuery(
    { projectId: selectedProject.id },
    { enabled: Boolean(selectedProject.id) },
  )
  const exportActiveCountQuery = trpc.exports.activeCount.useQuery(
    { projectId: selectedProject.id },
    {
      enabled: Boolean(selectedProject.id),
      refetchInterval: 1500,
    },
  )
  const projectHistoryItems = useMemo(
    () =>
      (projectHistoryChats.data ?? []).map((item) => ({
        id: item.id,
        chatId: item.id,
        name: item.name || "New Chat",
        created_at: item.createdAt instanceof Date
          ? item.createdAt.toISOString()
          : item.createdAt ?? undefined,
        updated_at: item.updatedAt instanceof Date
          ? item.updatedAt.toISOString()
          : item.updatedAt ?? undefined,
        mode: "agent" as const,
        kind: item.kind,
        status: item.status,
        compositionId: item.compositionId,
        commentThreadId: item.commentThreadId,
        revisionId: item.revisionId,
      })),
    [projectHistoryChats.data],
  )
  const conversationHistoryItems = useMemo(
    () =>
      mergeConversationHistoryItems(
        projectHistoryItems,
        Object.values(revealedConversationItems),
      ),
    [projectHistoryItems, revealedConversationItems],
  )
  const activeConversationItemById = useMemo(() => {
    const map = new Map<string, RippleConversationTabMeta>()
    for (const item of conversationHistoryItems) map.set(item.id, item)
    if (chatId && !map.has(chatId)) {
      map.set(chatId, {
        id: chatId,
        chatId,
        name: "New Chat",
        mode: "agent",
      })
    }
    return map
  }, [chatId, conversationHistoryItems])
  const activeConversationItems = useMemo(
    () =>
      activeConversationIds
        .map((id) => activeConversationItemById.get(id) ?? null)
        .filter((item): item is RippleConversationTabMeta => Boolean(item)),
    [activeConversationIds, activeConversationItemById],
  )
  const rememberActiveConversation = useCallback((conversationId: string | null | undefined) => {
    if (!conversationId) return
    setActiveConversationIds((current) => {
      const next = addActiveConversationId(current, conversationId)
      if (next.length === current.length && next.every((id, index) => id === current[index])) {
        return current
      }
      saveActiveConversationIds(selectedProject.id, next)
      return next
    })
  }, [selectedProject.id])
  const shellState = resolveRippleShellState({
    assetsPanelOpen,
    centerStageOpen,
    reviewPaneOpen,
    rightPaneMode,
  })
  const activePreviewRevisionId =
    getActiveRipplePreviewRevisionId(previewTarget)
  const activePreviewChatId = getActiveRipplePreviewChatId(previewTarget)
  const agentRuntimePreviewSource = useMemo<NonNullable<AgentRuntimeChatContext["previewSource"]>>(() => {
    if (previewTarget.kind === "comment-revision") {
      return { kind: "comment-revision", revisionId: previewTarget.revisionId }
    }
    if (previewTarget.kind === "chat-worktree") {
      return { kind: "chat-worktree", conversationId: previewTarget.chatId }
    }
    return { kind: "main" }
  }, [previewTarget])
  const agentRuntimePreviewContext = useMemo<AgentRuntimeChatContext>(() => ({
    projectId: selectedProject.id,
    compositionId: selectedProject.activeCompositionId ?? null,
    previewTimeSeconds: previewTime,
    previewFrame,
    previewSource: agentRuntimePreviewSource,
    commentThreadId: selectedCommentThreadId,
    revisionId: activePreviewRevisionId,
  }), [
    activePreviewRevisionId,
    agentRuntimePreviewSource,
    previewFrame,
    previewTime,
    selectedProject.id,
    selectedCommentThreadId,
    selectedProject.activeCompositionId,
  ])
  const commitShellState = useCallback(
    (nextState: RippleShellState) => {
      const resolved = resolveRippleShellState(nextState)
      setAssetsPanelOpen(resolved.assetsPanelOpen)
      setCenterStageOpen(resolved.centerStageOpen)
      setReviewPaneOpen(resolved.reviewPaneOpen)
      setRightPaneModeAtom(resolved.rightPaneMode)
    },
    [
      setAssetsPanelOpen,
      setCenterStageOpen,
      setReviewPaneOpen,
      setRightPaneModeAtom,
    ],
  )

  const togglePanel = useCallback((panel: RippleShellPanel) => {
    commitShellState(toggleRippleShellPanel(shellState, panel))
  }, [commitShellState, shellState])

  const handleModeChange = useCallback((mode: RippleRightPaneMode) => {
    commitShellState(setRippleRightPaneMode(shellState, mode))
  }, [commitShellState, shellState])

  useEffect(() => {
    const loaded = loadActiveConversationIds(selectedProject.id)
    setActiveConversationIds(loaded)
    setRevealedConversationItems({})
  }, [selectedProject.id])

  useEffect(() => {
    if (!chatId) return
    rememberActiveConversation(chatId)
  }, [chatId, rememberActiveConversation])

  useEffect(() => {
    if (projectHistoryChats.isLoading) return
    const availableIds = new Set(activeConversationItemById.keys())
    setActiveConversationIds((current) => {
      const next = pruneActiveConversationIds({
        ids: current,
        activeId: chatId,
        availableIds,
      }).ids
      if (next.length === current.length && next.every((id, index) => id === current[index])) {
        return current
      }
      saveActiveConversationIds(selectedProject.id, next)
      return next
    })
  }, [
    activeConversationItemById,
    chatId,
    projectHistoryChats.isLoading,
    selectedProject.id,
  ])

  const requestPreviewSeek = useCallback((time: number) => {
    const nextTime = normalizeRipplePreviewTime(time)
    const nextFrame = timelineSecondsToFrame(nextTime, previewFpsRef.current)
    previewTimeRef.current = nextTime
    previewFrameRef.current = nextFrame
    pendingPreviewSeekTimeRef.current = nextTime
    setPreviewTime(nextTime)
    setPreviewFrame(nextFrame)
    setPreviewSeekRequest((current) => ({
      time: nextTime,
      requestId: (current?.requestId ?? 0) + 1,
    }))
    return nextTime
  }, [])

  const handlePreviewRevision = useCallback((revisionId: string, time: number) => {
    const transition = selectRippleRevisionPreview({ revisionId, time })
    requestPreviewSeek(transition.seekTime)
    setPreviewTarget(transition.target)
  }, [requestPreviewSeek])

  const handleShowPrimaryPreview = useCallback((time?: number | null) => {
    const transition = selectRippleMainPreview({
      currentTime: previewTimeRef.current,
      requestedTime: time,
    })
    requestPreviewSeek(transition.seekTime)
    setPreviewTarget(transition.target)
    return transition.seekTime
  }, [requestPreviewSeek])

  const handlePreviewChatWorktree = useCallback((targetChatId: string) => {
    const transition = selectRippleChatDraftPreview({
      chatId: targetChatId,
      currentTime: previewTimeRef.current,
    })
    requestPreviewSeek(transition.seekTime)
    setPreviewTarget(transition.target)
  }, [requestPreviewSeek])

  const handleSelectPreviewComment = useCallback((selection: {
    threadId: string
    time: number
    revisionId?: string | null
  }) => {
    const transition = selectRippleCommentPreview(selection)
    setSelectedCommentThreadId(transition.selectedThreadId)
    requestPreviewSeek(transition.seekTime)
    setPreviewTarget(transition.target)
    commitShellState(setRippleRightPaneMode(shellState, "comments"))
  }, [commitShellState, requestPreviewSeek, shellState])

  const handleStartNewChat = useCallback(() => {
    void (async () => {
      if (chatId) {
        try {
          await window.desktopApi?.releaseChat?.(chatId)
        } catch (error) {
          console.warn("[RippleShell] Could not release current chat:", error)
        }
      }

      setSelectedDraftId(null)
      setSelectedChatIsRemote(false)
      setChatSourceMode("local")
      setShowNewChatForm(true)
      setSelectedChatId(null)
      const transition = selectRippleProjectChatPreview({
        currentTime: previewTimeRef.current,
      })
      requestPreviewSeek(transition.seekTime)
      setPreviewTarget(transition.target)
      setSelectedCommentThreadId(null)
      setNewChatDraftKey((key) => key + 1)
      commitShellState(setRippleRightPaneMode(shellState, "chat"))
    })()
  }, [
    chatId,
    commitShellState,
    requestPreviewSeek,
    setChatSourceMode,
    setSelectedChatId,
    setSelectedChatIsRemote,
    setSelectedDraftId,
    setShowNewChatForm,
    shellState,
  ])

  const handleOpenProjectChatFromHistory = useCallback((targetChatId: string) => {
    rememberActiveConversation(targetChatId)
    setSelectedDraftId(null)
    setSelectedChatIsRemote(false)
    setChatSourceMode("local")
    setShowNewChatForm(false)
    setSelectedChatId(targetChatId)
    const transition = selectRippleProjectChatPreview({
      currentTime: previewTimeRef.current,
    })
    requestPreviewSeek(transition.seekTime)
    setPreviewTarget(transition.target)
    setSelectedCommentThreadId(null)
    commitShellState(setRippleRightPaneMode(shellState, "chat"))
  }, [
    commitShellState,
    rememberActiveConversation,
    requestPreviewSeek,
    setChatSourceMode,
    setSelectedChatId,
    setSelectedChatIsRemote,
    setSelectedDraftId,
    setShowNewChatForm,
    shellState,
  ])

  const handleSelectActiveConversation = useCallback((targetChatId: string) => {
    rememberActiveConversation(targetChatId)
    setSelectedDraftId(null)
    setSelectedChatIsRemote(false)
    setChatSourceMode("local")
    setShowNewChatForm(false)
    setSelectedChatId(targetChatId)
    setSelectedCommentThreadId(null)
    commitShellState(setRippleRightPaneMode(shellState, "chat"))
  }, [
    commitShellState,
    rememberActiveConversation,
    setChatSourceMode,
    setSelectedChatId,
    setSelectedChatIsRemote,
    setSelectedDraftId,
    setShowNewChatForm,
    shellState,
  ])

  const handleCloseActiveConversation = useCallback((targetChatId: string) => {
    const result = closeActiveConversationId({
      ids: activeConversationIds,
      activeId: chatId,
      conversationId: targetChatId,
    })
    setActiveConversationIds(result.ids)
    saveActiveConversationIds(selectedProject.id, result.ids)
    if (targetChatId !== chatId) return
    if (result.activeId) {
      handleSelectActiveConversation(result.activeId)
      return
    }
    handleStartNewChat()
  }, [
    activeConversationIds,
    chatId,
    handleSelectActiveConversation,
    handleStartNewChat,
    selectedProject.id,
  ])

  const revealRevisionChat = trpc.chats.reveal.useMutation({
    onSuccess: async (_chat, variables) => {
      await Promise.all([
        trpcUtils.chats.list.invalidate(),
        trpcUtils.chats.get.invalidate({ id: variables.id }),
      ])
    },
  })

  const handleOpenRevisionChat = useCallback((
    revisionChatId: string,
    revisionId?: string | null,
    time = 0,
  ) => {
    void (async () => {
      try {
        const revealedChat = await revealRevisionChat.mutateAsync({ id: revisionChatId })
        setRevealedConversationItems((current) => ({
          ...current,
          [revealedChat.id]: {
            id: revealedChat.id,
            chatId: revealedChat.id,
            name: revealedChat.name || "New Chat",
            created_at: revealedChat.createdAt instanceof Date
              ? revealedChat.createdAt.toISOString()
              : revealedChat.createdAt ?? undefined,
            updated_at: revealedChat.updatedAt instanceof Date
              ? revealedChat.updatedAt.toISOString()
              : revealedChat.updatedAt ?? undefined,
            mode: "agent",
            kind: revealedChat.kind,
            status: revealedChat.status,
            compositionId: revealedChat.compositionId,
            commentThreadId: revealedChat.commentThreadId,
            revisionId: revealedChat.revisionId,
          },
        }))
        rememberActiveConversation(revisionChatId)
      } catch (error) {
        console.error("[RippleShell] Could not open comment chat:", error)
        return
      }
      setSelectedDraftId(null)
      setSelectedChatIsRemote(false)
      setChatSourceMode("local")
      setShowNewChatForm(false)
      setSelectedChatId(revisionChatId)
      const transition = selectRippleRevisionChatPreview({ revisionId, time })
      requestPreviewSeek(transition.seekTime)
      setPreviewTarget(transition.target)
      commitShellState(setRippleRightPaneMode(shellState, "chat"))
    })()
  }, [
    commitShellState,
    rememberActiveConversation,
    requestPreviewSeek,
    revealRevisionChat,
    setChatSourceMode,
    setSelectedChatId,
    setSelectedChatIsRemote,
    setSelectedDraftId,
    setShowNewChatForm,
    shellState,
  ])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableEventTarget(event.target)) return
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return

      const key = event.key.toLowerCase()
      if (key === "a") {
        event.preventDefault()
        commitShellState(applyRippleShellShortcut(shellState, "toggle-assets"))
      } else if (key === "p") {
        event.preventDefault()
        commitShellState(applyRippleShellShortcut(shellState, "toggle-center"))
      } else if (key === "r") {
        event.preventDefault()
        commitShellState(applyRippleShellShortcut(shellState, "toggle-review"))
      } else if (key === "c") {
        event.preventDefault()
        commitShellState(applyRippleShellShortcut(shellState, "show-chat"))
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [commitShellState, shellState])

  useEffect(() => {
    const transition = resetRipplePreviewTarget()
    setPreviewTarget(transition.target)
    setPreviewSeekRequest(null)
    setTimelineSelection(null)
    setSelectedCommentThreadId(null)
    previewTimeRef.current = transition.seekTime
    previewFrameRef.current = timelineSecondsToFrame(transition.seekTime, previewFpsRef.current)
    pendingPreviewSeekTimeRef.current = null
    setPreviewTime(transition.seekTime)
    setPreviewFrame(previewFrameRef.current)
  }, [selectedProject.id, selectedProject.activeCompositionId])

  const handlePreviewTimeChange = useCallback((time: number, context?: {
    frame: number
    fps: number
  }) => {
    const nextTime = normalizeRipplePreviewTime(time)
    const nextFps =
      typeof context?.fps === "number" && Number.isFinite(context.fps) && context.fps > 0
        ? Math.round(context.fps)
        : previewFpsRef.current
    const nextFrame =
      typeof context?.frame === "number" && Number.isFinite(context.frame)
        ? Math.max(0, Math.round(context.frame))
        : timelineSecondsToFrame(nextTime, nextFps)
    previewFpsRef.current = nextFps
    const pendingSeekTime = pendingPreviewSeekTimeRef.current
    if (
      shouldIgnorePendingRipplePreviewTimeUpdate({
        pendingSeekTime,
        incomingTime: nextTime,
      })
    ) {
      return
    }
    if (
      pendingSeekTime !== null &&
      shouldKeepStickyRipplePreviewTime({
        currentTime: pendingSeekTime,
        incomingTime: nextTime,
      })
    ) {
      pendingPreviewSeekTimeRef.current = null
      previewFrameRef.current = nextFrame
      setPreviewFrame(nextFrame)
      return
    }

    pendingPreviewSeekTimeRef.current = null
    if (
      shouldKeepStickyRipplePreviewTime({
        currentTime: previewTimeRef.current,
        incomingTime: nextTime,
      })
    ) {
      if (previewFrameRef.current !== nextFrame) {
        previewFrameRef.current = nextFrame
        setPreviewFrame(nextFrame)
      }
      return
    }

    previewTimeRef.current = nextTime
    previewFrameRef.current = nextFrame
    setPreviewTime(nextTime)
    setPreviewFrame(nextFrame)
  }, [])

  return (
    <div
      className="relative flex h-full min-w-0 flex-col overflow-hidden bg-background"
      data-testid="ripple-shell"
    >
      <RippleRevisionQueueWorker projectId={selectedProject.id} />
      {!isSidebarOpen && (
        <TrafficLights
          isFullscreen={isFullscreen}
          isDesktop={isDesktop}
          className="absolute left-[15px] top-[12px] z-20"
        />
      )}
      <div
        className={cn(
          "drag-region flex h-[44px] shrink-0 items-center justify-between border-b border-border/60 bg-tl-background pr-2.5",
          isSidebarOpen ? "pl-3" : "pl-[78px]",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {!isSidebarOpen && (
            <div className="no-drag">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Open sidebar"
                    onClick={onToggleSidebar}
                    className="h-7 w-7 rounded-md border border-transparent bg-transparent p-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground"
                  >
                    <TbLayoutSidebar className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Open sidebar
                  {toggleSidebarHotkey && <Kbd>{toggleSidebarHotkey}</Kbd>}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
          <div
            className="min-w-0 truncate text-sm font-semibold text-foreground/90"
            data-testid="ripple-shell-project-name"
          >
            {selectedProject.name}
          </div>
        </div>

        <div className="no-drag flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={shellState.rightPaneMode === "renders"}
                onClick={() => handleModeChange("renders")}
                className={cn(
                  "h-7 gap-1.5 rounded-md px-2 text-xs text-muted-foreground",
                  shellState.reviewPaneOpen &&
                    shellState.rightPaneMode === "renders" &&
                    "bg-foreground/[0.10] text-foreground",
                )}
                data-testid="ripple-renders-button"
              >
                <CirclePlay className="h-3 w-3" />
                Renders
                {exportActiveCountQuery.data ? (
                  <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] leading-none text-primary">
                    {exportActiveCountQuery.data}
                  </span>
                ) : null}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Renders</TooltipContent>
          </Tooltip>

          <UtilityMenuButton
            activeMode={shellState.rightPaneMode}
            active={
              shellState.reviewPaneOpen &&
              shellState.rightPaneMode !== "chat" &&
              shellState.rightPaneMode !== "comments" &&
              shellState.rightPaneMode !== "renders"
            }
            onModeChange={handleModeChange}
          />

          <div className="flex items-center gap-0">
            <PanelToggleButton
              label="Toggle assets"
              shortcut="Shift+Cmd+A"
              active={shellState.assetsPanelOpen}
              onClick={() => togglePanel("assets")}
            >
              <TbLayoutSidebar className="h-3.5 w-3.5" />
            </PanelToggleButton>

            <PanelToggleButton
              label="Toggle preview"
              shortcut="Shift+Cmd+P"
              active={shellState.centerStageOpen}
              onClick={() => togglePanel("center")}
            >
              <TbLayoutDistributeVertical className="h-3.5 w-3.5" />
            </PanelToggleButton>

            <PanelToggleButton
              label="Toggle review"
              shortcut="Shift+Cmd+R"
              active={shellState.reviewPaneOpen}
              onClick={() => togglePanel("review")}
            >
              <TbLayoutSidebarRight className="h-3.5 w-3.5" />
            </PanelToggleButton>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <ResizableSidebar
          isOpen={shellState.assetsPanelOpen}
          onClose={() => togglePanel("assets")}
          widthAtom={hyperframesProjectPaneWidthAtom}
          minWidth={240}
          maxWidth={340}
          side="left"
          animationDuration={0.18}
          initialWidth={0}
          exitWidth={0}
          disableClickToClose={true}
          className="border-r bg-tl-background"
          style={{ borderRightWidth: "0.5px" }}
        >
          <HyperFramesProjectPane
            projectId={selectedProject.id}
            activeCompositionId={selectedProject.activeCompositionId}
            onClose={() => togglePanel("assets")}
            onOpenComments={() => handleModeChange("comments")}
          />
        </ResizableSidebar>

        {shellState.centerStageOpen ? (
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-black">
            <HyperFramesPreviewPlayer
              projectId={selectedProject.id}
              compositionId={selectedProject.activeCompositionId}
              revisionId={activePreviewRevisionId}
              chatId={activePreviewChatId}
              selectedCommentThreadId={selectedCommentThreadId}
              seekToTime={previewSeekRequest?.time ?? null}
              seekRequestId={previewSeekRequest?.requestId}
              onPreviewTimeChange={handlePreviewTimeChange}
              onTimelineSelectionChange={setTimelineSelection}
              onCommentMarkerSelect={handleSelectPreviewComment}
            />
          </main>
        ) : null}

        <div
          className={cn(
            shellState.reviewPaneOpen ? "flex" : "hidden",
            !shellState.centerStageOpen && "min-w-0 flex-1",
          )}
        >
          <RippleReviewPane
            mode={shellState.rightPaneMode}
            onModeChange={handleModeChange}
            expanded={!shellState.centerStageOpen}
            projectId={selectedProject.id}
            compositionId={selectedProject.activeCompositionId}
            currentTime={previewTime}
            timelineSelection={timelineSelection}
            selectedCommentThreadId={selectedCommentThreadId}
            onSelectedCommentThreadChange={setSelectedCommentThreadId}
            activePreviewRevisionId={activePreviewRevisionId}
            onPreviewRevision={handlePreviewRevision}
            onShowPrimaryPreview={handleShowPrimaryPreview}
            onOpenRevisionChat={handleOpenRevisionChat}
          >
            {shellState.rightPaneMode === "renders" ? (
              <RippleRendersPane
                projectId={selectedProject.id}
                compositionId={selectedProject.activeCompositionId}
                activePreviewRevisionId={activePreviewRevisionId}
                activePreviewChatId={activePreviewChatId}
              />
            ) : chatId ? (
              <ChatView
                key={getRippleReviewContentKey(chatId, shellState.rightPaneMode)}
                chatId={chatId}
                isSidebarOpen={isSidebarOpen}
                onToggleSidebar={onToggleSidebar}
                selectedTeamName={selectedTeamName}
                selectedTeamImageUrl={selectedTeamImageUrl}
                hideHeader={true}
                suppressSecondarySidebars={true}
                rightPaneMode={shellState.rightPaneMode}
                onRightPaneModeChange={handleModeChange}
                onViewPrimaryPreview={handleShowPrimaryPreview}
                onPreviewChatWorktree={handlePreviewChatWorktree}
                activePreviewChatId={activePreviewChatId}
                agentRuntimePreviewContext={agentRuntimePreviewContext}
                onCreateNewChat={handleStartNewChat}
                historySubChats={conversationHistoryItems}
                isHistoryLoading={projectHistoryChats.isLoading}
                onOpenChatFromHistory={handleOpenProjectChatFromHistory}
                activeConversationId={chatId}
                activeConversations={activeConversationItems}
                onSelectActiveConversation={handleSelectActiveConversation}
                onCloseActiveConversation={handleCloseActiveConversation}
              />
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <RippleEmbeddedChatToolbar
                  onCreateNew={handleStartNewChat}
                  historySubChats={conversationHistoryItems}
                  isHistoryLoading={projectHistoryChats.isLoading}
                  onOpenChatFromHistory={handleOpenProjectChatFromHistory}
                  activeConversationId={chatId}
                  activeConversations={activeConversationItems}
                  onSelectActiveConversation={handleSelectActiveConversation}
                  onCloseActiveConversation={handleCloseActiveConversation}
                />
                <div className="min-h-0 flex-1">
                  <NewChatForm
                    key={`ripple-new-chat-${selectedProject.id}-${newChatDraftKey}`}
                    hideHeader={true}
                    embedded={true}
                  />
                </div>
              </div>
            )}
          </RippleReviewPane>
        </div>
      </div>
    </div>
  )
}
