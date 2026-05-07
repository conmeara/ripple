#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const appPath = process.env.RIPPLE_PACKAGED_APP ||
  (process.platform === "darwin" ? "release/mac-arm64/Ripple.app" : "")

function fail(message) {
  console.error(`[package-smoke] ${message}`)
  process.exit(1)
}

function assertExists(path) {
  if (!path || !existsSync(path)) fail(`Missing ${path}`)
}

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    timeout: 15000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

if (!appPath) {
  fail("Set RIPPLE_PACKAGED_APP to a packaged Ripple app for this platform.")
}

assertExists(appPath)

const resourcesPath = process.platform === "darwin"
  ? join(appPath, "Contents", "Resources")
  : join(appPath, "resources")
assertExists(resourcesPath)
const appAsarUnpackedPath = join(resourcesPath, "app.asar.unpacked")

for (const relative of [
  "app.asar",
  "migrations",
  "bin",
  "browser",
  "build",
  "hyperframes-templates",
  "agent-skills",
  "claude-plugins",
]) {
  assertExists(join(resourcesPath, relative))
}

for (const relative of [
  "node_modules/@hyperframes/engine",
  "node_modules/@hyperframes/producer",
  "node_modules/hyperframes",
]) {
  assertExists(join(appAsarUnpackedPath, relative))
}

const packagedEngineIndex = join(
  appAsarUnpackedPath,
  "node_modules",
  "@hyperframes",
  "engine",
  "dist",
  "index.js",
)
assertExists(packagedEngineIndex)

const forbiddenSdkPackages = []
function walk(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    if (child.includes("claude-agent-sdk-darwin-arm64")) {
      forbiddenSdkPackages.push(child)
      continue
    }
    if (entry.isDirectory() && !entry.name.endsWith(".app")) walk(child)
  }
}
walk(resourcesPath)
if (forbiddenSdkPackages.length > 0) {
  fail(`Found duplicate Claude SDK platform package: ${forbiddenSdkPackages[0]}`)
}

if (process.platform === "darwin") {
  const info = run("plutil", ["-p", join(appPath, "Contents", "Info.plist")])
  for (const expected of [
    '"CFBundleDisplayName" => "Ripple"',
    '"CFBundleExecutable" => "Ripple"',
    '"CFBundleIdentifier" => "app.ripple.desktop"',
    '"NSMicrophoneUsageDescription" => "Ripple needs microphone access for voice dictation"',
  ]) {
    if (!info.includes(expected)) fail(`Info.plist missing ${expected}`)
  }
}

const binPath = join(resourcesPath, "bin")
const browserPath = join(resourcesPath, "browser")
const bins = {
  ripple: ["--help"],
  hyperframes: ["--version"],
  claude: ["--version"],
  codex: ["--version"],
}

for (const [binary, args] of Object.entries(bins)) {
  const binaryName = process.platform === "win32" ? `${binary}.exe` : binary
  const binaryPath = join(binPath, binaryName)
  assertExists(binaryPath)
  const output = run(binaryPath, args)
  if (!output) fail(`${binary} produced no output`)
}

const rippleBinaryName = process.platform === "win32" ? "ripple.exe" : "ripple"
const rippleBinaryPath = join(binPath, rippleBinaryName)
const rippleSnapshotHelp = run(rippleBinaryPath, ["snapshot", "--help"])
const rippleFrameSheetHelp = run(rippleBinaryPath, ["frame-sheet", "--help"])
if (!rippleSnapshotHelp.includes("current") || !rippleFrameSheetHelp.includes("frame sheet")) {
  fail("Packaged ripple visual CLI did not expose snapshot and frame-sheet guidance.")
}

const visualProjectDir = mkdtempSync(join(tmpdir(), "ripple-package-visual-"))
try {
  writeFileSync(join(visualProjectDir, "hyperframes.json"), JSON.stringify({
    entry: "index.html",
    width: 320,
    height: 180,
    fps: 30,
  }))
  writeFileSync(join(visualProjectDir, "index.html"), `<!doctype html>
<html>
  <head>
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: #17324d; }
      main { width: 320px; height: 180px; background: #2a9d8f; }
    </style>
  </head>
  <body>
    <main data-composition-id="package-smoke"></main>
    <script>window.__hf = { duration: 1, seek: function () {} };</script>
  </body>
</html>`)
  const visualSnapshot = run(rippleBinaryPath, [
    "snapshot",
    "--dir",
    visualProjectDir,
    "--at",
    "0.5s",
    "--width",
    "320",
    "--height",
    "180",
    "--json",
  ])
  const parsedVisualSnapshot = JSON.parse(visualSnapshot)
  if (!parsedVisualSnapshot.ok || !parsedVisualSnapshot.snapshot?.path) {
    fail(`Packaged ripple snapshot failed: ${visualSnapshot}`)
  }
  assertExists(join(visualProjectDir, parsedVisualSnapshot.snapshot.path))
} finally {
  rmSync(visualProjectDir, { recursive: true, force: true })
}

const browserCandidates = process.platform === "darwin"
  ? [
    join(browserPath, "chrome-headless-shell"),
    join(
      browserPath,
      "Google Chrome for Testing.app",
      "Contents",
      "MacOS",
      "Google Chrome for Testing",
    ),
  ]
  : process.platform === "win32"
    ? [join(browserPath, "chrome-headless-shell.exe"), join(browserPath, "chrome.exe")]
    : [join(browserPath, "chrome-headless-shell"), join(browserPath, "chrome")]

const browserExecutable = browserCandidates.find((candidate) => existsSync(candidate))
if (!browserExecutable) {
  fail(`Missing packaged export browser. Tried: ${browserCandidates.join(", ")}`)
}
const browserVersion = run(browserExecutable, ["--version"])
if (!/Chrome|Chromium/i.test(browserVersion)) {
  fail(`Packaged export browser produced unexpected version: ${browserVersion}`)
}

const totalSize = statSync(appPath).isDirectory()
  ? run("du", ["-sh", appPath]).split(/\s+/)[0]
  : `${statSync(appPath).size} bytes`

console.log(`[package-smoke] ${appPath} OK (${totalSize})`)
