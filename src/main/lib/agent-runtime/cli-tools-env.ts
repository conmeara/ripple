import { existsSync } from "node:fs"
import { delimiter, dirname, join, resolve } from "node:path"
import {
  HYPERFRAMES_APP_ENV,
  getAppManagedBinaryDirectories,
  getPackageBinScript,
} from "../hyperframes/runtime"

export interface RippleAgentToolEnvironmentInput {
  baseEnv?: NodeJS.ProcessEnv
  repoRoot?: string
  workspaceRoot: string
  visualContextEndpoint?: string | null
  visualContextToken?: string | null
  visualContextBridgeDir?: string | null
  visualContextBridgeToken?: string | null
}

function platformArch(): string {
  return `${process.platform}-${process.arch}`
}

function maybeResourcesBinDir(): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  return typeof resourcesPath === "string" ? join(resourcesPath, "bin") : null
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function normalizeRepoRoot(repoRoot?: string): string | undefined {
  if (!repoRoot) return undefined
  const candidates = uniqueStrings([
    repoRoot,
    join(repoRoot, "..", ".."),
  ]).map((candidate) => resolve(candidate))
  return candidates.find((candidate) =>
    existsSync(join(candidate, "package.json")) &&
    existsSync(join(candidate, "resources", "cli", process.platform === "win32" ? "ripple.cmd" : "ripple"))
  ) ?? resolve(repoRoot)
}

export function getRippleAgentToolDirectories(repoRoot?: string): string[] {
  const normalizedRepoRoot = normalizeRepoRoot(repoRoot)
  const hyperframesBinScript = getPackageBinScript("hyperframes", "hyperframes")
  return uniqueStrings([
    maybeResourcesBinDir(),
    normalizedRepoRoot ? join(normalizedRepoRoot, "node_modules", ".bin") : null,
    normalizedRepoRoot ? join(normalizedRepoRoot, "resources", "bin", platformArch()) : null,
    normalizedRepoRoot ? join(normalizedRepoRoot, "resources", "cli") : null,
    hyperframesBinScript ? dirname(hyperframesBinScript) : null,
    normalizedRepoRoot ? join(normalizedRepoRoot, "scripts") : null,
    ...getAppManagedBinaryDirectories(),
  ])
}

export function buildRippleAgentToolEnvironment(
  input: RippleAgentToolEnvironmentInput,
): NodeJS.ProcessEnv {
  const baseEnv = input.baseEnv ?? process.env
  const toolDirectories = getRippleAgentToolDirectories(input.repoRoot)
  const existingPath = baseEnv.PATH ?? baseEnv.Path ?? ""
  const pathValue = uniqueStrings([
    ...toolDirectories,
    existingPath,
  ]).join(delimiter)
  const workspaceRoot = resolve(input.workspaceRoot)

  return {
    ...baseEnv,
    ...HYPERFRAMES_APP_ENV,
    PATH: pathValue,
    Path: process.platform === "win32" ? pathValue : baseEnv.Path,
    RIPPLE_AGENT_WORKSPACE_ROOT: workspaceRoot,
    RIPPLE_AGENT_VISUAL_CONTEXT_MODE: "clean",
    ...(input.visualContextEndpoint && input.visualContextToken
      ? {
        RIPPLE_VISUAL_CONTEXT_ENDPOINT: input.visualContextEndpoint,
        RIPPLE_VISUAL_CONTEXT_TOKEN: input.visualContextToken,
      }
      : {}),
    ...(input.visualContextBridgeDir && input.visualContextBridgeToken
      ? {
        RIPPLE_VISUAL_CONTEXT_BRIDGE_DIR: input.visualContextBridgeDir,
        RIPPLE_VISUAL_CONTEXT_BRIDGE_TOKEN: input.visualContextBridgeToken,
      }
      : {}),
  }
}
