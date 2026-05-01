import { stat } from "node:fs/promises"
import { join } from "node:path"
import {
  execFileSafe as execHyperframesFileSafe,
  firstLine,
  getAppManagedCommandCandidates,
  getBundledCommandCandidates,
  getHyperframesCommandCandidates,
  getProducerBrowserCandidates,
  resolvePackageJsonPath,
} from "../hyperframes/runtime"
import type { EnvironmentCheck, SetupReport, SetupStatus } from "./types"

interface CommandResult {
  ok: boolean
  stdout: string
  stderr: string
  error?: Error
}

export interface EnvironmentProbe {
  execFile: (
    command: string,
    args: string[],
    timeout?: number,
    env?: NodeJS.ProcessEnv,
  ) => Promise<CommandResult>
  hasPath: (path: string) => Promise<boolean>
}

const defaultProbe: EnvironmentProbe = {
  execFile: execFileSafe,
  hasPath: async (path) => {
    try {
      await stat(path)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
      throw error
    }
  },
}

export function execFileSafe(
  command: string,
  args: string[],
  timeout = 4000,
  env?: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  return execHyperframesFileSafe(command, args, {
    timeout,
    env: env ? { ...process.env, ...env } : process.env,
  })
}

export function parseNodeMajor(version: string): number | null {
  const match = version.trim().match(/^v?(\d+)/)
  if (!match) return null
  return Number(match[1])
}

function getEmbeddedNodeVersion(): string | null {
  const version = process.versions?.node
  return typeof version === "string" && version.length > 0 ? `v${version}` : null
}

function getEmbeddedNodeCheck(): EnvironmentCheck | null {
  const version = getEmbeddedNodeVersion()
  if (!version) return null
  const major = parseNodeMajor(version)
  if (major === null || major < 22) return null

  return {
    name: "node",
    status: "ready",
    label: "Motion runtime",
    version,
    message: "Ripple's built-in runtime is available.",
  }
}

async function checkNode(probe: EnvironmentProbe): Promise<EnvironmentCheck> {
  const result = await probe.execFile("node", ["--version"])
  const version = result.ok ? firstLine(result.stdout) : ""
  const major = parseNodeMajor(version)

  if (!result.ok) {
    const embeddedNode = getEmbeddedNodeCheck()
    if (embeddedNode) return embeddedNode

    return {
      name: "node",
      status: "missing",
      label: "Motion runtime",
      message: "Ripple's built-in motion runtime is not available in this build.",
    }
  }

  if (major === null || major < 22) {
    const embeddedNode = getEmbeddedNodeCheck()
    if (embeddedNode) return embeddedNode

    return {
      name: "node",
      status: "missing",
      label: "Motion runtime",
      version,
      message: "Ripple needs a newer built-in motion runtime for preview and export.",
    }
  }

  return {
    name: "node",
    status: "ready",
    label: "Motion runtime",
    version,
    message: "Ripple's motion runtime is available.",
  }
}

async function checkVersionCommand(
  command: "ffmpeg" | "ffprobe",
  label: string,
  repoRoot: string | undefined,
  probe: EnvironmentProbe,
): Promise<EnvironmentCheck> {
  const candidates = [
    ...getBundledCommandCandidates(command, repoRoot),
    ...getAppManagedCommandCandidates(command),
    command,
  ]

  for (const candidate of candidates) {
    const result = await probe.execFile(candidate, ["-version"])
    if (result.ok) {
      return {
        name: command,
        status: "ready",
        label,
        version: firstLine(result.stdout),
        message: `${label} is available.`,
      }
    }
  }

  return {
    name: command,
    status: "missing",
    label,
    message: `${label} is not bundled with this build yet.`,
  }
}

async function checkHyperFrames(
  repoRoot: string | undefined,
  probe: EnvironmentProbe,
): Promise<EnvironmentCheck> {
  for (const candidate of getHyperframesCommandCandidates(repoRoot)) {
    const result = await probe.execFile(
      candidate.command,
      [...candidate.argsPrefix, "--version"],
      2500,
      candidate.env,
    )
    if (result.ok) {
      return {
        name: "hyperframes",
        status: "ready",
        label: "HyperFrames",
        version: firstLine(result.stdout || result.stderr),
        message: "HyperFrames CLI is available locally.",
      }
    }
  }

  return {
    name: "hyperframes",
    status: "missing",
    label: "Motion CLI",
    message: "Ripple's preview and export tools are not available in this build.",
  }
}

async function checkOfflineRuntime(
  repoRoot: string | undefined,
  probe: EnvironmentProbe,
): Promise<EnvironmentCheck> {
  if (!repoRoot) {
    return {
      name: "offlineRuntime",
      status: "ready",
      label: "Starter runtime",
      message: "Ripple will write its offline starter timeline helper into new projects.",
    }
  }

  if (
    await probe.hasPath(join(repoRoot, "node_modules", "gsap")) ||
    resolvePackageJsonPath("gsap")
  ) {
    return {
      name: "offlineRuntime",
      status: "ready",
      label: "Starter runtime",
      message: "A local GSAP package is available.",
    }
  }

  return {
    name: "offlineRuntime",
    status: "warning",
    label: "Starter runtime",
    message: "No GSAP package is installed; Ripple will use its offline starter timeline helper.",
  }
}

async function checkExportBrowser(
  repoRoot: string | undefined,
  probe: EnvironmentProbe,
): Promise<EnvironmentCheck> {
  for (const candidate of getProducerBrowserCandidates(repoRoot)) {
    if (await probe.hasPath(candidate)) {
      return {
        name: "exportBrowser",
        status: "ready",
        label: "Export browser",
        message: "Ripple's export browser is available.",
      }
    }
  }

  return {
    name: "exportBrowser",
    status: "missing",
    label: "Export browser",
    message: "Ripple's packaged export browser is not available in this build.",
  }
}

export function setupStatusFromChecks(checks: EnvironmentCheck[]): SetupStatus {
  if (checks.some((check) => check.status === "error")) return "error"
  if (checks.some((check) => check.status === "missing")) return "needs_environment"
  return "ready"
}

export async function checkRippleEnvironment(
  repoRoot?: string,
  probe: EnvironmentProbe = defaultProbe,
): Promise<SetupReport> {
  const checks = await Promise.all([
    checkNode(probe),
    checkVersionCommand("ffmpeg", "FFmpeg", repoRoot, probe),
    checkVersionCommand("ffprobe", "FFprobe", repoRoot, probe),
    checkHyperFrames(repoRoot, probe),
    checkExportBrowser(repoRoot, probe),
    checkOfflineRuntime(repoRoot, probe),
  ])
  const status = setupStatusFromChecks(checks)
  const missing = checks.filter((check) => check.status === "missing")

  return {
    status,
    summary:
      missing.length > 0
        ? "Ripple could not finish preparing preview and export tools. You can keep creating; preview and export may be unavailable until the app runtime is fixed."
        : null,
    checks,
    checkedAt: new Date(),
  }
}
