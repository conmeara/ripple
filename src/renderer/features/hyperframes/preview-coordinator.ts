"use client"

import "@hyperframes/player"
import type { HyperframesPlayer } from "@hyperframes/player"
import { buildHyperframesPlayerBlobDocument } from "./player-source-url"

export const RIPPLE_PREVIEW_COORDINATOR_LIMITS = {
  maxPreparedDocuments: 18,
  maxPreparedBytes: 36 * 1024 * 1024,
  maxPreparedPlayers: 6,
} as const

export interface RipplePreparedPreviewDocument {
  sourceUrl: string
  documentHtml: string
  byteLength: number
  fromCache: boolean
}

interface PreparedPreviewCacheEntry {
  sourceUrl: string
  documentHtml: string
  byteLength: number
  lastAccessedAt: number
}

interface PrewarmedPreviewPlayerEntry {
  sourceUrl: string
  objectUrl: string
  player: HyperframesPlayer
  status: "loading" | "ready" | "failed"
  duration: number
  createdAt: number
  lastAccessedAt: number
  cleanup: () => void
}

export interface RippleClaimedPreviewPlayer {
  sourceUrl: string
  objectUrl: string
  player: HyperframesPlayer
  duration: number
}

type PreparedPreviewLoad = Promise<RipplePreparedPreviewDocument>

const preparedPreviewDocuments = new Map<string, PreparedPreviewCacheEntry>()
const pendingPreviewDocumentLoads = new Map<string, PreparedPreviewLoad>()
const prewarmedPreviewPlayers = new Map<string, PrewarmedPreviewPlayerEntry>()
const textEncoder = new TextEncoder()
let prewarmHost: HTMLDivElement | null = null

export function logRipplePreviewPerformance(
  event: string,
  details: Record<string, unknown> = {},
): void {
  const enabled =
    import.meta.env.DEV ||
    (typeof window !== "undefined" &&
      window.localStorage?.getItem("ripple:preview-debug") === "1")

  if (!enabled) return

  console.info(`[RipplePreview] ${event}`, {
    t: Math.round(performance.now()),
    ...details,
  })
}

function createAbortError(): Error {
  const error = new Error("Preview source load was cancelled.")
  error.name = "AbortError"
  return error
}

function estimateByteLength(value: string): number {
  return textEncoder.encode(value).byteLength
}

function ensurePrewarmHost(): HTMLDivElement | null {
  if (typeof document === "undefined") return null
  if (prewarmHost?.isConnected) return prewarmHost

  prewarmHost = document.createElement("div")
  prewarmHost.setAttribute("data-ripple-preview-prewarm-host", "true")
  Object.assign(prewarmHost.style, {
    position: "fixed",
    left: "-10000px",
    top: "-10000px",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    opacity: "0",
    pointerEvents: "none",
  })
  document.body.appendChild(prewarmHost)
  return prewarmHost
}

function configurePrewarmedPreviewPlayer(input: {
  player: HyperframesPlayer
  width: number
  height: number
  objectUrl: string
}): void {
  input.player.style.width = `${input.width}px`
  input.player.style.height = `${input.height}px`
  input.player.style.pointerEvents = "none"
  input.player.playbackRate = 1
  input.player.loop = false
  input.player.muted = false
  input.player.setAttribute("width", String(input.width))
  input.player.setAttribute("height", String(input.height))
  input.player.removeAttribute("srcdoc")
  input.player.setAttribute("src", input.objectUrl)
}

function toPreparedDocument(
  entry: PreparedPreviewCacheEntry,
  fromCache: boolean,
): RipplePreparedPreviewDocument {
  return {
    sourceUrl: entry.sourceUrl,
    documentHtml: entry.documentHtml,
    byteLength: entry.byteLength,
    fromCache,
  }
}

function preparedPreviewByteTotal(): number {
  let total = 0
  preparedPreviewDocuments.forEach((entry) => {
    total += entry.byteLength
  })
  return total
}

function evictPreparedPreviewDocuments(): void {
  let totalBytes = preparedPreviewByteTotal()

  while (
    preparedPreviewDocuments.size > RIPPLE_PREVIEW_COORDINATOR_LIMITS.maxPreparedDocuments ||
    (totalBytes > RIPPLE_PREVIEW_COORDINATOR_LIMITS.maxPreparedBytes &&
      preparedPreviewDocuments.size > 1)
  ) {
    let oldestSourceUrl: string | null = null
    let oldestAccess = Number.POSITIVE_INFINITY

    preparedPreviewDocuments.forEach((entry) => {
      if (entry.lastAccessedAt < oldestAccess) {
        oldestAccess = entry.lastAccessedAt
        oldestSourceUrl = entry.sourceUrl
      }
    })

    if (!oldestSourceUrl) return

    const evicted = preparedPreviewDocuments.get(oldestSourceUrl)
    preparedPreviewDocuments.delete(oldestSourceUrl)
    totalBytes -= evicted?.byteLength ?? 0
  }
}

function disposePrewarmedPreviewPlayer(
  entry: PrewarmedPreviewPlayerEntry,
  reason: string,
): void {
  entry.cleanup()
  entry.player.remove()
  URL.revokeObjectURL(entry.objectUrl)
  logRipplePreviewPerformance("player:evict", {
    reason,
    sourceUrl: entry.sourceUrl,
    status: entry.status,
  })
}

function evictPrewarmedPreviewPlayers(
  maxSize: number = RIPPLE_PREVIEW_COORDINATOR_LIMITS.maxPreparedPlayers,
): void {
  while (
    prewarmedPreviewPlayers.size > maxSize
  ) {
    let oldestSourceUrl: string | null = null
    let oldestAccess = Number.POSITIVE_INFINITY

    prewarmedPreviewPlayers.forEach((entry) => {
      if (entry.status === "loading") return
      if (entry.lastAccessedAt < oldestAccess) {
        oldestAccess = entry.lastAccessedAt
        oldestSourceUrl = entry.sourceUrl
      }
    })

    if (!oldestSourceUrl) {
      prewarmedPreviewPlayers.forEach((entry) => {
        if (entry.lastAccessedAt < oldestAccess) {
          oldestAccess = entry.lastAccessedAt
          oldestSourceUrl = entry.sourceUrl
        }
      })
    }

    if (!oldestSourceUrl) return

    const evicted = prewarmedPreviewPlayers.get(oldestSourceUrl)
    prewarmedPreviewPlayers.delete(oldestSourceUrl)
    if (evicted) disposePrewarmedPreviewPlayer(evicted, "capacity")
  }
}

async function fetchPreparedPreviewDocument(
  sourceUrl: string,
): Promise<RipplePreparedPreviewDocument> {
  const startedAt = performance.now()
  logRipplePreviewPerformance("document:fetch-start", { sourceUrl })
  const response = await fetch(sourceUrl, { cache: "no-store" })

  if (!response.ok) {
    throw new Error(`Preview source returned ${response.status}.`)
  }

  const html = await response.text()
  const documentHtml = buildHyperframesPlayerBlobDocument({ html, sourceUrl })
  const entry: PreparedPreviewCacheEntry = {
    sourceUrl,
    documentHtml,
    byteLength: estimateByteLength(documentHtml),
    lastAccessedAt: Date.now(),
  }

  preparedPreviewDocuments.set(sourceUrl, entry)
  evictPreparedPreviewDocuments()
  logRipplePreviewPerformance("document:fetch-done", {
    sourceUrl,
    ms: Math.round(performance.now() - startedAt),
    bytes: entry.byteLength,
  })

  return toPreparedDocument(entry, false)
}

function waitForPreviewDocument(
  load: PreparedPreviewLoad,
  signal?: AbortSignal,
): PreparedPreviewLoad {
  if (!signal) return load
  if (signal.aborted) return Promise.reject(createAbortError())

  return new Promise((resolve, reject) => {
    const handleAbort = () => reject(createAbortError())

    signal.addEventListener("abort", handleAbort, { once: true })
    load.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", handleAbort)
    })
  })
}

export function getRipplePreviewCoordinatorStats(): {
  preparedDocuments: number
  pendingDocuments: number
  preparedBytes: number
  preparedPlayers: number
} {
  return {
    preparedDocuments: preparedPreviewDocuments.size,
    pendingDocuments: pendingPreviewDocumentLoads.size,
    preparedBytes: preparedPreviewByteTotal(),
    preparedPlayers: prewarmedPreviewPlayers.size,
  }
}

export async function getRipplePreparedPreviewDocument(
  sourceUrl: string,
  options: { signal?: AbortSignal } = {},
): Promise<RipplePreparedPreviewDocument> {
  const cached = preparedPreviewDocuments.get(sourceUrl)
  if (cached) {
    cached.lastAccessedAt = Date.now()
    logRipplePreviewPerformance("document:cache-hit", {
      sourceUrl,
      bytes: cached.byteLength,
    })
    return toPreparedDocument(cached, true)
  }

  let load = pendingPreviewDocumentLoads.get(sourceUrl)
  if (!load) {
    load = fetchPreparedPreviewDocument(sourceUrl).finally(() => {
      pendingPreviewDocumentLoads.delete(sourceUrl)
    })
    pendingPreviewDocumentLoads.set(sourceUrl, load)
  }

  return waitForPreviewDocument(load, options.signal)
}

export function prewarmRipplePreparedPreviewDocument(sourceUrl: string | null | undefined): void {
  if (!sourceUrl) return
  if (preparedPreviewDocuments.has(sourceUrl) || pendingPreviewDocumentLoads.has(sourceUrl)) {
    logRipplePreviewPerformance("document:prewarm-skip", { sourceUrl })
    return
  }

  logRipplePreviewPerformance("document:prewarm-start", { sourceUrl })
  void getRipplePreparedPreviewDocument(sourceUrl).catch(() => {
    // Prewarming is speculative. The visible preview path will report real errors.
  })
}

export function prewarmRipplePreviewPlayer(input: {
  sourceUrl: string | null | undefined
  width: number
  height: number
  reason?: string
}): void {
  if (!input.sourceUrl || typeof document === "undefined") return
  const existing = prewarmedPreviewPlayers.get(input.sourceUrl)
  if (existing) {
    existing.lastAccessedAt = Date.now()
    logRipplePreviewPerformance("player:prewarm-skip", {
      sourceUrl: input.sourceUrl,
      status: existing.status,
      reason: input.reason,
    })
    return
  }

  if (
    prewarmedPreviewPlayers.size >=
    RIPPLE_PREVIEW_COORDINATOR_LIMITS.maxPreparedPlayers
  ) {
    evictPrewarmedPreviewPlayers(
      RIPPLE_PREVIEW_COORDINATOR_LIMITS.maxPreparedPlayers - 1,
    )
  }
  if (
    prewarmedPreviewPlayers.size >=
    RIPPLE_PREVIEW_COORDINATOR_LIMITS.maxPreparedPlayers
  ) {
    logRipplePreviewPerformance("player:prewarm-capacity-skip", {
      sourceUrl: input.sourceUrl,
      reason: input.reason,
    })
    return
  }

  const startedAt = performance.now()
  logRipplePreviewPerformance("player:prewarm-start", {
    sourceUrl: input.sourceUrl,
    reason: input.reason,
  })

  void getRipplePreparedPreviewDocument(input.sourceUrl)
    .then((preparedDocument) => {
      if (!input.sourceUrl || prewarmedPreviewPlayers.has(input.sourceUrl)) return

      const host = ensurePrewarmHost()
      if (!host) return

      const objectUrl = URL.createObjectURL(
        new Blob([preparedDocument.documentHtml], { type: "text/html" }),
      )
      const player = document.createElement("hyperframes-player") as HyperframesPlayer
      const createdAt = Date.now()
      let cleanup = () => {}
      const entry: PrewarmedPreviewPlayerEntry = {
        sourceUrl: input.sourceUrl,
        objectUrl,
        player,
        status: "loading",
        duration: 0,
        createdAt,
        lastAccessedAt: createdAt,
        cleanup: () => cleanup(),
      }

      const handleReady = (event: Event) => {
        const readyEvent = event as CustomEvent<{ duration?: number }>
        entry.status = "ready"
        entry.duration =
          typeof readyEvent.detail?.duration === "number"
            ? readyEvent.detail.duration
            : Number(player.duration) || 0
        entry.lastAccessedAt = Date.now()
        logRipplePreviewPerformance("player:prewarm-ready", {
          sourceUrl: entry.sourceUrl,
          ms: Math.round(performance.now() - startedAt),
          duration: entry.duration,
        })
      }
      const handleError = (event: Event) => {
        const errorEvent = event as CustomEvent<{ message?: string }>
        entry.status = "failed"
        logRipplePreviewPerformance("player:prewarm-error", {
          sourceUrl: entry.sourceUrl,
          ms: Math.round(performance.now() - startedAt),
          message: errorEvent.detail?.message ?? "Unknown player error",
        })
      }

      cleanup = () => {
        player.removeEventListener("ready", handleReady)
        player.removeEventListener("error", handleError)
      }

      prewarmedPreviewPlayers.set(input.sourceUrl, entry)
      player.addEventListener("ready", handleReady)
      player.addEventListener("error", handleError)
      host.appendChild(player)
      configurePrewarmedPreviewPlayer({
        player,
        width: input.width,
        height: input.height,
        objectUrl,
      })
      evictPrewarmedPreviewPlayers()
    })
    .catch((error) => {
      logRipplePreviewPerformance("player:prewarm-error", {
        sourceUrl: input.sourceUrl,
        ms: Math.round(performance.now() - startedAt),
        message: error instanceof Error ? error.message : String(error),
      })
    })
}

export function takeRipplePrewarmedPreviewPlayer(
  sourceUrl: string,
): RippleClaimedPreviewPlayer | null {
  const entry = prewarmedPreviewPlayers.get(sourceUrl)
  if (!entry) {
    logRipplePreviewPerformance("player:take-miss", { sourceUrl, reason: "missing" })
    return null
  }

  entry.lastAccessedAt = Date.now()
  if (entry.status !== "ready") {
    logRipplePreviewPerformance("player:take-miss", {
      sourceUrl,
      reason: entry.status,
    })
    prewarmedPreviewPlayers.delete(sourceUrl)
    disposePrewarmedPreviewPlayer(entry, `take-${entry.status}`)
    return null
  }

  prewarmedPreviewPlayers.delete(sourceUrl)
  entry.cleanup()
  entry.player.remove()
  logRipplePreviewPerformance("player:take-hit", {
    sourceUrl,
    duration: entry.duration,
    ageMs: Date.now() - entry.createdAt,
  })

  return {
    sourceUrl,
    objectUrl: entry.objectUrl,
    player: entry.player,
    duration: entry.duration,
  }
}

export function clearRipplePreviewCoordinator(): void {
  preparedPreviewDocuments.clear()
  pendingPreviewDocumentLoads.clear()
  prewarmedPreviewPlayers.forEach((entry) => disposePrewarmedPreviewPlayer(entry, "clear"))
  prewarmedPreviewPlayers.clear()
}

export function clearRipplePreviewCoordinatorForTests(): void {
  clearRipplePreviewCoordinator()
}
