"use client"

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { CircleDot, Clock3, MessageSquareText, Plus, X } from "lucide-react"
import { Button } from "../../components/ui/button"
import {
  IconSpinner,
  QuestionIcon,
} from "../../components/ui/icons"
import { PopoverTrigger } from "../../components/ui/popover"
import { SearchCombobox } from "../../components/ui/search-combobox"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { cn } from "../../lib/utils"
import {
  agentsSubChatUnseenChangesAtom,
  loadingSubChatsAtom,
  pendingUserQuestionsAtom,
} from "../agents/atoms"
import type { SubChatMeta } from "../agents/stores/sub-chat-store"
import { formatTimeAgo } from "../agents/utils/format-time-ago"
import { shouldShowActiveConversationTabs } from "./active-conversations"

export type RippleConversationTabMeta = SubChatMeta & {
  chatId?: string | null
  kind?: string | null
  status?: string | null
  commentThreadId?: string | null
  revisionId?: string | null
}

export interface RippleActiveConversationTabsProps {
  activeConversationId?: string | null
  activeConversations: RippleConversationTabMeta[]
  historyConversations: RippleConversationTabMeta[]
  isHistoryLoading?: boolean
  leadingContent?: ReactNode
  onSelectConversation: (conversationId: string) => void
  onCloseConversation: (conversationId: string) => void
  onCreateNew: () => void | Promise<void>
  onOpenConversationFromHistory: (conversationId: string) => void | Promise<void>
}

function conversationLabel(conversation: RippleConversationTabMeta): string {
  return conversation.name || "New Chat"
}

export const RippleActiveConversationTabs = memo(function RippleActiveConversationTabs({
  activeConversationId,
  activeConversations,
  historyConversations,
  isHistoryLoading = false,
  leadingContent,
  onSelectConversation,
  onCloseConversation,
  onCreateNew,
  onOpenConversationFromHistory,
}: RippleActiveConversationTabsProps) {
  const loadingSubChats = useAtomValue(loadingSubChatsAtom)
  const subChatUnseenChanges = useAtomValue(agentsSubChatUnseenChangesAtom)
  const pendingQuestionsMap = useAtomValue(pendingUserQuestionsAtom)
  const setSubChatUnseenChanges = useSetAtom(agentsSubChatUnseenChangesAtom)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const textRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  const leftGradientRef = useRef<HTMLDivElement>(null)
  const rightGradientRef = useRef<HTMLDivElement>(null)
  const truncatedTabsRef = useRef<Set<string>>(new Set())

  const sortedHistoryConversations = useMemo(
    () =>
      [...historyConversations].sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at || "0").getTime()
        const bTime = new Date(b.updated_at || b.created_at || "0").getTime()
        return bTime - aTime
      }),
    [historyConversations],
  )

  const handleSwitch = useCallback((conversationId: string) => {
    onSelectConversation(conversationId)
    setSubChatUnseenChanges((prev: Set<string>) => {
      if (!prev.has(conversationId)) return prev
      const next = new Set(prev)
      next.delete(conversationId)
      return next
    })
  }, [onSelectConversation, setSubChatUnseenChanges])

  const handleSelectFromHistory = useCallback((conversation: RippleConversationTabMeta) => {
    void onOpenConversationFromHistory(conversation.id)
    setIsHistoryOpen(false)
    setSubChatUnseenChanges((prev: Set<string>) => {
      if (!prev.has(conversation.id)) return prev
      const next = new Set(prev)
      next.delete(conversation.id)
      return next
    })
  }, [onOpenConversationFromHistory, setSubChatUnseenChanges])

  useEffect(() => {
    if (!activeConversationId || !tabsContainerRef.current) return
    const container = tabsContainerRef.current
    const activeTabElement = tabRefs.current.get(activeConversationId)
    if (!activeTabElement) return

    window.setTimeout(() => {
      const containerRect = container.getBoundingClientRect()
      const tabRect = activeTabElement.getBoundingClientRect()
      const isTabLeftOfView = tabRect.left < containerRect.left
      const isTabRightOfView = tabRect.right > containerRect.right
      if (!isTabLeftOfView && !isTabRightOfView) return

      const tabCenter =
        activeTabElement.offsetLeft + activeTabElement.offsetWidth / 2
      const containerCenter = container.offsetWidth / 2
      const targetScroll = tabCenter - containerCenter
      const maxScroll = container.scrollWidth - container.offsetWidth
      container.scrollTo({
        left: Math.max(0, Math.min(targetScroll, maxScroll)),
        behavior: "smooth",
      })
    }, 0)
  }, [activeConversationId, activeConversations])

  useEffect(() => {
    const checkTruncation = () => {
      const nextTruncated = new Set<string>()
      textRefs.current.forEach((el, conversationId) => {
        if (el.scrollWidth > el.clientWidth) nextTruncated.add(conversationId)
      })
      truncatedTabsRef.current = nextTruncated
      tabRefs.current.forEach((tabEl, conversationId) => {
        const gradientEl = tabEl.querySelector("[data-truncate-gradient]") as HTMLElement | null
        if (gradientEl) {
          gradientEl.style.display = nextTruncated.has(conversationId)
            ? "block"
            : "none"
        }
      })
    }

    checkTruncation()
    const resizeObserver = new ResizeObserver(() => checkTruncation())
    textRefs.current.forEach((el) => resizeObserver.observe(el))
    return () => resizeObserver.disconnect()
  }, [activeConversations, activeConversationId])

  const checkScrollPosition = useCallback(() => {
    const container = tabsContainerRef.current
    if (!container) return
    const { scrollLeft, scrollWidth, clientWidth } = container
    const isScrollable = scrollWidth > clientWidth
    const showLeft = isScrollable && scrollLeft > 0
    const showRight = isScrollable && scrollLeft < scrollWidth - clientWidth - 1
    if (leftGradientRef.current) {
      leftGradientRef.current.style.display = showLeft ? "block" : "none"
    }
    if (rightGradientRef.current) {
      rightGradientRef.current.style.display = showRight ? "block" : "none"
    }
  }, [])

  useEffect(() => {
    const container = tabsContainerRef.current
    if (!container) return
    checkScrollPosition()
    container.addEventListener("scroll", checkScrollPosition, { passive: true })
    return () => container.removeEventListener("scroll", checkScrollPosition)
  }, [checkScrollPosition])

  useEffect(() => {
    checkScrollPosition()
  }, [activeConversations, checkScrollPosition])

  useEffect(() => {
    const activeIds = new Set(activeConversations.map((conversation) => conversation.id))
    tabRefs.current.forEach((_, id) => {
      if (!activeIds.has(id)) {
        tabRefs.current.delete(id)
        textRefs.current.delete(id)
      }
    })
  }, [activeConversations])

  const showTabs = shouldShowActiveConversationTabs(activeConversations)

  return (
    <div className="flex h-9 min-w-0 items-center gap-1 px-3">
      {leadingContent ? (
        <div className="flex shrink-0 items-center gap-1.5">
          {leadingContent}
        </div>
      ) : null}

      <div className="relative flex min-w-0 flex-1 items-center">
        <div
          ref={leftGradientRef}
          className="pointer-events-none absolute bottom-0 left-0 top-0 z-20 hidden w-7 bg-gradient-to-r from-tl-background to-transparent"
        />
        <div
          ref={tabsContainerRef}
          className={cn(
            "scrollbar-hide flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pr-11",
            !showTabs && "invisible",
          )}
        >
          {activeConversations.map((conversation) => {
            const isActive = activeConversationId === conversation.id
            const isLoading = loadingSubChats.has(conversation.id)
            const hasUnseen = subChatUnseenChanges.has(conversation.id)
            const hasPendingQuestion = pendingQuestionsMap.has(conversation.id)
            const isCommentConversation =
              conversation.kind === "comment" || Boolean(conversation.commentThreadId)
            const showStatusSlot =
              hasPendingQuestion || isLoading || isCommentConversation || hasUnseen
            const showUnseenDotOnly =
              hasUnseen && !isLoading && !hasPendingQuestion && !isCommentConversation

            return (
              <button
                key={conversation.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(conversation.id, el)
                  else tabRefs.current.delete(conversation.id)
                }}
                type="button"
                onClick={() => handleSwitch(conversation.id)}
                onAuxClick={(event) => {
                  if (event.button !== 1) return
                  event.preventDefault()
                  onCloseConversation(conversation.id)
                }}
                className={cn(
                  "group relative flex h-6 min-w-[60px] max-w-[180px] shrink-0 items-center gap-1.5 overflow-hidden rounded-md border px-2 text-sm shadow-[0_1px_1px_rgba(0,0,0,0.03)] outline-offset-2 transition-colors duration-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                  isActive
                    ? "border-border bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                    : "border-border/55 bg-[color-mix(in_srgb,hsl(var(--foreground))_4%,hsl(var(--tl-background)))] text-muted-foreground hover:border-border hover:bg-background/80 hover:text-foreground",
                )}
              >
                {showStatusSlot ? (
                  <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    {hasPendingQuestion ? (
                      <QuestionIcon className="h-3.5 w-3.5 text-blue-500" />
                    ) : isLoading ? (
                      <IconSpinner className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : showUnseenDotOnly ? (
                      <span className="h-2 w-2 rounded-full bg-[#307BD0]" />
                    ) : isCommentConversation ? (
                      <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : null}
                    {hasUnseen && !isLoading && !hasPendingQuestion && isCommentConversation ? (
                      <span
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border bg-[#307BD0]",
                          isActive ? "border-background" : "border-tl-background",
                        )}
                      />
                    ) : null}
                  </span>
                ) : null}
                <span
                  ref={(el) => {
                    if (el) textRefs.current.set(conversation.id, el)
                    else textRefs.current.delete(conversation.id)
                  }}
                  className="relative z-0 block min-w-0 flex-1 overflow-hidden truncate pr-1 text-left"
                >
                  {conversationLabel(conversation)}
                </span>
                <span
                  data-truncate-gradient
                  className={cn(
                    "pointer-events-none absolute bottom-0 right-0 top-0 z-[1] hidden w-6 rounded-r-md opacity-100 transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0",
                    isActive
                      ? "bg-gradient-to-l from-background to-transparent"
                      : "bg-[linear-gradient(to_left,color-mix(in_srgb,hsl(var(--foreground))_4%,hsl(var(--tl-background)))_0%,transparent_100%)]",
                  )}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Close tab, keep in history"
                      onClick={(event) => {
                        event.stopPropagation()
                        onCloseConversation(conversation.id)
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return
                        event.preventDefault()
                        event.stopPropagation()
                        onCloseConversation(conversation.id)
                      }}
                      className={cn(
                        "absolute bottom-0 right-0 top-0 z-10 flex w-9 items-center justify-end rounded-r-md pr-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
                        isActive
                          ? "bg-[linear-gradient(to_left,hsl(var(--background))_0%,hsl(var(--background))_62%,transparent_100%)]"
                          : "bg-[linear-gradient(to_left,color-mix(in_srgb,hsl(var(--foreground))_4%,hsl(var(--tl-background)))_0%,color-mix(in_srgb,hsl(var(--foreground))_4%,hsl(var(--tl-background)))_62%,transparent_100%)]",
                      )}
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Close tab, keep in history
                  </TooltipContent>
                </Tooltip>
              </button>
            )
          })}
        </div>
        <div
          ref={rightGradientRef}
          className="pointer-events-none absolute bottom-0 right-11 top-0 z-20 hidden w-8 bg-gradient-to-l from-tl-background to-transparent"
        />
        <div className="absolute bottom-0 right-0 top-0 z-30 flex items-center">
          <div className="h-full w-5 bg-gradient-to-r from-transparent to-tl-background" />
          <div className="flex h-full items-center gap-0.5 bg-tl-background">
            <SearchCombobox
              isOpen={isHistoryOpen}
              onOpenChange={setIsHistoryOpen}
              items={sortedHistoryConversations}
              onSelect={handleSelectFromHistory}
              placeholder="Search chats..."
              emptyMessage={isHistoryLoading ? "Loading chats..." : "No chats yet"}
              getItemValue={(conversation) =>
                `${conversationLabel(conversation)} ${conversation.id}`
              }
              renderItem={(conversation) => {
                const isLoading = loadingSubChats.has(conversation.id)
                const hasUnseen = subChatUnseenChanges.has(conversation.id)
                const hasPendingQuestion = pendingQuestionsMap.has(conversation.id)
                return (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                      {hasPendingQuestion ? (
                        <QuestionIcon className="h-4 w-4 text-blue-500" />
                      ) : isLoading ? (
                        <IconSpinner className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <CircleDot className="h-4 w-4 text-muted-foreground" />
                      )}
                      {hasUnseen && !isLoading && !hasPendingQuestion ? (
                        <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[#307BD0]" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {conversationLabel(conversation)}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatTimeAgo(conversation.updated_at || conversation.created_at)}
                    </span>
                  </div>
                )
              }}
              align="end"
              width="w-72"
              trigger={
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-md p-0 text-muted-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-foreground/10 hover:text-foreground active:scale-[0.97]"
                        aria-label="Chat history"
                        disabled={!isHistoryLoading && sortedHistoryConversations.length === 0}
                      >
                        <Clock3 className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Chat history</TooltipContent>
                </Tooltip>
              }
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-md p-0 text-muted-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-foreground/10 hover:text-foreground active:scale-[0.97]"
                  aria-label="New chat"
                  onClick={() => void onCreateNew()}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">New chat</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  )
})
