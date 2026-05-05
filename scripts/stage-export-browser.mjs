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
const platformArch = `${process.platform}-${process.arch}`
const outputDir = join(repoRoot, "resources", "browser", platformArch)
const cacheRoot = process.env.PUPPETEER_CACHE_DIR ||
  join(homedir(), ".cache", "puppeteer")

function executableNames() {
  if (process.platform === "darwin") {
    return ["chrome-headless-shell", "Google Chrome for Testing"]
  }
  if (process.platform === "win32") {
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

function candidateFromExecutable(executable) {
  const macAppRoot = process.platform === "darwin" ? findMacAppRoot(executable) : null
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

function collectCandidates() {
  const names = new Set(executableNames())
  const candidates = []
  const explicit = process.env.RIPPLE_EXPORT_BROWSER_SOURCE ||
    process.env.PRODUCER_HEADLESS_SHELL_PATH

  if (explicit && existsSync(explicit) && statSync(explicit).isFile()) {
    candidates.push(candidateFromExecutable(explicit))
  }

  walk(cacheRoot, (path, entry) => {
    if (!entry.isFile() || !names.has(entry.name)) return
    candidates.push(candidateFromExecutable(path))
  })

  return candidates.sort((a, b) => {
    const aHeadless = a.executable.includes("chrome-headless-shell") ? 0 : 1
    const bHeadless = b.executable.includes("chrome-headless-shell") ? 0 : 1
    if (aHeadless !== bHeadless) return aHeadless - bHeadless
    return b.executable.localeCompare(a.executable)
  })
}

function installBrowserIfMissing() {
  console.log("[stage-export-browser] no Puppeteer browser found; installing chrome-headless-shell")
  const result = spawnSync(
    "bunx",
    ["puppeteer", "browsers", "install", "chrome-headless-shell"],
    { stdio: "inherit", env: process.env },
  )
  if (result.status !== 0) {
    throw new Error(
      "Could not install chrome-headless-shell for packaged exports. " +
        "Set RIPPLE_EXPORT_BROWSER_SOURCE or PRODUCER_HEADLESS_SHELL_PATH to an existing browser.",
    )
  }
}

function stage(candidate) {
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

let candidates = collectCandidates()
if (candidates.length === 0) {
  installBrowserIfMissing()
  candidates = collectCandidates()
}
if (candidates.length === 0) {
  throw new Error("No export browser candidate was available after install.")
}

stage(candidates[0])
