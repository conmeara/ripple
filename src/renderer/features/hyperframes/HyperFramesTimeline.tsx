"use client"

import {
  AudioLines,
  Captions,
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
  DragEvent as ReactDragEvent,
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
  getTimelineFrameIndicator,
  getTimelineFitPixelsPerSecond,
  getTimelinePixelsPerSecond,
  getTimelinePlayheadLeft,
  groupTimelineClipsByTrack,
  sortTimelineClips,
} from "../../../shared/hyperframes-timeline-model"
import {
  HYPERFRAMES_TIMELINE_ASSET_MIME,
  RIPPLE_TIMELINE_ASSET_MIME,
  resolveTimelineAssetDrop,
  resolveTimelineMove,
  resolveTimelineResize,
  timelineClipEditCapabilities,
} from "../../../shared/hyperframes-timeline-editing"
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
  onAssetDrop?: (assetPath: string, placement: { start: number; track: number }) => void | Promise<void>
  onClipUpdate?: (
    clip: RippleTimelineClip,
    updates: {
      start: number
      duration: number
      track: number
      playbackStart?: number
    },
  ) => void | Promise<void>
}

type TimelineZoomMode = "fit" | "manual"

const GUTTER_WIDTH = 36
const RULER_HEIGHT = 28
const TRACK_HEIGHT = 58
const TRACK_GAP = 0
const CLIP_INSET = 4
const MIN_CLIP_WIDTH = 8
const CLIP_HANDLE_WIDTH = 18
const CLIP_MOVE_THRESHOLD = 4
const CLIP_RESIZE_THRESHOLD = 2
const CLIP_COMMIT_EPSILON = 0.005
const TIMELINE_TRAILING_PADDING = 24
const TIMELINE_VIEWPORT_HEIGHT = 274

type TimelineClipEditState =
  | {
    kind: "move"
    clip: RippleTimelineClip
    originClientX: number
    originClientY: number
    originScrollLeft: number
    originScrollTop: number
    previewStart: number
    previewTrack: number
    started: boolean
    isCommitting?: boolean
    commitId?: number
  }
  | {
    kind: "resize"
    clip: RippleTimelineClip
    edge: "start" | "end"
    originClientX: number
    previewStart: number
    previewDuration: number
    previewPlaybackStart?: number
    started: boolean
    isCommitting?: boolean
    commitId?: number
  }

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
    case "caption":
      return <Captions className="h-3 w-3" />
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
    clip.kind === "caption" && "border-emerald-400/35 bg-emerald-500/10 hover:bg-emerald-500/15",
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
  if (clip.kind === "caption") return "CAPTION"

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
  if (clip.kind === "caption") return "Captions"
  if (clip.kind === "composition") return "Composition"
  const tagName = clip.tagName?.toLowerCase()
  if (tagName === "h1" || tagName === "h2" || tagName === "h3" || tagName === "p") return "Text"
  return clip.kind.charAt(0).toUpperCase() + clip.kind.slice(1)
}

function readResizeWidth(element: HTMLElement | null): number {
  return element?.getBoundingClientRect().width ?? 0
}

function timelineSecondsEqual(a: number | undefined, b: number | undefined): boolean {
  return Math.abs((a ?? 0) - (b ?? 0)) <= CLIP_COMMIT_EPSILON
}

function timelineClipMatchesEditTarget(
  candidate: RippleTimelineClip,
  edit: TimelineClipEditState,
): boolean {
  if (candidate.key === edit.clip.key) return true
  if (edit.clip.sourceFile && candidate.sourceFile !== edit.clip.sourceFile) return false
  if (edit.clip.domId && candidate.domId === edit.clip.domId) return true
  if (
    edit.clip.selector &&
    candidate.selector === edit.clip.selector &&
    candidate.selectorIndex === edit.clip.selectorIndex
  ) {
    return true
  }

  const editTag = edit.clip.tagName?.toLowerCase() ?? null
  const candidateTag = candidate.tagName?.toLowerCase() ?? null
  const editLabel = edit.clip.label.trim().toLowerCase()
  const candidateLabel = candidate.label.trim().toLowerCase()
  return Boolean(editLabel && candidateLabel && editLabel === candidateLabel) &&
    (!editTag || !candidateTag || editTag === candidateTag)
}

function findTimelineClipWithAppliedEdit(
  clips: RippleTimelineClip[],
  edit: TimelineClipEditState,
): RippleTimelineClip | null {
  return clips.find((candidate) => {
    if (!timelineClipMatchesEditTarget(candidate, edit)) return false

    if (edit.kind === "move") {
      return timelineSecondsEqual(candidate.start, edit.previewStart) &&
        timelineSecondsEqual(candidate.duration, edit.clip.duration) &&
        candidate.track === edit.previewTrack
    }

    return timelineSecondsEqual(candidate.start, edit.previewStart) &&
      timelineSecondsEqual(candidate.duration, edit.previewDuration) &&
      candidate.track === edit.clip.track &&
      timelineSecondsEqual(candidate.playbackStart, edit.previewPlaybackStart)
  }) ?? null
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
  onAssetDrop,
  onClipUpdate,
}: HyperFramesTimelineProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const playheadRef = useRef<HTMLDivElement | null>(null)
  const frameIndicatorRef = useRef<HTMLDivElement | null>(null)
  const rangeAnchorRef = useRef<number | null>(null)
  const timelineDurationRef = useRef(0)
  const pixelsPerSecondRef = useRef(1)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [zoomMode, setZoomMode] = useState<TimelineZoomMode>("fit")
  const [manualZoomPercent, setManualZoomPercent] = useState(125)
  const [selectedClipKey, setSelectedClipKey] = useState<string | null>(null)
  const [rangeSelection, setRangeSelection] = useState<RippleTimelineRangeSelection | null>(null)
  const [isRangeSelecting, setIsRangeSelecting] = useState(false)
  const [assetDropPlacement, setAssetDropPlacement] = useState<{
    start: number
    track: number
  } | null>(null)
  const [clipEditState, setClipEditState] = useState<TimelineClipEditState | null>(null)
  const clipEditStateRef = useRef<TimelineClipEditState | null>(null)
  const clipEditCommitIdRef = useRef(0)

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
  const trackOrder = useMemo(
    () => tracks.map((track) => track.track),
    [tracks],
  )
  const activeMoveEdit =
    clipEditState?.kind === "move" && clipEditState.started ? clipEditState : null
  const displayTrackOrder = useMemo(() => {
    if (
      !activeMoveEdit ||
      trackOrder.length === 0 ||
      trackOrder.includes(activeMoveEdit.previewTrack)
    ) {
      return trackOrder
    }

    return [...trackOrder, activeMoveEdit.previewTrack].sort((a, b) => a - b)
  }, [activeMoveEdit, trackOrder])
  const tracksByNumber = useMemo(
    () => new Map(tracks.map((track) => [track.track, track])),
    [tracks],
  )
  const displayTracks = useMemo(() => {
    return displayTrackOrder.map((trackNumber) => {
      const baseTrack = tracksByNumber.get(trackNumber)
      const clips = baseTrack?.clips ?? []
      if (!activeMoveEdit) {
        return {
          track: trackNumber,
          clips,
          label: baseTrack?.label ?? `Track ${trackNumber + 1}`,
        }
      }

      const filteredClips = clips.filter((clip) => clip.key !== activeMoveEdit.clip.key)
      const nextClips = trackNumber === activeMoveEdit.previewTrack
        ? sortTimelineClips([
            ...filteredClips,
            {
              ...activeMoveEdit.clip,
              start: activeMoveEdit.previewStart,
              track: activeMoveEdit.previewTrack,
            },
          ])
        : filteredClips

      return {
        track: trackNumber,
        clips: nextClips,
        label: baseTrack?.label ?? `Track ${trackNumber + 1}`,
      }
    })
  }, [activeMoveEdit, displayTrackOrder, tracksByNumber])
  const contentHeight =
    RULER_HEIGHT + Math.max(1, displayTracks.length) * (TRACK_HEIGHT + TRACK_GAP) + 14
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
  const frameIndicator = getTimelineFrameIndicator({
    time: currentTime,
    duration: timelineDuration,
    fps: model?.fps,
  })
  timelineDurationRef.current = timelineDuration ?? 0
  pixelsPerSecondRef.current = pixelsPerSecond
  clipEditStateRef.current = clipEditState

  const syncFrameIndicator = useCallback((time: number) => {
    if (!frameIndicatorRef.current) return
    const indicator = getTimelineFrameIndicator({
      time,
      duration: timelineDurationRef.current,
      fps: model?.fps,
    })
    frameIndicatorRef.current.textContent = indicator.label
    frameIndicatorRef.current.setAttribute("aria-label", `${indicator.label}, ${indicator.timecode}`)
  }, [model?.fps])

  const syncPlayheadPosition = useCallback((time: number) => {
    const liveDuration = timelineDurationRef.current
    if (!playheadRef.current || liveDuration <= 0) return

    playheadRef.current.style.left = `${getTimelinePlayheadLeft({
      time: clampRippleTimelineTime(time, liveDuration),
      pixelsPerSecond: pixelsPerSecondRef.current,
      gutterWidth: GUTTER_WIDTH,
    })}px`
    syncFrameIndicator(time)
  }, [syncFrameIndicator])

  useEffect(() => {
    syncPlayheadPosition(currentTime)
    syncFrameIndicator(currentTime)
  }, [currentTime, pixelsPerSecond, syncFrameIndicator, syncPlayheadPosition, timelineDuration])

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
      setClipEditState(null)
      onSelectionChange?.(null)
    }
  }, [model, onSelectionChange])

  const setActiveClipEditState = useCallback((state: TimelineClipEditState | null) => {
    clipEditStateRef.current = state
    setClipEditState(state)
  }, [])

  useEffect(() => {
    const edit = clipEditState
    if (!edit?.isCommitting || !model) return

    const refreshedClip = findTimelineClipWithAppliedEdit(model.clips, edit)
    if (!refreshedClip) return
    setActiveClipEditState(null)
  }, [clipEditState, model, setActiveClipEditState])

  const readPointerTime = (clientX: number): number | null => {
    const scroll = scrollRef.current
    if (!scroll || !timelineDuration) return null
    const rect = scroll.getBoundingClientRect()
    const x = clientX - rect.left + scroll.scrollLeft - GUTTER_WIDTH
    return clampRippleTimelineTime(x / Math.max(1, pixelsPerSecond), timelineDuration)
  }

  const readAssetPath = (dataTransfer: DataTransfer): string | null => {
    const ripplePayload = dataTransfer.getData(RIPPLE_TIMELINE_ASSET_MIME)
    if (ripplePayload) {
      try {
        const parsed = JSON.parse(ripplePayload) as { relativePath?: unknown }
        if (typeof parsed.relativePath === "string" && parsed.relativePath.trim()) {
          return parsed.relativePath
        }
      } catch {
        return ripplePayload
      }
    }

    const hyperframesPayload = dataTransfer.getData(HYPERFRAMES_TIMELINE_ASSET_MIME)
    if (hyperframesPayload.trim()) return hyperframesPayload
    const plain = dataTransfer.getData("text/plain")
    return plain.startsWith("assets/") ? plain : null
  }

  const hasAssetDragData = (dataTransfer: DataTransfer): boolean => {
    const types = Array.from(dataTransfer.types)
    return (
      types.includes(RIPPLE_TIMELINE_ASSET_MIME) ||
      types.includes(HYPERFRAMES_TIMELINE_ASSET_MIME)
    )
  }

  const readAssetDropPlacement = (
    event: ReactDragEvent<HTMLDivElement>,
  ): { start: number; track: number } | null => {
    const scroll = scrollRef.current
    if (!scroll || !timelineDuration) return null
    const rect = scroll.getBoundingClientRect()
    return resolveTimelineAssetDrop({
      rectLeft: rect.left,
      rectTop: rect.top,
      scrollLeft: scroll.scrollLeft,
      scrollTop: scroll.scrollTop,
      pixelsPerSecond,
      duration: timelineDuration,
      trackHeight: TRACK_HEIGHT + TRACK_GAP,
      trackOrder,
      gutterWidth: GUTTER_WIDTH,
      rulerHeight: RULER_HEIGHT,
    }, event.clientX, event.clientY)
  }

  const updateRangeSelection = useCallback((anchor: number, nextTime: number, clip?: RippleTimelineClip | null) => {
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
  }, [model])

  const updateClipEditPreview = useCallback((clientX: number, clientY: number): boolean => {
    const edit = clipEditStateRef.current
    if (!edit || !timelineDurationRef.current || !onClipUpdate) return false
    if (edit.isCommitting) return true

    if (edit.kind === "move") {
      const distance = Math.hypot(
        clientX - edit.originClientX,
        clientY - edit.originClientY,
      )
      if (!edit.started && distance < CLIP_MOVE_THRESHOLD) return true

      const nextMove = resolveTimelineMove({
        start: edit.clip.start,
        duration: edit.clip.duration,
        track: edit.clip.track,
        originClientX: edit.originClientX,
        originClientY: edit.originClientY,
        originScrollLeft: edit.originScrollLeft,
        originScrollTop: edit.originScrollTop,
        currentScrollLeft: scrollRef.current?.scrollLeft ?? edit.originScrollLeft,
        currentScrollTop: scrollRef.current?.scrollTop ?? edit.originScrollTop,
        pixelsPerSecond: pixelsPerSecondRef.current,
        trackHeight: TRACK_HEIGHT + TRACK_GAP,
        maxStart: Math.max(0, timelineDurationRef.current - edit.clip.duration),
        trackOrder,
      }, clientX, clientY)
      setRangeSelection(null)
      setActiveClipEditState({
        ...edit,
        previewStart: nextMove.start,
        previewTrack: nextMove.track,
        started: true,
      })
      return true
    }

    const distance = Math.abs(clientX - edit.originClientX)
    if (!edit.started && distance < CLIP_RESIZE_THRESHOLD) return true

    const sourceRemaining = edit.clip.sourceDuration != null
      ? Math.max(0, edit.clip.sourceDuration - (edit.clip.playbackStart ?? 0))
      : Number.POSITIVE_INFINITY
    const normalizedTag = edit.clip.tagName?.toLowerCase() ?? ""
    const canSeedPlaybackStart =
      edit.edge === "start" &&
      (normalizedTag === "audio" || normalizedTag === "video" || edit.clip.playbackStart != null)
    const nextResize = resolveTimelineResize({
      start: edit.clip.start,
      duration: edit.clip.duration,
      originClientX: edit.originClientX,
      pixelsPerSecond: pixelsPerSecondRef.current,
      minStart: 0,
      maxEnd: Math.min(
        timelineDurationRef.current,
        edit.clip.start + sourceRemaining,
      ),
      playbackStart: edit.edge === "start" && canSeedPlaybackStart
        ? (edit.clip.playbackStart ?? 0)
        : edit.clip.playbackStart,
      seedPlaybackStart: edit.edge === "start" && canSeedPlaybackStart,
    }, edit.edge, clientX)
    setRangeSelection(null)
    setActiveClipEditState({
      ...edit,
      previewStart: nextResize.start,
      previewDuration: nextResize.duration,
      previewPlaybackStart: nextResize.playbackStart,
      started: true,
    })
    return true
  }, [
    onClipUpdate,
    setActiveClipEditState,
    trackOrder,
  ])

  const finishClipEdit = useCallback((): boolean => {
    const edit = clipEditStateRef.current
    if (!edit) return false
    if (edit.isCommitting) return true
    if (!edit.started || !onClipUpdate) {
      setActiveClipEditState(null)
      return true
    }

    const clearCommittedEdit = (commitId: number) => {
      const currentEdit = clipEditStateRef.current
      if (currentEdit?.isCommitting && currentEdit.commitId === commitId) {
        setActiveClipEditState(null)
      }
    }

    if (edit.kind === "move") {
      const hasChanged =
        edit.previewStart !== edit.clip.start || edit.previewTrack !== edit.clip.track
      if (!hasChanged) {
        setActiveClipEditState(null)
        return true
      }
      const commitId = clipEditCommitIdRef.current + 1
      clipEditCommitIdRef.current = commitId
      setActiveClipEditState({ ...edit, isCommitting: true, commitId })
      try {
        const result = onClipUpdate(edit.clip, {
          start: edit.previewStart,
          duration: edit.clip.duration,
          track: edit.previewTrack,
          playbackStart: edit.clip.playbackStart,
        })
        void Promise.resolve(result).catch(() => clearCommittedEdit(commitId))
      } catch {
        clearCommittedEdit(commitId)
      }
      return true
    }

    const hasChanged =
      edit.previewStart !== edit.clip.start ||
      edit.previewDuration !== edit.clip.duration ||
      edit.previewPlaybackStart !== edit.clip.playbackStart
    if (!hasChanged) {
      setActiveClipEditState(null)
      return true
    }

    const commitId = clipEditCommitIdRef.current + 1
    clipEditCommitIdRef.current = commitId
    setActiveClipEditState({ ...edit, isCommitting: true, commitId })
    try {
      const result = onClipUpdate(edit.clip, {
        start: edit.previewStart,
        duration: edit.previewDuration,
        track: edit.clip.track,
        playbackStart: edit.previewPlaybackStart,
      })
      void Promise.resolve(result).catch(() => clearCommittedEdit(commitId))
    } catch {
      clearCommittedEdit(commitId)
    }
    return true
  }, [
    onClipUpdate,
    setActiveClipEditState,
  ])

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
    event.preventDefault()
    event.stopPropagation()
    if (!isReady) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedClipKey(clip.key)

    if (event.shiftKey) {
      rangeAnchorRef.current = clip.start
      setIsRangeSelecting(true)
      updateRangeSelection(clip.start, clip.start + clip.duration, clip)
      return
    }

    setRangeSelection(null)

    const capabilities = timelineClipEditCapabilities(clip)
    if (!onClipUpdate || !capabilities.canMove) return

    setActiveClipEditState({
      kind: "move",
      clip,
      originClientX: event.clientX,
      originClientY: event.clientY,
      originScrollLeft: scrollRef.current?.scrollLeft ?? 0,
      originScrollTop: scrollRef.current?.scrollTop ?? 0,
      previewStart: clip.start,
      previewTrack: clip.track,
      started: false,
    })
  }

  const handleClipResizePointerDown = (
    event: ReactPointerEvent<HTMLSpanElement>,
    clip: RippleTimelineClip,
    edge: "start" | "end",
  ) => {
    event.preventDefault()
    event.stopPropagation()
    if (!isReady || !onClipUpdate) return

    const capabilities = timelineClipEditCapabilities(clip)
    if (edge === "start" && !capabilities.canTrimStart) return
    if (edge === "end" && !capabilities.canTrimEnd) return

    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedClipKey(clip.key)
    setRangeSelection(null)
    setActiveClipEditState({
      kind: "resize",
      clip,
      edge,
      originClientX: event.clientX,
      previewStart: clip.start,
      previewDuration: clip.duration,
      previewPlaybackStart: clip.playbackStart,
      started: false,
    })
  }

  const handleClipPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
    clip: RippleTimelineClip,
  ) => {
    if (updateClipEditPreview(event.clientX, event.clientY)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (!isRangeSelecting || rangeAnchorRef.current === null) return
    event.stopPropagation()
    const time = readPointerTime(event.clientX)
    if (time !== null) updateRangeSelection(rangeAnchorRef.current, time, clip)
  }

  const handleClipPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const handledEdit = finishClipEdit()
    if (handledEdit) {
      event.preventDefault()
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    rangeAnchorRef.current = null
    setIsRangeSelecting(false)
  }

  const handleClipResizePointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!updateClipEditPreview(event.clientX, event.clientY)) return
    event.preventDefault()
    event.stopPropagation()
  }

  const handleClipResizePointerUp = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const handledEdit = finishClipEdit()
    if (handledEdit) {
      event.preventDefault()
    }
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    rangeAnchorRef.current = null
    setIsRangeSelecting(false)
  }

  useEffect(() => {
    if (!timelineDuration || !onClipUpdate) return

    const handleWindowPointerMove = (event: PointerEvent) => {
      updateClipEditPreview(event.clientX, event.clientY)
    }

    window.addEventListener("pointermove", handleWindowPointerMove, { capture: true })
    window.addEventListener("pointerup", finishClipEdit, { capture: true })
    window.addEventListener("pointercancel", finishClipEdit, { capture: true })
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove, { capture: true })
      window.removeEventListener("pointerup", finishClipEdit, { capture: true })
      window.removeEventListener("pointercancel", finishClipEdit, { capture: true })
    }
  }, [
    finishClipEdit,
    onClipUpdate,
    timelineDuration,
    updateClipEditPreview,
  ])

  const zoomIn = () => {
    setZoomMode("manual")
    setManualZoomPercent((current) => Math.min(800, Math.round(current * 1.25)))
  }
  const zoomOut = () => {
    setZoomMode("manual")
    setManualZoomPercent((current) => Math.max(25, Math.round(current * 0.8)))
  }

  const handleAssetDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!onAssetDrop || !timelineDuration || !isReady) return
    if (!hasAssetDragData(event.dataTransfer)) return
    const placement = readAssetDropPlacement(event)
    if (!placement) return

    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
    setAssetDropPlacement(placement)
  }

  const handleAssetDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
    setAssetDropPlacement(null)
  }

  const handleAssetDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!onAssetDrop || !timelineDuration || !isReady) return
    const assetPath = readAssetPath(event.dataTransfer)
    if (!assetPath) return
    const placement = readAssetDropPlacement(event)
    if (!placement) return

    event.preventDefault()
    setAssetDropPlacement(null)
    void onAssetDrop(assetPath, placement)
  }

  const assetDropTrackIndex = assetDropPlacement
    ? trackOrder.indexOf(assetDropPlacement.track)
    : -1
  const assetDropVisualTrackIndex = assetDropPlacement
    ? assetDropTrackIndex >= 0 ? assetDropTrackIndex : trackOrder.length
    : 0

  return (
    <div
      ref={rootRef}
      className="-mx-3 mt-1.5 h-[310px] overflow-hidden bg-background"
    >
      <div className="flex h-9 items-center border-b border-border/55 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-xs font-medium text-foreground">Timeline</div>
          <div
            ref={frameIndicatorRef}
            className="min-w-[5.5rem] rounded border border-border/55 bg-muted/35 px-1.5 py-0.5 text-center text-[10px] tabular-nums text-muted-foreground"
            aria-label={`${frameIndicator.label}, ${frameIndicator.timecode}`}
          >
            {frameIndicator.label}
          </div>
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
          onDragOver={handleAssetDragOver}
          onDragLeave={handleAssetDragLeave}
          onDrop={handleAssetDrop}
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

            {displayTracks.map((track, index) => {
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
                    <span className="sr-only">{track.label || trackLabel(firstClip)}</span>
                  </div>
                  <div
                    className="absolute inset-y-0 bg-muted/15"
                    style={{ left: GUTTER_WIDTH, width: canvasWidth - GUTTER_WIDTH }}
                  />
                  {track.clips.map((clip) => {
                    const selected = selectedClipKey === clip.key
                    const capabilities = timelineClipEditCapabilities(clip)
                    const activeResizeEdit =
                      clipEditState?.kind === "resize" &&
                      clipEditState.clip.key === clip.key &&
                      clipEditState.started
                        ? clipEditState
                        : null
                    const renderStart = activeResizeEdit?.previewStart ?? clip.start
                    const renderDuration = activeResizeEdit?.previewDuration ?? clip.duration
                    const clipStyle = {
                      left: GUTTER_WIDTH + renderStart * pixelsPerSecond,
                      width: Math.max(MIN_CLIP_WIDTH, renderDuration * pixelsPerSecond),
                      top: CLIP_INSET,
                      height: TRACK_HEIGHT - CLIP_INSET * 2,
                    } satisfies CSSProperties

                    return (
                      <button
                        key={clip.key}
                        type="button"
                        className={cn(
                          "absolute flex flex-col justify-between overflow-hidden rounded-md border py-2 pl-4 pr-3 text-left shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70",
                          clipTheme(clip),
                          capabilities.canMove && "cursor-grab active:cursor-grabbing",
                          selected && "ring-2 ring-primary/70 ring-offset-1 ring-offset-background",
                          clipEditState?.kind === "move" &&
                            clipEditState.clip.key === clip.key &&
                            clipEditState.started &&
                            "shadow-md",
                        )}
                        style={{ ...clipStyle, touchAction: "none" }}
                        onPointerDown={(event) => handleClipPointerDown(event, clip)}
                        onPointerMove={(event) => handleClipPointerMove(event, clip)}
                        onPointerUp={handleClipPointerUp}
                        onPointerCancel={handleClipPointerUp}
                      >
                        {capabilities.canTrimStart ? (
                          <span
                            className="absolute inset-y-0 left-0 z-10 flex cursor-col-resize items-center justify-start opacity-70 transition-opacity hover:opacity-100"
                            style={{ width: CLIP_HANDLE_WIDTH }}
                            onPointerDown={(event) => handleClipResizePointerDown(event, clip, "start")}
                            onPointerMove={handleClipResizePointerMove}
                            onPointerUp={handleClipResizePointerUp}
                            onPointerCancel={handleClipResizePointerUp}
                            aria-hidden="true"
                          >
                            <span className={cn(
                              "ml-1.5 h-[62%] w-0.5 rounded-full",
                              selected ? "bg-primary/45" : "bg-muted-foreground/25",
                            )} />
                          </span>
                        ) : null}
                        {capabilities.canTrimEnd ? (
                          <span
                            className="absolute inset-y-0 right-0 z-10 flex cursor-col-resize items-center justify-end opacity-70 transition-opacity hover:opacity-100"
                            style={{ width: CLIP_HANDLE_WIDTH }}
                            onPointerDown={(event) => handleClipResizePointerDown(event, clip, "end")}
                            onPointerMove={handleClipResizePointerMove}
                            onPointerUp={handleClipResizePointerUp}
                            onPointerCancel={handleClipResizePointerUp}
                            aria-hidden="true"
                          >
                            <span className={cn(
                              "mr-1.5 h-[62%] w-0.5 rounded-full",
                              selected ? "bg-primary/45" : "bg-muted-foreground/25",
                            )} />
                          </span>
                        ) : null}
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

            {assetDropPlacement && timelineDuration ? (
              <div
                className="pointer-events-none absolute z-30 rounded-md border border-primary/60 bg-primary/15 shadow-sm"
                style={{
                  left: GUTTER_WIDTH + assetDropPlacement.start * pixelsPerSecond,
                  top: RULER_HEIGHT +
                    assetDropVisualTrackIndex * (TRACK_HEIGHT + TRACK_GAP) +
                    CLIP_INSET,
                  width: Math.max(56, Math.min(160, 5 * pixelsPerSecond)),
                  height: TRACK_HEIGHT - CLIP_INSET * 2,
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
