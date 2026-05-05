#!/usr/bin/env node
import { execFile, execFileSync } from "node:child_process"
import { existsSync, realpathSync } from "node:fs"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { promisify } from "node:util"
import { _electron as electron } from "@playwright/test"

const execFileAsync = promisify(execFile)

const DEFAULT_REPO = "conmeara/ripple"
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000
const INSTALL_TIMEOUT_MS = 3 * 60 * 1000

const args = parseArgs(process.argv.slice(2))
const repo = args.repo ?? DEFAULT_REPO
const fromRelease = requiredArg("from-release")
const toVersion = requiredArg("to-version")
const fromVersion = args["from-version"] ?? fromRelease.replace(/^v/, "")
const arch = args.arch ?? normalizeArch(process.arch)
const keepArtifacts = args.keep === "1" || args.keep === "true"

function requiredArg(name) {
  const value = args[name]
  if (!value) {
    fail(`Missing --${name}.`)
  }
  return value
}

function parseArgs(values) {
  const parsed = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!value.startsWith("--")) continue
    const key = value.slice(2)
    const next = values[index + 1]
    if (!next || next.startsWith("--")) {
      parsed[key] = "true"
      continue
    }
    parsed[key] = next
    index += 1
  }
  return parsed
}

function normalizeArch(value) {
  if (value === "x64" || value === "arm64") return value
  fail(`Unsupported update-smoke architecture: ${value}`)
}

function fail(message) {
  console.error(`[update-smoke] ${message}`)
  process.exit(1)
}

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeout ?? 60_000,
    ...options,
  }).trim()
}

async function runAsync(command, commandArgs, options = {}) {
  const result = await execFileAsync(command, commandArgs, {
    encoding: "utf8",
    timeout: options.timeout ?? 60_000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 50,
    ...options,
  })
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()
}

function readBundleVersion(appPath) {
  return run("/usr/libexec/PlistBuddy", [
    "-c",
    "Print :CFBundleShortVersionString",
    join(appPath, "Contents", "Info.plist"),
  ])
}

function assertExists(path, label = path) {
  if (!existsSync(path)) {
    fail(`Missing ${label}: ${path}`)
  }
}

async function waitForBundleVersion(appPath, expectedVersion) {
  const deadline = Date.now() + INSTALL_TIMEOUT_MS
  let lastVersion = null
  while (Date.now() < deadline) {
    try {
      lastVersion = readBundleVersion(appPath)
      if (lastVersion === expectedVersion) {
        return lastVersion
      }
    } catch {
      // The app can briefly disappear while Squirrel swaps the bundle.
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  fail(
    `Timed out waiting for ${basename(appPath)} to report ${expectedVersion}; last version was ${lastVersion ?? "unreadable"}.`,
  )
}

async function waitForProcessExit(child) {
  if (child.exitCode != null) return child.exitCode
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for the packaged app to exit for update install."))
    }, INSTALL_TIMEOUT_MS)
    child.once("exit", (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}

function findProcessesByCommand(searchTerms) {
  const terms = searchTerms.filter(Boolean)
  if (terms.length === 0) return []

  const output = run("ps", ["-axo", "pid=,command="], { timeout: 15_000 })
  const pids = []
  for (const line of output.split(/\r?\n/)) {
    const match = line.trimStart().match(/^(\d+)\s+(.+)$/)
    if (!match) continue
    const pid = Number(match[1])
    const command = match[2]
    if (pid === process.pid) continue
    if (terms.some((term) => command.includes(term))) {
      pids.push(pid)
    }
  }
  return pids
}

async function stopRelaunchedApp(executablePath) {
  const searchTerms = [executablePath]
  try {
    searchTerms.push(realpathSync(executablePath))
  } catch {
    // The temp bundle may already be gone if cleanup raced a relaunch.
  }

  let pids = findProcessesByCommand(searchTerms)
  if (pids.length === 0) return

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      // It may have exited between ps and kill.
    }
  }

  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    pids = findProcessesByCommand(searchTerms)
    if (pids.length === 0) return
  }

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL")
    } catch {
      // It may have exited between ps and kill.
    }
  }
}

async function main() {
  if (process.platform !== "darwin") {
    fail("Packaged update smoke is currently implemented for macOS signed app bundles.")
  }

  const tempRoot = await mkdtemp(join(tmpdir(), "ripple-update-smoke-"))
  const downloadsDir = join(tempRoot, "downloads")
  const appRoot = join(tempRoot, "app")
  const homeDir = join(tempRoot, "home")
  const userDataDir = join(tempRoot, "userData")
  await mkdir(downloadsDir, { recursive: true })
  await mkdir(appRoot, { recursive: true })
  await mkdir(homeDir, { recursive: true })

  let app = null
  let child = null
  let executablePathForCleanup = null
  try {
    const assetName = `Ripple-${fromVersion}-${arch}.zip`
    console.log(`[update-smoke] downloading ${fromRelease} asset ${assetName}`)
    await runAsync("gh", [
      "release",
      "download",
      fromRelease,
      "--repo",
      repo,
      "--pattern",
      assetName,
      "--dir",
      downloadsDir,
      "--clobber",
    ], { timeout: DOWNLOAD_TIMEOUT_MS })

    const zipPath = join(downloadsDir, assetName)
    assertExists(zipPath, "downloaded app zip")

    console.log(`[update-smoke] unpacking ${zipPath}`)
    run("ditto", ["-x", "-k", zipPath, appRoot], { timeout: 120_000 })

    const appPath = join(appRoot, "Ripple.app")
    const executablePath = join(appPath, "Contents", "MacOS", "Ripple")
    executablePathForCleanup = executablePath
    assertExists(executablePath, "packaged Ripple executable")

    const initialVersion = readBundleVersion(appPath)
    if (initialVersion !== fromVersion) {
      fail(`Expected installed N version ${fromVersion}, got ${initialVersion}.`)
    }

    console.log(`[update-smoke] launching ${appPath}`)
    app = await electron.launch({
      executablePath,
      args: [],
      cwd: dirname(appPath),
      env: {
        ...process.env,
        HOME: homeDir,
        CFFIXED_USER_HOME: homeDir,
        XDG_CONFIG_HOME: join(homeDir, ".config"),
        XDG_CACHE_HOME: join(homeDir, ".cache"),
        XDG_DATA_HOME: join(homeDir, ".local", "share"),
        ELECTRON_RENDERER_URL: "",
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
        RIPPLE_E2E: "1",
        RIPPLE_E2E_HOME_DIR: homeDir,
        RIPPLE_E2E_USER_DATA_DIR: userDataDir,
      },
      timeout: 45_000,
    })
    child = app.process()
    child.stdout?.on("data", (chunk) => {
      const text = String(chunk).trim()
      if (text) console.log(`[update-smoke:stdout] ${text}`)
    })
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk).trim()
      if (text) console.log(`[update-smoke:stderr] ${text}`)
    })

    const page = await app.firstWindow({ timeout: 45_000 })
    await page.waitForFunction(() => Boolean(window.desktopApi), null, {
      timeout: 45_000,
    })

    const updateResult = await page.evaluate(
      async ({ expectedVersion, downloadTimeoutMs }) => {
        const api = window.desktopApi
        if (!api) {
          throw new Error("desktopApi is unavailable.")
        }

        const events = []
        let maxProgress = 0
        const cleanups = []

        const cleanup = () => {
          for (const dispose of cleanups) {
            try {
              dispose?.()
            } catch {
              // Ignore cleanup failures inside the renderer.
            }
          }
        }

        const downloaded = new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`Timed out downloading ${expectedVersion}.`))
          }, downloadTimeoutMs)

          cleanups.push(api.onUpdateChecking?.(() => {
            events.push({ event: "checking" })
          }))
          cleanups.push(api.onUpdateAvailable?.((info) => {
            events.push({ event: "available", info })
          }))
          cleanups.push(api.onUpdateProgress?.((progress) => {
            maxProgress = Math.max(maxProgress, progress.percent ?? 0)
            events.push({
              event: "progress",
              percent: progress.percent,
              transferred: progress.transferred,
              total: progress.total,
            })
          }))
          cleanups.push(api.onUpdateDownloaded?.((info) => {
            clearTimeout(timer)
            events.push({ event: "downloaded", info })
            resolve(info)
          }))
          cleanups.push(api.onUpdateError?.((error) => {
            clearTimeout(timer)
            reject(new Error(error || "Update error."))
          }))
        })

        try {
          const currentVersion = await api.getVersion()
          const channelSaved = await api.setUpdateChannel("beta")
          if (!channelSaved) {
            throw new Error("Could not switch Ripple to the beta update channel.")
          }

          const updateInfo = await api.checkForUpdates(true)
          if (!updateInfo) {
            throw new Error(`No update found for ${expectedVersion}.`)
          }
          if (updateInfo.version !== expectedVersion) {
            throw new Error(
              `Expected update ${expectedVersion}, found ${updateInfo.version}.`,
            )
          }

          const downloadStarted = await api.downloadUpdate()
          if (!downloadStarted) {
            throw new Error("Update download did not start.")
          }

          const readyInfo = await downloaded
          if (readyInfo.version !== expectedVersion) {
            throw new Error(
              `Downloaded update version mismatch: ${readyInfo.version}.`,
            )
          }

          return {
            currentVersion,
            updateInfo,
            readyInfo,
            maxProgress,
            events,
          }
        } finally {
          cleanup()
        }
      },
      { expectedVersion: toVersion, downloadTimeoutMs: DOWNLOAD_TIMEOUT_MS },
    )

    console.log(
      `[update-smoke] ${updateResult.currentVersion} found ${updateResult.updateInfo.version}; download max progress ${Math.round(updateResult.maxProgress)}%`,
    )

    await page.evaluate(() => {
      window.desktopApi?.installUpdate?.()
    })
    await waitForProcessExit(child)
    app = null

    const installedVersion = await waitForBundleVersion(appPath, toVersion)

    console.log("[update-smoke] verifying updated app signature/notarization")
    run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], {
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    })
    run("spctl", ["--assess", "--type", "execute", "--verbose", appPath], {
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    })
    run("xcrun", ["stapler", "validate", appPath], {
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    })

    console.log(
      `[update-smoke] ${fromVersion} updated to ${installedVersion} from ${repo} ${fromRelease}`,
    )
  } finally {
    if (app) {
      await app.close().catch(() => {
        child?.kill()
      })
    }
    if (executablePathForCleanup) {
      await stopRelaunchedApp(executablePathForCleanup)
    }
    if (keepArtifacts) {
      console.log(`[update-smoke] kept artifacts in ${tempRoot}`)
    } else {
      await rm(tempRoot, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
