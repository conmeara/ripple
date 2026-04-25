import { execFile } from "node:child_process"
import { readFileSync } from "node:fs"
import { stat } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
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

interface CommandCandidate {
  command: string
  args: string[]
  env?: NodeJS.ProcessEnv
}

const requireFromHere = createRequire(import.meta.url)
const HYPERFRAMES_APP_ENV: NodeJS.ProcessEnv = {
  HYPERFRAMES_NO_TELEMETRY: "1",
  HYPERFRAMES_NO_UPDATE_CHECK: "1",
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
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        timeout,
        env: env ? { ...process.env, ...env } : process.env,
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
          error: error ?? undefined,
        })
      },
    )
  })
}

export function parseNodeMajor(version: string): number | null {
  const match = version.trim().match(/^v?(\d+)/)
  if (!match) return null
  return Number(match[1])
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).find(Boolean)?.trim() ?? ""
}

function getPlatformBinName(command: string): string {
  return process.platform === "win32" ? `${command}.exe` : command
}

function normalizeExecutablePath(path: string): string {
  return path.replace("app.asar", "app.asar.unpacked")
}

function resolveRequiredPackage(packageName: string): unknown | null {
  try {
    return requireFromHere(packageName)
  } catch {
    return null
  }
}

function resolvePackageJsonPath(packageName: string): string | null {
  try {
    return normalizeExecutablePath(requireFromHere.resolve(`${packageName}/package.json`))
  } catch {
    return null
  }
}

function getPackageBinScript(packageName: string, binName: string): string | null {
  const packageJsonPath = resolvePackageJsonPath(packageName)
  if (!packageJsonPath) return null

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      bin?: string | Record<string, string>
    }
    const binPath =
      typeof packageJson.bin === "string"
        ? packageJson.bin
        : packageJson.bin?.[binName]

    return binPath ? normalizeExecutablePath(join(dirname(packageJsonPath), binPath)) : null
  } catch {
    return null
  }
}

function getBundledCommandCandidates(
  command: string,
  repoRoot: string | undefined,
): string[] {
  const platformArch = `${process.platform}-${process.arch}`
  const binaryName = getPlatformBinName(command)
  const candidates: string[] = []

  if (repoRoot) {
    candidates.push(join(repoRoot, "resources", "bin", platformArch, binaryName))
    candidates.push(join(repoRoot, "node_modules", ".bin", binaryName))
  }

  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (typeof resourcesPath === "string") {
    candidates.push(join(resourcesPath, "bin", binaryName))
  }

  return candidates
}

function getInstallerPackagePath(packageName: string): string | null {
  const packageValue = resolveRequiredPackage(packageName) as { path?: unknown } | null
  return typeof packageValue?.path === "string"
    ? normalizeExecutablePath(packageValue.path)
    : null
}

function getAppManagedCommandCandidates(
  command: "ffmpeg" | "ffprobe",
): string[] {
  const packagePath =
    command === "ffmpeg"
      ? getInstallerPackagePath("@ffmpeg-installer/ffmpeg")
      : getInstallerPackagePath("@ffprobe-installer/ffprobe")

  return packagePath ? [packagePath] : []
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
  const packageCliPath = getPackageBinScript("hyperframes", "hyperframes")
  const candidates: CommandCandidate[] = [
    ...getBundledCommandCandidates("hyperframes", repoRoot).map((command) => ({
      command,
      args: ["--version"],
      env: HYPERFRAMES_APP_ENV,
    })),
  ]

  for (const candidate of candidates) {
    const result = await probe.execFile(
      candidate.command,
      candidate.args,
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

  if (packageCliPath) {
    const result = await probe.execFile(
      process.execPath,
      [packageCliPath, "--version"],
      2500,
      { ...HYPERFRAMES_APP_ENV, ELECTRON_RUN_AS_NODE: "1" },
    )
    if (result.ok) {
      return {
        name: "hyperframes",
        status: "ready",
        label: "HyperFrames",
        version: firstLine(result.stdout || result.stderr),
        message: "Ripple's bundled motion CLI is available.",
      }
    }

    const directResult = await probe.execFile(
      packageCliPath,
      ["--version"],
      2500,
      HYPERFRAMES_APP_ENV,
    )
    if (directResult.ok) {
      return {
        name: "hyperframes",
        status: "ready",
        label: "HyperFrames",
        version: firstLine(directResult.stdout || directResult.stderr),
        message: "Ripple's bundled motion CLI is available.",
      }
    }
  }

  const globalResult = await probe.execFile(
    "hyperframes",
    ["--version"],
    2500,
    HYPERFRAMES_APP_ENV,
  )
  if (globalResult.ok) {
    return {
      name: "hyperframes",
      status: "ready",
      label: "HyperFrames",
      version: firstLine(globalResult.stdout || globalResult.stderr),
      message: "Motion CLI is available locally.",
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
