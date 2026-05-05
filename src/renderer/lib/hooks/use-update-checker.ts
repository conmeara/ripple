import { useEffect, useCallback, useRef } from "react"
import { useAtom } from "jotai"
import { updateStateAtom, type UpdateState } from "../atoms"

// Automatic checks are optional and owned by the main process. This hook only
// handles update events and exposes user-initiated actions.
const DISMISSED_KEY = "update-dismissed"
const DISMISS_DURATION = 12 * 60 * 60 * 1000 // 12 hours

/**
 * Hook to manage auto-updates via electron-updater
 * Listens to update events from main process and provides actions
 */
export function useUpdateChecker() {
  const [state, setState] = useAtom(updateStateAtom)
  const versionRef = useRef<string | undefined>(state.version)

  // Keep ref in sync with state
  useEffect(() => {
    versionRef.current = state.version
  }, [state.version])

  // Check if a version was dismissed recently
  const isDismissed = useCallback((version: string): boolean => {
    try {
      const dismissed = localStorage.getItem(DISMISSED_KEY)
      if (!dismissed) return false

      const { version: dismissedVersion, timestamp } = JSON.parse(dismissed)
      const elapsed = Date.now() - timestamp

      return dismissedVersion === version && elapsed < DISMISS_DURATION
    } catch {
      return false
    }
  }, [])

  // Subscribe to update events from main process
  useEffect(() => {
    const api = window.desktopApi
    if (!api) return

    const unsubs: Array<(() => void) | undefined> = []

    // Checking for updates
    unsubs.push(
      api.onUpdateChecking?.(() => {
        console.log("[Update] Checking for updates...")
        setState({ status: "checking" })
      }),
    )

    // Update available
    unsubs.push(
      api.onUpdateAvailable?.((info) => {
        console.log(`[Update] Update available: v${info.version}`)

        // Check if user dismissed this version
        if (isDismissed(info.version)) {
          console.log(`[Update] Version ${info.version} was dismissed, ignoring`)
          setState({ status: "idle" })
          return
        }

        setState({
          status: "available",
          version: info.version,
          releaseDate: info.releaseDate,
          releaseNotes: info.releaseNotes,
        })
      }),
    )

    // No update available
    unsubs.push(
      api.onUpdateNotAvailable?.((info) => {
        console.log("[Update] App is up to date")
        setState({
          status: "not-available",
          version: info.version,
          releaseDate: info.releaseDate,
          releaseNotes: info.releaseNotes,
        })
      }),
    )

    // Download progress
    unsubs.push(
      api.onUpdateProgress?.((progress) => {
        console.log(`[Update] Download progress: ${progress.percent.toFixed(1)}%`)
        setState({
          status: "downloading",
          version: versionRef.current,
          progress: progress.percent,
          bytesPerSecond: progress.bytesPerSecond,
          transferred: progress.transferred,
          total: progress.total,
        })
      }),
    )

    // Update downloaded and ready
    unsubs.push(
      api.onUpdateDownloaded?.((info) => {
        console.log(`[Update] Update downloaded: v${info.version}`)
        setState({
          status: "ready",
          version: info.version,
          releaseDate: info.releaseDate,
          releaseNotes: info.releaseNotes,
        })
      }),
    )

    // Error during update
    unsubs.push(
      api.onUpdateError?.((error) => {
        console.error("[Update] Error:", error)
        setState({
          status: "error",
          error,
        })
      }),
    )

    // Manual check from menu - clear dismiss state
    unsubs.push(
      api.onUpdateManualCheck?.(() => {
        console.log("[Update] Manual check triggered - clearing dismiss state")
        localStorage.removeItem(DISMISSED_KEY)
      }),
    )

    // Cleanup
    return () => {
      unsubs.forEach((unsub) => unsub?.())
    }
  }, [setState, isDismissed])

  // Actions
  const checkForUpdates = useCallback((force?: boolean) => {
    return window.desktopApi?.checkForUpdates?.(force)
  }, [])

  const downloadUpdate = useCallback(async () => {
    const ok = await window.desktopApi?.downloadUpdate?.()
    if (!ok) {
      setState({
        status: "error",
        error: "Update download failed. Try again when your connection is stable.",
      })
    }
    return ok ?? false
  }, [setState])

  const installUpdate = useCallback(() => {
    window.desktopApi?.installUpdate?.()
  }, [])

  const dismissUpdate = useCallback(() => {
    if (state.status === "ready") {
      return
    }

    if (state.version) {
      localStorage.setItem(
        DISMISSED_KEY,
        JSON.stringify({
          version: state.version,
          timestamp: Date.now(),
        }),
      )
      setState({ status: "idle" })
    }
  }, [state.status, state.version, setState])

  return {
    state,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    dismissUpdate,
  }
}

/**
 * Clear dismissed version from storage
 * Call this after a successful update to reset dismissal state
 */
export function clearDismissedUpdate() {
  localStorage.removeItem(DISMISSED_KEY)
}

/**
 * Clear dismiss for a specific version
 */
export function clearDismissedVersion(version: string) {
  try {
    const dismissed = localStorage.getItem(DISMISSED_KEY)
    if (!dismissed) return

    const { version: dismissedVersion } = JSON.parse(dismissed)
    if (dismissedVersion === version) {
      localStorage.removeItem(DISMISSED_KEY)
    }
  } catch {
    // Ignore errors
  }
}
