#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
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

for (const relative of [
  "app.asar",
  "migrations",
  "bin",
  "build",
  "hyperframes-templates",
  "agent-skills",
  "claude-plugins",
]) {
  assertExists(join(resourcesPath, relative))
}

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

const totalSize = statSync(appPath).isDirectory()
  ? run("du", ["-sh", appPath]).split(/\s+/)[0]
  : `${statSync(appPath).size} bytes`

console.log(`[package-smoke] ${appPath} OK (${totalSize})`)
