"use client"

import "@hyperframes/player"
import type { HyperframesPlayer } from "@hyperframes/player"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type RippleTimelineModel,
  type RippleTimelineRuntimeManifest,
  normalizeRuntimeTimelineManifest,
} from "../../../shared/hyperframes-timeline-model"
import { trpc } from "../../lib/trpc"
import {
  buildHyperframesPlayerBlobDocument,
  buildHyperframesPlayerFetchUrl,
} from "./player-source-url"
import {
  isRuntimeStateMessage,
  isRuntimeTimelineMessage,
  readClipManifest,
  readLivePlaybackDuration,
  readLivePlaybackPlaying,
  readLivePlaybackTime,
  safeDuration,
} from "./timeline-player-adapter-core"

export type RippleTimelineLiveTimeListener = (time: number) => void

export interface RippleTimelinePlayerState {
  isReady: boolean
  isPlaying: boolean
  currentTime: number
  duration: number
  playerError: string | null
  sourceLoadError: string | null
  playbackSpeed: number
  isLooping: boolean
  isMuted: boolean
}

interface UseRippleTimelinePlayerAdapterInput {
  projectId: string
  compositionId?: string | null
  revisionId?: string | null
}

interface TimelineContext {
  projectId: string
  compositionId: string
  filePath: string
  width: number
  height: number
}

const initialState: RippleTimelinePlayerState = {
  isReady: false,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playerError: null,
  sourceLoadError: null,
  playbackSpeed: 1,
  isLooping: false,
  isMuted: false,
}

function safeTime(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0
}

export function useRippleTimelinePlayerAdapter({
  projectId,
  compositionId,
  revisionId,
}: UseRippleTimelinePlayerAdapterInput): any {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<HyperframesPlayer | null>(null)
  const timelineContextRef = useRef<TimelineContext | null>(null)
  const liveTimeListenersRef = useRef(new Set<RippleTimelineLiveTimeListener>())
  const liveTimeRafRef = useRef<number | null>(null)
  const liveTimeLoopActiveRef = useRef(false)
  const durationRef = useRef(0)
  const isPlayingRef = useRef(false)
  const objectUrlsRef = useRef(new Set<string>())
  const [state, setState] = useState<RippleTimelinePlayerState>(initialState)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [playerDocument, setPlayerDocument] = useState<{
    sourceUrl: string
    objectUrl: string
  } | null>(null)
  const [timelineModel, setTimelineModel] = useState<RippleTimelineModel | null>(null)

  const sourceQuery = trpc.hyperframes.getPlayerSource.useQuery(
    { projectId, compositionId, revisionId },
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
      placeholderData: (previousData) => previousData,
      retry: 1,
    },
  )

  const source = sourceQuery.data?.source
  const selectedComposition = sourceQuery.data?.composition
  const sourceUrl = useMemo(() => {
    if (!source?.sourceUrl) return null
    return buildHyperframesPlayerFetchUrl(source.sourceUrl, reloadVersion)
  }, [reloadVersion, source?.sourceUrl])
  const playerSourceUrl = playerDocument?.sourceUrl === sourceUrl ? playerDocument.objectUrl : null

  const revokeObjectUrl = useCallback((objectUrl: string) => {
    if (objectUrlsRef.current.delete(objectUrl)) {
      URL.revokeObjectURL(objectUrl)
    }
  }, [])

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
      objectUrlsRef.current.clear()
    }
  }, [])

  useEffect(() => {
    timelineContextRef.current =
      selectedComposition && source
        ? {
            projectId,
            compositionId: selectedComposition.id,
            filePath: selectedComposition.filePath,
            width: source.width,
            height: source.height,
          }
        : null
  }, [projectId, selectedComposition, source])

  useEffect(() => {
    durationRef.current = state.duration
    isPlayingRef.current = state.isPlaying
  }, [state.duration, state.isPlaying])

  const notifyLiveTime = useCallback((time: number) => {
    const nextTime = safeTime(time)
    liveTimeListenersRef.current.forEach((listener) => listener(nextTime))
  }, [])

  const stopLiveTimeLoop = useCallback(() => {
    liveTimeLoopActiveRef.current = false
    if (liveTimeRafRef.current !== null) {
      cancelAnimationFrame(liveTimeRafRef.current)
      liveTimeRafRef.current = null
    }
  }, [])

  const startLiveTimeLoop = useCallback(() => {
    stopLiveTimeLoop()
    liveTimeLoopActiveRef.current = true

    const tick = () => {
      const player = playerRef.current
      if (!player || !liveTimeLoopActiveRef.current) {
        liveTimeRafRef.current = null
        return
      }

      const time = readLivePlaybackTime(player)
      const duration = readLivePlaybackDuration(player) || durationRef.current
      notifyLiveTime(time)

      const isRuntimePlaying = readLivePlaybackPlaying(player)
      if (duration > 0 && time >= duration - 0.001 && !isRuntimePlaying) {
        liveTimeLoopActiveRef.current = false
        isPlayingRef.current = false
        setState((current) => ({
          ...current,
          currentTime: time,
          isPlaying: false,
        }))
        liveTimeRafRef.current = null
        return
      }

      if (!isPlayingRef.current && !isRuntimePlaying) {
        liveTimeLoopActiveRef.current = false
        liveTimeRafRef.current = null
        return
      }

      liveTimeRafRef.current = requestAnimationFrame(tick)
    }

    liveTimeRafRef.current = requestAnimationFrame(tick)
  }, [notifyLiveTime, stopLiveTimeLoop])

  const subscribeLiveTime = useCallback((listener: RippleTimelineLiveTimeListener) => {
    liveTimeListenersRef.current.add(listener)
    return () => {
      liveTimeListenersRef.current.delete(listener)
    }
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
      const nextDuration = safeDuration(readyEvent.detail?.duration) || safeDuration(player.duration)
      const nextTime = readLivePlaybackTime(player)
      notifyLiveTime(nextTime)
      setState((current) => ({
        ...current,
        duration: nextDuration,
        currentTime: nextTime,
        isReady: true,
        playerError: null,
      }))
    }
    const handlePlay = () => {
      isPlayingRef.current = true
      setState((current) => ({ ...current, isPlaying: true }))
      startLiveTimeLoop()
    }
    const handlePause = () => {
      const nextTime = readLivePlaybackTime(player)
      notifyLiveTime(nextTime)
      isPlayingRef.current = false
      setState((current) => ({ ...current, currentTime: nextTime, isPlaying: false }))
      stopLiveTimeLoop()
    }
    const handleEnded = () => {
      const nextTime = readLivePlaybackTime(player)
      notifyLiveTime(nextTime)
      isPlayingRef.current = false
      setState((current) => ({ ...current, currentTime: nextTime, isPlaying: false }))
      stopLiveTimeLoop()
    }
    const handleTimeUpdate = (event: Event) => {
      const timeEvent = event as CustomEvent<{ currentTime?: number }>
      const nextCurrentTime =
        typeof timeEvent.detail?.currentTime === "number"
          ? timeEvent.detail.currentTime
          : player.currentTime
      const nextDuration = safeDuration(player.duration)
      notifyLiveTime(nextCurrentTime)
      setState((current) => ({
        ...current,
        currentTime: nextCurrentTime,
        duration: nextDuration || current.duration,
        isPlaying:
          !player.loop &&
          (nextDuration || current.duration) > 0 &&
          nextCurrentTime >= (nextDuration || current.duration) - 0.001
            ? false
            : current.isPlaying,
      }))
    }
    const handleError = (event: Event) => {
      const errorEvent = event as CustomEvent<{ message?: string }>
      setState((current) => ({
        ...current,
        playerError: errorEvent.detail?.message ?? "The composition could not be loaded.",
        isReady: false,
        isPlaying: false,
      }))
      isPlayingRef.current = false
      stopLiveTimeLoop()
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
      stopLiveTimeLoop()
      isPlayingRef.current = false
      player.remove()
      playerRef.current = null
    }
  }, [notifyLiveTime, startLiveTimeLoop, stopLiveTimeLoop])

  const normalizeRuntimeManifest = useCallback((manifest: RippleTimelineRuntimeManifest) => {
    const context = timelineContextRef.current
    if (!context) return

    const model = normalizeRuntimeTimelineManifest({
      context,
      manifest,
    })
    if (!model) return

    setTimelineModel(model)
    if (model.durationSeconds) {
      setState((current) => ({
        ...current,
        duration: current.duration || model.durationSeconds || 0,
      }))
    }
  }, [])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const player = playerRef.current
      const iframe = player?.iframeElement
      if (!iframe || event.source !== iframe.contentWindow) return

      if (isRuntimeTimelineMessage(event.data)) {
        normalizeRuntimeManifest(event.data)
        return
      }

      if (isRuntimeStateMessage(event.data)) {
        const manifest = readClipManifest(player)
        if (manifest) normalizeRuntimeManifest(manifest)
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [normalizeRuntimeManifest])

  useEffect(() => {
    const player = playerRef.current
    if (player) player.playbackRate = state.playbackSpeed
  }, [state.playbackSpeed])

  useEffect(() => {
    const player = playerRef.current
    if (player) player.loop = state.isLooping
  }, [state.isLooping])

  useEffect(() => {
    const player = playerRef.current
    if (player) player.muted = state.isMuted
  }, [state.isMuted])

  useEffect(() => {
    setTimelineModel(null)
    notifyLiveTime(0)
    stopLiveTimeLoop()
    isPlayingRef.current = false
    const player = playerRef.current
    if (player) {
      player.pause()
      player.removeAttribute("src")
    }
    setPlayerDocument((current) => {
      if (current) revokeObjectUrl(current.objectUrl)
      return null
    })

    if (!sourceUrl) {
      setState((current) => ({
        ...current,
        isReady: false,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        playerError: null,
        sourceLoadError: null,
      }))
      return
    }

    const abortController = new AbortController()

    setState((current) => ({
      ...current,
      isReady: false,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playerError: null,
      sourceLoadError: null,
    }))

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

        const objectUrl = URL.createObjectURL(
          new Blob(
            [buildHyperframesPlayerBlobDocument({ html, sourceUrl })],
            { type: "text/html" },
          ),
        )
        objectUrlsRef.current.add(objectUrl)
        setPlayerDocument((current) => {
          if (current) revokeObjectUrl(current.objectUrl)
          return { sourceUrl, objectUrl }
        })
      } catch (error) {
        if (abortController.signal.aborted) return

        const message = error instanceof Error ? error.message : String(error)
        setState((current) => ({
          ...current,
          sourceLoadError: `Preview source could not be loaded. ${message}`,
        }))
      }
    })()

    return () => {
      abortController.abort()
    }
  }, [notifyLiveTime, revokeObjectUrl, sourceUrl, stopLiveTimeLoop])

  useEffect(() => {
    const player = playerRef.current
    if (!player || !source || !playerSourceUrl) return

    setState((current) => ({
      ...current,
      isReady: current.isReady,
      isPlaying: false,
      currentTime: 0,
      duration: current.isReady ? current.duration : 0,
      playerError: null,
    }))
    notifyLiveTime(0)
    stopLiveTimeLoop()
    isPlayingRef.current = false
    player.pause()
    player.setAttribute("width", String(source.width))
    player.setAttribute("height", String(source.height))
    player.removeAttribute("srcdoc")
    player.setAttribute("src", playerSourceUrl)
  }, [notifyLiveTime, playerSourceUrl, source, stopLiveTimeLoop])

  const play = useCallback(() => {
    const player = playerRef.current
    if (!player || !state.isReady) return
    const duration = state.duration || safeDuration(player.duration)
    if (duration > 0 && state.currentTime >= duration - 0.001) {
      player.seek(0)
      notifyLiveTime(0)
      setState((current) => ({ ...current, currentTime: 0 }))
    }
    player.play()
    isPlayingRef.current = true
    startLiveTimeLoop()
  }, [notifyLiveTime, startLiveTimeLoop, state.currentTime, state.duration, state.isReady])

  const pause = useCallback(() => {
    const player = playerRef.current
    if (!player || !state.isReady) return
    player.pause()
  }, [state.isReady])

  const seek = useCallback((value: number) => {
    const player = playerRef.current
    if (!player || !state.isReady) return
    const maxDuration = state.duration || safeDuration(player.duration)
    const nextTime = Math.min(Math.max(value, 0), maxDuration || 0)
    player.seek(nextTime)
    notifyLiveTime(nextTime)
    isPlayingRef.current = false
    setState((current) => ({ ...current, currentTime: nextTime }))
    stopLiveTimeLoop()
  }, [notifyLiveTime, state.duration, state.isReady, stopLiveTimeLoop])

  const restart = useCallback(() => {
    seek(0)
  }, [seek])

  const reload = useCallback(() => {
    setTimelineModel(null)
    setReloadVersion((version) => version + 1)
    void sourceQuery.refetch()
  }, [sourceQuery])

  const setPlaybackSpeed = useCallback((playbackSpeed: number) => {
    setState((current) => ({ ...current, playbackSpeed }))
  }, [])

  const setLooping = useCallback((isLooping: boolean) => {
    setState((current) => ({ ...current, isLooping }))
  }, [])

  const setMuted = useCallback((isMuted: boolean) => {
    setState((current) => ({ ...current, isMuted }))
  }, [])

  return {
    containerRef,
    playerRef,
    state,
    sourceQuery,
    source,
    selectedComposition,
    timelineModel,
    subscribeLiveTime,
    errorMessage:
      state.playerError ??
      state.sourceLoadError ??
      (sourceQuery.error instanceof Error ? sourceQuery.error.message : null),
    play,
    pause,
    seek,
    restart,
    reload,
    setPlaybackSpeed,
    setLooping,
    setMuted,
  }
}
