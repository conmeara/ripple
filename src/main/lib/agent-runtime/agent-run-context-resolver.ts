import { existsSync } from "node:fs"
import { join } from "node:path"
import type { AgentProviderId, WorkspaceKind } from "./types"
import { RIPPLE_PROVIDER_POLICY } from "./ripple-provider-policy"
import {
  readRippleProjectAgentNote,
  type RippleAgentNoteFileName,
  type RippleAgentNoteStatus,
} from "../ripple-projects/project-agent-notes"
import {
  HYPERFRAMES_SKILL_NAMES,
  getAppManagedHyperframesSkillRoot,
  getProviderProjectSkillRoot,
  type RippleSkillProvider,
} from "../ripple-projects/hyperframes-skills"

export type RunContextDiscoveryStatus =
  | "native"
  | "injected"
  | "missing"
  | "disabled"
  | "user-modified"
  | "managed-old-version"

export interface AgentRunContextResolution {
  provider: AgentProviderId
  appPolicy: string
  projectNotes: {
    fileName: RippleAgentNoteFileName
    status: RippleAgentNoteStatus
    discoveryStatus: RunContextDiscoveryStatus
    nativePath: string
    fallbackPath: string
    content: string | null
    fallbackContent: string | null
  }
  skillRoots: {
    appManaged: string[]
    project: string[]
  }
  statusLabels: string[]
}

function noteFileNameForProvider(provider: AgentProviderId): RippleAgentNoteFileName {
  return provider === "claude" ? "CLAUDE.md" : "AGENTS.md"
}

function skillProviderForAgent(provider: AgentProviderId): RippleSkillProvider {
  return provider === "claude" ? "claude" : "codex"
}

function getAppManagedRippleResourcePath(...segments: string[]): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (typeof resourcesPath === "string") {
    const packagedRoot = join(resourcesPath, ...segments)
    if (existsSync(packagedRoot)) return packagedRoot
  }
  return join(process.cwd(), "resources", ...segments)
}

export function getAppManagedRippleAgentSkillRoot(
  provider: RippleSkillProvider = "codex",
): string {
  if (provider === "claude") {
    return getAppManagedRippleResourcePath(
      "claude-plugins",
      "ripple-visual-context",
      "skills",
    )
  }
  return getAppManagedRippleResourcePath("agent-skills")
}

export function getAppManagedRippleClaudePluginRoot(): string {
  return getAppManagedRippleResourcePath("claude-plugins", "ripple-visual-context")
}

function discoveryStatus(input: {
  workspaceKind: WorkspaceKind
  nativeStatus: RippleAgentNoteStatus
  fallbackStatus: RippleAgentNoteStatus
  nativeContent: string | null
  fallbackContent: string | null
}): RunContextDiscoveryStatus {
  if (input.nativeContent) {
    if (input.nativeStatus === "user-modified") return "user-modified"
    if (input.nativeStatus === "managed-old-version") return "managed-old-version"
    return "native"
  }
  if (input.fallbackContent) return "injected"
  if (input.workspaceKind !== "main" && input.fallbackStatus !== "missing") return "disabled"
  return "missing"
}

export async function resolveAgentRunContext(input: {
  provider: AgentProviderId
  cwd: string
  projectPath: string
  workspaceKind: WorkspaceKind
}): Promise<AgentRunContextResolution> {
  const fileName = noteFileNameForProvider(input.provider)
  const [nativeNote, projectNote] = await Promise.all([
    readRippleProjectAgentNote({ projectPath: input.cwd, fileName }),
    readRippleProjectAgentNote({ projectPath: input.projectPath, fileName }),
  ])
  const nativePath = join(input.cwd, fileName)
  const fallbackPath = join(input.projectPath, fileName)
  const noteDiscoveryStatus = discoveryStatus({
    workspaceKind: input.workspaceKind,
    nativeStatus: nativeNote.status,
    fallbackStatus: projectNote.status,
    nativeContent: nativeNote.content,
    fallbackContent: projectNote.content,
  })
  const skillProvider = skillProviderForAgent(input.provider)
  const appManagedSkillRoot = getAppManagedHyperframesSkillRoot(skillProvider)
  const visualContextSkillRoot = getAppManagedRippleAgentSkillRoot(skillProvider)
  const projectSkillRoot = getProviderProjectSkillRoot(input.projectPath, skillProvider)
  const appPolicy = [
    RIPPLE_PROVIDER_POLICY,
    [
      "Ripple app-managed HyperFrames skills for this run:",
      HYPERFRAMES_SKILL_NAMES.join(", "),
      `Loaded from: ${appManagedSkillRoot}`,
      "Prefer these bundled skills for HyperFrames composition authoring, validation, preview, timeline, and export guidance.",
      "",
      "Ripple app-managed visual-context skill for this run:",
      "ripple-visual-context",
      `Loaded from: ${visualContextSkillRoot}`,
      "Use it proactively after creating or editing visible motion work. Ripple comment runs may already include automatic visual context: frame comments get a still frame, and range comments get a frame sheet.",
      "For any extra visual context, use the app-aware `ripple snapshot` and `ripple frame-sheet` commands. Use `ripple snapshot --at current --json` for the visible app frame, `ripple snapshot --at 1.25s --json` for an exact timestamp, and `ripple frame-sheet --range 0s..8s --samples 8 --columns 4 --json` for a compact frame sheet. Add `--composition <path>` when you need another composition.",
      "Use bundled HyperFrames CLI and skills for structure, linting, inspection, and export work. Use app-managed bare commands (`ripple`, `hyperframes`) instead of `npx`, `bunx`, or package installs.",
      "If local image viewing is unavailable, do not call image-view/open/browser tools just to inspect the generated sheet; report the sheet path and manifest details so Ripple can show the artifact.",
    ].join("\n"),
  ].join("\n\n")

  return {
    provider: input.provider,
    appPolicy,
    projectNotes: {
      fileName,
      status: nativeNote.status,
      discoveryStatus: noteDiscoveryStatus,
      nativePath,
      fallbackPath,
      content: nativeNote.content,
      fallbackContent: projectNote.content,
    },
    skillRoots: {
      appManaged: [appManagedSkillRoot, visualContextSkillRoot],
      project: [projectSkillRoot],
    },
    statusLabels: [
      "Ripple app policy",
      noteDiscoveryStatus === "native"
        ? fileName
        : noteDiscoveryStatus === "injected"
          ? `${fileName} fallback`
          : `${fileName} ${noteDiscoveryStatus}`,
      "HyperFrames skills",
      "Ripple visual context",
    ],
  }
}

export function buildProjectNoteFallbackInstructions(
  resolution: AgentRunContextResolution,
): string | null {
  if (resolution.projectNotes.discoveryStatus !== "injected") return null
  if (!resolution.projectNotes.fallbackContent) return null
  return `Project notes from ${resolution.projectNotes.fileName}:\n\n${resolution.projectNotes.fallbackContent}`
}
