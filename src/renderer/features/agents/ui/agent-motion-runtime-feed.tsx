"use client"

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ChevronRight } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import {
  activeMotionRuntimeItemId,
  buildMotionRuntimeActivity,
  type MotionRuntimeActivityDetail,
  type MotionRuntimeActivityItem,
  type MotionRuntimeCanonicalEvent,
  type MotionRuntimeMetadataLike,
} from "./motion-runtime-activity"

interface AgentMotionRuntimeFeedProps {
  parts: any[]
  events?: MotionRuntimeCanonicalEvent[]
  metadata?: MotionRuntimeMetadataLike
  projectPath?: string
  isLive?: boolean
}

const LIVE_ACTIVITY_MIN_DWELL_MS = 520
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

function shouldDwellCompletedActivity(item: MotionRuntimeActivityItem): boolean {
  if (item.status !== "done") return false
  if (item.kind === "thinking" || item.kind === "status") return false
  return true
}

function useLiveActivityDwell(
  items: MotionRuntimeActivityItem[],
  isLive: boolean | undefined,
  activeItemId: string | undefined,
): string | undefined {
  const seenItemIdsRef = useRef(new Set<string>())
  const dwellRef = useRef<{ itemId?: string; until: number }>({ until: 0 })
  const [, forceRender] = useState(0)
  const signature = useMemo(
    () => items.map((item) => `${item.id}:${item.status}:${item.kind}`).join("|"),
    [items],
  )

  useBrowserLayoutEffect(() => {
    const now = Date.now()
    const itemIds = new Set(items.map((item) => item.id))
    let next = dwellRef.current

    if (!isLive) {
      if (seenItemIdsRef.current.size > 0 || next.itemId) {
        seenItemIdsRef.current = new Set()
        dwellRef.current = { until: 0 }
        forceRender((value) => value + 1)
      }
      return
    }

    if (next.itemId && (!itemIds.has(next.itemId) || next.until <= now)) {
      next = { until: 0 }
    }

    if (activeItemId) {
      next = {
        itemId: activeItemId,
        until: Math.max(
          next.itemId === activeItemId ? next.until : 0,
          now + LIVE_ACTIVITY_MIN_DWELL_MS,
        ),
      }
    } else {
      const tailItem = items.at(-1)
      if (
        tailItem &&
        shouldDwellCompletedActivity(tailItem) &&
        !seenItemIdsRef.current.has(tailItem.id)
      ) {
        next = {
          itemId: tailItem.id,
          until: now + LIVE_ACTIVITY_MIN_DWELL_MS,
        }
      } else if (!next.itemId || next.until <= now || !itemIds.has(next.itemId)) {
        next = { until: 0 }
      }
    }

    for (const item of items) {
      seenItemIdsRef.current.add(item.id)
    }

    const previous = dwellRef.current
    if (previous.itemId !== next.itemId || previous.until !== next.until) {
      dwellRef.current = next
      forceRender((value) => value + 1)
    }
  }, [activeItemId, isLive, items, signature])

  useEffect(() => {
    if (!isLive) return
    const dwell = dwellRef.current
    if (!dwell.itemId) return

    const remaining = dwell.until - Date.now()
    if (remaining <= 0) {
      dwellRef.current = { until: 0 }
      forceRender((value) => value + 1)
      return
    }

    const timeout = window.setTimeout(() => {
      if (dwellRef.current.itemId === dwell.itemId) {
        dwellRef.current = { until: 0 }
        forceRender((value) => value + 1)
      }
    }, remaining)

    return () => window.clearTimeout(timeout)
  }, [isLive, signature])

  if (!isLive) return undefined
  const dwell = dwellRef.current
  if (!dwell.itemId || dwell.until <= Date.now()) return undefined
  return dwell.itemId
}

function VisualPreview({ item }: { item: MotionRuntimeActivityItem }) {
  const visual = item.visual
  const localFilePath = useMemo(() => {
    if (!visual?.imageUrl?.startsWith("file://")) return null
    try {
      return decodeURIComponent(new URL(visual.imageUrl).pathname)
    } catch {
      return null
    }
  }, [visual?.imageUrl])
  const { data: localImage } = trpc.files.readBinaryFile.useQuery(
    { filePath: localFilePath ?? "" },
    {
      enabled: Boolean(localFilePath),
      staleTime: 60_000,
    },
  )

  if (!visual) return null

  const imageUrl = visual.imageUrl?.startsWith("data:")
    ? visual.imageUrl
    : localImage?.ok
      ? `data:${localImage.mimeType};base64,${localImage.data}`
      : undefined
  const isFrameSheet = visual.kind === "frame_sheet"

  return (
    <div
      data-agent-motion-visual-preview="true"
      data-agent-motion-visual-id={item.id}
      data-agent-motion-visual-kind={visual.kind}
      data-agent-motion-visual-status={item.status}
      className="mx-2 mb-1 overflow-hidden rounded-lg border border-border bg-muted/30"
      style={{
        width: isFrameSheet ? "calc(100% - 1rem)" : "min(72%, 32rem)",
        maxWidth: isFrameSheet ? "42rem" : "calc(100% - 1rem)",
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={isFrameSheet ? "Ripple frame sheet" : "Ripple current frame"}
          className={cn(
            "w-full bg-background/40 object-contain transition-opacity duration-200 ease-out",
            isFrameSheet ? "max-h-56" : "aspect-video max-h-40",
          )}
        />
      ) : (
        <div
          className={cn(
            "w-full bg-background/40",
            isFrameSheet ? "h-32 max-h-56" : "aspect-video max-h-40",
          )}
          aria-hidden="true"
        />
      )}
      <div className="border-t border-border px-2.5 py-1.5 text-[10px] text-muted-foreground/60">
        <span>{visual.label}</span>
      </div>
    </div>
  )
}

// A single, consistent "alive" cue across the whole runtime feed: the active row's
// label shimmers (matching the thinking row), instead of a separate pulsing-dots
// affordance. During a live run, the tail item is the only animated row.
function LiveActivityLabel({ children }: { children: string }) {
  return (
    <TextShimmer
      as="span"
      duration={1.6}
      spread={1.2}
      className="inline-flex h-5 max-w-full items-center truncate align-top leading-5"
    >
      {children}
    </TextShimmer>
  )
}

function shouldAnimateActivity(
  item: MotionRuntimeActivityItem,
  isLive?: boolean,
  isActive?: boolean,
) {
  return Boolean(isLive && isActive)
}

function preserveChatScrollForManualDisclosure(target: HTMLElement): void {
  const scrollContainer = target.closest("[data-chat-container]") as HTMLElement | null
  if (!scrollContainer) return

  const scrollTop = scrollContainer.scrollTop
  scrollContainer.dispatchEvent(new CustomEvent("ripple:manual-disclosure-toggle", {
    detail: { scrollTop },
  }))

  requestAnimationFrame(() => {
    scrollContainer.scrollTop = scrollTop
    requestAnimationFrame(() => {
      scrollContainer.scrollTop = scrollTop
    })
  })
}

function activeTitleForItem(item: MotionRuntimeActivityItem): string {
  if (item.kind === "thinking") return "Thinking"
  if (item.kind === "explored") return item.title.replace(/^Explored/, "Exploring")
  if (item.kind === "visual_check") return "Looking"
  if (item.kind === "motion_change") return "Editing"
  if (item.kind === "verification") return item.title
    .replace(/^Verified/, "Verifying")
    .replace(/^Prepared export/, "Preparing export")
    .replace(/^Rendered preview/, "Rendering preview")
  if (item.kind === "approval") return "Approval needed"
  if (item.kind === "project_activity") return "Working on project"
  return item.title
}

function settledTitleForItem(item: MotionRuntimeActivityItem): string {
  if (item.kind === "thinking") return item.preview || item.title
  return item.title
}

function CollapsibleActivityItem({
  item,
  isLive,
  isActive,
}: {
  item: MotionRuntimeActivityItem
  isLive?: boolean
  isActive?: boolean
}) {
  const details = item.details ?? []
  const [isExpanded, setIsExpanded] = useState(item.defaultExpanded ?? false)
  const shouldShimmer = shouldAnimateActivity(item, isLive, isActive)
  const displayTitle = shouldShimmer ? activeTitleForItem(item) : settledTitleForItem(item)

  return (
    <div data-agent-motion-collapsible-activity="true">
      <div
        className={cn(
          "group flex h-5 cursor-pointer items-center px-2 text-xs leading-5",
          "transition-colors hover:text-muted-foreground",
        )}
        onClick={(event) => {
          preserveChatScrollForManualDisclosure(event.currentTarget)
          setIsExpanded((value) => !value)
        }}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 truncate font-medium text-muted-foreground">
            {shouldShimmer ? (
              <LiveActivityLabel>{displayTitle}</LiveActivityLabel>
            ) : (
              displayTitle
            )}
          </span>
          <ChevronRight
            className={cn(
              "mt-px h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform duration-200 ease-out",
              isExpanded && "rotate-90",
            )}
          />
        </span>
      </div>
      {isExpanded && details.length > 0 ? (
        <div className="mt-1 grid gap-1.5 px-2 pb-0.5">
          {details.map((detail) => {
            const shouldShimmerDetail = shouldShimmer && detail.status === "pending"
            return (
              <div key={detail.id} className="text-xs leading-5 text-muted-foreground/80">
                <span className="activity-detail-title">
                  {shouldShimmerDetail ? (
                    <LiveActivityLabel>{detail.label}</LiveActivityLabel>
                  ) : (
                    detail.label
                  )}
                </span>
                {detail.value ? (
                  <span className="ml-1 text-muted-foreground/50">{detail.value}</span>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function MotionActivityRow({
  item,
  isLive,
  isActive,
}: {
  item: MotionRuntimeActivityItem
  isLive?: boolean
  isActive?: boolean
}) {
  const shouldShimmer = shouldAnimateActivity(item, isLive, isActive)
  const subtitle = item.subtitle
  const displayTitle = shouldShimmer ? activeTitleForItem(item) : settledTitleForItem(item)

  return (
    <div
      className="flex h-5 items-center px-2 text-xs leading-5 text-muted-foreground"
      data-agent-motion-activity-row="true"
    >
      <span className={cn(
        "min-w-0 truncate font-medium",
        item.status === "error" && "text-destructive",
      )}>
        {shouldShimmer ? (
          <LiveActivityLabel>{displayTitle}</LiveActivityLabel>
        ) : (
          displayTitle
        )}
      </span>
      {subtitle ? (
        <span className="ml-2 min-w-0 truncate text-muted-foreground/50">{subtitle}</span>
      ) : null}
    </div>
  )
}

function ActivityItem({
  item,
  isLive,
  isActive,
}: {
  item: MotionRuntimeActivityItem
  isLive?: boolean
  isActive?: boolean
}) {
  const rowTitle = isActive || item.status === "pending"
    ? activeTitleForItem(item)
    : settledTitleForItem(item)
  const rowProps = {
    "data-agent-motion-row-id": item.id,
    "data-agent-motion-row-kind": item.kind,
    "data-agent-motion-row-status": item.status,
    "data-agent-motion-row-active": isActive ? "true" : "false",
    "data-agent-motion-row-title": rowTitle,
  }

  if (item.collapsible && item.details?.length) {
    return (
      <div {...rowProps}>
        <CollapsibleActivityItem item={item} isLive={isLive} isActive={isActive} />
      </div>
    )
  }

  return (
    <div {...rowProps}>
      <MotionActivityRow item={item} isLive={isLive} isActive={isActive} />
      <VisualPreview item={item} />
    </div>
  )
}

const TRAIL_COLLAPSE_THRESHOLD = 2

// A finished turn collapses to one Codex-style summary line ("Edited
// composition, looked, explored"), expandable to the full trail. Visual
// artifacts (frames/frame sheets) stay inside the opened trail.
function summarizeTrail(
  items: MotionRuntimeActivityItem[],
  activeItem?: MotionRuntimeActivityItem | null,
): string {
  const meaningful = items.filter((item) => item.kind !== "thinking" && item.kind !== "status")
  const source = meaningful.length > 0 ? meaningful : items
  const unique = Array.from(new Set(source.map((item) =>
    activeItem && item.id === activeItem.id ? activeTitleForItem(item) : item.title
  )))
  const shown = unique.slice(0, 4).map((title, index) => {
    if (index === 0) return title
    return title.charAt(0).toLowerCase() + title.slice(1)
  })
  const extra = unique.length - shown.length
  return `${shown.join(", ")}${extra > 0 ? `, +${extra} more` : ""}`
}

function ActivityDetailRow({
  detail,
  isLive,
  isActive,
}: {
  detail: MotionRuntimeActivityDetail
  isLive?: boolean
  isActive?: boolean
}) {
  const shouldShimmerDetail = Boolean(
    isLive && isActive && (detail.status ?? "done") === "pending",
  )

  return (
    <div
      data-agent-motion-detail-row="true"
      className="px-2 text-xs leading-5 text-muted-foreground/80"
    >
      <span className="activity-detail-title">
        {shouldShimmerDetail ? (
          <LiveActivityLabel>{detail.label}</LiveActivityLabel>
        ) : (
          detail.label
        )}
      </span>
      {detail.value ? (
        <span className="ml-1 text-muted-foreground/50">{detail.value}</span>
      ) : null}
    </div>
  )
}

function ActivityTrailVisualRow({
  item,
  isLive,
  isActive,
}: {
  item: MotionRuntimeActivityItem
  isLive?: boolean
  isActive?: boolean
}) {
  const shouldShimmer = shouldAnimateActivity(item, isLive, isActive)
  const displayTitle = shouldShimmer ? activeTitleForItem(item) : settledTitleForItem(item)

  return (
    <div
      data-agent-motion-row-id={item.id}
      data-agent-motion-row-kind={item.kind}
      data-agent-motion-row-status={item.status}
      data-agent-motion-row-active={isActive ? "true" : "false"}
      data-agent-motion-row-title={displayTitle}
    >
      <div
        data-agent-motion-detail-row="true"
        className="px-2 text-xs leading-5 text-muted-foreground/80"
      >
        <span className="activity-detail-title">
          {shouldShimmer ? (
            <LiveActivityLabel>{displayTitle}</LiveActivityLabel>
          ) : (
            displayTitle
          )}
        </span>
        {item.subtitle ? (
          <span className="ml-1 text-muted-foreground/50">{item.subtitle}</span>
        ) : null}
      </div>
      <VisualPreview item={item} />
    </div>
  )
}

function ActivityTrailPlainRow({
  item,
  isLive,
  isActive,
}: {
  item: MotionRuntimeActivityItem
  isLive?: boolean
  isActive?: boolean
}) {
  const shouldShimmer = shouldAnimateActivity(item, isLive, isActive)
  const displayTitle = shouldShimmer ? activeTitleForItem(item) : settledTitleForItem(item)

  return (
    <div
      data-agent-motion-row-id={item.id}
      data-agent-motion-row-kind={item.kind}
      data-agent-motion-row-status={item.status}
      data-agent-motion-row-active={isActive ? "true" : "false"}
      data-agent-motion-row-title={displayTitle}
    >
      <ActivityDetailRow
        detail={{
          id: `${item.id}-trail-detail`,
          label: displayTitle,
          value: item.subtitle,
          status: item.status,
        }}
        isLive={isLive}
        isActive={isActive}
      />
    </div>
  )
}

function ActivityTrailDetail({
  item,
  isLive,
  isActive,
}: {
  item: MotionRuntimeActivityItem
  isLive?: boolean
  isActive?: boolean
}) {
  if (item.details?.length) {
    return (
      <>
        {item.details.map((detail) => (
          <ActivityDetailRow
            key={detail.id}
            detail={detail}
            isLive={isLive}
            isActive={isActive}
          />
        ))}
      </>
    )
  }

  if (item.visual) {
    return <ActivityTrailVisualRow item={item} isLive={isLive} isActive={isActive} />
  }

  return <ActivityTrailPlainRow item={item} isLive={isLive} isActive={isActive} />
}

type ActivityListSegment =
  | {
      key: string
      kind: "activity"
      items: MotionRuntimeActivityItem[]
    }
  | {
      key: string
      kind: "thinking"
      item: MotionRuntimeActivityItem
    }

function ActivityGroup({
  items,
  isLive,
  activeItemId,
}: {
  items: MotionRuntimeActivityItem[]
  isLive?: boolean
  activeItemId?: string
}) {
  const [trailExpanded, setTrailExpanded] = useState(false)
  const activeItem = useMemo(() => {
    if (!isLive) return null
    return items.find((item) => item.id === activeItemId) ?? null
  }, [activeItemId, items, isLive])
  const isCollapsible =
    items.length >= TRAIL_COLLAPSE_THRESHOLD ||
    items.some((item) => item.visual || item.details?.length)
  const collapsedTitle = summarizeTrail(items, activeItem)
  const collapsedTitleShouldAnimate = Boolean(
    activeItem && shouldAnimateActivity(activeItem, isLive, true),
  )
  const collapsedRowItem = !trailExpanded && items.length === 1 ? items[0] : null
  const collapsedRowProps = collapsedRowItem
    ? {
      "data-agent-motion-row-id": collapsedRowItem.id,
      "data-agent-motion-row-kind": collapsedRowItem.kind,
      "data-agent-motion-row-status": collapsedRowItem.status,
      "data-agent-motion-row-active": collapsedRowItem.id === activeItemId ? "true" : "false",
      "data-agent-motion-row-title": collapsedTitle,
    }
    : {}

  if (!isCollapsible) {
    return (
      <>
        {items.map((item) => (
          <ActivityItem
            key={item.id}
            item={item}
            isLive={isLive}
            isActive={item.id === activeItemId}
          />
        ))}
      </>
    )
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          preserveChatScrollForManualDisclosure(event.currentTarget)
          setTrailExpanded((value) => !value)
        }}
        {...collapsedRowProps}
        className="group flex h-5 cursor-pointer items-center gap-2 px-2 text-xs leading-5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="min-w-0 truncate font-medium">
          {collapsedTitleShouldAnimate ? (
            <TextShimmer as="span" className="inline">
              {collapsedTitle}
            </TextShimmer>
          ) : collapsedTitle}
        </span>
        <ChevronRight
          className={cn(
            "mt-px h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform duration-200 ease-out",
            trailExpanded && "rotate-90",
          )}
        />
      </div>
      {trailExpanded ? (
        <div className="mt-0.5">
          {items.map((item) => (
            <ActivityTrailDetail
              key={item.id}
              item={item}
              isLive={isLive}
              isActive={item.id === activeItemId}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function buildActivityListSegments(items: MotionRuntimeActivityItem[]): ActivityListSegment[] {
  const segments: ActivityListSegment[] = []
  let activityBuffer: MotionRuntimeActivityItem[] = []

  const flushActivityBuffer = () => {
    if (activityBuffer.length === 0) return
    segments.push({
      key: activityBuffer.map((item) => item.id).join("|"),
      kind: "activity",
      items: activityBuffer,
    })
    activityBuffer = []
  }

  for (const item of items) {
    if (item.kind === "thinking") {
      flushActivityBuffer()
      segments.push({
        key: item.id,
        kind: "thinking",
        item,
      })
      continue
    }
    activityBuffer.push(item)
  }

  flushActivityBuffer()
  return segments
}

function ActivityList({
  items,
  isLive,
  activeItemId,
}: {
  items: MotionRuntimeActivityItem[]
  isLive?: boolean
  activeItemId?: string
}) {
  const segments = useMemo(() => buildActivityListSegments(items), [items])

  return (
    <div className="min-h-5">
      {segments.map((segment) => {
        if (segment.kind === "thinking") {
          return (
            <ActivityItem
              key={segment.key}
              item={segment.item}
              isLive={isLive}
              isActive={segment.item.id === activeItemId}
            />
          )
        }

        return (
          <ActivityGroup
            key={segment.key}
            items={segment.items}
            isLive={isLive}
            activeItemId={activeItemId}
          />
        )
      })}
    </div>
  )
}

export const AgentMotionRuntimeFeed = memo(function AgentMotionRuntimeFeed({
  parts,
  events,
  metadata,
  projectPath,
  isLive,
}: AgentMotionRuntimeFeedProps) {
  const projection = useMemo(
    () => buildMotionRuntimeActivity({ parts, events, metadata, projectPath }),
    [parts, events, metadata, projectPath],
  )
  const visibleItems = projection.items
  const activeItemId = activeMotionRuntimeItemId(projection.items, isLive)
  const dwellItemId = useLiveActivityDwell(visibleItems, isLive, activeItemId)
  const displayActiveItemId = activeItemId ?? dwellItemId

  if (visibleItems.length === 0) {
    return null
  }

  return (
    <div
      className="group/motion-feed relative"
      data-agent-motion-runtime-feed="true"
    >
      <ActivityList items={visibleItems} isLive={isLive} activeItemId={displayActiveItemId} />
    </div>
  )
})
