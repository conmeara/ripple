"use client"

import "@hyperframes/player"
import type { HyperframesPlayer } from "@hyperframes/player"
import {
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "../../components/ui/button"
import { trpc } from "../../lib/trpc"
import { cn } from "../../lib/utils"

interface HyperFramesPreviewPlayerProps {
  projectId: string
  compositionId?: string | null
  isMobile?: boolean
  onClose?: () => void
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const wholeSeconds = Math.floor(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainingSeconds = wholeSeconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

function clampScale(value: number): number {
  return Math.min(150, Math.max(35, value))
}

export function HyperFramesPreviewPlayer({
  projectId,
  compositionId,
  isMobile = false,
  onClose,
}: HyperFramesPreviewPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<HyperframesPlayer | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [scale, setScale] = useState(100)
  const [reloadVersion, setReloadVersion] = useState(0)

  const sourceQuery = trpc.hyperframes.getPlayerSource.useQuery(
    { projectId, compositionId },
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
      retry: 1,
    },
  )

  const source = sourceQuery.data?.source
  const composition = sourceQuery.data?.composition
  const project = sourceQuery.data?.project
  const aspectRatio = source ? `${source.width} / ${source.height}` : "16 / 9"
  const sourceDocument = useMemo(() => {
    if (!source?.srcDoc) return null
    return `${source.srcDoc}\n<!-- ripple-player-reload:${reloadVersion} -->`
  }, [reloadVersion, source?.srcDoc])
  const statusLabel = playerError
    ? "Error"
    : sourceQuery.isLoading
      ? "Loading"
      : isReady
        ? isPlaying ? "Playing" : "Ready"
        : "Preparing"
  const errorMessage =
    playerError ??
    (sourceQuery.error instanceof Error ? sourceQuery.error.message : null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const player = document.createElement("hyperframes-player") as HyperframesPlayer
    player.className = "block h-full w-full"
    player.style.width = "100%"
    player.style.height = "100%"
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
    const player = playerRef.current
    if (!player || !source || !sourceDocument) return

    setIsReady(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setPlayerError(null)
    player.pause()
    player.setAttribute("width", String(source.width))
    player.setAttribute("height", String(source.height))
    player.removeAttribute("src")
    player.setAttribute("srcdoc", sourceDocument)
  }, [source, sourceDocument])

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
    player.seek(value)
    setCurrentTime(value)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-tl-background text-foreground">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {composition?.name ?? project?.name ?? "Preview"}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {project?.name ?? "Ripple project"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              errorMessage
                ? "bg-destructive/10 text-destructive"
                : isReady
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {statusLabel}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md"
            onClick={handleReload}
            disabled={sourceQuery.isFetching}
            aria-label="Reload preview"
          >
            <RefreshCw className={cn("h-4 w-4", sourceQuery.isFetching && "animate-spin")} />
          </Button>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md"
              onClick={onClose}
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-zinc-950 p-4">
        <div
          className="relative max-h-full max-w-full overflow-hidden rounded-md bg-black shadow-2xl ring-1 ring-white/10"
          style={{
            aspectRatio,
            width: `${scale}%`,
          }}
        >
          <div ref={containerRef} className="absolute inset-0" />
          {!isReady || errorMessage ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center">
              <div className="max-w-xs">
                <div className="text-sm font-medium text-white">
                  {errorMessage ? "Preview failed" : "Preparing preview"}
                </div>
                <div className="mt-1 text-xs text-white/60">
                  {errorMessage ?? "Loading the HyperFrames player."}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-9 w-9 rounded-md"
            onClick={handleTogglePlayback}
            disabled={!isReady}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-md"
            onClick={handleRestart}
            disabled={!isReady}
            aria-label="Restart"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <div className="min-w-[68px] text-center text-xs tabular-nums text-muted-foreground">
            {formatTime(currentTime)}
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={1 / 30}
            value={Math.min(currentTime, duration || 0)}
            disabled={!isReady || duration <= 0}
            onChange={(event) => handleSeek(Number(event.currentTarget.value))}
            className="h-2 min-w-0 flex-1 accent-primary"
            aria-label="Preview time"
          />
          <div className="min-w-[68px] text-center text-xs tabular-nums text-muted-foreground">
            {formatTime(duration)}
          </div>
          {!isMobile ? (
            <div className="ml-1 flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-md"
                onClick={() => setScale((value) => clampScale(value - 10))}
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <div className="w-11 text-center text-xs tabular-nums text-muted-foreground">
                {scale}%
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-md"
                onClick={() => setScale((value) => clampScale(value + 10))}
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
