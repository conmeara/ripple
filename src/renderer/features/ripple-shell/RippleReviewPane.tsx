"use client"

import type { ReactNode } from "react"
import {
  ChevronDown,
  Clock3,
  Files,
  GitCompare,
  Info,
  ListChecks,
  ListFilter,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Puzzle,
  Search,
  Send,
  Smile,
  TerminalSquare,
} from "lucide-react"
import { Button } from "../../components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { cn } from "../../lib/utils"
import type { RippleRightPaneMode } from "./ripple-shell-layout"

export const rightPaneLabels: Record<RippleRightPaneMode, string> = {
  chat: "Chat",
  comments: "Comments",
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

function CommentsPane() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-tl-background">
      <div className="flex h-10 shrink-0 items-center justify-between px-4">
        <button
          type="button"
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          All comments
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md p-0 text-muted-foreground"
                aria-label="Filter comments"
              >
                <ListFilter className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Filter comments</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md p-0 text-muted-foreground"
                aria-label="Comment list"
              >
                <ListChecks className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Comment list</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md p-0 text-muted-foreground"
                aria-label="Search comments"
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Search comments</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md p-0 text-muted-foreground"
                aria-label="More comment actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">More comment actions</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="relative mb-5 h-16 w-20 text-muted-foreground/45">
          <div className="absolute left-1 top-3 h-10 w-14 rounded-lg bg-foreground/10" />
          <div className="absolute right-0 top-0 flex h-11 w-14 items-center justify-center rounded-lg bg-foreground/10">
            <MoreHorizontal className="h-5 w-5" />
          </div>
        </div>
        <div className="text-sm font-medium text-foreground">No comments yet</div>
      </div>

      <div className="shrink-0 border-t border-border/60 bg-background/80 p-3">
        <div className="flex items-center gap-2 rounded-md border border-border/70 bg-tl-background px-2 py-2">
          <div className="flex shrink-0 items-center gap-1 rounded-md bg-foreground/10 px-1.5 py-1 text-[11px] tabular-nums text-muted-foreground">
            <Clock3 className="h-3 w-3" />
            00:00:00:00
          </div>
          <div className="min-w-0 flex-1 text-sm text-muted-foreground">
            Leave your comment...
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md p-0 text-muted-foreground"
            aria-label="Attach media"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md p-0 text-muted-foreground"
            aria-label="Add reaction"
          >
            <Smile className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="default"
            size="icon"
            className="h-7 w-7 rounded-md p-0"
            aria-label="Send comment"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function RippleReviewPane({
  mode,
  onModeChange,
  expanded = false,
  children,
}: {
  mode: RippleRightPaneMode
  onModeChange: (mode: RippleRightPaneMode) => void
  expanded?: boolean
  children: ReactNode
}) {
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col border-l border-border/60 bg-tl-background",
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
          "min-h-0 flex-1",
          mode === "comments" ? "flex" : "hidden",
        )}
      >
        <CommentsPane />
      </div>
    </aside>
  )
}
