"use client"

import {
  Captions,
  ExternalLink,
  Gauge,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  Repeat2,
  Rows2,
  RotateCcw,
  Settings,
  StepBack,
  StepForward,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
} from "lucide-react"
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type {
  RippleTimelineClip,
  RippleTimelineModel,
  RippleTimelineRangeSelection,
} from "../../../shared/hyperframes-timeline-model"
import {
  getActiveCaptionOverlayClips,
  getTimelineFrameIndicator,
  timelineSecondsToFrame,
} from "../../../shared/hyperframes-timeline-model"
import { buildVisualPreviewSurfaceKey } from "../../../shared/visual-preview-surface"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { trpc } from "../../lib/trpc"
import { cn } from "../../lib/utils"
import { HyperFramesTimeline } from "./HyperFramesTimeline"
import {
  PREVIEW_COMMENT_MARKER_HALO_CLASSNAMES,
  PREVIEW_COMMENT_MARKER_TONE_CLASSNAMES,
  buildPreviewCommentMarkers,
  hasActivePreviewCommentMarkerWork,
} from "./preview-comment-markers"
import {
  PLAYBACK_SPEEDS,
  PREVIEW_SETTINGS_CONTROLS,
  ZOOM_OPTIONS,
  fitPreviewStageSize,
  formatPreviewTimecode,
  getPreviewPlayerControlLayout,
  resolvePreviewNavigationHold,
  type ZoomValue,
  shouldRenderPreviewCloseControl,
  shouldIssuePreviewSeekRequest,
  shouldSettlePreviewSeekRequest,
  shouldTogglePreviewPlaybackForSpacebar,
} from "./preview-player-controls"
import { resolvePreviewSeekRatio } from "./preview-scrubber"
import { buildHyperframesPlayerFetchUrl } from "./player-source-url"
import {
  clearRipplePreviewCoordinator,
  prewarmRipplePreparedPreviewDocument,
  prewarmRipplePreviewPlayer,
} from "./preview-coordinator"
import { useRippleTimelinePlayerAdapter } from "./timeline-player-adapter"
import { useHyperframesSourceChangeListener } from "./use-hyperframes-source-change-listener"

interface HyperFramesPreviewPlayerProps {
  projectId: string
  compositionId?: string | null
  revisionId?: string | null
  chatId?: string | null
  selectedCommentThreadId?: string | null
  seekToTime?: number | null
  seekRequestId?: number
  onPreviewTimeChange?: (time: number, context: {
    frame: number
    fps: number
  }) => void
  onTimelineSelectionChange?: (selection: RippleTimelineRangeSelection | null) => void
  onCommentMarkerSelect?: (selection: {
    threadId: string
    time: number
    revisionId?: string | null
  }) => void
  isMobile?: boolean
  onClose?: () => void
}

const PREVIEW_FPS = 30
const PREVIEW_PREWARM_LIMIT = 6
const PREVIEW_BLOCKING_STATUS_DELAY_MS = 500
const PREVIEW_SURFACE_HEARTBEAT_MS = 5_000

const timelineThemeStyle = {
  "--preview-timeline-rail":
    "color-mix(in srgb, hsl(var(--foreground)) 24%, hsl(var(--tl-background)))",
  "--preview-timeline-rail-hover":
    "color-mix(in srgb, hsl(var(--foreground)) 32%, hsl(var(--tl-background)))",
  "--preview-timeline-handle":
    "color-mix(in srgb, hsl(var(--foreground)) 84%, hsl(var(--tl-background)))",
  touchAction: "none",
} as CSSProperties

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const wholeSeconds = Math.floor(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainingSeconds = wholeSeconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

function formatPlaybackSpeed(speed: number): string {
  if (Number.isInteger(speed)) return `${speed.toFixed(1)}x`
  return `${speed}x`
}

function optionLabel<TValue extends string>(
  options: readonly { value: TValue; label: string }[],
  value: TValue,
): string {
  return options.find((option) => option.value === value)?.label ?? value
}

function isPreviewPlayerVisible(root: HTMLDivElement | null): boolean {
  if (!root?.isConnected) return false
  const rect = root.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function useDelayedPreviewStatus(active: boolean, delayMs: number): boolean {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }

    const timeout = window.setTimeout(() => setVisible(true), delayMs)
    return () => window.clearTimeout(timeout)
  }, [active, delayMs])

  return visible
}

function PlayerIconButton({
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

export function HyperFramesPreviewPlayer({
  projectId,
  compositionId,
  revisionId,
  chatId,
  selectedCommentThreadId,
  seekToTime,
  seekRequestId,
  onPreviewTimeChange,
  onTimelineSelectionChange,
  onCommentMarkerSelect,
  onClose,
}: HyperFramesPreviewPlayerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const previewSurfaceRef = useRef<HTMLDivElement | null>(null)
  const controlsRef = useRef<HTMLDivElement | null>(null)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const timelineProgressRef = useRef<HTMLDivElement | null>(null)
  const timelineHandleRef = useRef<HTMLDivElement | null>(null)
  const timecodeRef = useRef<HTMLDivElement | null>(null)
  const frameIndicatorRef = useRef<HTMLDivElement | null>(null)
  const durationRef = useRef(0)
  const previewFpsRef = useRef(PREVIEW_FPS)
  const displayTimeRef = useRef(0)
  const settledDisplayTimeRef = useRef(0)
  const [zoom, setZoom] = useState<ZoomValue>("fit")
  const [previewStageSize, setPreviewStageSize] = useState({ width: 0, height: 0 })
  const [previewControlWidth, setPreviewControlWidth] = useState<number | null>(null)
  const [isElementFullscreen, setIsElementFullscreen] = useState(false)
  const [isTimelineVisible, setIsTimelineVisible] = useState(true)
  const [isCaptionOverlayVisible, setIsCaptionOverlayVisible] = useState(true)
  const [timelineHover, setTimelineHover] = useState<{
    percent: number
    time: number
  } | null>(null)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [settledTimelineSnapshot, setSettledTimelineSnapshot] = useState<{
    duration: number
    model: RippleTimelineModel | null
  }>({ duration: 0, model: null })
  const [timelineEditModel, setTimelineEditModel] = useState<RippleTimelineModel | null>(null)
  const [settledSeekRequestId, setSettledSeekRequestId] = useState<number | null>(null)
  const issuedPreviewSeekRef = useRef<{
    requestId: number
    time: number
    canSettle: boolean
  } | null>(null)
  const seekSettleFrameRef = useRef<{
    first: number | null
    second: number | null
  }>({ first: null, second: null })
  const [, setSeekSettleEpoch] = useState(0)
  const sourceRefreshSeekTimeRef = useRef(0)
  const requestedSeekTime =
    typeof seekToTime === "number" && Number.isFinite(seekToTime)
      ? Math.max(0, seekToTime)
      : null
  const adapter = useRippleTimelinePlayerAdapter({
    projectId,
    compositionId,
    revisionId,
    chatId,
    readySeekTime: requestedSeekTime,
  })
  const trpcUtils = trpc.useUtils()
  const startStudioPreviewMutation = trpc.hyperframes.startPreview.useMutation()
  const timelineQuery = trpc.hyperframes.getTimelineModel.useQuery(
    { projectId, compositionId, revisionId, chatId },
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
      placeholderData: (previousData) => previousData,
      retry: 1,
    },
  )
  const commentThreadsQuery = trpc.revisions.listThreads.useQuery(
    { projectId, compositionId, filter: "all" },
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
      refetchInterval: (query) => {
        const threads = Array.isArray(query.state.data) ? query.state.data : []
        return threads.some(hasActivePreviewCommentMarkerWork) ? 1_000 : false
      },
    },
  )

  const {
    containerRef,
    playerRef,
    state: playerState,
    sourceQuery,
    source,
    timelineModel: runtimeTimelineModel,
    subscribeLiveTime,
    errorMessage,
  } = adapter
  const {
    isReady,
    isPlaying,
    currentTime,
    duration,
    playbackSpeed,
    isLooping,
    isMuted,
    isLoadingSource,
  } = playerState
  const timelineModel: RippleTimelineModel | null =
    timelineEditModel ?? runtimeTimelineModel ?? timelineQuery.data?.model ?? null
  const insertAssetOnTimelineMutation = trpc.hyperframes.insertAssetOnTimeline.useMutation({
    onSuccess: async () => {
      toast.success("Media was added to the timeline")
      setTimelineEditModel(null)
      await Promise.all([
        timelineQuery.refetch(),
        trpcUtils.hyperframes.getProjectBrowserModel.invalidate({ projectId }),
      ])
      adapter.reload({ seekTime: displayTime })
    },
    onError: (error) => {
      toast.error("Media was not added", {
        description: error.message,
      })
    },
  })
  const updateTimelineClipMutation = trpc.hyperframes.updateTimelineClip.useMutation({
    onSuccess: (result) => {
      setTimelineEditModel(result.model)
      trpcUtils.hyperframes.getTimelineModel.setData(
        { projectId, compositionId, revisionId, chatId },
        (current) => current ? { ...current, model: result.model } : current,
      )
    },
    onError: (error) => {
      toast.error("Timeline edit was not applied", {
        description: error.message,
      })
    },
  })
  const aspectRatio = source ? `${source.width} / ${source.height}` : "16 / 9"
  const previewSurfaceKey = useMemo(() => buildVisualPreviewSurfaceKey({
    projectId,
    compositionId,
    revisionId,
    chatId,
  }), [chatId, compositionId, projectId, revisionId])
  const scale = zoom === "fit" ? 100 : Number(zoom)
  const fittedPreviewSize = useMemo(() => fitPreviewStageSize({
    containerWidth: previewStageSize.width,
    containerHeight: previewStageSize.height,
    sourceWidth: source?.width ?? 16,
    sourceHeight: source?.height ?? 9,
    zoom,
  }), [
    previewStageSize.height,
    previewStageSize.width,
    source?.height,
    source?.width,
    zoom,
  ])
  const previewControlLayout = useMemo(
    () => getPreviewPlayerControlLayout(previewControlWidth ?? previewStageSize.width),
    [previewControlWidth, previewStageSize.width],
  )
  const hasHiddenPlaybackControls =
    !previewControlLayout.showLoopControl ||
    !previewControlLayout.showSpeedControl ||
    !previewControlLayout.showMuteControl ||
    !previewControlLayout.showRestartControl ||
    !previewControlLayout.showFrameStepControls
  const hasHiddenViewControls =
    !previewControlLayout.showCaptionControl ||
    !previewControlLayout.showTimelineControl ||
    !previewControlLayout.showFullscreenControl
  const isPreviewSourceFetching = sourceQuery.isFetching
  const previewNavigationHold = resolvePreviewNavigationHold({
    requestedTime: requestedSeekTime,
    seekRequestId,
    settledSeekRequestId,
    isReady,
    isLoadingSource,
    isPreviewSourceFetching,
    currentTime,
    currentDuration: duration,
    settledDisplayTime: settledDisplayTimeRef.current,
    settledDuration: settledTimelineSnapshot.duration,
  })
  const {
    hasPendingSeek: hasPendingPreviewSeek,
    isPreviewSettling,
    seekTargetTime: previewSeekTargetTime,
    displayTime,
    displayDuration,
    previewControlsReady,
    timelineInteractionsReady,
  } = previewNavigationHold
  displayTimeRef.current = displayTime
  sourceRefreshSeekTimeRef.current = displayTime

  const handleHyperframesSourceChange = useCallback(() => {
    setTimelineEditModel(null)
    adapter.reload({ seekTime: sourceRefreshSeekTimeRef.current })
  }, [adapter.reload])

  useHyperframesSourceChangeListener({
    projectId,
    revisionId,
    chatId,
    enabled: Boolean(projectId),
    onChange: handleHyperframesSourceChange,
  })

  const displayTimelineModel =
    isPreviewSettling && settledTimelineSnapshot.model
      ? settledTimelineSnapshot.model
      : timelineModel
  previewFpsRef.current = displayTimelineModel?.fps ?? PREVIEW_FPS
  const progress =
    displayDuration > 0 ? clamp((displayTime / displayDuration) * 100, 0, 100) : 0
  const canUseTimeline = previewControlsReady && displayDuration > 0
  const commentMarkers = useMemo(
    () => buildPreviewCommentMarkers(commentThreadsQuery.data ?? [], displayDuration),
    [commentThreadsQuery.data, displayDuration],
  )
  const activeCaptionClips = useMemo(
    () => getActiveCaptionOverlayClips({
      model: displayTimelineModel,
      time: displayTime,
      limit: 2,
    }),
    [displayTime, displayTimelineModel],
  )
  const hasCaptionClips = useMemo(
    () => Boolean(displayTimelineModel?.clips.some((clip) => clip.kind === "caption")),
    [displayTimelineModel?.clips],
  )
  const prewarmTargets = useMemo(() => {
    const targets: Array<{ revisionId: string | null; chatId: string | null }> = []
    const seen = new Set<string>()
    const addTarget = (target: { revisionId: string | null; chatId: string | null }) => {
      const key = `${target.revisionId ?? "main"}:${target.chatId ?? "main"}`
      if (seen.has(key)) return
      seen.add(key)
      targets.push(target)
    }

    if (revisionId || chatId) {
      addTarget({ revisionId: null, chatId: null })
    }

    commentMarkers
      .filter((marker) => marker.previewRevisionId && marker.previewRevisionId !== revisionId)
      .sort((a, b) => {
        const aSelected = a.id === selectedCommentThreadId ? 0 : 1
        const bSelected = b.id === selectedCommentThreadId ? 0 : 1
        const aDistance =
          requestedSeekTime === null
            ? 0
            : Math.abs(a.time - requestedSeekTime)
        const bDistance =
          requestedSeekTime === null
            ? 0
            : Math.abs(b.time - requestedSeekTime)
        return (
          aSelected - bSelected ||
          aDistance - bDistance ||
          a.time - b.time ||
          a.id.localeCompare(b.id)
        )
      })
      .forEach((marker) => {
        if (marker.previewRevisionId) {
          addTarget({ revisionId: marker.previewRevisionId, chatId: null })
        }
      })

    return targets.slice(0, PREVIEW_PREWARM_LIMIT)
  }, [chatId, commentMarkers, requestedSeekTime, revisionId, selectedCommentThreadId])

  useEffect(() => {
    setTimelineEditModel(null)
  }, [projectId, compositionId, revisionId, chatId])

  useEffect(() => {
    if (!source?.sourceUrl) return
    prewarmRipplePreparedPreviewDocument(
      buildHyperframesPlayerFetchUrl(source.sourceUrl, 0),
    )
  }, [source?.sourceUrl])

  useEffect(() => {
    if (!projectId || prewarmTargets.length === 0) return

    let cancelled = false
    prewarmTargets.forEach((target) => {
      const input = {
        projectId,
        compositionId,
        revisionId: target.revisionId,
        chatId: target.chatId,
      }

      void trpcUtils.hyperframes.getTimelineModel.prefetch(input, {
        staleTime: 30_000,
      })
      void trpcUtils.hyperframes.getPlayerSource
        .fetch(input)
        .then((result) => {
          if (cancelled) return
          const sourceUrl = buildHyperframesPlayerFetchUrl(result.source.sourceUrl, 0)
          prewarmRipplePreparedPreviewDocument(
            sourceUrl,
          )
          prewarmRipplePreviewPlayer({
            sourceUrl,
            width: result.source.width,
            height: result.source.height,
            reason: "likely-target",
          })
        })
        .catch(() => {
          // Speculative prewarming should never interrupt the visible preview.
        })
    })

    return () => {
      cancelled = true
    }
  }, [compositionId, prewarmTargets, projectId, trpcUtils])
  const zoomLabel = optionLabel(ZOOM_OPTIONS, zoom)
  const showCloseControl = shouldRenderPreviewCloseControl(onClose)
  const showDelayedPreparingPreview = useDelayedPreviewStatus(
    Boolean(!errorMessage && !isReady),
    PREVIEW_BLOCKING_STATUS_DELAY_MS,
  )
  const showBlockingPreviewStatus = Boolean(errorMessage || showDelayedPreparingPreview)
  const timelinePreview = timelineHover
  const timelinePreviewLeft = timelinePreview
    ? clamp(timelinePreview.percent, 4, 96)
    : 0
  const timelineError =
    timelineQuery.error instanceof Error && !runtimeTimelineModel
      ? timelineQuery.error.message
      : null

  const updateVisualPreviewSurface = useCallback(() => {
    const element = previewSurfaceRef.current
    const projectPath = sourceQuery.data?.projectPath ?? null
    if (!element || !source || !projectPath || !isReady) return
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const fps = Math.max(1, Math.round(previewFpsRef.current || PREVIEW_FPS))
    const timeMs = Math.max(0, Math.round(displayTimeRef.current * 1000))
    void window.desktopApi?.updateVisualPreviewSurface?.({
      surfaceKey: previewSurfaceKey,
      projectId,
      compositionId: compositionId ?? null,
      revisionId: revisionId ?? null,
      chatId: chatId ?? null,
      projectPath: sourceQuery.data?.project?.path ?? null,
      sourcePath: projectPath,
      compositionPath: sourceQuery.data?.composition?.filePath ?? null,
      sourceWidth: source.width,
      sourceHeight: source.height,
      timeMs,
      frame: timelineSecondsToFrame(timeMs / 1000, fps),
      bounds: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
    }).catch(() => undefined)
  }, [
    chatId,
    compositionId,
    isReady,
    previewSurfaceKey,
    projectId,
    revisionId,
    source,
    sourceQuery.data?.project?.path,
    sourceQuery.data?.composition?.filePath,
    sourceQuery.data?.projectPath,
  ])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsElementFullscreen(document.fullscreenElement === rootRef.current)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  useLayoutEffect(() => {
    const element = previewSurfaceRef.current
    if (!element || !source || !sourceQuery.data?.projectPath || !isReady) return

    updateVisualPreviewSurface()
    const observer = new ResizeObserver(updateVisualPreviewSurface)
    observer.observe(element)
    window.addEventListener("resize", updateVisualPreviewSurface)
    const heartbeat = window.setInterval(updateVisualPreviewSurface, PREVIEW_SURFACE_HEARTBEAT_MS)
    return () => {
      window.clearInterval(heartbeat)
      observer.disconnect()
      window.removeEventListener("resize", updateVisualPreviewSurface)
    }
  }, [
    isReady,
    source,
    sourceQuery.data?.projectPath,
    updateVisualPreviewSurface,
  ])

  useEffect(() => {
    if (!isReady) {
      void window.desktopApi?.clearVisualPreviewSurface?.({ surfaceKey: previewSurfaceKey }).catch(() => undefined)
    }
  }, [isReady, previewSurfaceKey])

  useEffect(() => {
    return () => {
      void window.desktopApi?.clearVisualPreviewSurface?.({ surfaceKey: previewSurfaceKey }).catch(() => undefined)
    }
  }, [previewSurfaceKey])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const updateStageSize = () => {
      const rect = stage.getBoundingClientRect()
      setPreviewStageSize((current) => {
        const width = Math.max(0, rect.width)
        const height = Math.max(0, rect.height)
        if (current.width === width && current.height === height) return current
        return { width, height }
      })
    }

    updateStageSize()
    const observer = new ResizeObserver(updateStageSize)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    const updateControlWidth = () => {
      const rect = controls.getBoundingClientRect()
      setPreviewControlWidth((current) => {
        const width = Math.max(0, Math.floor(rect.width))
        return current === width ? current : width
      })
    }

    updateControlWidth()
    const observer = new ResizeObserver(updateControlWidth)
    observer.observe(controls)
    return () => observer.disconnect()
  }, [])

  const syncLivePreviewTime = useCallback((time: number) => {
    const liveDuration = durationRef.current
    const liveProgress = liveDuration > 0 ? clamp((time / liveDuration) * 100, 0, 100) : 0

    if (timelineProgressRef.current) {
      timelineProgressRef.current.style.width = `${liveProgress}%`
    }
    if (timelineHandleRef.current) {
      timelineHandleRef.current.style.left = `${liveProgress}%`
    }
    if (timecodeRef.current) {
      timecodeRef.current.textContent = formatPreviewTimecode(time, previewFpsRef.current)
    }
    if (frameIndicatorRef.current) {
      const indicator = getTimelineFrameIndicator({
        time,
        duration: liveDuration,
        fps: previewFpsRef.current,
      })
      frameIndicatorRef.current.textContent = indicator.label
      frameIndicatorRef.current.setAttribute("aria-label", `${indicator.label}, ${indicator.timecode}`)
    }
    if (timelineRef.current) {
      timelineRef.current.setAttribute("aria-valuenow", String(Math.min(time, liveDuration || 0)))
      timelineRef.current.setAttribute(
        "aria-valuetext",
        `${formatTime(time)} of ${formatTime(liveDuration)}`,
      )
    }
  }, [])

  const emitPreviewTimeChange = useCallback((time: number) => {
    const fps = Math.max(1, Math.round(previewFpsRef.current || PREVIEW_FPS))
    onPreviewTimeChange?.(time, {
      frame: timelineSecondsToFrame(time, fps),
      fps,
    })
  }, [onPreviewTimeChange])

  useLayoutEffect(() => {
    if (!isPreviewSettling && isReady) {
      settledDisplayTimeRef.current = currentTime
      setSettledTimelineSnapshot((current) => {
        if (current.duration === duration && current.model === timelineModel) {
          return current
        }
        return { duration, model: timelineModel }
      })
    }
  }, [currentTime, duration, isPreviewSettling, isReady, timelineModel])

  useLayoutEffect(() => {
    durationRef.current = displayDuration
    syncLivePreviewTime(displayTime)
  }, [displayDuration, displayTime, syncLivePreviewTime])

  useEffect(() => {
    if (isPreviewSettling) return
    emitPreviewTimeChange(currentTime)
  }, [currentTime, emitPreviewTimeChange, isPreviewSettling])

  useEffect(() => subscribeLiveTime((time: number) => {
    if (isPreviewSettling) return
    syncLivePreviewTime(time)
    emitPreviewTimeChange(time)
  }), [
    emitPreviewTimeChange,
    isPreviewSettling,
    subscribeLiveTime,
    syncLivePreviewTime,
  ])

  const cancelSeekSettleFrames = useCallback(() => {
    const frames = seekSettleFrameRef.current
    if (frames.first !== null) {
      window.cancelAnimationFrame(frames.first)
    }
    if (frames.second !== null) {
      window.cancelAnimationFrame(frames.second)
    }
    seekSettleFrameRef.current = { first: null, second: null }
  }, [])

  const scheduleSeekSettleAfterPaint = useCallback((requestId: number) => {
    cancelSeekSettleFrames()
    seekSettleFrameRef.current.first = window.requestAnimationFrame(() => {
      seekSettleFrameRef.current.first = null
      seekSettleFrameRef.current.second = window.requestAnimationFrame(() => {
        seekSettleFrameRef.current.second = null
        const issuedSeek = issuedPreviewSeekRef.current
        if (issuedSeek?.requestId !== requestId) return
        issuedSeek.canSettle = true
        setSeekSettleEpoch((epoch) => epoch + 1)
      })
    })
  }, [cancelSeekSettleFrames])

  useEffect(() => cancelSeekSettleFrames, [cancelSeekSettleFrames])

  useLayoutEffect(() => {
    if (requestedSeekTime === null) {
      cancelSeekSettleFrames()
      issuedPreviewSeekRef.current = null
      if (settledSeekRequestId !== null) {
        setSettledSeekRequestId(null)
      }
      return
    }

    const issuedSeek = issuedPreviewSeekRef.current
    if (!shouldIssuePreviewSeekRequest({
      requestedTime: previewSeekTargetTime,
      seekRequestId,
      settledSeekRequestId,
      isReady,
      isLoadingSource,
      isPreviewSourceFetching,
      issuedSeekRequestId: issuedSeek?.requestId ?? null,
      issuedSeekTime: issuedSeek?.time ?? null,
    })) {
      return
    }

    if (typeof seekRequestId === "number" && previewSeekTargetTime !== null) {
      issuedPreviewSeekRef.current = {
        requestId: seekRequestId,
        time: previewSeekTargetTime,
        canSettle: false,
      }
      scheduleSeekSettleAfterPaint(seekRequestId)
    }
    if (previewSeekTargetTime !== null) {
      adapter.seek(previewSeekTargetTime)
    }
  }, [
    adapter.seek,
    cancelSeekSettleFrames,
    isLoadingSource,
    isPreviewSourceFetching,
    isReady,
    previewSeekTargetTime,
    requestedSeekTime,
    scheduleSeekSettleAfterPaint,
    seekRequestId,
    settledSeekRequestId,
  ])

  useLayoutEffect(() => {
    if (typeof seekRequestId !== "number") return
    const issuedSeek = issuedPreviewSeekRef.current
    if (issuedSeek?.requestId !== seekRequestId || !issuedSeek.canSettle) return

    if (shouldSettlePreviewSeekRequest({
      requestedTime: previewSeekTargetTime,
      seekRequestId,
      settledSeekRequestId,
      isReady,
      isLoadingSource,
      isPreviewSourceFetching,
      currentTime,
    })) {
      cancelSeekSettleFrames()
      issuedPreviewSeekRef.current = null
      setSettledSeekRequestId(seekRequestId)
    }
  }, [
    cancelSeekSettleFrames,
    currentTime,
    isLoadingSource,
    isPreviewSourceFetching,
    isReady,
    previewSeekTargetTime,
    requestedSeekTime,
    seekRequestId,
    settledSeekRequestId,
  ])

  const handleTogglePlayback = useCallback(() => {
    if (isPlaying) {
      adapter.pause()
    } else {
      adapter.play()
    }
  }, [adapter.pause, adapter.play, isPlaying])

  const handlePreviewSpacebarKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!previewControlsReady) return
      if (!isPreviewPlayerVisible(rootRef.current)) return
      if (!shouldTogglePreviewPlaybackForSpacebar(event)) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      handleTogglePlayback()
    },
    [handleTogglePlayback, previewControlsReady],
  )

  useEffect(() => {
    window.addEventListener("keydown", handlePreviewSpacebarKeyDown, true)
    return () => window.removeEventListener("keydown", handlePreviewSpacebarKeyDown, true)
  }, [handlePreviewSpacebarKeyDown])

  useEffect(() => {
    if (!previewControlsReady) return

    let iframeWindow: Window | null = null
    try {
      iframeWindow = playerRef.current?.iframeElement?.contentWindow ?? null
    } catch {
      iframeWindow = null
    }
    if (!iframeWindow) return

    iframeWindow.addEventListener("keydown", handlePreviewSpacebarKeyDown, true)
    return () => {
      iframeWindow?.removeEventListener("keydown", handlePreviewSpacebarKeyDown, true)
    }
  }, [handlePreviewSpacebarKeyDown, previewControlsReady, playerRef, source?.sourceUrl])

  const handleRestart = () => {
    if (!previewControlsReady) return
    adapter.restart()
  }

  const handleStepFrame = (direction: -1 | 1) => {
    if (!previewControlsReady) return
    const fps = Math.max(1, previewFpsRef.current || PREVIEW_FPS)
    const nextTime = displayTime + direction / fps
    handleSeek(nextTime)
  }

  const handleReload = () => {
    setTimelineEditModel(null)
    clearRipplePreviewCoordinator()
    adapter.reload({ seekTime: displayTime })
    void timelineQuery.refetch()
  }

  const handleOpenStudio = async () => {
    try {
      const preview = await startStudioPreviewMutation.mutateAsync({
        projectId,
      })
      if (preview.url) {
        if (window.desktopApi?.openExternal) {
          await window.desktopApi.openExternal(preview.url)
        } else {
          window.open(preview.url, "_blank")
        }
      }
    } catch (error) {
      toast.error("HyperFrames Studio did not open", {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const handleSeek = (value: number) => {
    if (!previewControlsReady) return
    const nextTime = clamp(value, 0, duration || 0)
    syncLivePreviewTime(nextTime)
    adapter.seek(nextTime)
  }

  const handleTimelineAssetDrop = (
    assetPath: string,
    placement: { start: number; track: number },
  ) => {
    if (revisionId || chatId) {
      toast.error("Switch to Main to add media to the timeline")
      return
    }

    insertAssetOnTimelineMutation.mutate({
      projectId,
      compositionId: displayTimelineModel?.compositionId ?? compositionId ?? null,
      assetPath,
      start: placement.start,
      track: placement.track,
    })
  }

  const handleTimelineClipUpdate = (
    clip: RippleTimelineClip,
    updates: {
      start: number
      duration: number
      track: number
      playbackStart?: number
    },
  ) => {
    if (revisionId || chatId) {
      toast.error("Switch to Main to edit the timeline")
      return
    }

    return updateTimelineClipMutation.mutateAsync({
      projectId,
      compositionId: displayTimelineModel?.compositionId ?? compositionId ?? null,
      clip: {
        key: clip.key,
        sourceFile: clip.sourceFile,
        domId: clip.domId ?? null,
        selector: clip.selector ?? null,
        selectorIndex: clip.selectorIndex ?? null,
        label: clip.label,
        tagName: clip.tagName,
        start: clip.start,
        duration: clip.duration,
        track: clip.track,
      },
      start: updates.start,
      duration: updates.duration,
      track: updates.track,
      playbackStart: updates.playbackStart ?? null,
    }).then(() => undefined)
  }

  const readTimelinePoint = (clientX: number) => {
    const timeline = timelineRef.current
    if (!timeline || !canUseTimeline) return null

    const rect = timeline.getBoundingClientRect()
    const ratio = resolvePreviewSeekRatio({
      clientX,
      rectLeft: rect.left,
      rectWidth: rect.width,
    })
    return {
      percent: ratio * 100,
      time: duration * ratio,
    }
  }

  const updateTimelineHover = (clientX: number) => {
    const point = readTimelinePoint(clientX)
    if (point) {
      setTimelineHover(point)
    }
    return point
  }

  const handleTimelinePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!canUseTimeline) return
    if (event.button !== 0) return

    event.preventDefault()
    event.currentTarget.focus()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Older WebViews may not support pointer capture on every input type.
    }
    setIsScrubbing(true)
    setTimelineHover(null)
    const point = readTimelinePoint(event.clientX)
    if (point) {
      handleSeek(point.time)
    }
  }

  const handleTimelinePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!canUseTimeline) return

    if (isScrubbing) {
      const point = readTimelinePoint(event.clientX)
      setTimelineHover(null)
      if (!point) return
      handleSeek(point.time)
      return
    }

    updateTimelineHover(event.clientX)
  }

  const handleTimelinePointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (isScrubbing) {
      const point = readTimelinePoint(event.clientX)
      if (point) {
        handleSeek(point.time)
      }
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // The capture may already be released by the browser.
      }
    }
    setIsScrubbing(false)
    setTimelineHover(null)
  }

  const handleTimelinePointerLeave = () => {
    if (!isScrubbing) {
      setTimelineHover(null)
    }
  }

  const handleTimelineKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (!canUseTimeline) return

    const frameStep = 1 / Math.max(1, previewFpsRef.current || PREVIEW_FPS)
    const step = event.shiftKey ? 1 : frameStep
    let nextTime = displayTime

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        nextTime = displayTime - step
        break
      case "ArrowRight":
      case "ArrowUp":
        nextTime = displayTime + step
        break
      case "PageDown":
        nextTime = displayTime - 1
        break
      case "PageUp":
        nextTime = displayTime + 1
        break
      case "Home":
        nextTime = 0
        break
      case "End":
        nextTime = duration
        break
      default:
        return
    }

    event.preventDefault()
    handleSeek(nextTime)
  }

  const handleSpeedChange = (nextSpeed: number) => {
    adapter.setPlaybackSpeed(nextSpeed)
  }

  const handleLoopChange = () => {
    adapter.setLooping(!isLooping)
  }

  const handleMuteChange = () => {
    adapter.setMuted(!isMuted)
  }

  const handleToggleFullscreen = () => {
    const root = rootRef.current
    if (!root) return

    if (document.fullscreenElement === root) {
      void document.exitFullscreen()
      return
    }

    if (root.requestFullscreen) {
      void root.requestFullscreen().catch(() => {
        void window.desktopApi?.windowToggleFullscreen?.()
      })
      return
    }

    void window.desktopApi?.windowToggleFullscreen?.()
  }

  return (
    <div
      ref={rootRef}
      className="flex h-full min-h-0 flex-col bg-tl-background text-foreground [&:fullscreen]:h-screen [&:fullscreen]:w-screen"
      data-testid="ripple-preview-player"
    >
      <div
        ref={stageRef}
        className="flex min-h-[120px] flex-1 items-center justify-center overflow-hidden bg-tl-background p-1"
        data-testid="ripple-preview-stage"
      >
        <div
          ref={previewSurfaceRef}
          className={cn(
            "relative max-h-full overflow-hidden rounded-md bg-black shadow-sm ring-1 ring-border/70",
            zoom === "fit" && "max-w-full",
          )}
          style={{
            aspectRatio,
            width: fittedPreviewSize ? `${fittedPreviewSize.width}px` : `${scale}%`,
            height: fittedPreviewSize ? `${fittedPreviewSize.height}px` : undefined,
            maxWidth: zoom === "fit" ? "100%" : "none",
          }}
        >
          <div ref={containerRef} className="absolute inset-0" />
          {isCaptionOverlayVisible && activeCaptionClips.length > 0 ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex flex-col items-center gap-1 px-6">
              {activeCaptionClips.map((clip) => (
                <div
                  key={clip.key}
                  className="max-w-full truncate rounded-md border border-black/25 bg-black/68 px-3 py-1 text-center text-sm font-medium text-white shadow-lg"
                >
                  {clip.label}
                </div>
              ))}
            </div>
          ) : null}
          {showBlockingPreviewStatus ? (
            <div className="pointer-events-none absolute inset-0 flex animate-in items-center justify-center bg-background/85 p-6 text-center backdrop-blur-sm fade-in-0 duration-150">
              <div className="max-w-xs">
                <div className="text-sm font-medium text-foreground">
                  {errorMessage ? "Preview failed" : "Preparing preview"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {errorMessage ?? "Loading the HyperFrames player."}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 px-3 pb-2 pt-1.5">
        <div className="flex items-center">
          <div
            ref={timelineRef}
            role="slider"
            tabIndex={canUseTimeline ? 0 : -1}
            aria-disabled={!canUseTimeline}
            aria-label="Preview time"
            aria-valuemin={0}
            aria-valuemax={displayDuration || 0}
            aria-valuenow={Math.min(displayTime, displayDuration || 0)}
            aria-valuetext={`${formatTime(displayTime)} of ${formatTime(displayDuration)}`}
            data-scrubbing={isScrubbing}
            onPointerDown={handleTimelinePointerDown}
            onPointerMove={handleTimelinePointerMove}
            onPointerUp={handleTimelinePointerUp}
            onPointerCancel={handleTimelinePointerUp}
            onPointerLeave={handleTimelinePointerLeave}
            onKeyDown={handleTimelineKeyDown}
            style={timelineThemeStyle}
            className="group/timeline relative flex h-12 min-w-0 flex-1 cursor-pointer items-center outline-none data-[scrubbing=false]:focus-visible:ring-2 data-[scrubbing=false]:focus-visible:ring-primary/40 data-[scrubbing=false]:focus-visible:ring-offset-2 data-[scrubbing=false]:focus-visible:ring-offset-background aria-disabled:cursor-default aria-disabled:opacity-40"
          >
            <div className="relative h-5 w-full">
              <div className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 bg-[var(--preview-timeline-rail)] transition-[height,background-color] duration-150 group-hover/timeline:h-2 group-hover/timeline:bg-[var(--preview-timeline-rail-hover)] group-data-[scrubbing=true]/timeline:h-2 group-data-[scrubbing=true]/timeline:bg-[var(--preview-timeline-rail-hover)]" />
              <div
                ref={timelineProgressRef}
                className="absolute left-0 top-1/2 h-[5px] -translate-y-1/2 bg-primary transition-[height] duration-150 group-hover/timeline:h-2 group-data-[scrubbing=true]/timeline:h-2"
                style={{ width: `${progress}%` }}
              />
              {commentMarkers.map((marker) => {
                const active = marker.id === selectedCommentThreadId
                return (
                  <Tooltip key={marker.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={marker.label}
                        aria-pressed={active}
                        data-comment-marker="true"
                        className="group/comment-marker absolute top-[calc(50%+18px)] z-20 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none transition-transform duration-150 hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        style={{
                          left: `${clamp(marker.positionPercent, 0.75, 99.25)}%`,
                        }}
                        onPointerDown={(event) => {
                          event.stopPropagation()
                        }}
                        onPointerMove={(event) => {
                          event.stopPropagation()
                        }}
                        onPointerUp={(event) => {
                          event.stopPropagation()
                        }}
                        onPointerEnter={() => setTimelineHover(null)}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setTimelineHover(null)
                          if (onCommentMarkerSelect) {
                            onCommentMarkerSelect({
                              threadId: marker.id,
                              time: marker.time,
                              revisionId: marker.previewRevisionId,
                            })
                            return
                          }
                          handleSeek(marker.time)
                        }}
                      >
                        <span
                          className={cn(
                            "absolute h-5 w-5 rounded-full opacity-0 transition-opacity duration-150 group-hover/comment-marker:opacity-100 group-focus-visible/comment-marker:opacity-100",
                            PREVIEW_COMMENT_MARKER_HALO_CLASSNAMES[marker.tone],
                            active && "opacity-100",
                          )}
                        />
                        <span
                          className={cn(
                            "relative h-3.5 w-3.5 rounded-full border border-background/90 shadow-sm transition-transform duration-150 group-hover/comment-marker:scale-95",
                            PREVIEW_COMMENT_MARKER_TONE_CLASSNAMES[marker.tone],
                          )}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{marker.label}</TooltipContent>
                  </Tooltip>
                )
              })}
              <div
                ref={timelineHandleRef}
                className="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-[var(--preview-timeline-handle)] transition-[height] duration-150 group-hover/timeline:h-5 group-data-[scrubbing=true]/timeline:h-5"
                style={{ left: `${progress}%` }}
              />
              {timelinePreview ? (
                <div
                  className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-md bg-popover px-2 py-1 text-[11px] tabular-nums text-popover-foreground shadow-sm ring-1 ring-border/60"
                  style={{ left: `${timelinePreviewLeft}%` }}
                >
                  {formatPreviewTimecode(timelinePreview.time, previewFpsRef.current)}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div
          ref={controlsRef}
          className="mt-1.5 flex min-w-0 items-center gap-1.5"
          data-preview-control-density={previewControlLayout.density}
        >
          <div className="flex shrink-0 items-center gap-1">
            <PlayerIconButton
              label={isPlaying ? "Pause preview" : "Play preview"}
              onClick={handleTogglePlayback}
              disabled={!previewControlsReady}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
            </PlayerIconButton>

            {previewControlLayout.showLoopControl ? (
              <PlayerIconButton
                label={isLooping ? "Loop on" : "Loop off"}
                active={isLooping}
                onClick={handleLoopChange}
                disabled={!previewControlsReady}
                aria-pressed={isLooping}
              >
                <Repeat2 className="h-4 w-4" />
              </PlayerIconButton>
            ) : null}

            {previewControlLayout.showSpeedControl ? (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-7 items-center gap-1 rounded-full px-1.5 text-xs tabular-nums text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70 disabled:pointer-events-none disabled:opacity-40"
                        disabled={!previewControlsReady}
                      >
                        <Gauge className="h-3.5 w-3.5" />
                        {previewControlLayout.showSpeedLabel ? formatPlaybackSpeed(playbackSpeed) : null}
                        <span className="sr-only">Playback speed</span>
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top">Playback speed</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" side="top" sideOffset={10} className="w-32">
                  <DropdownMenuRadioGroup
                    value={String(playbackSpeed)}
                    onValueChange={(value) => handleSpeedChange(Number(value))}
                  >
                    {PLAYBACK_SPEEDS.map((speed) => (
                      <DropdownMenuRadioItem key={speed} value={String(speed)}>
                        {formatPlaybackSpeed(speed)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {previewControlLayout.showMuteControl ? (
              <PlayerIconButton
                label={isMuted ? "Unmute preview" : "Mute preview"}
                active={isMuted}
                onClick={handleMuteChange}
                disabled={!previewControlsReady}
                aria-pressed={isMuted}
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </PlayerIconButton>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
            {previewControlLayout.showRestartControl ? (
              <PlayerIconButton
                label="Restart preview"
                onClick={handleRestart}
                disabled={!previewControlsReady}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </PlayerIconButton>
            ) : null}
            {previewControlLayout.showFrameStepControls ? (
              <PlayerIconButton
                label="Step back one frame"
                onClick={() => handleStepFrame(-1)}
                disabled={!previewControlsReady}
              >
                <StepBack className="h-3.5 w-3.5" />
              </PlayerIconButton>
            ) : null}
            <div
              className="shrink-0 rounded-md bg-muted/40 px-2.5 py-1.5 text-center shadow-sm ring-1 ring-border/50"
            >
              <div
                ref={timecodeRef}
                className="min-w-[7.5rem] text-sm tabular-nums tracking-normal text-foreground"
              >
                {formatPreviewTimecode(displayTime, displayTimelineModel?.fps ?? PREVIEW_FPS)}
              </div>
              <div
                ref={frameIndicatorRef}
                data-testid="ripple-preview-frame-indicator"
                className="sr-only"
              >
                {getTimelineFrameIndicator({
                  time: displayTime,
                  duration: displayDuration,
                  fps: displayTimelineModel?.fps ?? PREVIEW_FPS,
                }).label}
              </div>
            </div>
            {previewControlLayout.showFrameStepControls ? (
              <PlayerIconButton
                label="Step forward one frame"
                onClick={() => handleStepFrame(1)}
                disabled={!previewControlsReady}
              >
                <StepForward className="h-3.5 w-3.5" />
              </PlayerIconButton>
            ) : null}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {previewControlLayout.showCaptionControl ? (
              <PlayerIconButton
                label={isCaptionOverlayVisible ? "Hide caption overlays" : "Show caption overlays"}
                active={isCaptionOverlayVisible}
                aria-pressed={isCaptionOverlayVisible}
                onClick={() => setIsCaptionOverlayVisible((visible) => !visible)}
                disabled={!hasCaptionClips}
                className={isCaptionOverlayVisible && hasCaptionClips ? "text-primary hover:text-primary" : undefined}
              >
                <Captions className="h-4 w-4" />
              </PlayerIconButton>
            ) : null}

            {previewControlLayout.showTimelineControl ? (
              <PlayerIconButton
                label={isTimelineVisible ? "Hide timeline" : "Show timeline"}
                active={isTimelineVisible}
                aria-pressed={isTimelineVisible}
                onClick={() => setIsTimelineVisible((visible) => !visible)}
                className={isTimelineVisible ? "text-primary hover:text-primary" : undefined}
              >
                <Rows2 className="h-4 w-4" />
              </PlayerIconButton>
            ) : null}

            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70"
                    >
                      <Settings className="h-4 w-4" />
                      <span className="sr-only">Preview settings</span>
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">Preview settings</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" side="top" sideOffset={10} className="w-56">
                <DropdownMenuLabel>Preview settings</DropdownMenuLabel>
                {PREVIEW_SETTINGS_CONTROLS.includes("zoom") ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <ZoomIn className="h-4 w-4" />
                      <span>Zoom</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {zoomLabel}
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-32">
                      <DropdownMenuRadioGroup
                        value={zoom}
                        onValueChange={(value) => setZoom(value as ZoomValue)}
                      >
                        {ZOOM_OPTIONS.map((option) => (
                          <DropdownMenuRadioItem key={option.value} value={option.value}>
                            {option.label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
                {hasHiddenPlaybackControls ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Playback</DropdownMenuLabel>
                    {!previewControlLayout.showLoopControl ? (
                      <DropdownMenuCheckboxItem
                        checked={isLooping}
                        onCheckedChange={(checked) => adapter.setLooping(checked === true)}
                        disabled={!previewControlsReady}
                      >
                        Loop playback
                      </DropdownMenuCheckboxItem>
                    ) : null}
                    {!previewControlLayout.showSpeedControl ? (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger disabled={!previewControlsReady}>
                          <Gauge className="h-4 w-4" />
                          <span>Speed</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {formatPlaybackSpeed(playbackSpeed)}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-32">
                          <DropdownMenuRadioGroup
                            value={String(playbackSpeed)}
                            onValueChange={(value) => handleSpeedChange(Number(value))}
                          >
                            {PLAYBACK_SPEEDS.map((speed) => (
                              <DropdownMenuRadioItem key={speed} value={String(speed)}>
                                {formatPlaybackSpeed(speed)}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ) : null}
                    {!previewControlLayout.showMuteControl ? (
                      <DropdownMenuCheckboxItem
                        checked={isMuted}
                        onCheckedChange={(checked) => adapter.setMuted(checked === true)}
                        disabled={!previewControlsReady}
                      >
                        Mute preview
                      </DropdownMenuCheckboxItem>
                    ) : null}
                    {!previewControlLayout.showRestartControl ? (
                      <DropdownMenuItem
                        onSelect={handleRestart}
                        disabled={!previewControlsReady}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Restart preview
                      </DropdownMenuItem>
                    ) : null}
                    {!previewControlLayout.showFrameStepControls ? (
                      <>
                        <DropdownMenuItem
                          onSelect={() => handleStepFrame(-1)}
                          disabled={!previewControlsReady}
                        >
                          <StepBack className="h-4 w-4" />
                          Step back one frame
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => handleStepFrame(1)}
                          disabled={!previewControlsReady}
                        >
                          <StepForward className="h-4 w-4" />
                          Step forward one frame
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </>
                ) : null}
                {hasHiddenViewControls ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>View</DropdownMenuLabel>
                    {!previewControlLayout.showCaptionControl ? (
                      <DropdownMenuCheckboxItem
                        checked={isCaptionOverlayVisible}
                        onCheckedChange={(checked) => setIsCaptionOverlayVisible(checked === true)}
                        disabled={!hasCaptionClips}
                      >
                        Caption overlays
                      </DropdownMenuCheckboxItem>
                    ) : null}
                    {!previewControlLayout.showTimelineControl ? (
                      <DropdownMenuCheckboxItem
                        checked={isTimelineVisible}
                        onCheckedChange={(checked) => setIsTimelineVisible(checked === true)}
                      >
                        Timeline
                      </DropdownMenuCheckboxItem>
                    ) : null}
                    {!previewControlLayout.showFullscreenControl ? (
                      <DropdownMenuItem onSelect={handleToggleFullscreen}>
                        {isElementFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        {isElementFullscreen ? "Exit fullscreen" : "Open fullscreen"}
                      </DropdownMenuItem>
                    ) : null}
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => void handleOpenStudio()}
                  disabled={startStudioPreviewMutation.isPending}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open in HyperFrames Studio
                </DropdownMenuItem>
                {PREVIEW_SETTINGS_CONTROLS.includes("reload-preview") ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={handleReload}
                      disabled={sourceQuery.isFetching}
                    >
                      <RefreshCw className={cn("h-4 w-4", sourceQuery.isFetching && "animate-spin")} />
                      Reload preview
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            {previewControlLayout.showFullscreenControl ? (
              <PlayerIconButton
                label={isElementFullscreen ? "Exit fullscreen" : "Open fullscreen"}
                onClick={handleToggleFullscreen}
              >
                {isElementFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </PlayerIconButton>
            ) : null}

            {showCloseControl ? (
              <PlayerIconButton label="Close preview" onClick={onClose}>
                <X className="h-4 w-4" />
              </PlayerIconButton>
            ) : null}
          </div>
        </div>

        {isTimelineVisible ? (
          <HyperFramesTimeline
            model={displayTimelineModel}
            isLoading={timelineQuery.isLoading && !runtimeTimelineModel}
            error={timelineError}
            isReady={timelineInteractionsReady}
            currentTime={displayTime}
            duration={displayDuration}
            subscribeLiveTime={previewControlsReady ? subscribeLiveTime : undefined}
            onSeek={handleSeek}
            onSelectionChange={onTimelineSelectionChange}
            onAssetDrop={handleTimelineAssetDrop}
            onClipUpdate={revisionId || chatId ? undefined : handleTimelineClipUpdate}
          />
        ) : null}
      </div>
    </div>
  )
}
