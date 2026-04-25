export type SelectedProject = {
  id: string
  name: string
  path: string
  slug?: string | null
  localPath?: string | null
  aspectRatioPreset?: string | null
  activeCompositionId?: string | null
  templateId?: string | null
  setupStatus?: "unknown" | "checking" | "ready" | "needs_environment" | "error"
  setupError?: string | null
  lastSetupCheckAt?: string | Date | null
  iconPath?: string | null
  updatedAt?: string | Date | null
  gitRemoteUrl?: string | null
  gitProvider?: "github" | "gitlab" | "bitbucket" | null
  gitOwner?: string | null
  gitRepo?: string | null
} | null

export type SelectableProjectRecord = {
  id: string
  name: string
  path?: string | null
  localPath?: string | null
  slug?: string | null
  aspectRatioPreset?: string | null
  activeCompositionId?: string | null
  templateId?: string | null
  setupStatus?: "unknown" | "checking" | "ready" | "needs_environment" | "error"
  setupError?: string | null
  lastSetupCheckAt?: string | Date | null
  iconPath?: string | null
  updatedAt?: string | Date | null
  gitRemoteUrl?: string | null
  gitProvider?: string | null
  gitOwner?: string | null
  gitRepo?: string | null
}

export function toSelectedProject(
  project: SelectableProjectRecord,
): NonNullable<SelectedProject> {
  const projectPath = project.localPath ?? project.path
  if (!projectPath) {
    throw new Error("Project is missing a local path.")
  }

  return {
    id: project.id,
    name: project.name,
    path: projectPath,
    localPath: project.localPath ?? projectPath,
    slug: project.slug,
    aspectRatioPreset: project.aspectRatioPreset,
    activeCompositionId: project.activeCompositionId,
    templateId: project.templateId,
    setupStatus: project.setupStatus,
    setupError: project.setupError,
    lastSetupCheckAt: project.lastSetupCheckAt,
    iconPath: project.iconPath,
    updatedAt: project.updatedAt,
    gitRemoteUrl: project.gitRemoteUrl,
    gitProvider: project.gitProvider as
      | "github"
      | "gitlab"
      | "bitbucket"
      | null
      | undefined,
    gitOwner: project.gitOwner,
    gitRepo: project.gitRepo,
  }
}
