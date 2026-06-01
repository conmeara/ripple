import { join } from "node:path"
import type { AgentProviderId, WorkspaceKind } from "./types"
import {
  RIPPLE_PROVIDER_POLICY,
  RIPPLE_VISUAL_CONTEXT_POLICY,
} from "./ripple-provider-policy"
import {
  readRippleProjectAgentNote,
  type RippleAgentNoteFileName,
  type RippleAgentNoteStatus,
} from "../ripple-projects/project-agent-notes"
import {
  ensureProjectHyperframesSkills,
  getAppManagedHyperframesSkillRoots,
  getProviderProjectSkillRoot,
  listBundledHyperframesSkillNames,
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

export async function ensureProjectAppManagedAgentSkills(input: {
  provider: AgentProviderId
  projectPath: string
}) {
  const skillProvider = skillProviderForAgent(input.provider)
  const hyperframesSkills = await ensureProjectHyperframesSkills({
    projectPath: input.projectPath,
    providers: [skillProvider],
  })

  return {
    skills: hyperframesSkills.skills,
  }
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
  const appManagedSkillRoots = getAppManagedHyperframesSkillRoots(skillProvider)
  const hyperframesSkillNames = await listBundledHyperframesSkillNames({
    provider: skillProvider,
  })
  const projectSkillRoot = getProviderProjectSkillRoot(input.projectPath, skillProvider)
  const appPolicy = [
    RIPPLE_VISUAL_CONTEXT_POLICY,
    RIPPLE_PROVIDER_POLICY,
    [
      "Ripple app-managed HyperFrames skills for this run:",
      hyperframesSkillNames.join(", "),
      `Loaded from: ${appManagedSkillRoots.join(", ")}`,
      "Prefer these official bundled skills for HyperFrames composition authoring, validation, preview, timeline, media preprocessing, transparent overlays, registry, animation library, and export guidance.",
      "",
      "Use bundled HyperFrames CLI and skills for structure, linting, inspection, and export work. Use app-managed bare commands (`ripple`, `hyperframes`) instead of `npx`, `bunx`, or package installs.",
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
      appManaged: appManagedSkillRoots,
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
