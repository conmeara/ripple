import { EventEmitter } from "node:events"
import { extname } from "node:path"
import type { Stats } from "node:fs"
import type { FSWatcher } from "chokidar"
import {
  HYPERFRAMES_SOURCE_WATCHED_EXTENSIONS,
  type HyperframesSourceWatchChange,
  type HyperframesSourceWatchChangeType,
} from "../../../shared/hyperframes-source-watch"

const HYPERFRAMES_SOURCE_WATCH_DEBOUNCE_MS = 300
const WATCHED_EXTENSION_SET = new Set<string>(HYPERFRAMES_SOURCE_WATCHED_EXTENSIONS)
const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".ripple",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
])

function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), wait)
  }
}

function normalizeWatchPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "")
}

export function isHyperframesSourceWatchPath(filePath: string): boolean {
  return WATCHED_EXTENSION_SET.has(extname(filePath).toLowerCase())
}

export function shouldIgnoreHyperframesSourceWatchPath(
  filePath: string,
  stats?: Stats,
): boolean {
  const normalized = normalizeWatchPath(filePath)
  const segments = normalized.split("/").filter(Boolean)
  if (segments.some((segment) => IGNORED_DIRECTORY_NAMES.has(segment))) {
    return true
  }

  if (stats?.isFile()) {
    return !isHyperframesSourceWatchPath(normalized)
  }

  return false
}

export interface HyperframesSourceWatchBatchEvent {
  projectPath: string
  changes: HyperframesSourceWatchChange[]
  timestamp: number
}

interface HyperframesSourceWatcherConfig {
  projectPath: string
  debounceMs?: number
}

export class HyperframesSourceWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null
  private pendingChanges = new Map<string, HyperframesSourceWatchChangeType>()
  private isDisposed = false
  private readonly projectPath: string
  private readonly debounceMs: number
  private readonly initPromise: Promise<void>

  constructor(config: HyperframesSourceWatcherConfig) {
    super()
    this.projectPath = config.projectPath
    this.debounceMs = config.debounceMs ?? HYPERFRAMES_SOURCE_WATCH_DEBOUNCE_MS
    this.initPromise = this.initWatcher()
  }

  private async initWatcher(): Promise<void> {
    const chokidar = await import("chokidar")

    const flushChanges = debounce(() => {
      if (this.isDisposed || this.pendingChanges.size === 0) return

      const changes = Array.from(this.pendingChanges.entries()).map(
        ([path, type]) => ({ path, type }),
      )
      this.pendingChanges.clear()

      const event: HyperframesSourceWatchBatchEvent = {
        projectPath: this.projectPath,
        changes,
        timestamp: Date.now(),
      }
      this.emit("change", event)
    }, this.debounceMs)

    const recordChange = (
      type: HyperframesSourceWatchChangeType,
      filePath: string,
    ) => {
      const normalized = normalizeWatchPath(filePath)
      if (!isHyperframesSourceWatchPath(normalized)) return
      this.pendingChanges.set(normalized, type)
      flushChanges()
    }

    this.watcher = chokidar.watch(".", {
      cwd: this.projectPath,
      persistent: true,
      ignoreInitial: true,
      ignored: shouldIgnoreHyperframesSourceWatchPath,
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 25,
      },
      usePolling: false,
      followSymlinks: false,
    })

    this.watcher
      .on("add", (path: string) => recordChange("add", path))
      .on("change", (path: string) => recordChange("change", path))
      .on("unlink", (path: string) => recordChange("unlink", path))
      .on("error", (error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error))
        console.error("[HyperFramesSourceWatcher] Error:", err)
        this.emit("error", err)
      })

    await new Promise<void>((resolve) => {
      this.watcher?.once("ready", resolve)
    })

    console.log(`[HyperFramesSourceWatcher] Watching: ${this.projectPath}`)
  }

  async waitForReady(): Promise<void> {
    await this.initPromise
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) return
    this.isDisposed = true
    this.pendingChanges.clear()
    await this.watcher?.close()
    this.removeAllListeners()
    console.log(`[HyperFramesSourceWatcher] Disposed: ${this.projectPath}`)
  }
}

export class HyperframesSourceWatcherRegistry {
  private watchers = new Map<string, HyperframesSourceWatcher>()
  private listeners = new Map<string, Set<(event: HyperframesSourceWatchBatchEvent) => void>>()

  async getOrCreate(projectPath: string): Promise<HyperframesSourceWatcher> {
    let watcher = this.watchers.get(projectPath)
    if (!watcher) {
      watcher = new HyperframesSourceWatcher({ projectPath })
      this.watchers.set(projectPath, watcher)
      watcher.on("change", (event: HyperframesSourceWatchBatchEvent) => {
        const listeners = this.listeners.get(projectPath)
        if (!listeners) return
        for (const listener of listeners) listener(event)
      })
      watcher.on("error", (error: Error) => {
        console.error(`[HyperFramesSourceWatcher] Registry error for ${projectPath}:`, error)
      })
    }

    await watcher.waitForReady()
    return watcher
  }

  async subscribe(
    projectPath: string,
    listener: (event: HyperframesSourceWatchBatchEvent) => void,
  ): Promise<() => void> {
    await this.getOrCreate(projectPath)

    let listeners = this.listeners.get(projectPath)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(projectPath, listeners)
    }
    listeners.add(listener)

    return () => {
      const current = this.listeners.get(projectPath)
      if (!current) return
      current.delete(listener)
      if (current.size === 0) {
        this.listeners.delete(projectPath)
        const watcher = this.watchers.get(projectPath)
        this.watchers.delete(projectPath)
        void watcher?.dispose().catch((error) => {
          console.error(`[HyperFramesSourceWatcher] Failed to dispose ${projectPath}:`, error)
        })
      }
    }
  }

  hasWatcher(projectPath: string): boolean {
    return this.watchers.has(projectPath)
  }

  async dispose(projectPath: string): Promise<void> {
    const watcher = this.watchers.get(projectPath)
    if (!watcher) return
    await watcher.dispose()
    this.watchers.delete(projectPath)
    this.listeners.delete(projectPath)
  }

  async disposeAll(): Promise<void> {
    const disposals = Array.from(this.watchers.values()).map((watcher) =>
      watcher.dispose(),
    )
    await Promise.all(disposals)
    this.watchers.clear()
    this.listeners.clear()
  }
}

export const hyperframesSourceWatcherRegistry = new HyperframesSourceWatcherRegistry()
