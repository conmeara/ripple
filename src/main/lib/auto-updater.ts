import { BrowserWindow, ipcMain, app } from "electron"
import log from "electron-log"
import { autoUpdater, type UpdateInfo, type ProgressInfo } from "electron-updater"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { getConfiguredUpdateFeedUrl } from "./config"

/**
 * IMPORTANT: Do NOT use lazy/dynamic imports for electron-updater!
 *
 * In v0.0.6 we tried using async getAutoUpdater() with dynamic imports,
 * which broke the auto-updater completely. The synchronous import is required
 * for electron-updater to work correctly.
 *
 * See commit d946614c5 for the broken implementation - do not repeat this mistake.
 */

function initAutoUpdaterConfig() {
  // Configure logging
  log.transports.file.level = "info"
  autoUpdater.logger = log

  // Configure updater behavior
  autoUpdater.autoDownload = false // Let user decide when to download
  autoUpdater.autoInstallOnAppQuit = false // Install only from explicit Restart to update
  autoUpdater.autoRunAppAfterInstall = true // Restart app after install
}

// Official packaged builds use electron-builder's generated app-update.yml,
// which points electron-updater at GitHub Releases. This env URL remains only
// as a maintainer fallback for explicit local/provider tests.
const FALLBACK_UPDATE_FEED_URL = getConfiguredUpdateFeedUrl()

// Minimum interval between update checks (prevent spam on rapid focus/blur)
const MIN_CHECK_INTERVAL = 60 * 1000 // 1 minute
const STARTUP_CHECK_DELAY_MS = 5000
let lastCheckTime = 0
let automaticFocusChecksRegistered = false

// Update channel preference file
const CHANNEL_PREF_FILE = "update-channel.json"
const AUTO_CHECKS_PREF_FILE = "update-auto-checks.json"

type UpdateChannel = "latest" | "beta"
type UpdateCheckSource = "automatic" | "manual"

function getBundledUpdateConfigPath(): string {
  return join(process.resourcesPath, "app-update.yml")
}

function hasBundledUpdateConfig(): boolean {
  return app.isPackaged && existsSync(getBundledUpdateConfigPath())
}

function hasUpdateProviderConfig(): boolean {
  return Boolean(FALLBACK_UPDATE_FEED_URL) || hasBundledUpdateConfig()
}

function configureUpdateChannel(channel: UpdateChannel): void {
  autoUpdater.channel = channel
  // GitHub provider only offers prereleases when this is true.
  autoUpdater.allowPrerelease = channel === "beta"
  // electron-updater flips this to true when channel/prerelease changes. Ripple
  // never offers downgrades between stable and early access builds.
  autoUpdater.allowDowngrade = false
}

function configureUpdateProvider(): boolean {
  if (FALLBACK_UPDATE_FEED_URL) {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: FALLBACK_UPDATE_FEED_URL,
    })
    autoUpdater.requestHeaders = {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
    }
    log.info("[AutoUpdater] Using explicit fallback update feed:", FALLBACK_UPDATE_FEED_URL)
    return true
  }

  if (hasBundledUpdateConfig()) {
    log.info("[AutoUpdater] Using bundled GitHub Releases update config:", getBundledUpdateConfigPath())
    return true
  }

  log.info("[AutoUpdater] Disabled; no bundled GitHub update config or fallback feed configured")
  return false
}

function getChannelPrefPath(): string {
  return join(app.getPath("userData"), CHANNEL_PREF_FILE)
}

function getSavedChannel(): UpdateChannel {
  try {
    const prefPath = getChannelPrefPath()
    if (existsSync(prefPath)) {
      const data = JSON.parse(readFileSync(prefPath, "utf-8"))
      if (data.channel === "beta" || data.channel === "latest") {
        return data.channel
      }
    }
  } catch {
    // Ignore read errors, fall back to default
  }
  return "latest"
}

function saveChannel(channel: UpdateChannel): void {
  try {
    writeFileSync(getChannelPrefPath(), JSON.stringify({ channel }), "utf-8")
  } catch (error) {
    log.error("[AutoUpdater] Failed to save channel preference:", error)
  }
}

function getAutoChecksPrefPath(): string {
  return join(app.getPath("userData"), AUTO_CHECKS_PREF_FILE)
}

export function getAutoUpdateChecksEnabled(): boolean {
  try {
    const prefPath = getAutoChecksPrefPath()
    if (existsSync(prefPath)) {
      const data = JSON.parse(readFileSync(prefPath, "utf-8"))
      if (typeof data.autoCheckEnabled === "boolean") {
        return data.autoCheckEnabled
      }
      if (typeof data.enabled === "boolean") {
        return data.enabled
      }
    }
  } catch {
    // Ignore read errors, fall back to the default.
  }
  return false
}

export function setAutoUpdateChecksEnabled(enabled: boolean): boolean {
  try {
    writeFileSync(
      getAutoChecksPrefPath(),
      JSON.stringify({ autoCheckEnabled: enabled }),
      "utf-8",
    )
  } catch (error) {
    log.error("[AutoUpdater] Failed to save automatic update check preference:", error)
  }
  return getAutoUpdateChecksEnabled()
}

let getAllWindows: (() => BrowserWindow[]) | null = null

/**
 * Send update event to all renderer windows
 * Update events are app-wide and should be visible in all windows
 */
function sendToAllRenderers(channel: string, data?: unknown) {
  const windows = getAllWindows?.() ?? BrowserWindow.getAllWindows()
  for (const win of windows) {
    try {
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    } catch {
      // Window may have been destroyed between check and send
    }
  }
}

/**
 * Initialize the auto-updater with event handlers and IPC
 */
export async function initAutoUpdater(getWindows: () => BrowserWindow[]) {
  getAllWindows = getWindows

  // Register IPC handlers even when updates are disabled so renderer/menu calls
  // remain harmless no-ops.
  registerIpcHandlers()

  // Initialize config
  initAutoUpdaterConfig()
  if (!configureUpdateProvider()) {
    return
  }

  // Set update channel from saved preference
  const savedChannel = getSavedChannel()
  configureUpdateChannel(savedChannel)
  log.info(`[AutoUpdater] Using update channel: ${savedChannel}`)

  // Event: Checking for updates
  autoUpdater.on("checking-for-update", () => {
    log.info("[AutoUpdater] Checking for updates...")
    sendToAllRenderers("update:checking")
  })

  // Event: Update available
  autoUpdater.on("update-available", (info: UpdateInfo) => {
    log.info(`[AutoUpdater] Update available: v${info.version}`)
    // Update menu to show "Update to vX.X.X..."
    const setUpdateAvailable = (global as any).__setUpdateAvailable
    if (setUpdateAvailable) {
      setUpdateAvailable(true, info.version)
    }
    sendToAllRenderers("update:available", {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    })
  })

  // Event: No update available
  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    log.info(`[AutoUpdater] App is up to date (v${info.version})`)
    sendToAllRenderers("update:not-available", {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    })
  })

  // Event: Download progress
  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    log.info(
      `[AutoUpdater] Download progress: ${progress.percent.toFixed(1)}% ` +
        `(${formatBytes(progress.transferred)}/${formatBytes(progress.total)})`,
    )
    sendToAllRenderers("update:progress", {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  // Event: Update downloaded
  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    log.info(`[AutoUpdater] Update downloaded: v${info.version}`)
    // Reset menu back to "Check for Updates..." since update is ready
    const setUpdateAvailable = (global as any).__setUpdateAvailable
    if (setUpdateAvailable) {
      setUpdateAvailable(false)
    }
    sendToAllRenderers("update:downloaded", {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    })
  })

  // Event: Error
  autoUpdater.on("error", (error: Error) => {
    log.error("[AutoUpdater] Error:", error.message)
    sendToAllRenderers("update:error", error.message)
  })

  registerAutomaticUpdateChecks()
  log.info("[AutoUpdater] Initialized")
}

/**
 * Register IPC handlers for update operations
 */
function registerIpcHandlers() {
  // Check for updates
  ipcMain.handle("update:check", async (_event, force?: boolean) => {
    try {
      const result = await checkForUpdates(force === true, "manual")
      return result?.updateInfo || null
    } catch (error) {
      log.error("[AutoUpdater] Check failed:", error)
      return null
    }
  })

  // Download update
  ipcMain.handle("update:download", async () => {
    return downloadUpdate()
  })

  // Install update and restart
  ipcMain.handle("update:install", () => {
    log.info("[AutoUpdater] Installing update and restarting...")
    // Give renderer time to save state
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true)
    }, 100)
  })

  // Get current update state (useful for re-renders)
  ipcMain.handle("update:get-state", () => {
    return {
      currentVersion: app.getVersion(),
    }
  })

  // Set update channel (latest = stable only, beta = stable + beta)
  ipcMain.handle("update:set-channel", async (_event, channel: string) => {
    if (channel !== "latest" && channel !== "beta") {
      log.warn(`[AutoUpdater] Invalid channel: ${channel}`)
      return false
    }
    log.info(`[AutoUpdater] Switching update channel to: ${channel}`)
    configureUpdateChannel(channel)
    saveChannel(channel)

    if (app.isPackaged && getAutoUpdateChecksEnabled()) {
      try {
        await checkForUpdates(true, "automatic")
      } catch (error) {
        log.error("[AutoUpdater] Post-channel-switch check failed:", error)
      }
    }
    return true
  })

  // Get current update channel
  ipcMain.handle("update:get-channel", () => {
    return getSavedChannel()
  })

  ipcMain.handle("update:get-auto-checks-enabled", () => {
    return getAutoUpdateChecksEnabled()
  })

  ipcMain.handle("update:set-auto-checks-enabled", (_event, enabled: boolean) => {
    return setAutoUpdateChecksEnabled(enabled === true)
  })
}

/**
 * Manually trigger an update check
 * @param force - Skip the minimum interval check
 */
export async function checkForUpdates(
  force = false,
  source: UpdateCheckSource = "manual",
) {
  if (!app.isPackaged) {
    log.info("[AutoUpdater] Skipping update check in dev mode")
    return Promise.resolve(null)
  }
  if (!hasUpdateProviderConfig()) {
    log.info("[AutoUpdater] Skipping update check; no Ripple update provider configured")
    return Promise.resolve(null)
  }
  if (source === "automatic" && !getAutoUpdateChecksEnabled()) {
    log.info("[AutoUpdater] Skipping automatic update check; disabled in Settings")
    return Promise.resolve(null)
  }

  // Respect minimum interval to prevent spam
  const now = Date.now()
  if (!force && now - lastCheckTime < MIN_CHECK_INTERVAL) {
    log.info(
      `[AutoUpdater] Skipping check - last check was ${Math.round((now - lastCheckTime) / 1000)}s ago`,
    )
    return Promise.resolve(null)
  }

  lastCheckTime = now
  return autoUpdater.checkForUpdates()
}

/**
 * Start downloading the update
 */
export async function downloadUpdate() {
  if (!app.isPackaged) {
    log.info("[AutoUpdater] Skipping download in dev mode")
    sendToAllRenderers("update:error", "Update downloads are available in packaged builds.")
    return false
  }
  if (!hasUpdateProviderConfig()) {
    log.info("[AutoUpdater] Skipping download; no Ripple update provider configured")
    sendToAllRenderers("update:error", "Ripple update downloads are unavailable in this build.")
    return false
  }

  try {
    log.info("[AutoUpdater] Starting update download...")
    await autoUpdater.downloadUpdate()
    return true
  } catch (error) {
    log.error("[AutoUpdater] Download failed:", error)
    sendToAllRenderers(
      "update:error",
      error instanceof Error ? error.message : "Update download failed.",
    )
    return false
  }
}

/**
 * Register optional automatic checks. The listener is safe to keep installed:
 * every automatic entry point re-reads the persisted preference before network
 * work, so changing Settings takes effect without restarting Ripple.
 */
function registerAutomaticUpdateChecks() {
  if (automaticFocusChecksRegistered) return
  automaticFocusChecksRegistered = true

  app.on("browser-window-focus", () => {
    if (!getAutoUpdateChecksEnabled()) {
      log.info("[AutoUpdater] Window focused; automatic update checks disabled")
      return
    }
    log.info("[AutoUpdater] Window focused - checking for updates")
    void checkForUpdates(false, "automatic")
  })

  if (app.isPackaged && getAutoUpdateChecksEnabled()) {
    setTimeout(() => {
      void checkForUpdates(true, "automatic")
    }, STARTUP_CHECK_DELAY_MS)
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}
