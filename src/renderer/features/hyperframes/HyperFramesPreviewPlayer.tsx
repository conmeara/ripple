"use client"

import {
  ExternalLink,
  Gauge,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  Repeat2,
  Rows2,
  Settings,
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
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  DropdownMenu,
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
  PLAYBACK_SPEEDS,
  PREVIEW_SETTINGS_CONTROLS,
  ZOOM_OPTIONS,
  type ZoomValue,
  shouldRenderPreviewCloseControl,
} from "./preview-player-controls"
import { resolvePreviewSeekRatio } from "./preview-scrubber"
import { useRippleTimelinePlayerAdapter } from "./timeline-player-adapter"

interface HyperFramesPreviewPlayerProps {
  projectId: string
  compositionId?: string | null
  isMobile?: boolean
  onClose?: () => void
}

const PREVIEW_FPS = 30

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

function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00:00:00"
  const totalFrames = Math.max(0, Math.floor(seconds * PREVIEW_FPS))
  const frames = totalFrames % PREVIEW_FPS
  const totalSeconds = Math.floor(totalFrames / PREVIEW_FPS)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  return [
    hours,
    minutes,
    remainingSeconds,
    frames,
  ]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":")
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
  onClose,
}: HyperFramesPreviewPlayerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const timelineProgressRef = useRef<HTMLDivElement | null>(null)
  const timelineHandleRef = useRef<HTMLDivElement | null>(null)
  const timecodeRef = useRef<HTMLDivElement | null>(null)
  const durationRef = useRef(0)
  const [zoom, setZoom] = useState<ZoomValue>("fit")
  const [isElementFullscreen, setIsElementFullscreen] = useState(false)
  const [isTimelineVisible, setIsTimelineVisible] = useState(true)
  const [timelineHover, setTimelineHover] = useState<{
    percent: number
    time: number
  } | null>(null)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const adapter = useRippleTimelinePlayerAdapter({
    projectId,
    compositionId,
  })
  const startStudioPreviewMutation = trpc.hyperframes.startPreview.useMutation()
  const timelineQuery = trpc.hyperframes.getTimelineModel.useQuery(
    { projectId, compositionId },
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
      placeholderData: (previousData) => previousData,
      retry: 1,
    },
  )

  const {
    containerRef,
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
  } = playerState
  const timelineModel = runtimeTimelineModel ?? timelineQuery.data?.model ?? null
  const aspectRatio = source ? `${source.width} / ${source.height}` : "16 / 9"
  const scale = zoom === "fit" ? 100 : Number(zoom)
  const progress = duration > 0 ? clamp((currentTime / duration) * 100, 0, 100) : 0
  const zoomLabel = optionLabel(ZOOM_OPTIONS, zoom)
  const showCloseControl = shouldRenderPreviewCloseControl(onClose)
  const timelinePreview = timelineHover
  const timelinePreviewLeft = timelinePreview
    ? clamp(timelinePreview.percent, 4, 96)
    : 0
  const timelineError =
    timelineQuery.error instanceof Error && !runtimeTimelineModel
      ? timelineQuery.error.message
      : null

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsElementFullscreen(document.fullscreenElement === rootRef.current)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
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
      timecodeRef.current.textContent = formatTimecode(time)
    }
    if (timelineRef.current) {
      timelineRef.current.setAttribute("aria-valuenow", String(Math.min(time, liveDuration || 0)))
      timelineRef.current.setAttribute(
        "aria-valuetext",
        `${formatTime(time)} of ${formatTime(liveDuration)}`,
      )
    }
  }, [])

  useEffect(() => {
    durationRef.current = duration
    syncLivePreviewTime(currentTime)
  }, [currentTime, duration, syncLivePreviewTime])

  useEffect(() => subscribeLiveTime(syncLivePreviewTime), [subscribeLiveTime, syncLivePreviewTime])

  const handleTogglePlayback = () => {
    if (isPlaying) {
      adapter.pause()
    } else {
      adapter.play()
    }
  }

  const handleRestart = () => {
    adapter.restart()
  }

  const handleReload = () => {
    adapter.reload()
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
    const nextTime = clamp(value, 0, duration || 0)
    syncLivePreviewTime(nextTime)
    adapter.seek(nextTime)
  }

  const readTimelinePoint = (clientX: number) => {
    const timeline = timelineRef.current
    if (!timeline || !isReady || duration <= 0) return null

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
    if (!isReady || duration <= 0) return
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
    if (!isReady || duration <= 0) return

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
    if (!isReady || duration <= 0) return

    const frameStep = 1 / PREVIEW_FPS
    const step = event.shiftKey ? 1 : frameStep
    let nextTime = currentTime

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        nextTime = currentTime - step
        break
      case "ArrowRight":
      case "ArrowUp":
        nextTime = currentTime + step
        break
      case "PageDown":
        nextTime = currentTime - 1
        break
      case "PageUp":
        nextTime = currentTime + 1
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
    >
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-tl-background p-1">
        <div
          className={cn(
            "relative max-h-full overflow-hidden rounded-md bg-black shadow-sm ring-1 ring-border/70",
            zoom === "fit" && "max-w-full",
          )}
          style={{
            aspectRatio,
            width: `${scale}%`,
            maxWidth: zoom === "fit" ? "100%" : "none",
          }}
        >
          <div ref={containerRef} className="absolute inset-0" />
          {!isReady || errorMessage ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/85 p-6 text-center backdrop-blur-sm">
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
            tabIndex={isReady && duration > 0 ? 0 : -1}
            aria-disabled={!isReady || duration <= 0}
            aria-label="Preview time"
            aria-valuemin={0}
            aria-valuemax={duration || 0}
            aria-valuenow={Math.min(currentTime, duration || 0)}
            aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
            data-scrubbing={isScrubbing}
            onPointerDown={handleTimelinePointerDown}
            onPointerMove={handleTimelinePointerMove}
            onPointerUp={handleTimelinePointerUp}
            onPointerCancel={handleTimelinePointerUp}
            onPointerLeave={handleTimelinePointerLeave}
            onKeyDown={handleTimelineKeyDown}
            style={timelineThemeStyle}
            className="group/timeline relative flex h-8 min-w-0 flex-1 cursor-pointer items-center outline-none data-[scrubbing=false]:focus-visible:ring-2 data-[scrubbing=false]:focus-visible:ring-primary/40 data-[scrubbing=false]:focus-visible:ring-offset-2 data-[scrubbing=false]:focus-visible:ring-offset-background aria-disabled:cursor-default aria-disabled:opacity-40"
          >
            <div className="relative h-5 w-full">
              <div className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 bg-[var(--preview-timeline-rail)] transition-[height,background-color] duration-150 group-hover/timeline:h-2 group-hover/timeline:bg-[var(--preview-timeline-rail-hover)] group-data-[scrubbing=true]/timeline:h-2 group-data-[scrubbing=true]/timeline:bg-[var(--preview-timeline-rail-hover)]" />
              <div
                ref={timelineProgressRef}
                className="absolute left-0 top-1/2 h-[5px] -translate-y-1/2 bg-primary transition-[height] duration-150 group-hover/timeline:h-2 group-data-[scrubbing=true]/timeline:h-2"
                style={{ width: `${progress}%` }}
              />
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
                  {formatTimecode(timelinePreview.time)}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <div className="flex min-w-fit items-center gap-1">
            <PlayerIconButton
              label={isPlaying ? "Pause" : "Play"}
              onClick={handleTogglePlayback}
              disabled={!isReady}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
            </PlayerIconButton>

            <PlayerIconButton
              label={isLooping ? "Loop on" : "Loop off"}
              active={isLooping}
              onClick={handleLoopChange}
              disabled={!isReady}
              aria-pressed={isLooping}
            >
              <Repeat2 className="h-4 w-4" />
            </PlayerIconButton>

            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-7 items-center gap-1 rounded-full px-1.5 text-xs tabular-nums text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70 disabled:pointer-events-none disabled:opacity-40"
                      disabled={!isReady}
                    >
                      <Gauge className="h-3.5 w-3.5" />
                      {formatPlaybackSpeed(playbackSpeed)}
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

            <PlayerIconButton
              label={isMuted ? "Unmute preview" : "Mute preview"}
              active={isMuted}
              onClick={handleMuteChange}
              disabled={!isReady}
              aria-pressed={isMuted}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </PlayerIconButton>
          </div>

          <div className="mx-auto flex min-w-fit items-center gap-1.5">
            <PlayerIconButton
              label="Restart"
              onClick={handleRestart}
              disabled={!isReady}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </PlayerIconButton>
            <div
              ref={timecodeRef}
              className="min-w-[7.75rem] rounded-md bg-muted/40 px-2.5 py-1 text-center text-sm tabular-nums tracking-normal text-foreground shadow-sm ring-1 ring-border/50"
            >
              {formatTimecode(currentTime)}
            </div>
          </div>

          <div className="ml-auto flex min-w-fit items-center gap-1">
            <PlayerIconButton
              label={isTimelineVisible ? "Hide timeline" : "Show timeline"}
              active={isTimelineVisible}
              aria-pressed={isTimelineVisible}
              onClick={() => setIsTimelineVisible((visible) => !visible)}
              className={isTimelineVisible ? "text-primary hover:text-primary" : undefined}
            >
              <Rows2 className="h-4 w-4" />
            </PlayerIconButton>

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

            <PlayerIconButton
              label={isElementFullscreen ? "Exit fullscreen" : "Open fullscreen"}
              onClick={handleToggleFullscreen}
            >
              {isElementFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </PlayerIconButton>

            {showCloseControl ? (
              <PlayerIconButton label="Close preview" onClick={onClose}>
                <X className="h-4 w-4" />
              </PlayerIconButton>
            ) : null}
          </div>
        </div>

        {isTimelineVisible ? (
          <HyperFramesTimeline
            model={timelineModel}
            isLoading={timelineQuery.isLoading && !runtimeTimelineModel}
            error={timelineError}
            isReady={isReady}
            currentTime={currentTime}
            duration={duration}
            subscribeLiveTime={subscribeLiveTime}
            onSeek={handleSeek}
          />
        ) : null}
      </div>
    </div>
  )
}
