#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs"
import { dirname, join, relative } from "node:path"
import { homedir } from "node:os"

const repoRoot = process.cwd()
const cacheRoot = process.env.PUPPETEER_CACHE_DIR ||
  join(homedir(), ".cache", "puppeteer")

function defaultTargets() {
  if (process.platform === "darwin") {
    return [
      {
        platform: "darwin",
        arch: "arm64",
        puppeteerPlatform: "mac_arm",
      },
      {
        platform: "darwin",
        arch: "x64",
        puppeteerPlatform: "mac",
      },
    ]
  }

  return [{
    platform: process.platform,
    arch: process.arch,
    puppeteerPlatform: puppeteerPlatformFor(process.platform, process.arch),
  }]
}

function puppeteerPlatformFor(platform, arch) {
  if (platform === "linux") return arch === "arm64" ? "linux_arm" : "linux"
  if (platform === "win32") return arch === "ia32" ? "win32" : "win64"
  return undefined
}

function outputDirFor(target) {
  return join(repoRoot, "resources", "browser", `${target.platform}-${target.arch}`)
}

function executableNames(target) {
  if (target.platform === "darwin") {
    return ["chrome-headless-shell", "Google Chrome for Testing"]
  }
  if (target.platform === "win32") {
    return ["chrome-headless-shell.exe", "chrome.exe"]
  }
  return ["chrome-headless-shell", "chrome"]
}

function walk(root, visitor, depth = 0) {
  if (depth > 8 || !existsSync(root)) return
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(root, entry.name)
    visitor(path, entry)
    if (entry.isDirectory()) walk(path, visitor, depth + 1)
  }
}

function findMacAppRoot(path) {
  const parts = path.split("/")
  const index = parts.findIndex((part) => part.endsWith(".app"))
  if (index === -1) return null
  return parts.slice(0, index + 1).join("/")
}

function candidateFromExecutable(executable, target) {
  const macAppRoot = target.platform === "darwin" ? findMacAppRoot(executable) : null
  if (macAppRoot) {
    return {
      executable,
      copyRoot: macAppRoot,
      copyMode: "directory",
      relativeExecutable: relative(macAppRoot, executable),
    }
  }

  return {
    executable,
    copyRoot: dirname(executable),
    copyMode: "contents",
    relativeExecutable: executable.split(/[\\/]/).pop(),
  }
}

function matchesTargetCache(path, target) {
  if (!target.puppeteerPlatform) return true
  return path.split("\\").join("/").includes(`/${target.puppeteerPlatform}-`)
}

function collectCandidates(target) {
  const names = new Set(executableNames(target))
  const candidates = []
  const explicit = process.env.RIPPLE_EXPORT_BROWSER_SOURCE ||
    process.env.PRODUCER_HEADLESS_SHELL_PATH

  if (explicit && existsSync(explicit) && statSync(explicit).isFile()) {
    candidates.push(candidateFromExecutable(explicit, target))
  }

  walk(cacheRoot, (path, entry) => {
    if (!entry.isFile() || !names.has(entry.name)) return
    if (!matchesTargetCache(path, target)) return
    candidates.push(candidateFromExecutable(path, target))
  })

  return candidates.sort((a, b) => {
    const aHeadless = a.executable.includes("chrome-headless-shell") ? 0 : 1
    const bHeadless = b.executable.includes("chrome-headless-shell") ? 0 : 1
    if (aHeadless !== bHeadless) return aHeadless - bHeadless
    return b.executable.localeCompare(a.executable)
  })
}

function installBrowserIfMissing(target) {
  const platformArgs = target.puppeteerPlatform
    ? ["--platform", target.puppeteerPlatform]
    : []
  console.log(
    `[stage-export-browser] no Puppeteer browser found for ` +
      `${target.platform}-${target.arch}; installing chrome-headless-shell`,
  )
  const result = spawnSync(
    "bunx",
    [
      "puppeteer",
      "browsers",
      "install",
      "chrome-headless-shell",
      ...platformArgs,
    ],
    { stdio: "inherit", env: process.env },
  )
  if (result.status !== 0) {
    throw new Error(
      "Could not install chrome-headless-shell for packaged exports. " +
        "Set RIPPLE_EXPORT_BROWSER_SOURCE or PRODUCER_HEADLESS_SHELL_PATH to an existing browser.",
    )
  }
}

function stage(target, candidate) {
  const outputDir = outputDirFor(target)
  rmSync(outputDir, { recursive: true, force: true })
  mkdirSync(outputDir, { recursive: true })

  if (candidate.copyMode === "directory") {
    const destination = join(outputDir, candidate.copyRoot.split(/[\\/]/).pop())
    cpSync(candidate.copyRoot, destination, { recursive: true })
  } else {
    cpSync(candidate.copyRoot, outputDir, { recursive: true })
  }

  const executable = candidate.copyMode === "directory"
    ? join(outputDir, candidate.copyRoot.split(/[\\/]/).pop(), candidate.relativeExecutable)
    : join(outputDir, candidate.relativeExecutable)

  if (!existsSync(executable)) {
    throw new Error(`Staged export browser is missing executable: ${executable}`)
  }
  if (process.platform !== "win32") {
    chmodSync(executable, 0o755)
  }
  console.log(`[stage-export-browser] staged ${executable}`)
}

for (const target of defaultTargets()) {
  let candidates = collectCandidates(target)
  if (candidates.length === 0) {
    installBrowserIfMissing(target)
    candidates = collectCandidates(target)
  }
  if (candidates.length === 0) {
    throw new Error(
      `No export browser candidate was available after install for ` +
        `${target.platform}-${target.arch}.`,
    )
  }

  stage(target, candidates[0])
}
