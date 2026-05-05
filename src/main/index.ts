import { app, BrowserWindow, dialog, Menu, nativeImage, session } from "electron"
import { existsSync, readFileSync, readlinkSync, unlinkSync } from "fs"
import { createServer } from "http"
import { dirname, join } from "path"
import { AuthManager, initAuthManager, getAuthManager as getAuthManagerFromModule } from "./auth-manager"
import {
  initAnalytics,
  shutdown as shutdownAnalytics,
  trackAppOpened,
} from "./lib/analytics"
import {
  checkForUpdates,
  downloadUpdate,
  initAutoUpdater,
} from "./lib/auto-updater"
import { closeDatabase, initDatabase } from "./lib/db"
import { getApiUrl } from "./lib/config"
import {
  getAppId,
  getAppProtocol,
  getAppUserDataDir,
  getLegacyUserDataDirs,
  isAcceptedInboundProtocol,
  RIPPLE_IDENTITY,
} from "../shared/app-identity"
import {
  getLaunchDirectory,
  isCliInstalled,
  installCli,
  uninstallCli,
  parseLaunchDirectory,
} from "./lib/cli"
import { cleanupGitWatchers } from "./lib/git/watcher"
import {
  previewManager,
  registerHyperframesPlayerProtocolPrivileges,
  registerHyperframesPlayerSourceProtocol,
  renderManager,
} from "./lib/hyperframes"
import { cancelAllPendingOAuth, handleMcpOAuthCallback } from "./lib/mcp-auth"
import {
  cleanupTerminalRevisionWorktrees,
  recoverRevisionQueueOnStartup,
} from "./lib/revisions/revision-queue"
import { scheduleGeneratedChangeQueue } from "./lib/agent-runtime/generated-change-scheduler"
import { recoverAgentRunsOnStartup } from "./lib/agent-runtime/service"
import { cancelAllExports, recoverExportJobsOnStartup } from "./lib/exports"
import { ensureRippleRuntimeOnLaunch } from "./lib/ripple-projects/service"
import { getAllMcpConfigHandler, hasActiveClaudeSessions, abortAllClaudeSessions } from "./lib/trpc/routers/claude"
import { getAllCodexMcpConfigHandler, hasActiveCodexStreams, abortAllCodexStreams } from "./lib/trpc/routers/codex"
import {
  createMainWindow,
  createWindow,
  getWindow,
  getAllWindows,
  setIsQuitting,
} from "./windows/main"
import { windowManager } from "./windows/window-manager"

import { IS_DEV, AUTH_SERVER_PORT } from "./constants"
import { getBuildAssetPath } from "./lib/packaged-assets"
import { migrateLegacyUserData } from "./lib/user-data-migration"

// Deep link protocol (must match package.json build.protocols.schemes)
// Use different protocol in dev to avoid conflicts with production app
const PROTOCOL = getAppProtocol(IS_DEV)

// Set userData path BEFORE requestSingleInstanceLock().
// This ensures dev, prod, and automated E2E runs have separate instance locks.
{
  const e2eUserDataPath = process.env.RIPPLE_E2E_USER_DATA_DIR?.trim()
  if (e2eUserDataPath) {
    const e2eHomePath = process.env.RIPPLE_E2E_HOME_DIR?.trim()
    if (e2eHomePath) {
      app.setPath("home", e2eHomePath)
    }
    app.setPath("userData", e2eUserDataPath)
    console.log("[E2E] Using isolated userData path:", e2eUserDataPath)
  } else {
    const defaultUserDataPath = app.getPath("userData")
    const appDataParent = dirname(defaultUserDataPath)
    const userDataPath = join(appDataParent, getAppUserDataDir(IS_DEV))
    app.setPath("userData", userDataPath)

    const legacyUserDataPaths = getLegacyUserDataDirs(IS_DEV)
      .map((dirName) => join(appDataParent, dirName))
      .filter((legacyPath) => legacyPath !== userDataPath)

    const migration = migrateLegacyUserData({
      destinationPath: userDataPath,
      legacyPaths: legacyUserDataPaths,
      appVersion: app.getVersion(),
    })

    if (migration.migrated) {
      console.log(
        `[App] Migrated legacy userData from ${migration.sourcePath} to ${migration.destinationPath}`,
      )
      if (migration.authReadable === false) {
        console.warn("[App] Migrated auth data could not be decrypted")
      }
    } else if (IS_DEV) {
      console.log("[Dev] Using separate userData path:", userDataPath)
    }
  }
}

// Increase V8 old-space limit for renderer/main processes to reduce OOM frequency
// under heavy multi-chat workloads. Must be set before app readiness/window creation.
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=8192")

registerHyperframesPlayerProtocolPrivileges()

console.log("[App] Skipping Sentry initialization; remote crash reporting is disabled")

// Hosted-service URL configuration. Local Ripple builds do not default to any
// hosted backend; an optional future service must be configured explicitly.
export function getBaseUrl(): string | null {
  return getApiUrl()
}

export function getAppUrl(): string {
  return process.env.ELECTRON_RENDERER_URL || getBaseUrl() || "about:blank"
}

// Auth manager singleton (use the one from auth-manager module)
let authManager: AuthManager

export function getAuthManager(): AuthManager {
  // First try to get from module, fallback to local variable for backwards compat
  return getAuthManagerFromModule() || authManager
}

// Handle auth code from deep link (exported for IPC handlers)
export async function handleAuthCode(code: string): Promise<void> {
  console.log("[Auth] Handling auth code:", code.slice(0, 8) + "...")

  try {
    const authData = await authManager.exchangeCode(code)
    console.log("[Auth] Success for user:", authData.user.email)

    // Set desktop token cookie using persist:main partition
    const baseUrl = getBaseUrl()
    if (baseUrl) {
      const ses = session.fromPartition("persist:main")
      try {
        // First remove any existing cookie to avoid HttpOnly conflict
        await ses.cookies.remove(baseUrl, "x-desktop-token")
        await ses.cookies.set({
          url: baseUrl,
          name: "x-desktop-token",
          value: authData.token,
          expirationDate: Math.floor(
            new Date(authData.expiresAt).getTime() / 1000,
          ),
          httpOnly: false,
          secure: baseUrl.startsWith("https"),
          sameSite: "lax" as const,
        })
        console.log("[Auth] Desktop token cookie set")
      } catch (cookieError) {
        // Cookie setting is optional - auth data is already saved to disk
        console.warn("[Auth] Cookie set failed (non-critical):", cookieError)
      }
    } else {
      console.log("[Auth] Hosted API not configured; skipping desktop token cookie")
    }

    // Notify all windows and reload them to show app
    const windows = getAllWindows()
    for (const win of windows) {
      try {
        if (win.isDestroyed()) continue
        win.webContents.send("auth:success", authData.user)

        // Use stable window ID (main, window-2, etc.) instead of Electron's numeric ID
        const stableId = windowManager.getStableId(win)

        if (process.env.ELECTRON_RENDERER_URL) {
          // Pass window ID via query param for dev mode
          const url = new URL(process.env.ELECTRON_RENDERER_URL)
          url.searchParams.set("windowId", stableId)
          win.loadURL(url.toString())
        } else {
          // Pass window ID via hash for production
          win.loadFile(join(__dirname, "../renderer/index.html"), {
            hash: `windowId=${stableId}`,
          })
        }
      } catch (error) {
        // Window may have been destroyed during iteration
        console.warn("[Auth] Failed to reload window:", error)
      }
    }
    // Focus the first window
    windows[0]?.focus()
  } catch (error) {
    console.error("[Auth] Exchange failed:", error)
    // Broadcast auth error to all windows (not just focused)
    for (const win of getAllWindows()) {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send("auth:error", (error as Error).message)
        }
      } catch {
        // Window destroyed during iteration
      }
    }
  }
}

// Handle deep link
function handleDeepLink(url: string): void {
  console.log("[DeepLink] Received:", url)

  try {
    const parsed = new URL(url)

    // Handle auth callback: ripple://auth?code=xxx
    if (parsed.pathname === "/auth" || parsed.host === "auth") {
      const code = parsed.searchParams.get("code")
      if (code) {
        handleAuthCode(code)
        return
      }
    }

    // Handle MCP OAuth callback: ripple://mcp-oauth?code=xxx&state=yyy
    if (parsed.pathname === "/mcp-oauth" || parsed.host === "mcp-oauth") {
      const code = parsed.searchParams.get("code")
      const state = parsed.searchParams.get("state")
      if (code && state) {
        handleMcpOAuthCallback(code, state)
        return
      }
    }
  } catch (e) {
    console.error("[DeepLink] Failed to parse:", e)
  }
}

// Register protocol BEFORE app is ready
console.log("[Protocol] ========== PROTOCOL REGISTRATION ==========")
console.log("[Protocol] Protocol:", PROTOCOL)
console.log("[Protocol] Is dev mode (process.defaultApp):", process.defaultApp)
console.log("[Protocol] process.execPath:", process.execPath)
console.log("[Protocol] process.argv:", process.argv)

/**
 * Register the app as the handler for our custom protocol.
 * On macOS, this may not take effect immediately on first install -
 * Launch Services caches protocol handlers and may need time to update.
 */
function registerProtocol(): boolean {
  let success = false

  if (process.defaultApp) {
    // Dev mode: need to pass execPath and script path
    if (process.argv.length >= 2) {
      success = app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
        process.argv[1]!,
      ])
      console.log(
        `[Protocol] Dev mode registration:`,
        success ? "success" : "failed",
      )
    } else {
      console.warn("[Protocol] Dev mode: insufficient argv for registration")
    }
  } else {
    // Production mode
    success = app.setAsDefaultProtocolClient(PROTOCOL)
    console.log(
      `[Protocol] Production registration:`,
      success ? "success" : "failed",
    )
  }

  return success
}

// Store initial registration result (set in app.whenReady())
let initialRegistration = false

// Verify registration (this checks if OS recognizes us as the handler)
function verifyProtocolRegistration(): void {
  const isDefault = process.defaultApp
    ? app.isDefaultProtocolClient(PROTOCOL, process.execPath, [
        process.argv[1]!,
      ])
    : app.isDefaultProtocolClient(PROTOCOL)

  console.log(`[Protocol] Verification - isDefaultProtocolClient: ${isDefault}`)

  if (!isDefault && initialRegistration) {
    console.warn(
      "[Protocol] Registration returned success but verification failed.",
    )
    console.warn(
      "[Protocol] This is common on first install - macOS Launch Services may need time to update.",
    )
    console.warn("[Protocol] The protocol should work after app restart.")
  }
}

console.log("[Protocol] =============================================")

// Note: app.on("open-url") will be registered in app.whenReady()

function findDeepLinkArg(args: string[]): string | undefined {
  return args.find((arg) => {
    try {
      const parsed = new URL(arg)
      return isAcceptedInboundProtocol(parsed.protocol, IS_DEV)
    } catch {
      return false
    }
  })
}

// SVG favicon as data URI for auth callback pages. This mirrors
// build/ripple-logo-source.svg.
const FAVICON_SVG = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><filter id="mark-glow" x="198" y="323" width="628" height="378" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="0" stdDeviation="11" flood-color="#FFFFFF" flood-opacity="0.42"/><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000000" flood-opacity="0.34"/></filter><filter id="playhead-glow" x="433" y="108" width="158" height="808" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="0" stdDeviation="14" flood-color="#FFFFFF" flood-opacity="0.48"/><feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000000" flood-opacity="0.34"/></filter><clipPath id="tileClip"><rect width="1024" height="1024" rx="220"/></clipPath></defs><g clip-path="url(#tileClip)"><rect width="1024" height="1024" rx="220" fill="#050505"/><g filter="url(#mark-glow)" stroke="#FFFFFF" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"><path d="M360 390L254 512L360 634"/><path d="M664 390L770 512L664 634"/></g><g filter="url(#playhead-glow)"><rect x="480" y="154" width="64" height="716" rx="32" fill="#FFFFFF"/></g></g></svg>`
const FAVICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`

// Start local HTTP server for auth callbacks
// This catches http://localhost:{AUTH_SERVER_PORT}/auth/callback?code=xxx and /callback (for MCP OAuth)
const server = createServer((req, res) => {
    const url = new URL(req.url || "", `http://localhost:${AUTH_SERVER_PORT}`)

    // Serve favicon
    if (url.pathname === "/favicon.ico" || url.pathname === "/favicon.svg") {
      res.writeHead(200, { "Content-Type": "image/svg+xml" })
      res.end(FAVICON_SVG)
      return
    }

    if (url.pathname === "/auth/callback") {
      const code = url.searchParams.get("code")
      console.log(
        "[Auth Server] Received callback with code:",
        code?.slice(0, 8) + "...",
      )

      if (code) {
        // Handle the auth code
        handleAuthCode(code)

        // Send success response and close the browser tab
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
  <title>Ripple - Authentication</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #09090b;
      --text: #fafafa;
      --text-muted: #71717a;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #ffffff;
        --text: #09090b;
        --text-muted: #71717a;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
    }
    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .logo {
      width: 24px;
      height: 24px;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 4px;
    }
    p {
      font-size: 12px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <img class="logo" src="${FAVICON_DATA_URI}" alt="Ripple">
    <h1>Authentication successful</h1>
    <p>You can close this tab</p>
  </div>
  <script>setTimeout(() => window.close(), 1000)</script>
</body>
</html>`)
      } else {
        res.writeHead(400, { "Content-Type": "text/plain" })
        res.end("Missing code parameter")
      }
    } else if (url.pathname === "/callback") {
      // Handle MCP OAuth callback
      const code = url.searchParams.get("code")
      const state = url.searchParams.get("state")
      console.log(
        "[Auth Server] Received MCP OAuth callback with code:",
        code?.slice(0, 8) + "...",
        "state:",
        state?.slice(0, 8) + "...",
      )

      if (code && state) {
        // Handle the MCP OAuth callback
        handleMcpOAuthCallback(code, state)

        // Send success response and close the browser tab
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
  <title>Ripple - MCP Authentication</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #09090b;
      --text: #fafafa;
      --text-muted: #71717a;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #ffffff;
        --text: #09090b;
        --text-muted: #71717a;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
    }
    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .logo {
      width: 24px;
      height: 24px;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 4px;
    }
    p {
      font-size: 12px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <img class="logo" src="${FAVICON_DATA_URI}" alt="Ripple">
    <h1>MCP Server authenticated</h1>
    <p>You can close this tab</p>
  </div>
  <script>setTimeout(() => window.close(), 1000)</script>
</body>
</html>`)
      } else {
        res.writeHead(400, { "Content-Type": "text/plain" })
        res.end("Missing code or state parameter")
      }
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" })
      res.end("Not found")
    }
  })

server.listen(AUTH_SERVER_PORT, () => {
  console.log(`[Auth Server] Listening on http://localhost:${AUTH_SERVER_PORT}`)
})

// Clean up stale lock files from crashed instances
// Returns true if locks were cleaned, false otherwise
function cleanupStaleLocks(): boolean {
  const userDataPath = app.getPath("userData")
  const lockPath = join(userDataPath, "SingletonLock")

  if (!existsSync(lockPath)) return false

  try {
    // SingletonLock is a symlink like "hostname-pid"
    const lockTarget = readlinkSync(lockPath)
    const match = lockTarget.match(/-(\d+)$/)
    if (match) {
      const pid = parseInt(match[1], 10)
      try {
        // Check if process is running (signal 0 doesn't kill, just checks)
        process.kill(pid, 0)
        // Process exists, lock is valid
        console.log("[App] Lock held by running process:", pid)
        return false
      } catch {
        // Process doesn't exist, clean up stale locks
        console.log("[App] Cleaning stale locks (pid", pid, "not running)")
        const filesToRemove = ["SingletonLock", "SingletonSocket", "SingletonCookie"]
        for (const file of filesToRemove) {
          const filePath = join(userDataPath, file)
          if (existsSync(filePath)) {
            try {
              unlinkSync(filePath)
            } catch (e) {
              console.warn("[App] Failed to remove", file, e)
            }
          }
        }
        return true
      }
    }
  } catch (e) {
    console.warn("[App] Failed to check lock file:", e)
  }
  return false
}

// Prevent multiple instances
let gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // Maybe stale lock - try cleanup and retry once
  const cleaned = cleanupStaleLocks()
  if (cleaned) {
    gotTheLock = app.requestSingleInstanceLock()
  }
  if (!gotTheLock) {
    app.quit()
  }
}

if (gotTheLock) {
  // Handle second instance launch (also handles deep links on Windows/Linux)
  app.on("second-instance", (_event, commandLine) => {
    // Check for deep link in command line args
    const url = findDeepLinkArg(commandLine)
    if (url) {
      handleDeepLink(url)
    }

    // Focus on the first available window
    const windows = getAllWindows()
    if (windows.length > 0) {
      const window = windows[0]!
      if (window.isMinimized()) window.restore()
      window.focus()
    } else {
      // No windows open, create a new one
      createMainWindow()
    }
  })

  // App ready
  app.whenReady().then(async () => {
    app.name = IS_DEV ? RIPPLE_IDENTITY.devProductName : RIPPLE_IDENTITY.productName

    // Register protocol handler (must be after app is ready)
    initialRegistration = registerProtocol()
    registerHyperframesPlayerSourceProtocol()

    // Handle deep link on macOS (app already running)
    app.on("open-url", (event, url) => {
      console.log("[Protocol] open-url event received:", url)
      event.preventDefault()
      handleDeepLink(url)
    })

    // Set app user model ID for Windows (different in dev to avoid taskbar conflicts)
    if (process.platform === "win32") {
      app.setAppUserModelId(getAppId(IS_DEV))
    }

    console.log(`[App] Starting ${IS_DEV ? RIPPLE_IDENTITY.devProductName : RIPPLE_IDENTITY.productName}...`)

    // Verify protocol registration after app is ready
    // This helps diagnose first-install issues where the protocol isn't recognized yet
    verifyProtocolRegistration()

    // Get Claude Code version for About panel
    let claudeCodeVersion = "unknown"
    try {
      const isDev = !app.isPackaged
      const versionPath = isDev
        ? join(app.getAppPath(), "resources/bin/VERSION")
        : join(process.resourcesPath, "bin/VERSION")

      if (existsSync(versionPath)) {
        const versionContent = readFileSync(versionPath, "utf-8")
        claudeCodeVersion = versionContent.split("\n")[0]?.trim() || "unknown"
      }
    } catch (error) {
      console.warn("[App] Failed to read Claude Code version:", error)
    }

    // Set About panel options with Claude Code version
    app.setAboutPanelOptions({
      applicationName: RIPPLE_IDENTITY.productName,
      applicationVersion: app.getVersion(),
      version: `Claude Code ${claudeCodeVersion}`,
      copyright: "Copyright © 2026 Ripple",
    })

    // Track update availability for menu
    let updateAvailable = false
    let availableVersion: string | null = null
    // Track devtools unlock state (hidden feature - 5 clicks on Beta tab)
    let devToolsUnlocked = false

    // Menu icons: PNG template for settings (auto light/dark via "Template" suffix),
    // macOS native SF Symbol for terminal
    const settingsMenuIcon = nativeImage.createFromPath(
      getBuildAssetPath("settingsTemplate.png", {
        isPackaged: app.isPackaged,
        moduleDir: __dirname,
      })
    )
    const terminalMenuIcon = process.platform === "darwin"
      ? nativeImage.createFromNamedImage("terminal")?.resize({ width: 12, height: 12 })
      : null

    // Function to build and set application menu
    const buildMenu = () => {
      // Show devtools menu item only in dev mode or when unlocked
      const showDevTools = !app.isPackaged || devToolsUnlocked
      const template: Electron.MenuItemConstructorOptions[] = [
        {
          label: app.name,
          submenu: [
            {
              label: `About ${RIPPLE_IDENTITY.productName}`,
              click: () => app.showAboutPanel(),
            },
            {
              label: updateAvailable
                ? `Update to v${availableVersion}...`
                : "Check for Updates...",
              click: () => {
                // Send event to renderer to clear dismiss state
                const win = getWindow()
                if (win) {
                  win.webContents.send("update:manual-check")
                }
                // If update is already available, start downloading immediately
                if (updateAvailable) {
                  downloadUpdate()
                } else {
                  checkForUpdates(true)
                }
              },
            },
            { type: "separator" },
            {
              label: "Settings...",
              ...(settingsMenuIcon && { icon: settingsMenuIcon }),
              accelerator: "CmdOrCtrl+,",
              click: () => {
                const win = getWindow()
                if (win) {
                  win.webContents.send("shortcut:open-settings")
                }
              },
            },
            { type: "separator" },
            {
              label: isCliInstalled()
                ? `Uninstall '${RIPPLE_IDENTITY.cliCommand}' Command...`
                : `Install '${RIPPLE_IDENTITY.cliCommand}' Command in PATH...`,
              ...(terminalMenuIcon && { icon: terminalMenuIcon }),
              click: async () => {
                const { dialog } = await import("electron")
                if (isCliInstalled()) {
                  const result = await uninstallCli()
                  if (result.success) {
                    dialog.showMessageBox({
                      type: "info",
                      message: "CLI command uninstalled",
                      detail: `The '${RIPPLE_IDENTITY.cliCommand}' command has been removed from your PATH.`,
                    })
                    buildMenu()
                  } else {
                    dialog.showErrorBox("Uninstallation Failed", result.error || "Unknown error")
                  }
                } else {
                  const result = await installCli()
                  if (result.success) {
                    dialog.showMessageBox({
                      type: "info",
                      message: "CLI command installed",
                      detail:
                        `You can now use '${RIPPLE_IDENTITY.cliCommand} frame-sheet --help' in any terminal.`,
                    })
                    buildMenu()
                  } else {
                    dialog.showErrorBox("Installation Failed", result.error || "Unknown error")
                  }
                }
              },
            },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            {
              label: "Quit",
              accelerator: "CmdOrCtrl+Q",
              click: async () => {
                if (hasActiveClaudeSessions() || hasActiveCodexStreams()) {
                  const { dialog } = await import("electron")
                  const { response } = await dialog.showMessageBox({
                    type: "warning",
                    buttons: ["Cancel", "Quit Anyway"],
                    defaultId: 0,
                    cancelId: 0,
                    title: "Active Sessions",
                    message: "There are active agent sessions running.",
                    detail: "Quitting now will interrupt them. Are you sure you want to quit?",
                  })
                  if (response === 1) {
                    abortAllClaudeSessions()
                    abortAllCodexStreams()
                    setIsQuitting(true)
                    app.quit()
                  }
                } else {
                  app.quit()
                }
              },
            },
          ],
        },
        {
          label: "File",
          submenu: [
            {
              label: "New Chat",
              accelerator: "CmdOrCtrl+N",
              click: () => {
                console.log("[Menu] New Chat clicked (Cmd+N)")
                const win = getWindow()
                if (win) {
                  console.log("[Menu] Sending shortcut:new-agent to renderer")
                  win.webContents.send("shortcut:new-agent")
                } else {
                  console.log("[Menu] No window found!")
                }
              },
            },
            {
              label: "New Window",
              accelerator: "CmdOrCtrl+Shift+N",
              click: () => {
                console.log("[Menu] New Window clicked (Cmd+Shift+N)")
                createWindow()
              },
            },
            { type: "separator" },
            {
              label: "Close Window",
              accelerator: "CmdOrCtrl+W",
              click: () => {
                const win = getWindow()
                if (win) {
                  win.close()
                }
              },
            },
          ],
        },
        {
          label: "Edit",
          submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "selectAll" },
          ],
        },
        {
          label: "View",
          submenu: [
            // Cmd+R is disabled to prevent accidental page refresh
            // Cmd+Shift+R reloads but warns if there are active streams
            {
              label: "Force Reload",
              accelerator: "CmdOrCtrl+Shift+R",
              click: () => {
                const win = BrowserWindow.getFocusedWindow()
                if (!win) return
                if (hasActiveClaudeSessions() || hasActiveCodexStreams()) {
                  dialog
                    .showMessageBox(win, {
                      type: "warning",
                      buttons: ["Cancel", "Reload Anyway"],
                      defaultId: 0,
                      cancelId: 0,
                      title: "Active Sessions",
                      message: "There are active agent sessions running.",
                      detail:
                        "Reloading will interrupt them. The current progress will be saved. Are you sure you want to reload?",
                    })
                    .then(({ response }) => {
                      if (response === 1) {
                        abortAllClaudeSessions()
                        abortAllCodexStreams()
                        win.webContents.reloadIgnoringCache()
                      }
                    })
                } else {
                  win.webContents.reloadIgnoringCache()
                }
              },
            },
            // Only show DevTools in dev mode or when unlocked via hidden feature
            ...(showDevTools ? [{ role: "toggleDevTools" as const }] : []),
            { type: "separator" },
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { type: "separator" },
            { role: "togglefullscreen" },
          ],
        },
        {
          label: "Window",
          submenu: [
            { role: "minimize" },
            { role: "zoom" },
            { type: "separator" },
            { role: "front" },
          ],
        },
        {
          role: "help",
          submenu: [
            {
              label: "About Ripple",
              click: () => app.showAboutPanel(),
            },
          ],
        },
      ]
      Menu.setApplicationMenu(Menu.buildFromTemplate(template))
    }

    // macOS: Set dock menu (right-click on dock icon)
    if (process.platform === "darwin") {
      const dockMenu = Menu.buildFromTemplate([
        {
          label: "New Window",
          click: () => {
            console.log("[Dock] New Window clicked")
            createWindow()
          },
        },
      ])
      app.dock?.setMenu(dockMenu)
    }

    // Set update state and rebuild menu
    const setUpdateAvailable = (available: boolean, version?: string) => {
      updateAvailable = available
      availableVersion = version || null
      buildMenu()
    }

    // Unlock devtools and rebuild menu (called from renderer via IPC)
    const unlockDevTools = () => {
      if (!devToolsUnlocked) {
        devToolsUnlocked = true
        console.log("[App] DevTools unlocked via hidden feature")
        buildMenu()
      }
    }

    // Expose setUpdateAvailable globally for auto-updater
    ;(global as any).__setUpdateAvailable = setUpdateAvailable
    // Expose unlockDevTools globally for IPC handler
    ;(global as any).__unlockDevTools = unlockDevTools

    // Build initial menu
    buildMenu()

    // Initialize auth manager (uses singleton from auth-manager module)
    authManager = initAuthManager(!!process.env.ELECTRON_RENDERER_URL)
    console.log("[App] Auth manager initialized")

    // Initialize analytics after userData has been prepared. Capture remains
    // anonymous and consent-gated; hosted auth identity is never used.
    initAnalytics({
      userDataPath: app.getPath("userData"),
      appVersion: app.getVersion(),
      runtimeOptions: {
        isPackaged: app.isPackaged,
        isDev: IS_DEV,
      },
    })

    // Track app opened only if consent and runtime configuration allow capture.
    trackAppOpened()

    // Set up callback to update cookie when token is refreshed
    authManager.setOnTokenRefresh(async (authData) => {
      console.log("[Auth] Token refreshed, updating cookie...")
      const baseUrl = getBaseUrl()
      if (!baseUrl) {
        console.log("[Auth] Hosted API not configured; skipping token cookie refresh")
        return
      }
      const ses = session.fromPartition("persist:main")
      try {
        await ses.cookies.set({
          url: baseUrl,
          name: "x-desktop-token",
          value: authData.token,
          expirationDate: Math.floor(
            new Date(authData.expiresAt).getTime() / 1000,
          ),
          httpOnly: false,
          secure: baseUrl.startsWith("https"),
          sameSite: "lax" as const,
        })
        console.log("[Auth] Desktop token cookie updated after refresh")
      } catch (err) {
        console.error("[Auth] Failed to update cookie:", err)
      }
    })

    // Initialize database
    try {
      initDatabase()
      console.log("[App] Database initialized")
      void recoverRevisionQueueOnStartup()
        .then((result) => {
          if (result.requeued || result.failed) {
            console.log(
              `[Ripple] Revision recovery: ${result.requeued} requeued, ${result.failed} failed`,
            )
          }
          scheduleGeneratedChangeQueue()
        })
        .catch((error) => {
          console.warn("[Ripple] Revision recovery failed:", error)
        })
      try {
        const agentRecovery = recoverAgentRunsOnStartup()
        if (agentRecovery.recoverable) {
          console.log(
            `[Ripple] Agent run recovery: ${agentRecovery.recoverable} marked recoverable`,
          )
        }
      } catch (error) {
        console.warn("[Ripple] Agent run recovery failed:", error)
      }
      try {
        const exportRecovery = recoverExportJobsOnStartup()
        if (exportRecovery.interrupted) {
          console.log(
            `[Ripple] Export recovery: ${exportRecovery.interrupted} interrupted`,
          )
        }
      } catch (error) {
        console.warn("[Ripple] Export recovery failed:", error)
      }
      void cleanupTerminalRevisionWorktrees()
        .then((result) => {
          if (result.cleaned || result.failed) {
            console.log(
              `[Ripple] Revision cleanup: ${result.cleaned} cleaned, ${result.failed} failed`,
            )
          }
        })
        .catch((error) => {
          console.warn("[Ripple] Revision cleanup failed:", error)
        })
      void ensureRippleRuntimeOnLaunch()
        .then((setup) => {
          console.log(`[Ripple] Motion runtime check: ${setup.status}`)
        })
        .catch((error) => {
          console.warn("[Ripple] Motion runtime check failed:", error)
        })
    } catch (error) {
      console.error("[App] Failed to initialize database:", error)
    }

    // Create main window
    createMainWindow()

    // Register auto-updater IPC in all builds. Packaged automatic checks are
    // scheduled inside the updater only when the user enables them.
    await initAutoUpdater(getAllWindows)

    // Warm up MCP cache 3 seconds after startup (background, non-blocking)
    // This populates the cache so all future sessions can use filtered MCP servers
    setTimeout(async () => {
      try {
        const results = await Promise.allSettled([
          getAllMcpConfigHandler(),
          getAllCodexMcpConfigHandler(),
        ])

        if (results[0].status === "rejected") {
          console.error("[App] Claude MCP warmup failed:", results[0].reason)
        }
        if (results[1].status === "rejected") {
          console.error("[App] Codex MCP warmup failed:", results[1].reason)
        }
      } catch (error) {
        console.error("[App] MCP warmup failed:", error)
      }
    }, 3000)

    // Handle directory argument from CLI (e.g., `ripple /path/to/project`)
    parseLaunchDirectory()

    // Handle deep link from app launch (Windows/Linux)
    const deepLinkUrl = findDeepLinkArg(process.argv)
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl)
    }

    // macOS: Re-create window when dock icon is clicked
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
      }
    })
  })

  // Quit when all windows are closed (except on macOS)
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })

  // Cleanup before quit
  app.on("before-quit", async () => {
    console.log("[App] Shutting down...")
    cancelAllPendingOAuth()
    await previewManager.stopAll()
    renderManager.cancelAll()
    await cancelAllExports()
    await cleanupGitWatchers()
    await shutdownAnalytics()
    await closeDatabase()
  })

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    console.error("[App] Uncaught exception:", error)
  })

  process.on("unhandledRejection", (reason, promise) => {
    console.error("[App] Unhandled rejection at:", promise, "reason:", reason)
  })
}
