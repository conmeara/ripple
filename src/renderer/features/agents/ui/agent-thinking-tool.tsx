"use client"

import { memo, useState, useEffect, useRef } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "../../../lib/utils"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import { AgentToolInterrupted } from "./agent-tool-interrupted"
import { areToolPropsEqual } from "./agent-tool-utils"

interface ThinkingToolPart {
  type: string
  state: string
  input?: {
    label?: string
    text?: string
  }
  output?: {
    completed?: boolean
  }
  startedAt?: number
}

interface AgentThinkingToolProps {
  part: ThinkingToolPart
  chatStatus?: string
  compact?: boolean
  forceChevronVisible?: boolean
}

const PREVIEW_LENGTH = 60

function formatCompactThinkingText(text: string): string {
  return text
    .replace(/([.!?])(?=[A-Z][a-z])/g, "$1\n\n")
    .replace(/([a-z0-9)])(\*\*[^*]+\*\*)/gi, "$1\n\n$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function formatElapsedTime(ms: number): string {
  if (ms < 1000) return ""
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) return `${minutes}m`
  return `${minutes}m ${remainingSeconds}s`
}

export const AgentThinkingTool = memo(function AgentThinkingTool({
  part,
  chatStatus,
  compact,
  forceChevronVisible,
}: AgentThinkingToolProps) {
  const isPending =
    part.state !== "output-available" && part.state !== "output-error"
  const isActivelyStreaming = chatStatus === "streaming" || chatStatus === "submitted"
  const isStreaming = isPending && isActivelyStreaming
  const isInterrupted = isPending && !isActivelyStreaming && chatStatus !== undefined

  // Compact runtime rows read better as one-line live labels, with detail on demand.
  const [isExpanded, setIsExpanded] = useState(compact ? false : isStreaming)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wasStreamingRef = useRef(isStreaming)

  // Auto-collapse when streaming ends (transition from true -> false)
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setIsExpanded(false)
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming])

  // Elapsed time — ticks every second while streaming. Written straight to the DOM
  // node's textContent (not React state) so the per-second tick never re-renders the
  // row (and the rest of the live feed) while the model is working.
  const startedAtRef = useRef(part.startedAt || Date.now())
  const elapsedRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!isStreaming) return
    const tick = () => {
      if (elapsedRef.current) {
        elapsedRef.current.textContent = formatElapsedTime(Date.now() - startedAtRef.current)
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [isStreaming])

  // Track whether content overflows the scroll container
  const [isOverflowing, setIsOverflowing] = useState(false)

  // Auto-scroll when expanded during streaming + check overflow
  useEffect(() => {
    if (isStreaming && isExpanded && scrollRef.current) {
      const el = scrollRef.current
      setIsOverflowing(el.scrollHeight > el.clientHeight)
      el.scrollTop = el.scrollHeight
    }
  }, [part.input?.text, isStreaming, isExpanded])

  const thinkingText = part.input?.text || ""
  const displayThinkingText = compact ? formatCompactThinkingText(thinkingText) : thinkingText
  const headline = part.input?.label

  // In compact (motion-feed) rows the headline is a clean, model-authored summary,
  // so prefer it over slicing raw thought text for the collapsed preview. The full
  // thought stays available in the expanded body (detail on demand).
  const previewSource = compact && headline ? headline : thinkingText
  const previewText = previewSource.slice(0, PREVIEW_LENGTH).replace(/\n/g, " ")
  void headline
  void previewText
  const titleText = "Thinking"
  const collapsedPreviewText = ""

  if (isInterrupted && !thinkingText) {
    return <AgentToolInterrupted toolName="Thinking" />
  }

  return (
    <div>
      {/* Header - always visible, clickable to toggle */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="group flex h-5 cursor-pointer items-center px-2 text-xs leading-5"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className={cn(
            "flex min-w-0 items-center gap-2",
            compact ? "text-xs leading-5" : "text-xs",
          )}>
            <span className={cn(
              "font-medium",
              compact ? "min-w-0 truncate" : "flex-shrink-0 whitespace-nowrap",
            )}>
              {isStreaming ? (
                <TextShimmer
                  as="span"
                  duration={compact ? 1.6 : 1.2}
                  spread={compact ? 1.2 : 2}
                  className="m-0 inline-flex h-5 max-w-full items-center truncate text-xs leading-5"
                >
                  {titleText}
                </TextShimmer>
              ) : (
                <span className="text-muted-foreground">{titleText}</span>
              )}
            </span>
            {/* Preview when collapsed */}
            {!isExpanded && collapsedPreviewText && (
              <span className="text-muted-foreground/60 truncate">
                {collapsedPreviewText}
              </span>
            )}
            {/* Elapsed time */}
            {isStreaming && (
              <span
                ref={elapsedRef}
                className="text-muted-foreground/50 tabular-nums flex-shrink-0"
              />
            )}
            {/* Chevron */}
            <ChevronRight
              className={cn(
                "mt-px h-3 w-3 flex-shrink-0 text-muted-foreground/60 transition-[opacity,transform] duration-200 ease-out",
                isExpanded && "rotate-90",
                !isExpanded && !forceChevronVisible && "opacity-0 group-hover:opacity-100",
              )}
            />
          </div>
        </div>
      </div>

      {/* Content - expanded while streaming, collapsible after */}
      {isExpanded && thinkingText && (
        <div className="relative mt-1">
          {/* Top gradient fade when streaming */}
          <div
            className={cn(
              "absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none transition-opacity duration-200",
              isStreaming && isOverflowing ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            ref={scrollRef}
            className={cn(
              "px-2",
              compact && "text-[13px] leading-6 text-muted-foreground/90",
              isStreaming && "overflow-y-auto scrollbar-hide max-h-64",
            )}
          >
            <ChatMarkdownRenderer content={displayThinkingText} size="sm" isStreaming={isStreaming} />
          </div>
        </div>
      )}
    </div>
  )
}, areToolPropsEqual)
