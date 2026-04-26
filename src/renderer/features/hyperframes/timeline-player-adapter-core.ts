import type { HyperframesPlayer } from "@hyperframes/player"
import type { RippleTimelineRuntimeManifest } from "../../../shared/hyperframes-timeline-model"

export interface RipplePlaybackAdapter {
  getTime: () => number
  getDuration: () => number
  isPlaying: () => boolean
}

interface TimelineLike {
  time: () => number
  duration: () => number
  isActive: () => boolean
}

type IframePlaybackWindow = Window & {
  __clipManifest?: RippleTimelineRuntimeManifest
  __player?: RipplePlaybackAdapter
  __timeline?: TimelineLike
  __timelines?: Record<string, TimelineLike>
}

type PlayerLike = Pick<HyperframesPlayer, "currentTime" | "duration" | "paused"> & {
  iframeElement?: {
    contentWindow?: Window | null
    contentDocument?: Pick<Document, "querySelector"> | null
  } | null
}

export function safeDuration(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 7200
    ? value
    : 0
}

export function safeTime(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0
}

function wrapTimeline(timeline: TimelineLike): RipplePlaybackAdapter {
  return {
    getTime: () => timeline.time(),
    getDuration: () => timeline.duration(),
    isPlaying: () => timeline.isActive(),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isRuntimeTimelineMessage(value: unknown): value is RippleTimelineRuntimeManifest {
  return (
    isRecord(value) &&
    value.source === "hf-preview" &&
    value.type === "timeline" &&
    Array.isArray(value.clips)
  )
}

export function isRuntimeStateMessage(value: unknown): boolean {
  return isRecord(value) && value.source === "hf-preview" && value.type === "state"
}

export function readClipManifest(player: PlayerLike | null): RippleTimelineRuntimeManifest | null {
  try {
    const manifest = (player?.iframeElement?.contentWindow as IframePlaybackWindow | null | undefined)
      ?.__clipManifest

    return manifest && Array.isArray(manifest.clips) ? manifest : null
  } catch {
    return null
  }
}

export function resolvePlaybackAdapter(player: PlayerLike | null): RipplePlaybackAdapter | null {
  try {
    const iframe = player?.iframeElement
    const win = iframe?.contentWindow as IframePlaybackWindow | null | undefined
    if (!win) return null

    if (win.__player && typeof win.__player.getTime === "function") {
      return win.__player
    }

    if (win.__timeline) return wrapTimeline(win.__timeline)

    if (win.__timelines) {
      const keys = Object.keys(win.__timelines)
      if (keys.length === 0) return null

      const rootId = iframe?.contentDocument
        ?.querySelector("[data-composition-id]")
        ?.getAttribute("data-composition-id")
      const key = rootId && rootId in win.__timelines ? rootId : keys[keys.length - 1]
      const timeline = win.__timelines[key]
      return timeline ? wrapTimeline(timeline) : null
    }

    return null
  } catch {
    return null
  }
}

export function readLivePlaybackTime(player: PlayerLike | null): number {
  const adapter = resolvePlaybackAdapter(player)
  const adapterTime = adapter?.getTime()
  return typeof adapterTime === "number" && Number.isFinite(adapterTime) && adapterTime >= 0
    ? adapterTime
    : safeTime(player?.currentTime)
}

export function readLivePlaybackDuration(player: PlayerLike | null): number {
  const adapter = resolvePlaybackAdapter(player)
  return safeDuration(adapter?.getDuration()) || safeDuration(player?.duration)
}

export function readLivePlaybackPlaying(player: PlayerLike | null): boolean {
  if (!player) return false
  const adapter = resolvePlaybackAdapter(player)
  return adapter?.isPlaying() ?? !player.paused
}
