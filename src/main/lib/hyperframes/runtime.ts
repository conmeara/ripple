import { execFile, spawn } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { stat } from "node:fs/promises"
import { createRequire } from "node:module"
import { homedir } from "node:os"
import { delimiter, dirname, join } from "node:path"
import type {
  HyperframesCommandCandidate,
  HyperframesCommandResult,
  HyperframesResolvedCommand,
  HyperframesSpawnResult,
} from "./types"
import { HyperframesError } from "./types"

export interface HyperframesExecOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeout?: number
}

export interface HyperframesRuntimeOptions extends HyperframesExecOptions {
  repoRoot?: string
  execFile?: (
    command: string,
    args: string[],
    options: HyperframesExecOptions,
  ) => Promise<HyperframesCommandResult>
}

const requireFromHere = createRequire(import.meta.url)

export const HYPERFRAMES_APP_ENV: NodeJS.ProcessEnv = {
  HYPERFRAMES_NO_TELEMETRY: "1",
  HYPERFRAMES_NO_UPDATE_CHECK: "1",
  HYPERFRAMES_NO_AUTO_INSTALL: "1",
}

export function firstLine(value: string): string {
  return value.split(/\r?\n/).find(Boolean)?.trim() ?? ""
}

export function getPlatformBinName(command: string): string {
  return process.platform === "win32" ? `${command}.exe` : command
}

export function normalizeExecutablePath(path: string): string {
  return path.replace(/(^|[/\\])app\.asar(?=([/\\]|$))/, "$1app.asar.unpacked")
}

function resolveRequiredPackage(packageName: string): unknown | null {
  try {
    return requireFromHere(packageName)
  } catch {
    return null
  }
}

export function resolvePackageJsonPath(packageName: string): string | null {
  try {
    return normalizeExecutablePath(requireFromHere.resolve(`${packageName}/package.json`))
  } catch {
    return null
  }
}

export function getPackageBinScript(
  packageName: string,
  binName: string,
): string | null {
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

export function getBundledCommandCandidates(
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

export function getAppManagedCommandCandidates(
  command: "ffmpeg" | "ffprobe",
): string[] {
  const packagePath =
    command === "ffmpeg"
      ? getInstallerPackagePath("@ffmpeg-installer/ffmpeg")
      : getInstallerPackagePath("@ffprobe-installer/ffprobe")

  return packagePath ? [packagePath] : []
}

export function getAppManagedBinaryDirectories(): string[] {
  return Array.from(
    new Set(
      [
        ...getAppManagedCommandCandidates("ffmpeg"),
        ...getAppManagedCommandCandidates("ffprobe"),
      ].map((commandPath) => dirname(commandPath)),
    ),
  )
}

function getPackagedNodeModuleDirectories(): string[] {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (typeof resourcesPath !== "string") return []

  return [
    join(resourcesPath, "app.asar.unpacked", "node_modules"),
    join(resourcesPath, "app.asar", "node_modules"),
  ]
}

function getBrowserExecutableNames(): string[] {
  if (process.platform === "darwin") {
    return [
      join("Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
      "chrome-headless-shell",
      "Chromium",
    ]
  }
  if (process.platform === "win32") {
    return ["chrome.exe", "chrome-headless-shell.exe"]
  }
  return ["chrome", "chrome-headless-shell"]
}

function getBrowserResourceCandidates(repoRoot?: string): string[] {
  const platformArch = `${process.platform}-${process.arch}`
  const candidates: string[] = []
  const executableNames = getBrowserExecutableNames()

  if (repoRoot) {
    for (const executableName of executableNames) {
      candidates.push(join(repoRoot, "resources", "browser", platformArch, executableName))
    }
  }

  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (typeof resourcesPath === "string") {
    for (const executableName of executableNames) {
      candidates.push(join(resourcesPath, "browser", executableName))
    }
  }

  return candidates
}

function getPuppeteerCacheCandidates(): string[] {
  const cacheRoot = join(homedir(), ".cache", "puppeteer")
  const families = ["chrome-headless-shell", "chrome"]
  const candidates: string[] = []

  for (const family of families) {
    const familyRoot = join(cacheRoot, family)
    if (!existsSync(familyRoot)) continue

    let versions: string[]
    try {
      versions = readdirSync(familyRoot).sort().reverse()
    } catch {
      continue
    }

    for (const version of versions) {
      const versionRoot = join(familyRoot, version)
      if (process.platform === "darwin") {
        const arch = process.arch === "arm64" ? "mac-arm64" : "mac-x64"
        candidates.push(
          join(versionRoot, `chrome-headless-shell-${arch}`, "chrome-headless-shell"),
          join(
            versionRoot,
            `chrome-${arch}`,
            "Google Chrome for Testing.app",
            "Contents",
            "MacOS",
            "Google Chrome for Testing",
          ),
        )
      } else if (process.platform === "win32") {
        candidates.push(
          join(versionRoot, "chrome-headless-shell-win64", "chrome-headless-shell.exe"),
          join(versionRoot, "chrome-win64", "chrome.exe"),
        )
      } else {
        candidates.push(
          join(versionRoot, "chrome-headless-shell-linux64", "chrome-headless-shell"),
          join(versionRoot, "chrome-linux64", "chrome"),
        )
      }
    }
  }

  return candidates
}

export function getProducerBrowserCandidates(repoRoot?: string): string[] {
  return Array.from(
    new Set([
      process.env.PRODUCER_HEADLESS_SHELL_PATH,
      ...getBrowserResourceCandidates(repoRoot),
      ...getPuppeteerCacheCandidates(),
    ].filter((path): path is string => Boolean(path))),
  )
}

export function resolveProducerBrowserPath(repoRoot?: string): string | null {
  return getProducerBrowserCandidates(repoRoot).find((candidate) => existsSync(candidate)) ?? null
}

export function buildHyperframesEnvironment(
  baseEnv: NodeJS.ProcessEnv = process.env,
  options: { repoRoot?: string } = {},
): NodeJS.ProcessEnv {
  const appManagedPaths = getAppManagedBinaryDirectories()
  const existingPath = baseEnv.PATH ?? baseEnv.Path ?? ""
  const pathValue = [...appManagedPaths, existingPath].filter(Boolean).join(delimiter)
  const nodePathValue = [
    ...getPackagedNodeModuleDirectories(),
    baseEnv.NODE_PATH,
  ].filter(Boolean).join(delimiter)
  const appManagedBrowserPath =
    baseEnv.HYPERFRAMES_BROWSER_PATH ??
    baseEnv.PRODUCER_HEADLESS_SHELL_PATH ??
    resolveProducerBrowserPath(options.repoRoot ?? process.cwd()) ??
    undefined

  return {
    ...baseEnv,
    ...HYPERFRAMES_APP_ENV,
    ...(appManagedBrowserPath
      ? {
        HYPERFRAMES_BROWSER_PATH: appManagedBrowserPath,
        PRODUCER_HEADLESS_SHELL_PATH: appManagedBrowserPath,
      }
      : {}),
    PATH: pathValue,
    Path: process.platform === "win32" ? pathValue : baseEnv.Path,
    ...(nodePathValue ? { NODE_PATH: nodePathValue } : {}),
  }
}

export function getHyperframesCommandCandidates(
  repoRoot?: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): HyperframesCommandCandidate[] {
  const env = buildHyperframesEnvironment(baseEnv, { repoRoot })
  const candidates: HyperframesCommandCandidate[] = [
    ...getBundledCommandCandidates("hyperframes", repoRoot).map((command, index) => ({
      command,
      argsPrefix: [],
      env,
      source: index === 0 ? "packaged-bin" as const : "repo-bin" as const,
    })),
  ]
  const packageCliPath = getPackageBinScript("hyperframes", "hyperframes")

  if (packageCliPath) {
    candidates.push({
      command: process.execPath,
      argsPrefix: [packageCliPath],
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
      source: "package-script",
    })
    candidates.push({
      command: packageCliPath,
      argsPrefix: [],
      env,
      source: "package-bin",
    })
  }

  candidates.push({
    command: "hyperframes",
    argsPrefix: [],
    env,
    source: "global",
  })

  return candidates
}

function getRuntimeBaseEnvironment(
  env: NodeJS.ProcessEnv | undefined,
): NodeJS.ProcessEnv {
  return env ? { ...process.env, ...env } : process.env
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

export function execFileSafe(
  command: string,
  args: string[],
  options: HyperframesExecOptions = {},
): Promise<HyperframesCommandResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeout ?? 4000,
        env: options.env ?? process.env,
      },
      (error, stdout, stderr) => {
        const execError = error as (NodeJS.ErrnoException & {
          signal?: NodeJS.Signals | null
        }) | null
        resolve({
          ok: !error,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
          exitCode: typeof execError?.code === "number" ? execError.code : undefined,
          signal: execError?.signal as NodeJS.Signals | null | undefined,
          error: error ?? undefined,
          timedOut: execError?.code === "ETIMEDOUT",
        })
      },
    )
  })
}

export async function resolveHyperframesCommand(
  options: HyperframesRuntimeOptions = {},
): Promise<HyperframesResolvedCommand> {
  const exec = options.execFile ?? execFileSafe
  const baseEnv = getRuntimeBaseEnvironment(options.env)

  for (const candidate of getHyperframesCommandCandidates(options.repoRoot, baseEnv)) {
    const result = await exec(
      candidate.command,
      [...candidate.argsPrefix, "--version"],
      {
        cwd: options.cwd,
        env: candidate.env,
        timeout: options.timeout ?? 3000,
      },
    )

    if (result.ok) {
      return {
        ...candidate,
        version: firstLine(result.stdout || result.stderr) || null,
      }
    }
  }

  throw new HyperframesError(
    "Ripple could not find its motion runtime.",
    "HYPERFRAMES_COMMAND_MISSING",
  )
}

export async function runHyperframesCommand(
  args: string[],
  options: HyperframesRuntimeOptions = {},
): Promise<HyperframesCommandResult> {
  const command = await resolveHyperframesCommand(options)
  const exec = options.execFile ?? execFileSafe

  return exec(
    command.command,
    [...command.argsPrefix, ...args],
    {
      cwd: options.cwd,
      env: command.env,
      timeout: options.timeout ?? 30000,
    },
  )
}

export async function spawnHyperframesCommand(
  args: string[],
  options: HyperframesRuntimeOptions = {},
): Promise<HyperframesSpawnResult> {
  const command = await resolveHyperframesCommand(options)
  const finalArgs = [...command.argsPrefix, ...args]
  const child = spawn(command.command, finalArgs, {
    cwd: options.cwd,
    env: command.env,
    stdio: ["ignore", "pipe", "pipe"],
  })

  return { child, command, args: finalArgs }
}
