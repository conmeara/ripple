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
  const projectSkillRoot = getProviderProjectSkillRoot(input.projectPath, skillProvider)
  const appPolicy = [
    RIPPLE_PROVIDER_POLICY,
    [
      "Ripple app-managed HyperFrames skills for this run:",
      HYPERFRAMES_SKILL_NAMES.join(", "),
      `Loaded from: ${appManagedSkillRoot}`,
      "Prefer these bundled skills for HyperFrames composition authoring, validation, preview, timeline, and export guidance.",
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
      appManaged: [appManagedSkillRoot],
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
