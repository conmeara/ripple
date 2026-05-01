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
import { buildHyperframesPlayerFetchUrl } from "./player-source-url"
import {
  getRipplePreparedPreviewDocument,
  logRipplePreviewPerformance,
  takeRipplePrewarmedPreviewPlayer,
} from "./preview-coordinator"
import {
  isRuntimeStateMessage,
  isRuntimeTimelineMessage,
  readClipManifest,
  readLivePlaybackDuration,
  readLivePlaybackPlaying,
  readLivePlaybackTime,
  resolveSeekTime,
  safeDuration,
  shouldHoldProgrammaticSeekReport,
} from "./timeline-player-adapter-core"

export type RippleTimelineLiveTimeListener = (time: number) => void

export interface RippleTimelinePlayerState {
  isReady: boolean
  isLoadingSource: boolean
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
  chatId?: string | null
  readySeekTime?: number | null
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
  isLoadingSource: false,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playerError: null,
  sourceLoadError: null,
  playbackSpeed: 1,
  isLooping: false,
  isMuted: false,
}

const PENDING_SEEK_SETTLE_TIMEOUT_MS = 180
const PENDING_SEEK_SETTLE_TOLERANCE_SECONDS = 0.02

function safeTime(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0
}

function createTimelinePlayerElement(): HyperframesPlayer {
  const player = document.createElement("hyperframes-player") as HyperframesPlayer
  styleTimelinePlayerElement(player)
  player.playbackRate = 1
  player.loop = false
  player.muted = false
  return player
}

function styleTimelinePlayerElement(player: HyperframesPlayer): void {
  player.className =
    "absolute inset-0 block h-full w-full bg-black opacity-0 transition-opacity duration-150 ease-out"
  player.style.width = "100%"
  player.style.height = "100%"
  player.style.pointerEvents = "none"
}

function configureTimelinePlayerSource(
  player: HyperframesPlayer,
  source: { width: number; height: number },
  playerSourceUrl: string,
): void {
  player.setAttribute("width", String(source.width))
  player.setAttribute("height", String(source.height))
  player.removeAttribute("srcdoc")
  player.setAttribute("src", playerSourceUrl)
}

export function useRippleTimelinePlayerAdapter({
  projectId,
  compositionId,
  revisionId,
  chatId,
  readySeekTime,
}: UseRippleTimelinePlayerAdapterInput): any {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<HyperframesPlayer | null>(null)
  const timelineContextRef = useRef<TimelineContext | null>(null)
  const liveTimeListenersRef = useRef(new Set<RippleTimelineLiveTimeListener>())
  const liveTimeRafRef = useRef<number | null>(null)
  const liveTimeLoopActiveRef = useRef(false)
  const durationRef = useRef(0)
  const isPlayingRef = useRef(false)
  const sourceHandoffRef = useRef(false)
  const readySeekTimeRef = useRef<number | null>(null)
  const activePlayerCleanupRef = useRef<(() => void) | null>(null)
  const pendingPlayerRef = useRef<HyperframesPlayer | null>(null)
  const pendingPlayerCleanupRef = useRef<(() => void) | null>(null)
  const activeObjectUrlRef = useRef<string | null>(null)
  const programmaticSeekRef = useRef<{ time: number; startedAt: number } | null>(null)
  const handoffIdRef = useRef(0)
  const objectUrlsRef = useRef(new Set<string>())
  const [state, setState] = useState<RippleTimelinePlayerState>(initialState)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [playerDocument, setPlayerDocument] = useState<{
    sourceUrl: string
    objectUrl: string
    prewarmedPlayer?: HyperframesPlayer
    prewarmedDuration?: number
  } | null>(null)
  const playerDocumentRef = useRef<typeof playerDocument>(null)
  const [timelineModel, setTimelineModel] = useState<RippleTimelineModel | null>(null)

  useEffect(() => {
    readySeekTimeRef.current =
      typeof readySeekTime === "number" && Number.isFinite(readySeekTime)
        ? Math.max(0, readySeekTime)
        : null
  }, [readySeekTime])

  const sourceQuery = trpc.hyperframes.getPlayerSource.useQuery(
    { projectId, compositionId, revisionId, chatId },
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
    playerDocumentRef.current = playerDocument
  }, [playerDocument])

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

  const markProgrammaticSeek = useCallback((time: number) => {
    const nextTime = safeTime(time)
    programmaticSeekRef.current =
      nextTime > 0 ? { time: nextTime, startedAt: performance.now() } : null
  }, [])

  const settleProgrammaticSeekReport = useCallback((
    player: HyperframesPlayer | null,
    reportedTime: number,
    duration?: number,
  ) => {
    const seek = programmaticSeekRef.current
    if (!seek) return safeTime(reportedTime)

    const requestedTime = resolveSeekTime(seek.time, duration ?? 0)
    const nextReportedTime = safeTime(reportedTime)
    const elapsedMs = performance.now() - seek.startedAt

    if (
      shouldHoldProgrammaticSeekReport({
        requestedTime,
        reportedTime: nextReportedTime,
        elapsedMs,
      })
    ) {
      logRipplePreviewPerformance("player:seek-hold", {
        requestedTime,
        reportedTime: nextReportedTime,
        elapsedMs: Math.round(elapsedMs),
      })
      try {
        player?.seek(requestedTime)
      } catch {
        // The visible state should stay on the requested frame even if a retry
        // races with the player internals during source handoff.
      }
      return requestedTime
    }

    programmaticSeekRef.current = null
    return nextReportedTime
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
      const settledTime = settleProgrammaticSeekReport(player, time, duration)
      notifyLiveTime(settledTime)

      const isRuntimePlaying = readLivePlaybackPlaying(player)
      if (duration > 0 && settledTime >= duration - 0.001 && !isRuntimePlaying) {
        liveTimeLoopActiveRef.current = false
        isPlayingRef.current = false
        setState((current) => ({
          ...current,
          currentTime: settledTime,
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
  }, [notifyLiveTime, settleProgrammaticSeekReport, stopLiveTimeLoop])

  const subscribeLiveTime = useCallback((listener: RippleTimelineLiveTimeListener) => {
    liveTimeListenersRef.current.add(listener)
    return () => {
      liveTimeListenersRef.current.delete(listener)
    }
  }, [])

  const bindActivePlayerEvents = useCallback((player: HyperframesPlayer) => {
    const handlePlay = () => {
      if (player !== playerRef.current) return
      isPlayingRef.current = true
      setState((current) => ({ ...current, isPlaying: true }))
      startLiveTimeLoop()
    }
    const handlePause = () => {
      if (player !== playerRef.current) return
      if (sourceHandoffRef.current) return
      const nextDuration = readLivePlaybackDuration(player) || durationRef.current
      const nextTime = settleProgrammaticSeekReport(
        player,
        readLivePlaybackTime(player),
        nextDuration,
      )
      notifyLiveTime(nextTime)
      isPlayingRef.current = false
      setState((current) => ({ ...current, currentTime: nextTime, isPlaying: false }))
      stopLiveTimeLoop()
    }
    const handleEnded = () => {
      if (player !== playerRef.current) return
      if (sourceHandoffRef.current) return
      const nextDuration = readLivePlaybackDuration(player) || durationRef.current
      const nextTime = settleProgrammaticSeekReport(
        player,
        readLivePlaybackTime(player),
        nextDuration,
      )
      notifyLiveTime(nextTime)
      isPlayingRef.current = false
      setState((current) => ({ ...current, currentTime: nextTime, isPlaying: false }))
      stopLiveTimeLoop()
    }
    const handleTimeUpdate = (event: Event) => {
      if (player !== playerRef.current) return
      if (sourceHandoffRef.current) return
      const timeEvent = event as CustomEvent<{ currentTime?: number }>
      const nextCurrentTime =
        typeof timeEvent.detail?.currentTime === "number"
          ? timeEvent.detail.currentTime
          : player.currentTime
      const nextDuration = safeDuration(player.duration)
      const settledTime = settleProgrammaticSeekReport(
        player,
        nextCurrentTime,
        nextDuration || durationRef.current,
      )
      notifyLiveTime(settledTime)
      setState((current) => ({
        ...current,
        currentTime: settledTime,
        duration: nextDuration || current.duration,
        isPlaying:
          !player.loop &&
          (nextDuration || current.duration) > 0 &&
          settledTime >= (nextDuration || current.duration) - 0.001
            ? false
            : current.isPlaying,
      }))
    }
    const handleError = (event: Event) => {
      if (player !== playerRef.current) return
      const errorEvent = event as CustomEvent<{ message?: string }>
      sourceHandoffRef.current = false
      setState((current) => ({
        ...current,
        playerError: errorEvent.detail?.message ?? "The composition could not be loaded.",
        isReady: false,
        isLoadingSource: false,
        isPlaying: false,
      }))
      isPlayingRef.current = false
      stopLiveTimeLoop()
    }

    player.addEventListener("play", handlePlay)
    player.addEventListener("pause", handlePause)
    player.addEventListener("ended", handleEnded)
    player.addEventListener("timeupdate", handleTimeUpdate)
    player.addEventListener("error", handleError)

    return () => {
      player.removeEventListener("play", handlePlay)
      player.removeEventListener("pause", handlePause)
      player.removeEventListener("ended", handleEnded)
      player.removeEventListener("timeupdate", handleTimeUpdate)
      player.removeEventListener("error", handleError)
    }
  }, [
    notifyLiveTime,
    settleProgrammaticSeekReport,
    startLiveTimeLoop,
    stopLiveTimeLoop,
  ])

  useEffect(() => {
    return () => {
      stopLiveTimeLoop()
      programmaticSeekRef.current = null
      activePlayerCleanupRef.current?.()
      activePlayerCleanupRef.current = null
      pendingPlayerCleanupRef.current?.()
      pendingPlayerCleanupRef.current = null
      playerRef.current?.remove()
      playerRef.current = null
      pendingPlayerRef.current?.remove()
      pendingPlayerRef.current = null
      activeObjectUrlRef.current = null
    }
  }, [stopLiveTimeLoop])

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
    const pendingPlayer = pendingPlayerRef.current
    if (pendingPlayer) pendingPlayer.playbackRate = state.playbackSpeed
  }, [state.playbackSpeed])

  useEffect(() => {
    const player = playerRef.current
    if (player) player.loop = state.isLooping
    const pendingPlayer = pendingPlayerRef.current
    if (pendingPlayer) pendingPlayer.loop = state.isLooping
  }, [state.isLooping])

  useEffect(() => {
    const player = playerRef.current
    if (player) player.muted = state.isMuted
    const pendingPlayer = pendingPlayerRef.current
    if (pendingPlayer) pendingPlayer.muted = state.isMuted
  }, [state.isMuted])

  useEffect(() => {
    const hasExistingPreview = Boolean(playerRef.current && activeObjectUrlRef.current)
    if (sourceUrl) {
      sourceHandoffRef.current = true
    }
    stopLiveTimeLoop()
    isPlayingRef.current = false
    const player = playerRef.current
    if (player) {
      player.pause()
    }

    if (!sourceUrl) {
      sourceHandoffRef.current = false
      programmaticSeekRef.current = null
      setTimelineModel(null)
      notifyLiveTime(0)
      pendingPlayerCleanupRef.current?.()
      pendingPlayerCleanupRef.current = null
      pendingPlayerRef.current?.remove()
      pendingPlayerRef.current = null
      activePlayerCleanupRef.current?.()
      activePlayerCleanupRef.current = null
      playerRef.current?.remove()
      playerRef.current = null
      activeObjectUrlRef.current = null
      objectUrlsRef.current.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
      objectUrlsRef.current.clear()
      setPlayerDocument((current) => {
        if (current) {
          if (current.objectUrl !== activeObjectUrlRef.current) {
            current.prewarmedPlayer?.remove()
          }
          playerDocumentRef.current = null
        }
        return null
      })
      setState((current) => ({
        ...current,
        isReady: false,
        isLoadingSource: false,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        playerError: null,
        sourceLoadError: null,
      }))
      return
    }

    const abortController = new AbortController()

    if (!hasExistingPreview) {
      setTimelineModel(null)
      if (readySeekTimeRef.current === null) {
        notifyLiveTime(0)
      }
    }
    setState((current) => ({
      ...current,
      isReady: hasExistingPreview ? current.isReady : false,
      isLoadingSource: true,
      isPlaying: false,
      currentTime: hasExistingPreview ? current.currentTime : 0,
      duration: hasExistingPreview ? current.duration : 0,
      playerError: null,
      sourceLoadError: null,
    }))

    void (async () => {
      try {
        logRipplePreviewPerformance("source:load-start", {
          sourceUrl,
          hasExistingPreview,
        })
        const prewarmedPlayer = takeRipplePrewarmedPreviewPlayer(sourceUrl)
        if (prewarmedPlayer) {
          if (abortController.signal.aborted) {
            prewarmedPlayer.player.remove()
            URL.revokeObjectURL(prewarmedPlayer.objectUrl)
            return
          }

          objectUrlsRef.current.add(prewarmedPlayer.objectUrl)
          setPlayerDocument((current) => {
            if (current && current.objectUrl !== activeObjectUrlRef.current) {
              current.prewarmedPlayer?.remove()
              revokeObjectUrl(current.objectUrl)
            }
            return {
              sourceUrl,
              objectUrl: prewarmedPlayer.objectUrl,
              prewarmedPlayer: prewarmedPlayer.player,
              prewarmedDuration: prewarmedPlayer.duration,
            }
          })
          return
        }

        const preparedDocument = await getRipplePreparedPreviewDocument(sourceUrl, {
          signal: abortController.signal,
        })
        if (abortController.signal.aborted) return

        const objectUrl = URL.createObjectURL(
          new Blob([preparedDocument.documentHtml], { type: "text/html" }),
        )
        objectUrlsRef.current.add(objectUrl)
        setPlayerDocument((current) => {
          if (current && current.objectUrl !== activeObjectUrlRef.current) {
            current.prewarmedPlayer?.remove()
            revokeObjectUrl(current.objectUrl)
          }
          return { sourceUrl, objectUrl }
        })
      } catch (error) {
        if (abortController.signal.aborted) return
        sourceHandoffRef.current = false

        const message = error instanceof Error ? error.message : String(error)
        setState((current) => ({
          ...current,
          isLoadingSource: false,
          sourceLoadError: `Preview source could not be loaded. ${message}`,
        }))
      }
    })()

    return () => {
      abortController.abort()
    }
  }, [notifyLiveTime, revokeObjectUrl, sourceUrl, stopLiveTimeLoop])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !source || !playerSourceUrl) return
    if (activeObjectUrlRef.current === playerSourceUrl && playerRef.current) return
    const claimedPrewarmedPlayer =
      playerDocument?.objectUrl === playerSourceUrl
        ? playerDocument.prewarmedPlayer ?? null
        : null

    const handoffId = handoffIdRef.current + 1
    handoffIdRef.current = handoffId
    pendingPlayerCleanupRef.current?.()
    pendingPlayerCleanupRef.current = null
    pendingPlayerRef.current?.remove()
    pendingPlayerRef.current = null

    const previousPlayer = playerRef.current
    if (previousPlayer) {
      previousPlayer.pause()
      previousPlayer.style.opacity = "1"
      previousPlayer.style.pointerEvents = "none"
      previousPlayer.style.zIndex = "1"
    }

    const pendingPlayer = claimedPrewarmedPlayer ?? createTimelinePlayerElement()
    styleTimelinePlayerElement(pendingPlayer)
    pendingPlayer.playbackRate = state.playbackSpeed
    pendingPlayer.loop = state.isLooping
    pendingPlayer.muted = state.isMuted
    pendingPlayer.style.zIndex = "2"
    pendingPlayerRef.current = pendingPlayer
    container.appendChild(pendingPlayer)
    logRipplePreviewPerformance("player:handoff-start", {
      sourceUrl,
      fromPrewarm: Boolean(claimedPrewarmedPlayer),
    })

    stopLiveTimeLoop()
    isPlayingRef.current = false
    sourceHandoffRef.current = true
    setState((current) => ({
      ...current,
      isReady: current.isReady && Boolean(previousPlayer),
      isLoadingSource: true,
      isPlaying: false,
      currentTime: current.isReady ? current.currentTime : 0,
      duration: current.isReady ? current.duration : 0,
      playerError: null,
    }))

    let revealFrame: number | null = null
    let settleFrame: number | null = null
    let seekSettleFrame: number | null = null
    let seekSettleTimer: number | null = null
    let removePreviousTimer: number | null = null

    const clearScheduledWork = () => {
      if (seekSettleFrame !== null) {
        cancelAnimationFrame(seekSettleFrame)
        seekSettleFrame = null
      }
      if (seekSettleTimer !== null) {
        window.clearTimeout(seekSettleTimer)
        seekSettleTimer = null
      }
      if (revealFrame !== null) {
        cancelAnimationFrame(revealFrame)
        revealFrame = null
      }
      if (settleFrame !== null) {
        cancelAnimationFrame(settleFrame)
        settleFrame = null
      }
      if (removePreviousTimer !== null) {
        window.clearTimeout(removePreviousTimer)
        removePreviousTimer = null
      }
    }

    const cleanupPendingLifecycle = () => {
      pendingPlayer.removeEventListener("ready", handleReady)
      pendingPlayer.removeEventListener("error", handleError)
    }

    const discardPendingPlayer = () => {
      clearScheduledWork()
      cleanupPendingLifecycle()
      if (pendingPlayerRef.current === pendingPlayer) {
        pendingPlayerRef.current = null
        pendingPlayerCleanupRef.current = null
      }
      if (playerRef.current !== pendingPlayer) {
        pendingPlayer.remove()
      }
    }

    const activatePendingPlayer = (nextDuration: number, nextTime: number) => {
      revealFrame = requestAnimationFrame(() => {
        settleFrame = requestAnimationFrame(() => {
          if (
            handoffIdRef.current !== handoffId ||
            pendingPlayerRef.current !== pendingPlayer
          ) {
            discardPendingPlayer()
            return
          }

          cleanupPendingLifecycle()
          pendingPlayerCleanupRef.current = null
          pendingPlayerRef.current = null

          const previousActivePlayer = playerRef.current
          const previousActiveCleanup = activePlayerCleanupRef.current
          const previousObjectUrl = activeObjectUrlRef.current

          previousActiveCleanup?.()
          activePlayerCleanupRef.current = bindActivePlayerEvents(pendingPlayer)
          playerRef.current = pendingPlayer
          activeObjectUrlRef.current = playerSourceUrl

          pendingPlayer.style.pointerEvents = "auto"
          pendingPlayer.style.opacity = "1"

          setState((current) => ({
            ...current,
            duration: nextDuration,
            currentTime: nextTime,
            isReady: true,
            isLoadingSource: false,
            isPlaying: false,
            playerError: null,
          }))
          sourceHandoffRef.current = false

          if (previousActivePlayer && previousActivePlayer !== pendingPlayer) {
            previousActivePlayer.style.opacity = "0"
            previousActivePlayer.style.pointerEvents = "none"
            removePreviousTimer = window.setTimeout(() => {
              previousActivePlayer.remove()
              if (previousObjectUrl && previousObjectUrl !== playerSourceUrl) {
                revokeObjectUrl(previousObjectUrl)
              }
            }, 180)
          }
        })
      })
    }

    const waitForPendingSeekThenActivate = (
      nextDuration: number,
      nextTime: number,
      shouldWaitForSeek: boolean,
    ) => {
      if (!shouldWaitForSeek || nextTime <= PENDING_SEEK_SETTLE_TOLERANCE_SECONDS) {
        activatePendingPlayer(nextDuration, nextTime)
        return
      }

      const startedAt = performance.now()
      const isSettled = () => {
        const liveTime = readLivePlaybackTime(pendingPlayer)
        return Math.abs(liveTime - nextTime) <= PENDING_SEEK_SETTLE_TOLERANCE_SECONDS
      }
      const finish = (reason: string) => {
        if (seekSettleTimer !== null) {
          window.clearTimeout(seekSettleTimer)
          seekSettleTimer = null
        }
        if (seekSettleFrame !== null) {
          cancelAnimationFrame(seekSettleFrame)
          seekSettleFrame = null
        }
        if (
          handoffIdRef.current !== handoffId ||
          pendingPlayerRef.current !== pendingPlayer
        ) {
          discardPendingPlayer()
          return
        }

        logRipplePreviewPerformance("player:seek-settled", {
          sourceUrl,
          reason,
          requestedTime: nextTime,
          reportedTime: readLivePlaybackTime(pendingPlayer),
          ms: Math.round(performance.now() - startedAt),
        })
        activatePendingPlayer(nextDuration, nextTime)
      }
      const check = () => {
        seekSettleFrame = null
        if (isSettled()) {
          finish("clock")
          return
        }

        try {
          pendingPlayer.seek(nextTime)
        } catch {
          // If the official player is between internal states, keep the
          // pending instance hidden and try again until the settle timeout.
        }
        seekSettleFrame = requestAnimationFrame(check)
      }

      seekSettleTimer = window.setTimeout(() => {
        seekSettleTimer = null
        if (seekSettleFrame !== null) {
          cancelAnimationFrame(seekSettleFrame)
          seekSettleFrame = null
        }
        finish("timeout")
      }, PENDING_SEEK_SETTLE_TIMEOUT_MS)
      seekSettleFrame = requestAnimationFrame(check)
    }

    function handleReady(event: Event) {
      if (
        handoffIdRef.current !== handoffId ||
        pendingPlayerRef.current !== pendingPlayer
      ) {
        discardPendingPlayer()
        return
      }

      const readyEvent = event as CustomEvent<{ duration?: number }>
      const nextDuration =
        safeDuration(readyEvent.detail?.duration) || safeDuration(pendingPlayer.duration)
      const requestedReadySeekTime = readySeekTimeRef.current
      const nextTime =
        typeof requestedReadySeekTime === "number"
          ? nextDuration > 0
            ? Math.min(requestedReadySeekTime, nextDuration)
            : requestedReadySeekTime
          : readLivePlaybackTime(pendingPlayer)

      if (typeof requestedReadySeekTime === "number") {
        markProgrammaticSeek(nextTime)
        pendingPlayer.seek(nextTime)
      }
      waitForPendingSeekThenActivate(
        nextDuration,
        nextTime,
        typeof requestedReadySeekTime === "number",
      )
    }

    function handleError(event: Event) {
      if (
        handoffIdRef.current !== handoffId ||
        pendingPlayerRef.current !== pendingPlayer
      ) {
        discardPendingPlayer()
        return
      }

      const errorEvent = event as CustomEvent<{ message?: string }>
      discardPendingPlayer()
      sourceHandoffRef.current = false
      setState((current) => ({
        ...current,
        playerError: errorEvent.detail?.message ?? "The composition could not be loaded.",
        isLoadingSource: false,
        isPlaying: false,
      }))
    }

    pendingPlayerCleanupRef.current = discardPendingPlayer
    if (claimedPrewarmedPlayer) {
      pendingPlayer.setAttribute("width", String(source.width))
      pendingPlayer.setAttribute("height", String(source.height))
      const nextDuration =
        safeDuration(playerDocument?.prewarmedDuration) ||
        safeDuration(pendingPlayer.duration)
      const requestedReadySeekTime = readySeekTimeRef.current
      const nextTime =
        typeof requestedReadySeekTime === "number"
          ? nextDuration > 0
            ? Math.min(requestedReadySeekTime, nextDuration)
            : requestedReadySeekTime
          : readLivePlaybackTime(pendingPlayer)

      if (typeof requestedReadySeekTime === "number") {
        markProgrammaticSeek(nextTime)
        pendingPlayer.seek(nextTime)
      }
      waitForPendingSeekThenActivate(
        nextDuration,
        nextTime,
        typeof requestedReadySeekTime === "number",
      )
    } else {
      pendingPlayer.addEventListener("ready", handleReady)
      pendingPlayer.addEventListener("error", handleError)
      configureTimelinePlayerSource(pendingPlayer, source, playerSourceUrl)
    }

    return () => {
      if (pendingPlayerRef.current === pendingPlayer) {
        discardPendingPlayer()
      }
    }
  }, [
    bindActivePlayerEvents,
    playerDocument,
    playerSourceUrl,
    revokeObjectUrl,
    source,
    sourceUrl,
    stopLiveTimeLoop,
  ])

  const play = useCallback(() => {
    const player = playerRef.current
    if (!player || !state.isReady) return
    const duration = state.duration || safeDuration(player.duration)
    if (duration > 0 && state.currentTime >= duration - 0.001) {
      programmaticSeekRef.current = null
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
    const nextTime = resolveSeekTime(value, maxDuration)
    markProgrammaticSeek(nextTime)
    logRipplePreviewPerformance("player:seek-request", {
      requestedTime: value,
      resolvedTime: nextTime,
      duration: maxDuration,
    })
    player.seek(nextTime)
    notifyLiveTime(nextTime)
    isPlayingRef.current = false
    setState((current) => ({ ...current, currentTime: nextTime }))
    stopLiveTimeLoop()
  }, [
    markProgrammaticSeek,
    notifyLiveTime,
    state.duration,
    state.isReady,
    stopLiveTimeLoop,
  ])

  const restart = useCallback(() => {
    seek(0)
  }, [seek])

  const reload = useCallback((options?: { seekTime?: number | null }) => {
    if (typeof options?.seekTime === "number" && Number.isFinite(options.seekTime)) {
      readySeekTimeRef.current = Math.max(0, options.seekTime)
    }
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
