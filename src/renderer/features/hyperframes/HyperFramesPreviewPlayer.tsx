"use client"

import "@hyperframes/player"
import type { HyperframesPlayer } from "@hyperframes/player"
import {
  Gauge,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  Repeat2,
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
import { useEffect, useMemo, useRef, useState } from "react"
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
import {
  buildHyperframesPlayerBlobDocument,
  buildHyperframesPlayerFetchUrl,
} from "./player-source-url"
import {
  PLAYBACK_SPEEDS,
  PREVIEW_SETTINGS_CONTROLS,
  ZOOM_OPTIONS,
  type ZoomValue,
  shouldRenderPreviewCloseControl,
} from "./preview-player-controls"

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
            active && "text-foreground",
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
  const containerRef = useRef<HTMLDivElement | null>(null)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<HyperframesPlayer | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [isLooping, setIsLooping] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [zoom, setZoom] = useState<ZoomValue>("fit")
  const [isElementFullscreen, setIsElementFullscreen] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [playerSourceUrl, setPlayerSourceUrl] = useState<string | null>(null)
  const [sourceLoadError, setSourceLoadError] = useState<string | null>(null)
  const [timelineHover, setTimelineHover] = useState<{
    percent: number
    time: number
  } | null>(null)
  const [isScrubbing, setIsScrubbing] = useState(false)

  const sourceQuery = trpc.hyperframes.getPlayerSource.useQuery(
    { projectId, compositionId },
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
      retry: 1,
    },
  )

  const source = sourceQuery.data?.source
  const aspectRatio = source ? `${source.width} / ${source.height}` : "16 / 9"
  const scale = zoom === "fit" ? 100 : Number(zoom)
  const progress = duration > 0 ? clamp((currentTime / duration) * 100, 0, 100) : 0
  const zoomLabel = optionLabel(ZOOM_OPTIONS, zoom)
  const showCloseControl = shouldRenderPreviewCloseControl(onClose)
  const timelinePreview = timelineHover
  const timelinePreviewLeft = timelinePreview
    ? clamp(timelinePreview.percent, 4, 96)
    : 0
  const sourceUrl = useMemo(() => {
    if (!source?.sourceUrl) return null
    return buildHyperframesPlayerFetchUrl(source.sourceUrl, reloadVersion)
  }, [reloadVersion, source?.sourceUrl])
  const errorMessage =
    playerError ??
    sourceLoadError ??
    (sourceQuery.error instanceof Error ? sourceQuery.error.message : null)

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsElementFullscreen(document.fullscreenElement === rootRef.current)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const player = document.createElement("hyperframes-player") as HyperframesPlayer
    player.className = "block h-full w-full"
    player.style.width = "100%"
    player.style.height = "100%"
    player.playbackRate = 1
    player.loop = false
    player.muted = false
    playerRef.current = player
    container.appendChild(player)

    const handleReady = (event: Event) => {
      const readyEvent = event as CustomEvent<{ duration?: number }>
      const nextDuration =
        typeof readyEvent.detail?.duration === "number"
          ? readyEvent.detail.duration
          : player.duration
      setDuration(nextDuration)
      setCurrentTime(player.currentTime)
      setIsReady(true)
      setPlayerError(null)
    }
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)
    const handleTimeUpdate = (event: Event) => {
      const timeEvent = event as CustomEvent<{ currentTime?: number }>
      setCurrentTime(
        typeof timeEvent.detail?.currentTime === "number"
          ? timeEvent.detail.currentTime
          : player.currentTime,
      )
      setDuration(player.duration)
    }
    const handleError = (event: Event) => {
      const errorEvent = event as CustomEvent<{ message?: string }>
      setPlayerError(errorEvent.detail?.message ?? "The composition could not be loaded.")
      setIsReady(false)
      setIsPlaying(false)
    }

    player.addEventListener("ready", handleReady)
    player.addEventListener("play", handlePlay)
    player.addEventListener("pause", handlePause)
    player.addEventListener("ended", handleEnded)
    player.addEventListener("timeupdate", handleTimeUpdate)
    player.addEventListener("error", handleError)

    return () => {
      player.removeEventListener("ready", handleReady)
      player.removeEventListener("play", handlePlay)
      player.removeEventListener("pause", handlePause)
      player.removeEventListener("ended", handleEnded)
      player.removeEventListener("timeupdate", handleTimeUpdate)
      player.removeEventListener("error", handleError)
      player.remove()
      playerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.loop = isLooping
    }
  }, [isLooping])

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.muted = isMuted
    }
  }, [isMuted])

  useEffect(() => {
    if (!sourceUrl) {
      setPlayerSourceUrl(null)
      setSourceLoadError(null)
      return
    }

    let objectUrl: string | null = null
    const abortController = new AbortController()

    setPlayerSourceUrl(null)
    setSourceLoadError(null)

    setIsReady(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setPlayerError(null)
    playerRef.current?.pause()

    void (async () => {
      try {
        const response = await fetch(sourceUrl, {
          cache: "no-store",
          signal: abortController.signal,
        })

        if (!response.ok) {
          throw new Error(`Preview source returned ${response.status}.`)
        }

        const html = await response.text()
        if (abortController.signal.aborted) return

        objectUrl = URL.createObjectURL(
          new Blob(
            [buildHyperframesPlayerBlobDocument({ html, sourceUrl })],
            { type: "text/html" },
          ),
        )
        setPlayerSourceUrl(objectUrl)
      } catch (error) {
        if (abortController.signal.aborted) return

        const message = error instanceof Error ? error.message : String(error)
        setSourceLoadError(`Preview source could not be loaded. ${message}`)
      }
    })()

    return () => {
      abortController.abort()
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [sourceUrl])

  useEffect(() => {
    const player = playerRef.current
    if (!player || !source || !playerSourceUrl) return

    setIsReady(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setPlayerError(null)
    player.pause()
    player.setAttribute("width", String(source.width))
    player.setAttribute("height", String(source.height))
    player.removeAttribute("srcdoc")
    player.setAttribute("src", playerSourceUrl)
  }, [playerSourceUrl, source])

  const handleTogglePlayback = () => {
    const player = playerRef.current
    if (!player || !isReady) return
    if (isPlaying) {
      player.pause()
    } else {
      player.play()
    }
  }

  const handleRestart = () => {
    const player = playerRef.current
    if (!player || !isReady) return
    player.seek(0)
    setCurrentTime(0)
  }

  const handleReload = () => {
    setReloadVersion((version) => version + 1)
    void sourceQuery.refetch()
  }

  const handleSeek = (value: number) => {
    const player = playerRef.current
    if (!player || !isReady) return
    const nextTime = clamp(value, 0, duration || 0)
    player.seek(nextTime)
    setCurrentTime(nextTime)
  }

  const readTimelinePoint = (clientX: number) => {
    const timeline = timelineRef.current
    if (!timeline || !isReady || duration <= 0) return null

    const rect = timeline.getBoundingClientRect()
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
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

    event.currentTarget.setPointerCapture(event.pointerId)
    setIsScrubbing(true)
    const point = updateTimelineHover(event.clientX)
    if (point) {
      handleSeek(point.time)
    }
  }

  const handleTimelinePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!isReady || duration <= 0) return

    const point = updateTimelineHover(event.clientX)
    if (point && isScrubbing) {
      handleSeek(point.time)
    }
  }

  const handleTimelinePointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (isScrubbing) {
      const point = updateTimelineHover(event.clientX)
      if (point) {
        handleSeek(point.time)
      }
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setIsScrubbing(false)
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
    setPlaybackSpeed(nextSpeed)
    if (playerRef.current) {
      playerRef.current.playbackRate = nextSpeed
    }
  }

  const handleLoopChange = () => {
    setIsLooping((current) => {
      const next = !current
      if (playerRef.current) {
        playerRef.current.loop = next
      }
      return next
    })
  }

  const handleMuteChange = () => {
    setIsMuted((current) => {
      const next = !current
      if (playerRef.current) {
        playerRef.current.muted = next
      }
      return next
    })
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
                className="absolute left-0 top-1/2 h-[5px] -translate-y-1/2 bg-primary transition-[height] duration-150 group-hover/timeline:h-2 group-data-[scrubbing=true]/timeline:h-2"
                style={{ width: `${progress}%` }}
              />
              <div
                className="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-[var(--preview-timeline-handle)] transition-[height] duration-150 group-hover/timeline:h-5 group-data-[scrubbing=true]/timeline:h-5"
                style={{ left: `${progress}%` }}
              />
              {timelinePreview ? (
                <>
                  <div
                    className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-[var(--preview-timeline-handle)]"
                    style={{ left: `${timelinePreview.percent}%` }}
                  />
                  <div
                    className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-md bg-popover px-2 py-1 text-[11px] tabular-nums text-popover-foreground shadow-sm ring-1 ring-border/60"
                    style={{ left: `${timelinePreviewLeft}%` }}
                  >
                    {formatTimecode(timelinePreview.time)}
                  </div>
                </>
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
            <div className="min-w-[7.75rem] rounded-md bg-muted/40 px-2.5 py-1 text-center text-sm tabular-nums tracking-normal text-foreground shadow-sm ring-1 ring-border/50">
              {formatTimecode(currentTime)}
            </div>
          </div>

          <div className="ml-auto flex min-w-fit items-center gap-1">
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
      </div>
    </div>
  )
}
