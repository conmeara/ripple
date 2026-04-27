"use client"

import { useCallback, useMemo, useState } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { Clock3, Plus } from "lucide-react"
import { Button } from "../../components/ui/button"
import {
  AgentIcon,
  IconSpinner,
  PlanIcon,
  QuestionIcon,
} from "../../components/ui/icons"
import { PopoverTrigger } from "../../components/ui/popover"
import { SearchCombobox } from "../../components/ui/search-combobox"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import {
  agentsSubChatUnseenChangesAtom,
  loadingSubChatsAtom,
  pendingUserQuestionsAtom,
} from "../agents/atoms"
import {
  useAgentSubChatStore,
  type SubChatMeta,
} from "../agents/stores/sub-chat-store"
import { formatTimeAgo } from "../agents/utils/format-time-ago"

export function RippleEmbeddedChatToolbar({
  onCreateNew,
}: {
  onCreateNew: () => void | Promise<void>
}) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const allSubChats = useAgentSubChatStore((state) => state.allSubChats)
  const loadingSubChats = useAtomValue(loadingSubChatsAtom)
  const subChatUnseenChanges = useAtomValue(agentsSubChatUnseenChangesAtom)
  const pendingQuestionsMap = useAtomValue(pendingUserQuestionsAtom)
  const setSubChatUnseenChanges = useSetAtom(agentsSubChatUnseenChangesAtom)

  const sortedSubChats = useMemo(
    () =>
      [...allSubChats].sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at || "0").getTime()
        const bTime = new Date(b.updated_at || b.created_at || "0").getTime()
        return bTime - aTime
      }),
    [allSubChats],
  )

  const handleSelectFromHistory = useCallback(
    (subChat: SubChatMeta) => {
      const store = useAgentSubChatStore.getState()
      if (!store.openSubChatIds.includes(subChat.id)) {
        store.addToOpenSubChats(subChat.id)
      }
      store.setActiveSubChat(subChat.id)
      setSubChatUnseenChanges((prev: Set<string>) => {
        if (!prev.has(subChat.id)) return prev
        const next = new Set(prev)
        next.delete(subChat.id)
        return next
      })
      setIsHistoryOpen(false)
    },
    [setSubChatUnseenChanges],
  )

  const renderHistoryItem = useCallback(
    (subChat: SubChatMeta) => {
      const isLoading = loadingSubChats.has(subChat.id)
      const hasUnseen = subChatUnseenChanges.has(subChat.id)
      const hasPendingQuestion = pendingQuestionsMap.has(subChat.id)
      const mode = subChat.mode || "agent"

      return (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
            {hasPendingQuestion ? (
              <QuestionIcon className="h-4 w-4 text-blue-500" />
            ) : isLoading ? (
              <IconSpinner className="h-4 w-4 text-muted-foreground" />
            ) : mode === "plan" ? (
              <PlanIcon className="h-4 w-4 text-muted-foreground" />
            ) : (
              <AgentIcon className="h-4 w-4 text-muted-foreground" />
            )}
            {hasUnseen && !isLoading && !hasPendingQuestion && (
              <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[#307BD0]" />
            )}
          </div>
          <span className="min-w-0 flex-1 truncate text-sm">
            {subChat.name || "New Chat"}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatTimeAgo(subChat.updated_at || subChat.created_at)}
          </span>
        </div>
      )
    },
    [loadingSubChats, pendingQuestionsMap, subChatUnseenChanges],
  )

  return (
    <div className="flex h-9 shrink-0 items-center justify-end px-3">
      <div className="flex items-center gap-0.5">
        <SearchCombobox
          isOpen={isHistoryOpen}
          onOpenChange={setIsHistoryOpen}
          items={sortedSubChats}
          onSelect={handleSelectFromHistory}
          placeholder="Search chats..."
          emptyMessage="No chats yet"
          getItemValue={(subChat) => `${subChat.name || "New Chat"} ${subChat.id}`}
          renderItem={renderHistoryItem}
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
                    className="h-7 w-7 rounded-md p-0 text-muted-foreground"
                    aria-label="Chat history"
                    disabled={sortedSubChats.length === 0}
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
              className="h-7 w-7 rounded-md p-0 text-muted-foreground"
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
  )
}
