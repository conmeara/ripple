#!/usr/bin/env node
import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { once } from "node:events"

const enabled = process.env.RIPPLE_LIVE_PROVIDER_SMOKE === "1"
const provider = process.env.RIPPLE_LIVE_PROVIDER

if (!enabled) {
  console.log("[live-provider-smoke] skipped; set RIPPLE_LIVE_PROVIDER_SMOKE=1 to run")
  process.exit(0)
}

if (provider !== "codex" && provider !== "claude") {
  fail("Set RIPPLE_LIVE_PROVIDER to codex or claude when RIPPLE_LIVE_PROVIDER_SMOKE=1.")
}

if (provider === "codex") {
  const binary = resolveBinary("codex", process.env.RIPPLE_CODEX_BINARY)
  await smokeCodex(binary)
} else {
  const binary = resolveBinary("claude", process.env.RIPPLE_CLAUDE_BINARY)
  await smokeClaude(binary)
}

function resolveBinary(name, override) {
  const candidates = [
    override,
    join(process.cwd(), "resources", "bin", `${platformSegment()}-${archSegment()}`, executableName(name)),
    join(process.cwd(), "resources", "bin", "darwin-arm64", executableName(name)),
    name,
  ].filter(Boolean)

  const existing = candidates.find((candidate) =>
    candidate === name || existsSync(candidate),
  )

  if (!existing) {
    fail(`Could not find ${name} binary. Tried: ${candidates.join(", ")}`)
  }
  return existing
}

function platformSegment() {
  if (process.platform === "darwin") return "darwin"
  if (process.platform === "win32") return "win32"
  return "linux"
}

function archSegment() {
  if (process.arch === "arm64") return "arm64"
  return "x64"
}

function executableName(name) {
  return process.platform === "win32" ? `${name}.exe` : name
}

async function smokeClaude(binary) {
  const result = await execJson(binary, ["auth", "status", "--json"], 20_000)
  if (result.loggedIn !== true) {
    fail(`Claude live smoke failed: ${safeText(result.authStatus || result.message || "not logged in")}`)
  }
  console.log("[live-provider-smoke] Claude connected", JSON.stringify({
    authMethod: result.authMethod ?? null,
    apiProvider: result.apiProvider ?? null,
    subscriptionType: result.subscriptionType ?? null,
  }))
}

async function smokeCodex(binary) {
  const child = spawn(binary, ["app-server"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  })
  const pending = new Map()
  const stderr = []
  const lines = createInterface({ input: child.stdout })
  const timeout = setTimeout(() => {
    child.kill()
    fail(`Codex live smoke timed out. ${stderr.join("\n")}`)
  }, 30_000)

  child.stderr.on("data", (chunk) => stderr.push(String(chunk).trim()))
  child.on("error", (error) => fail(`Codex app-server did not start: ${error.message}`))
  child.on("close", (code, signal) => {
    const error = signal
      ? `Codex app-server stopped with ${signal}`
      : `Codex app-server stopped with code ${code}`
    for (const item of pending.values()) item.reject(new Error(error))
    pending.clear()
  })

  lines.on("line", (line) => {
    if (!line.trim()) return
    let message
    try {
      message = JSON.parse(line)
    } catch {
      stderr.push(`non-json stdout: ${line}`)
      return
    }
    if (message.id === undefined || message.method) return
    const item = pending.get(message.id)
    if (!item) return
    pending.delete(message.id)
    if (message.error) {
      item.reject(new Error(JSON.stringify(message.error)))
    } else {
      item.resolve(message.result)
    }
  })

  const request = (id, method, params = {}) => {
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  }

  try {
    await request(1, "initialize", {
      clientInfo: {
        name: "ripple-live-smoke",
        title: "Ripple Live Smoke",
        version: "0.0.0",
      },
      capabilities: { experimentalApi: true },
    })
    child.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`)
    const response = await request(2, "account/read", {})
    if (!response?.account) {
      fail("Codex live smoke failed: no ChatGPT account is available.")
    }
    console.log("[live-provider-smoke] Codex connected", JSON.stringify({
      hasAccount: Boolean(response.account),
      requiresOpenaiAuth: Boolean(response.requiresOpenaiAuth),
    }))
  } finally {
    clearTimeout(timeout)
    child.kill()
    await once(child, "close").catch(() => undefined)
  }
}

async function execJson(command, args, timeoutMs) {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  })
  const stdout = []
  const stderr = []
  child.stdout.on("data", (chunk) => stdout.push(String(chunk)))
  child.stderr.on("data", (chunk) => stderr.push(String(chunk)))
  const timer = setTimeout(() => {
    child.kill()
  }, timeoutMs)
  const [code] = await once(child, "close")
  clearTimeout(timer)
  if (code !== 0) {
    fail(`${command} ${args.join(" ")} failed: ${stderr.join("").trim()}`)
  }
  try {
    return JSON.parse(stdout.join(""))
  } catch (error) {
    fail(`Could not parse ${command} JSON output: ${error.message}`)
  }
}

function safeText(value) {
  return String(value).replace(/[\r\n]+/g, " ").slice(0, 240)
}

function fail(message) {
  console.error(`[live-provider-smoke] ${message}`)
  process.exit(1)
}
