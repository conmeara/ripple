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
  visualContextManifestPath?: string | null
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

export function getRippleAgentToolDirectories(repoRoot?: string): string[] {
  const hyperframesBinScript = getPackageBinScript("hyperframes", "hyperframes")
  return uniqueStrings([
    repoRoot ? join(repoRoot, "resources", "cli") : null,
    repoRoot ? join(repoRoot, "resources", "bin", platformArch()) : null,
    maybeResourcesBinDir(),
    repoRoot ? join(repoRoot, "node_modules", ".bin") : null,
    hyperframesBinScript ? dirname(hyperframesBinScript) : null,
    repoRoot ? join(repoRoot, "scripts") : null,
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
    ...(input.visualContextManifestPath
      ? {
        RIPPLE_VISUAL_CONTEXT_MANIFEST: input.visualContextManifestPath,
      }
      : {}),
  }
}
