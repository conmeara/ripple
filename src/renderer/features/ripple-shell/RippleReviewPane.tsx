"use client"

import type { ReactNode } from "react"
import {
  Files,
  GitCompare,
  Info,
  ListChecks,
  MessageSquare,
  CirclePlay,
  Puzzle,
  TerminalSquare,
} from "lucide-react"
import type { RippleTimelineRangeSelection } from "../../../shared/hyperframes-timeline-model"
import { cn } from "../../lib/utils"
import { RippleCommentsPane } from "../comments/RippleCommentsPane"
import type { RippleRightPaneMode } from "./ripple-shell-layout"

export const rightPaneLabels: Record<RippleRightPaneMode, string> = {
  chat: "Chat",
  comments: "Comments",
  renders: "Renders",
  details: "Details",
  files: "Files",
  changes: "Changes",
  plan: "Plan",
  terminal: "Terminal",
  mcp: "MCP",
}

export function UtilityModeIcon({ mode }: { mode: RippleRightPaneMode }) {
  switch (mode) {
    case "details":
      return <Info className="h-4 w-4" />
    case "files":
      return <Files className="h-4 w-4" />
    case "changes":
      return <GitCompare className="h-4 w-4" />
    case "plan":
      return <ListChecks className="h-4 w-4" />
    case "terminal":
      return <TerminalSquare className="h-4 w-4" />
    case "mcp":
      return <Puzzle className="h-4 w-4" />
    case "renders":
      return <CirclePlay className="h-4 w-4" />
    default:
      return <MessageSquare className="h-4 w-4" />
  }
}

function ReviewModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-7 flex-1 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground",
        active && "bg-foreground/10 text-foreground shadow-sm",
      )}
    >
      {children}
    </button>
  )
}

export function RippleReviewPane({
  mode,
  onModeChange,
  expanded = false,
  projectId,
  compositionId,
  currentTime,
  timelineSelection,
  selectedCommentThreadId,
  onSelectedCommentThreadChange,
  activePreviewRevisionId,
  onPreviewRevision,
  onShowPrimaryPreview,
  onOpenRevisionChat,
  children,
}: {
  mode: RippleRightPaneMode
  onModeChange: (mode: RippleRightPaneMode) => void
  expanded?: boolean
  projectId: string
  compositionId?: string | null
  currentTime: number
  timelineSelection: RippleTimelineRangeSelection | null
  selectedCommentThreadId?: string | null
  onSelectedCommentThreadChange?: (threadId: string | null) => void
  activePreviewRevisionId?: string | null
  onPreviewRevision: (revisionId: string, time: number) => void
  onShowPrimaryPreview: (time?: number | null) => void
  onOpenRevisionChat: (
    chatId: string,
    revisionId?: string | null,
    time?: number,
  ) => void
  children: ReactNode
}) {
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden border-l border-border/60 bg-tl-background",
        expanded
          ? "w-auto min-w-[340px] max-w-none flex-1"
          : "w-[390px] min-w-[340px] max-w-[430px]",
      )}
    >
      <div className="flex h-11 shrink-0 items-center px-3">
        <div className="flex w-full items-center gap-0.5 rounded-lg bg-foreground/5 p-0.5">
          <ReviewModeButton
            active={mode === "chat"}
            onClick={() => onModeChange("chat")}
          >
            Chat
          </ReviewModeButton>
          <ReviewModeButton
            active={mode === "comments"}
            onClick={() => onModeChange("comments")}
          >
            Comments
          </ReviewModeButton>
        </div>
      </div>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1",
          mode === "comments" ? "hidden" : "block",
        )}
      >
        {children}
      </div>
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-hidden",
          mode === "comments" ? "flex" : "hidden",
        )}
      >
        <RippleCommentsPane
          projectId={projectId}
          compositionId={compositionId}
          currentTime={currentTime}
          selection={timelineSelection}
          selectedThreadId={selectedCommentThreadId}
          onSelectedThreadIdChange={onSelectedCommentThreadChange}
          agentTextResetKey={mode}
          activePreviewRevisionId={activePreviewRevisionId}
          onPreviewRevision={onPreviewRevision}
          onShowPrimaryPreview={onShowPrimaryPreview}
          onOpenChat={onOpenRevisionChat}
        />
      </div>
    </aside>
  )
}
