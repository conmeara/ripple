"use client"

import {
  AudioLines,
  Image as ImageIcon,
  Layers3,
  ScanLine,
  Type,
  Video,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type RippleTimelineClip,
  type RippleTimelineModel,
  type RippleTimelineRangeSelection,
  buildTimelineRangeSelection,
  clampRippleTimelineTime,
  formatTimelineTime,
  formatTimelineTimecode,
  generateTimelineTicks,
  getTimelineFitPixelsPerSecond,
  getTimelinePixelsPerSecond,
  getTimelinePlayheadLeft,
  groupTimelineClipsByTrack,
} from "../../../shared/hyperframes-timeline-model"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { cn } from "../../lib/utils"

interface HyperFramesTimelineProps {
  model: RippleTimelineModel | null
  isLoading?: boolean
  error?: string | null
  isReady: boolean
  currentTime: number
  duration: number
  subscribeLiveTime?: (listener: (time: number) => void) => () => void
  onSeek: (time: number) => void
  onSelectionChange?: (selection: RippleTimelineRangeSelection | null) => void
}

type TimelineZoomMode = "fit" | "manual"

const GUTTER_WIDTH = 36
const RULER_HEIGHT = 28
const TRACK_HEIGHT = 58
const TRACK_GAP = 0
const CLIP_INSET = 4
const MIN_CLIP_WIDTH = 8
const TIMELINE_TRAILING_PADDING = 24
const TIMELINE_VIEWPORT_HEIGHT = 274

function TimelineIconButton({
  label,
  active = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  active?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70 disabled:pointer-events-none disabled:opacity-40",
            active && "bg-foreground/5 text-foreground",
            className,
          )}
          {...props}
        >
          {children}
          <span className="sr-only">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

function kindIcon(clip: RippleTimelineClip): ReactNode {
  switch (clip.kind) {
    case "video":
      return <Video className="h-3 w-3" />
    case "audio":
      return <AudioLines className="h-3 w-3" />
    case "image":
      return <ImageIcon className="h-3 w-3" />
    case "composition":
      return <Layers3 className="h-3 w-3" />
    default:
      return <Type className="h-3 w-3" />
  }
}

function clipTheme(clip: RippleTimelineClip): string {
  return cn(
    "border-border/70 bg-muted/55 text-foreground hover:bg-muted/70",
    clip.kind === "composition" && "border-primary/35 bg-primary/10 hover:bg-primary/15",
  )
}

function isGenericNodeLabel(value: string | null | undefined): boolean {
  if (!value) return false
  return /^(?:node index \d+|__node__index_\d+)$/i.test(value.trim())
}

function clipTypeLabel(clip: RippleTimelineClip): string {
  if (clip.kind === "composition") {
    return (clip.compositionId ?? clip.label).replace(/[_\s]+/g, "-").toUpperCase()
  }

  const tagName = clip.tagName?.toLowerCase()
  if (tagName === "h1" || tagName === "h2" || tagName === "h3" || tagName === "p") {
    return "TEXT"
  }
  if (tagName) return tagName.toUpperCase()
  return clip.kind.toUpperCase()
}

function clipPrimaryLabel(clip: RippleTimelineClip, fps: number | undefined): string {
  if (isGenericNodeLabel(clip.label)) {
    const tagName = clip.tagName?.toLowerCase()
    if (tagName === "section" || tagName === "div" || tagName === "main") {
      return `${formatTimelineTimecode(clip.start, fps)} - ${formatTimelineTimecode(clip.start + clip.duration, fps)}`
    }
  }

  return clip.label
}

function trackLabel(clip: RippleTimelineClip | undefined): string {
  if (!clip) return "Track"
  if (clip.kind === "composition") return "Composition"
  const tagName = clip.tagName?.toLowerCase()
  if (tagName === "h1" || tagName === "h2" || tagName === "h3" || tagName === "p") return "Text"
  return clip.kind.charAt(0).toUpperCase() + clip.kind.slice(1)
}

function readResizeWidth(element: HTMLElement | null): number {
  return element?.getBoundingClientRect().width ?? 0
}

export function HyperFramesTimeline({
  model,
  isLoading = false,
  error,
  isReady,
  currentTime,
  duration,
  subscribeLiveTime,
  onSeek,
  onSelectionChange,
}: HyperFramesTimelineProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const playheadRef = useRef<HTMLDivElement | null>(null)
  const rangeAnchorRef = useRef<number | null>(null)
  const timelineDurationRef = useRef(0)
  const pixelsPerSecondRef = useRef(1)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [zoomMode, setZoomMode] = useState<TimelineZoomMode>("fit")
  const [manualZoomPercent, setManualZoomPercent] = useState(125)
  const [selectedClipKey, setSelectedClipKey] = useState<string | null>(null)
  const [rangeSelection, setRangeSelection] = useState<RippleTimelineRangeSelection | null>(null)
  const [isRangeSelecting, setIsRangeSelecting] = useState(false)

  const modelDuration = model?.durationSeconds ?? null
  const timelineDuration = modelDuration ?? (duration > 0 ? duration : null)
  const tracks = useMemo(
    () => groupTimelineClipsByTrack(model?.clips ?? []),
    [model?.clips],
  )
  const selectedClip = useMemo(() => {
    if (!selectedClipKey) return null

    for (const track of tracks) {
      const clip = track.clips.find((candidate) => candidate.key === selectedClipKey)
      if (clip) return clip
    }

    return null
  }, [selectedClipKey, tracks])
  const trackCount = Math.max(1, tracks.length)
  const contentHeight = RULER_HEIGHT + trackCount * (TRACK_HEIGHT + TRACK_GAP) + 14
  const canvasHeight = Math.max(TIMELINE_VIEWPORT_HEIGHT, contentHeight)
  const fitPixelsPerSecond = getTimelineFitPixelsPerSecond({
    duration: timelineDuration ?? 0,
    viewportWidth,
    gutterWidth: GUTTER_WIDTH,
    trailingPadding: TIMELINE_TRAILING_PADDING,
  })
  const pixelsPerSecond = getTimelinePixelsPerSecond({
    fitPixelsPerSecond,
    zoomMode,
    manualZoomPercent,
  })
  const canvasWidth = Math.max(
    viewportWidth,
    GUTTER_WIDTH + (timelineDuration ?? 0) * pixelsPerSecond + TIMELINE_TRAILING_PADDING,
  )
  const ticks = useMemo(
    () => generateTimelineTicks(timelineDuration ?? 0),
    [timelineDuration],
  )
  const playheadLeft = getTimelinePlayheadLeft({
    time: clampRippleTimelineTime(currentTime, timelineDuration),
    pixelsPerSecond,
    gutterWidth: GUTTER_WIDTH,
  })
  timelineDurationRef.current = timelineDuration ?? 0
  pixelsPerSecondRef.current = pixelsPerSecond

  const syncPlayheadPosition = useCallback((time: number) => {
    const liveDuration = timelineDurationRef.current
    if (!playheadRef.current || liveDuration <= 0) return

    playheadRef.current.style.left = `${getTimelinePlayheadLeft({
      time: clampRippleTimelineTime(time, liveDuration),
      pixelsPerSecond: pixelsPerSecondRef.current,
      gutterWidth: GUTTER_WIDTH,
    })}px`
  }, [])

  useEffect(() => {
    syncPlayheadPosition(currentTime)
  }, [currentTime, pixelsPerSecond, syncPlayheadPosition, timelineDuration])

  useEffect(() => subscribeLiveTime?.(syncPlayheadPosition), [
    subscribeLiveTime,
    syncPlayheadPosition,
  ])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    setViewportWidth(readResizeWidth(root))
    const observer = new ResizeObserver(() => {
      setViewportWidth(readResizeWidth(root))
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    onSelectionChange?.(rangeSelection)
  }, [onSelectionChange, rangeSelection])

  useEffect(() => {
    if (!model) {
      setSelectedClipKey(null)
      setRangeSelection(null)
      onSelectionChange?.(null)
    }
  }, [model, onSelectionChange])

  const readPointerTime = (clientX: number): number | null => {
    const scroll = scrollRef.current
    if (!scroll || !timelineDuration) return null
    const rect = scroll.getBoundingClientRect()
    const x = clientX - rect.left + scroll.scrollLeft - GUTTER_WIDTH
    return clampRippleTimelineTime(x / Math.max(1, pixelsPerSecond), timelineDuration)
  }

  const updateRangeSelection = (anchor: number, nextTime: number, clip?: RippleTimelineClip | null) => {
    if (!model) return
    const selection = buildTimelineRangeSelection({
      projectId: model.projectId,
      compositionId: model.compositionId,
      source: model.source,
      confidence: clip?.confidence ?? (model.source === "runtime-manifest" ? "authoritative" : "static"),
      startTime: anchor,
      endTime: nextTime,
      fps: model.fps,
      clip,
    })
    setRangeSelection(selection)
  }

  const handleTimelinePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!timelineDuration || !isReady) return
    const time = readPointerTime(event.clientX)
    if (time === null) return

    event.currentTarget.setPointerCapture(event.pointerId)
    onSeek(time)
    setSelectedClipKey(null)
    if (event.shiftKey) {
      rangeAnchorRef.current = time
      setIsRangeSelecting(true)
      updateRangeSelection(time, time, null)
    } else {
      setRangeSelection(null)
    }
  }

  const handleTimelinePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isRangeSelecting || rangeAnchorRef.current === null) return
    const time = readPointerTime(event.clientX)
    if (time === null) return
    updateRangeSelection(rangeAnchorRef.current, time, selectedClip)
  }

  const handleTimelinePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (isRangeSelecting && rangeAnchorRef.current !== null) {
      const time = readPointerTime(event.clientX)
      if (time !== null) updateRangeSelection(rangeAnchorRef.current, time, selectedClip)
    }

    rangeAnchorRef.current = null
    setIsRangeSelecting(false)
  }

  const handleClipPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    clip: RippleTimelineClip,
  ) => {
    event.stopPropagation()
    if (!isReady) return
    event.currentTarget.setPointerCapture(event.pointerId)
    onSeek(clip.start)
    setSelectedClipKey(clip.key)

    if (event.shiftKey) {
      rangeAnchorRef.current = clip.start
      setIsRangeSelecting(true)
      updateRangeSelection(clip.start, clip.start + clip.duration, clip)
    } else {
      updateRangeSelection(clip.start, clip.start + clip.duration, clip)
    }
  }

  const handleClipPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
    clip: RippleTimelineClip,
  ) => {
    if (!isRangeSelecting || rangeAnchorRef.current === null) return
    event.stopPropagation()
    const time = readPointerTime(event.clientX)
    if (time !== null) updateRangeSelection(rangeAnchorRef.current, time, clip)
  }

  const handleClipPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    rangeAnchorRef.current = null
    setIsRangeSelecting(false)
  }

  const zoomIn = () => {
    setZoomMode("manual")
    setManualZoomPercent((current) => Math.min(800, Math.round(current * 1.25)))
  }
  const zoomOut = () => {
    setZoomMode("manual")
    setManualZoomPercent((current) => Math.max(25, Math.round(current * 0.8)))
  }

  return (
    <div
      ref={rootRef}
      className="-mx-3 mt-1.5 h-[310px] overflow-hidden bg-background"
    >
      <div className="flex h-9 items-center border-b border-border/55 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-xs font-medium text-foreground">Timeline</div>
        </div>

        <div className="ml-auto flex min-w-fit items-center gap-1">
          <TimelineIconButton
            label="Fit timeline"
            active={zoomMode === "fit"}
            onClick={() => setZoomMode("fit")}
            disabled={!timelineDuration}
          >
            <ScanLine className="h-3.5 w-3.5" />
          </TimelineIconButton>
          <TimelineIconButton
            label="Zoom out"
            onClick={zoomOut}
            disabled={!timelineDuration}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </TimelineIconButton>
          <TimelineIconButton
            label="Zoom in"
            onClick={zoomIn}
            disabled={!timelineDuration}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </TimelineIconButton>
        </div>
      </div>

      <div className="relative h-[274px]">
        <div
          ref={scrollRef}
          className={cn(
            "h-full overflow-y-auto",
            zoomMode === "fit" ? "overflow-x-hidden" : "overflow-x-auto",
          )}
          onPointerDown={handleTimelinePointerDown}
          onPointerMove={handleTimelinePointerMove}
          onPointerUp={handleTimelinePointerUp}
          onPointerCancel={handleTimelinePointerUp}
        >
          <div
            className="relative"
            style={{
              width: `${canvasWidth}px`,
              height: `${canvasHeight}px`,
            }}
          >
            <div
              className="sticky left-0 top-0 z-20 flex h-7 items-center justify-center border-r border-border/45 bg-background/95 text-[10px] uppercase tracking-normal text-muted-foreground"
              aria-hidden="true"
              style={{ width: GUTTER_WIDTH }}
            />

            <div
              className="absolute top-0 h-7 border-b border-border/55"
              style={{ left: GUTTER_WIDTH, width: canvasWidth - GUTTER_WIDTH }}
            >
              {ticks.minor.map((tick) => (
                <div
                  key={`minor-${tick}`}
                  className="absolute bottom-0 h-2 w-px bg-border/55"
                  style={{ left: tick * pixelsPerSecond }}
                />
              ))}
              {ticks.major.map((tick) => (
                <div
                  key={`major-${tick}`}
                  className="absolute bottom-0 h-3.5 w-px bg-muted-foreground/45"
                  style={{ left: tick * pixelsPerSecond }}
                >
                  <span className="absolute bottom-3 left-1 text-[10px] tabular-nums text-muted-foreground">
                    {formatTimelineTime(tick)}
                  </span>
                </div>
              ))}
            </div>

            {tracks.map((track, index) => {
              const top = RULER_HEIGHT + index * (TRACK_HEIGHT + TRACK_GAP)
              const firstClip = track.clips[0]
              return (
                <div
                  key={track.track}
                  className="absolute left-0 right-0 border-b border-border/45"
                  style={{ top, height: TRACK_HEIGHT }}
                >
                  <div
                    className="sticky left-0 z-10 flex h-full items-center justify-center border-r border-border/45 bg-background/95 text-muted-foreground"
                    style={{ width: GUTTER_WIDTH }}
                  >
                    <div className="flex h-5 w-5 items-center justify-center rounded-md border border-border/60 bg-muted/45">
                      {firstClip ? kindIcon(firstClip) : <Type className="h-3 w-3" />}
                    </div>
                    <span className="sr-only">{trackLabel(firstClip)}</span>
                  </div>
                  <div
                    className="absolute inset-y-0 bg-muted/15"
                    style={{ left: GUTTER_WIDTH, width: canvasWidth - GUTTER_WIDTH }}
                  />
                  {track.clips.map((clip) => {
                    const selected = selectedClipKey === clip.key
                    const clipStyle = {
                      left: GUTTER_WIDTH + clip.start * pixelsPerSecond,
                      width: Math.max(MIN_CLIP_WIDTH, clip.duration * pixelsPerSecond),
                      top: CLIP_INSET,
                      height: TRACK_HEIGHT - CLIP_INSET * 2,
                    } satisfies CSSProperties

                    return (
                      <button
                        key={clip.key}
                        type="button"
                        className={cn(
                          "absolute flex flex-col justify-between overflow-hidden rounded-md border px-2 py-2 text-left shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70",
                          clipTheme(clip),
                          selected && "ring-2 ring-primary/70 ring-offset-1 ring-offset-background",
                        )}
                        style={clipStyle}
                        onPointerDown={(event) => handleClipPointerDown(event, clip)}
                        onPointerMove={(event) => handleClipPointerMove(event, clip)}
                        onPointerUp={handleClipPointerUp}
                        onPointerCancel={handleClipPointerUp}
                      >
                        <span className="max-w-full truncate rounded border border-border/45 bg-background/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-normal text-muted-foreground">
                          {clipTypeLabel(clip)}
                        </span>
                        <span className="max-w-full truncate text-[10px] font-medium leading-none text-foreground/85">
                          {clipPrimaryLabel(clip, model?.fps)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}

            {rangeSelection && timelineDuration ? (
              <div
                className="pointer-events-none absolute top-7 z-30 rounded-sm border border-primary/45 bg-primary/18"
                style={{
                  left: GUTTER_WIDTH + rangeSelection.startTime * pixelsPerSecond,
                  width: Math.max(
                    2,
                    (rangeSelection.endTime - rangeSelection.startTime) * pixelsPerSecond,
                  ),
                  height: canvasHeight - RULER_HEIGHT - 7,
                }}
              />
            ) : null}

            {timelineDuration ? (
              <div
                ref={playheadRef}
                className="pointer-events-none absolute top-0 z-40 w-px bg-primary"
                style={{
                  left: playheadLeft,
                  height: canvasHeight,
                }}
              >
                <div className="absolute -left-[5px] top-0 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-primary" />
              </div>
            ) : null}
          </div>
        </div>

        {isLoading || error || !model || model.clips.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/76 p-4 text-center backdrop-blur-[1px]">
            <div className="max-w-xs">
              <div className="text-sm font-medium text-foreground">
                {error ? "Timeline unavailable" : isLoading ? "Reading timeline" : "No clips found"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {error ?? (isLoading ? "Ripple is preparing the clip model." : "The player is still usable.")}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {rangeSelection ? (
        <span className="sr-only">
          {formatTimelineTimecode(rangeSelection.startTime, model?.fps)} - {formatTimelineTimecode(rangeSelection.endTime, model?.fps)}
        </span>
      ) : null}
    </div>
  )
}
